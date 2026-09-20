const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const loginLimiter = require('../loginLimiter');
const { getServices } = require('../services');

/*
 * Front-desk (receptionist) API.
 *
 * Least privilege by design: a receptionist runs the walk-in queue, sees today's appointments and processes new-patient
 * registrations. The queries below select ONLY administrative columns, so clinical and health information is never sent to
 * this role at all (hiding it in the browser would not be enough):
 *   - no clinical notes, prescriptions, documents, charts, or online-booking questionnaire answers / reasons
 *   - no health fields from registrations (conditions, medicines, allergies, free-text notes)
 * What a receptionist may see is decided here, in one place.
 */
const router = express.Router();
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const WALKIN_STATUSES = ['expected', 'arrived', 'seen', 'cancelled'];

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
function isPlausibleDob(dob) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const d = new Date(dob + 'T00:00:00');
  return !Number.isNaN(d.getTime()) && d >= new Date('1900-01-01T00:00:00') && d <= new Date();
}

// Uses its own session keys (receptionistId), so doctor / admin / patient sessions can never satisfy it, and it can
// never satisfy theirs. Also ends the session when the account is deactivated or after 30 idle minutes.
async function requireReceptionist(req, res, next) {
  if (!req.session || !req.session.receptionistId) return res.status(401).json({ error: 'Not logged in' });
  const now = Date.now();
  if (req.session.receptionActivityAt && now - req.session.receptionActivityAt > IDLE_TIMEOUT_MS) {
    req.session.receptionistId = null;
    return res.status(401).json({ error: 'Session expired due to inactivity' });
  }
  const rec = await db.get('SELECT id, active FROM receptionists WHERE id = ?', [req.session.receptionistId]);
  if (!rec || rec.active === 0) {
    req.session.receptionistId = null;
    return res.status(401).json({ error: 'Not logged in' });
  }
  req.session.receptionActivityAt = now;
  db.run('UPDATE receptionists SET last_active_at = NOW() WHERE id = ?', [rec.id]).catch(() => {});
  next();
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
  res.json({ loggedIn: true, name: rec.name, practiceName: process.env.PRACTICE_NAME || 'GP4U Clinic' });
});

// ---------------------------------------------------------------- overview counts
router.get('/summary', requireReceptionist, async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : new Date().toISOString().slice(0, 10);
  const walkins = await db.get(`
    SELECT COUNT(*) AS n FROM walkin_checkins
    WHERE status IN ('expected', 'arrived') AND created_at > (NOW() - INTERVAL 24 HOUR)`);
  const regs = await db.get("SELECT COUNT(*) AS n FROM patient_registrations WHERE status = 'new'");
  const appts = await db.get("SELECT COUNT(*) AS n FROM bookings WHERE status IN ('paid', 'completed') AND DATE(slot_start) = ?", [date]);
  res.json({ waiting: walkins.n, newRegistrations: regs.n, appointmentsToday: appts.n });
});

// ---------------------------------------------------------------- walk-in queue
router.get('/walk-ins', requireReceptionist, async (req, res) => {
  const rows = await db.all(`
    SELECT id, status, full_name, dob, phone, email, reason, arrival_minutes, created_at
    FROM walkin_checkins
    WHERE created_at > (NOW() - INTERVAL 24 HOUR)
    ORDER BY created_at ASC`);
  res.json(rows);
});

// Someone who turns up without checking in online — the receptionist adds them at the desk (starts as "arrived").
router.post('/walk-ins', requireReceptionist, async (req, res) => {
  const b = req.body || {};
  const fullName = clean(b.fullName, 255);
  const dob = clean(b.dob, 20);
  const phone = clean(b.phone, 64);
  const reason = clean(b.reason, 500);
  if (!fullName || !dob || !phone || !reason) return res.status(400).json({ error: 'Please fill in name, date of birth, phone and reason for visit.' });
  if (!isPlausibleDob(dob)) return res.status(400).json({ error: 'Please enter a valid date of birth.' });
  const id = `WI-${crypto.randomBytes(4).toString('hex')}`.toUpperCase();
  await db.run(`
    INSERT INTO walkin_checkins (id, status, full_name, dob, phone, email, reason, arrival_minutes)
    VALUES (?, 'arrived', ?, ?, ?, NULL, ?, 0)`, [id, fullName, dob, phone, db.encrypt(reason)]);
  res.json({ ok: true, id });
});

router.post('/walk-ins/:id/status', requireReceptionist, async (req, res) => {
  const { status } = req.body || {};
  if (!WALKIN_STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status' });
  const result = await db.run('UPDATE walkin_checkins SET status = ?, updated_at = NOW() WHERE id = ?', [status, req.params.id]);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- today's online appointments (read-only, no clinical details)
router.get('/schedule', requireReceptionist, async (req, res) => {
  const date = req.query.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ error: 'date is required' });
  const rows = await db.all(`
    SELECT id, patient_name, service_type, slot_start, slot_end, status
    FROM bookings
    WHERE status IN ('paid', 'completed') AND DATE(slot_start) = ?
    ORDER BY slot_start ASC`, [date]);
  const services = await getServices();
  res.json(rows.map((r) => ({ ...r, service: (services[r.service_type] || {}).label || r.service_type.replace('_', ' ') })));
});

// ---------------------------------------------------------------- new-patient registrations (administrative details only)
router.get('/registrations', requireReceptionist, async (req, res) => {
  // Deliberately NOT selected: known_conditions, current_medications, allergies, reg_notes (health information).
  const rows = await db.all(`
    SELECT id, status, full_name, dob, sex, email, phone, address, eircode, medical_card, previous_gp,
           next_of_kin, family_members, created_at
    FROM patient_registrations
    ORDER BY (status = 'new') DESC, created_at DESC
    LIMIT 100`);
  const parse = (v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
  res.json(rows.map((r) => ({ ...r, next_of_kin: parse(r.next_of_kin), family_members: parse(r.family_members) || [] })));
});

router.post('/registrations/:id/status', requireReceptionist, async (req, res) => {
  const { status } = req.body || {};
  if (!['new', 'processed'].includes(status)) return res.status(400).json({ error: 'Unknown status' });
  const result = await db.run(
    'UPDATE patient_registrations SET status = ?, processed_at = ? WHERE id = ?',
    [status, status === 'processed' ? db.toMySQLDateTime(new Date().toISOString()) : null, req.params.id]
  );
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = { router };
