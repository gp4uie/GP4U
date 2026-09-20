const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const mailer = require('../mailer');
const { getPractice, escapeHtml: esc, emailHeader } = require('../practice');
const loginLimiter = require('../loginLimiter');
const { getServices } = require('../services');
const { ensureWalkInBooking, applyWalkInStatus } = require('../walkins');

/*
 * Front-desk (receptionist) API.
 *
 * What a receptionist can see and do (all decided here, in one place):
 *   CAN   run the walk-in queue and add walk-ins at the desk (an arrived walk-in becomes a booking the doctor can chart),
 *         see the day's online appointments including the reason for visit and the patient's intake answers,
 *         register new patients at the desk (with family members) and see registration details including health information.
 *   CANNOT see the doctor's clinical record — consultation notes, prescriptions, documents/letters, messages, charts or
 *         history — and cannot reach any doctor, admin or patient endpoint.
 * Because health information is visible to this role, front-desk activity is written to reception_access_log for admins.
 */
const router = express.Router();
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const WALKIN_STATUSES = ['expected', 'arrived', 'seen', 'cancelled'];
const MAX_FAMILY_MEMBERS = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
function isPlausibleDob(dob) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const d = new Date(dob + 'T00:00:00');
  return !Number.isNaN(d.getTime()) && d >= new Date('1900-01-01T00:00:00') && d <= new Date();
}
const newId = (prefix) => `${prefix}-${crypto.randomBytes(4).toString('hex')}`.toUpperCase();

// Own session keys (receptionistId): doctor / admin / patient sessions can never satisfy it, and it can never satisfy theirs.
async function requireReceptionist(req, res, next) {
  if (!req.session || !req.session.receptionistId) return res.status(401).json({ error: 'Not logged in' });
  const now = Date.now();
  if (req.session.receptionActivityAt && now - req.session.receptionActivityAt > IDLE_TIMEOUT_MS) {
    req.session.receptionistId = null;
    return res.status(401).json({ error: 'Session expired due to inactivity' });
  }
  const rec = await db.get('SELECT id, name, active FROM receptionists WHERE id = ?', [req.session.receptionistId]);
  if (!rec || rec.active === 0) {
    req.session.receptionistId = null;
    return res.status(401).json({ error: 'Not logged in' });
  }
  req.receptionist = rec;
  req.session.receptionActivityAt = now;
  db.run('UPDATE receptionists SET last_active_at = NOW() WHERE id = ?', [rec.id]).catch(() => {});
  next();
}

// Audit trail. Repeated *views* of the same thing are collapsed to one entry per 10 minutes; changes are always logged.
const lastViewLogged = new Map();
async function logAccess(req, action, detail, { view = false } = {}) {
  try {
    if (view) {
      const key = `${req.receptionist.id}:${action}`;
      if (Date.now() - (lastViewLogged.get(key) || 0) < 10 * 60 * 1000) return;
      lastViewLogged.set(key, Date.now());
    }
    await db.run('INSERT INTO reception_access_log (receptionist_id, action, detail) VALUES (?, ?, ?)', [req.receptionist.id, action, detail ? String(detail).slice(0, 255) : null]);
  } catch (err) { /* never block front-desk work on logging */ }
}

// ---------------------------------------------------------------- session
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const accountKey = (email || '').toLowerCase().trim();
  const limit = loginLimiter.checkLimit(accountKey, req.ip);
  if (limit.blocked) {
    const minutes = Math.ceil(limit.retryAfterMs / 60000);
    return res.status(429).json({ error: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` });
  }
  const rec = accountKey && await db.get('SELECT * FROM receptionists WHERE email = ?', [accountKey]);
  if (!rec || !bcrypt.compareSync(password || '', rec.password_hash)) {
    loginLimiter.recordFailure(accountKey, req.ip);
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  if (rec.active === 0) return res.status(403).json({ error: 'This account has been deactivated. Please contact your practice administrator.' });
  loginLimiter.recordSuccess(accountKey);
  req.session.receptionistId = rec.id;
  req.session.receptionActivityAt = Date.now();
  await db.run('UPDATE receptionists SET last_login_at = NOW() WHERE id = ?', [rec.id]);
  db.run('INSERT INTO reception_access_log (receptionist_id, action) VALUES (?, ?)', [rec.id, 'Signed in']).catch(() => {});
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  if (req.session) { req.session.receptionistId = null; req.session.receptionActivityAt = null; }
  res.json({ ok: true });
});

router.get('/me', async (req, res) => {
  if (!req.session || !req.session.receptionistId) return res.json({ loggedIn: false });
  const rec = await db.get('SELECT id, name, active FROM receptionists WHERE id = ?', [req.session.receptionistId]);
  if (!rec || rec.active === 0) { req.session.receptionistId = null; return res.json({ loggedIn: false }); }
  res.json({ loggedIn: true, name: rec.name, practiceName: (await getPractice()).name });
});

// ---------------------------------------------------------------- overview counts
router.get('/summary', requireReceptionist, async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : new Date().toISOString().slice(0, 10);
  const walkins = await db.get(`
    SELECT COUNT(*) AS n FROM walkin_checkins
    WHERE status IN ('expected', 'arrived') AND created_at > (NOW() - INTERVAL 24 HOUR)`);
  const regs = await db.get("SELECT COUNT(*) AS n FROM patient_registrations WHERE status = 'new' AND source = 'online'");
  const appts = await db.get("SELECT COUNT(*) AS n FROM bookings WHERE status IN ('paid', 'completed') AND service_type <> 'walk_in' AND DATE(slot_start) = ?", [date]);
  res.json({ waiting: walkins.n, newRegistrations: regs.n, appointmentsToday: appts.n });
});

// ---------------------------------------------------------------- walk-in queue
router.get('/walk-ins', requireReceptionist, async (req, res) => {
  const rows = await db.all(`
    SELECT id, status, full_name, dob, phone, email, reason, arrival_minutes, booking_id, created_at
    FROM walkin_checkins
    WHERE created_at > (NOW() - INTERVAL 24 HOUR)
    ORDER BY created_at ASC`);
  logAccess(req, 'Viewed walk-in queue', null, { view: true });
  res.json(rows);
});

// Someone who turns up without checking in online: added at the desk as "arrived" and immediately becomes a booking the doctor sees.
router.post('/walk-ins', requireReceptionist, async (req, res) => {
  const b = req.body || {};
  const fullName = clean(b.fullName, 255);
  const dob = clean(b.dob, 20);
  const phone = clean(b.phone, 64);
  const email = clean(b.email, 255).toLowerCase();
  const reason = clean(b.reason, 500);
  if (!fullName || !dob || !phone || !reason) return res.status(400).json({ error: 'Please fill in name, date of birth, phone and reason for visit.' });
  if (!isPlausibleDob(dob)) return res.status(400).json({ error: 'Please enter a valid date of birth.' });
  if (email && !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address, or leave it blank.' });
  const id = newId('WI');
  await db.run(`
    INSERT INTO walkin_checkins (id, status, full_name, dob, phone, email, reason, arrival_minutes)
    VALUES (?, 'arrived', ?, ?, ?, ?, ?, 0)`, [id, fullName, dob, phone, email || null, db.encrypt(reason)]);
  const bookingId = await ensureWalkInBooking(id);
  logAccess(req, 'Added walk-in patient', `${fullName} (${id})`);
  res.json({ ok: true, id, bookingId });
});

router.post('/walk-ins/:id/status', requireReceptionist, async (req, res) => {
  const { status } = req.body || {};
  if (!WALKIN_STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status' });
  const result = await db.run('UPDATE walkin_checkins SET status = ?, updated_at = NOW() WHERE id = ?', [status, req.params.id]);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  await applyWalkInStatus(req.params.id, status);
  logAccess(req, `Marked walk-in ${status}`, req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- the day's online appointments (with the reason and intake answers)
router.get('/schedule', requireReceptionist, async (req, res) => {
  const date = req.query.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ error: 'date is required' });
  const rows = await db.all(`
    SELECT id, patient_name, patient_dob, patient_phone, service_type, reason, symptoms_duration, current_medications,
           allergies, extra_details, slot_start, slot_end, status
    FROM bookings
    WHERE status IN ('paid', 'completed') AND service_type <> 'walk_in' AND DATE(slot_start) = ?
    ORDER BY slot_start ASC`, [date]);
  const services = await getServices();
  logAccess(req, "Viewed appointments (with reasons and intake answers)", date, { view: true });
  res.json(rows.map((r) => ({ ...r, service: (services[r.service_type] || {}).label || r.service_type.replace('_', ' ') })));
});

// ---------------------------------------------------------------- registrations
// ?source=online (website form, default) or ?source=desk (registered at the desk by reception)
router.get('/registrations', requireReceptionist, async (req, res) => {
  const source = req.query.source === 'desk' ? 'desk' : 'online';
  const rows = await db.all(`
    SELECT id, status, source, registered_by, full_name, dob, sex, email, phone, address, eircode, previous_gp,
           known_conditions, current_medications, allergies, next_of_kin, family_members, reg_notes, created_at
    FROM patient_registrations
    WHERE source = ?
    ORDER BY (status = 'new') DESC, created_at DESC
    LIMIT 100`, [source]);
  const parse = (v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
  logAccess(req, `Viewed ${source === 'desk' ? 'desk' : 'website'} registrations (with health information)`, null, { view: true });
  res.json(rows.map((r) => ({ ...r, next_of_kin: parse(r.next_of_kin), family_members: parse(r.family_members) || [] })));
});

// Register a new patient at the desk. Same data as the website form; email is optional here.
router.post('/registrations', requireReceptionist, async (req, res) => {
  try {
    const b = req.body || {};
    const fullName = clean(b.fullName, 255);
    const dob = clean(b.dob, 20);
    const email = clean(b.email, 255).toLowerCase();
    const phone = clean(b.phone, 64);
    const address = clean(b.address, 1000);
    if (!fullName || !dob || !phone || !address) return res.status(400).json({ error: 'Please fill in name, date of birth, phone and address.' });
    if (!isPlausibleDob(dob)) return res.status(400).json({ error: 'Please enter a valid date of birth.' });
    if (email && !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address, or leave it blank.' });
    if (b.consentConfirmed !== true) return res.status(400).json({ error: 'Please confirm the patient has been shown the Privacy Notice and agrees.' });

    const family = [];
    for (const m of (Array.isArray(b.familyMembers) ? b.familyMembers : []).slice(0, MAX_FAMILY_MEMBERS)) {
      const name = clean(m && m.name, 255); const mdob = clean(m && m.dob, 20); const rel = clean(m && m.relationship, 64);
      if (!name && !mdob && !rel) continue;
      if (!name || !isPlausibleDob(mdob)) return res.status(400).json({ error: 'Each family member needs a name and a valid date of birth (or remove that row).' });
      family.push({ name, dob: mdob, relationship: rel });
    }
    const kinParts = { name: clean(b.nextOfKinName, 255), relationship: clean(b.nextOfKinRelationship, 64), phone: clean(b.nextOfKinPhone, 64) };
    const nextOfKin = Object.values(kinParts).some(Boolean) ? JSON.stringify(kinParts) : '';

    const id = newId('REG');
    await db.run(`
      INSERT INTO patient_registrations
        (id, source, registered_by, full_name, dob, sex, email, phone, address, eircode, previous_gp,
         known_conditions, current_medications, allergies, next_of_kin, family_members, reg_notes, consent_at)
      VALUES (?, 'desk', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [id, req.receptionist.name, fullName, dob, clean(b.sex, 32), email, phone, db.encrypt(address), clean(b.eircode, 16).toUpperCase(),
      clean(b.previousGp, 255), db.encrypt(clean(b.knownConditions, 2000)), db.encrypt(clean(b.currentMedications, 2000)),
      db.encrypt(clean(b.allergies, 1000)), db.encrypt(nextOfKin), db.encrypt(family.length ? JSON.stringify(family) : ''),
      db.encrypt(clean(b.notes, 2000))]);

    if (email) {
      getPractice().then((practice) => mailer.sendMail({
        to: email,
        subject: `Welcome to ${practice.name} — your registration`,
        html: `${emailHeader(practice)}<p>Hi ${esc(fullName)},</p><p>Thank you for registering with ${esc(practice.name)}. Your reference is <strong>${id}</strong>.</p>`,
      })).catch(() => {});
    }
    logAccess(req, 'Registered a new patient at the desk', `${fullName} (${id})`);
    res.json({ ok: true, reference: id });
  } catch (err) {
    console.error('desk registration failed:', err);
    res.status(500).json({ error: 'Something went wrong saving this registration. Please try again.' });
  }
});

router.post('/registrations/:id/status', requireReceptionist, async (req, res) => {
  const { status } = req.body || {};
  if (!['new', 'processed'].includes(status)) return res.status(400).json({ error: 'Unknown status' });
  const result = await db.run(
    'UPDATE patient_registrations SET status = ?, processed_at = ? WHERE id = ?',
    [status, status === 'processed' ? db.toMySQLDateTime(new Date().toISOString()) : null, req.params.id]
  );
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  logAccess(req, `Marked registration ${status}`, req.params.id);
  res.json({ ok: true });
});

module.exports = { router };
