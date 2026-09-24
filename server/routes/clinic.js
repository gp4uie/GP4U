const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const mailer = require('../mailer');
const { getPractice, escapeHtml: esc, emailHeader, enrichBooking } = require('../practice');
const formLimiter = require('../formLimiter');
const { requireDoctor } = require('./doctor');
const { applyWalkInStatus, ensureWalkInBooking } = require('../walkins');
const seo = require('../seo');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ARRIVAL_MINUTES = [0, 15, 30, 60];
const WALKIN_STATUSES = ['expected', 'arrived', 'seen', 'cancelled'];
const MAX_FAMILY_MEMBERS = 8;

// Same plausibility check as routes/booking.js — rejects obvious typos/placeholders only.
function isPlausibleDob(dob) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const date = new Date(dob + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return false;
  return date >= new Date('1900-01-01T00:00:00') && date <= new Date();
}

// Trim and cap length; anything that isn't a string becomes ''.
function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function newId(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`.toUpperCase();
}

// ---------------------------------------------------------------- public: new patient registration
router.post('/register-patient', formLimiter.limit('register'), async (req, res) => {
  try {
    const b = req.body || {};
    const fullName = clean(b.fullName, 255);
    const dob = clean(b.dob, 20);
    const email = clean(b.email, 255).toLowerCase();
    const phone = clean(b.phone, 64);
    const address = clean(b.address, 1000);

    if (!fullName || !dob || !email || !phone || !address) {
      return res.status(400).json({ error: 'Please fill in all required fields (marked with *).' });
    }
    if (!isPlausibleDob(dob)) return res.status(400).json({ error: 'Please enter a valid date of birth.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (b.consent !== true) {
      return res.status(400).json({ error: 'Please tick the box to confirm your details and agree to the Privacy Notice.' });
    }

    const familyMembers = [];
    for (const m of (Array.isArray(b.familyMembers) ? b.familyMembers : []).slice(0, MAX_FAMILY_MEMBERS)) {
      const name = clean(m && m.name, 255);
      const memberDob = clean(m && m.dob, 20);
      const relationship = clean(m && m.relationship, 64);
      if (!name && !memberDob && !relationship) continue; // untouched blank row
      if (!name || !isPlausibleDob(memberDob)) {
        return res.status(400).json({ error: 'Each family member needs a name and a valid date of birth (or remove that row).' });
      }
      familyMembers.push({ name, dob: memberDob, relationship });
    }

    const nextOfKin = [clean(b.nextOfKinName, 255), clean(b.nextOfKinRelationship, 64), clean(b.nextOfKinPhone, 64)]
      .some(Boolean)
      ? JSON.stringify({
        name: clean(b.nextOfKinName, 255),
        relationship: clean(b.nextOfKinRelationship, 64),
        phone: clean(b.nextOfKinPhone, 64),
      })
      : '';

    const id = newId('REG');
    await db.run(`
      INSERT INTO patient_registrations
        (id, full_name, dob, sex, email, phone, address, eircode, previous_gp,
         known_conditions, current_medications, allergies, next_of_kin, family_members, reg_notes, consent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      id, fullName, dob, clean(b.sex, 32), email, phone,
      db.encrypt(address), clean(b.eircode, 16).toUpperCase(), clean(b.previousGp, 255),
      db.encrypt(clean(b.knownConditions, 2000)), db.encrypt(clean(b.currentMedications, 2000)),
      db.encrypt(clean(b.allergies, 1000)),
      db.encrypt(nextOfKin), db.encrypt(familyMembers.length ? JSON.stringify(familyMembers) : ''),
      db.encrypt(clean(b.notes, 2000)),
    ]);

    // Best-effort emails — a missing/broken mail setup must never fail the registration itself.
    // Neither email contains any health information.
    const practiceInfo = await getPractice();
    const practice = practiceInfo.name;
    try {
      await mailer.sendMail({
        to: email,
        subject: `We've received your registration — ${practice}`,
        html: `${emailHeader(practiceInfo)}<p>Hi ${esc(fullName)},</p>
          <p>Thank you for registering with ${esc(practice)}. We've received your details${familyMembers.length ? ' (including your family members)' : ''} and our team will review them and be in touch.</p>
          <p>Your reference is <strong>${id}</strong>.</p>`,
      });
    } catch (err) {
      console.log('Registration confirmation email not sent:', err.message);
    }
    if (process.env.DOCTOR_EMAIL) {
      try {
        await mailer.sendMail({
          to: process.env.DOCTOR_EMAIL,
          subject: 'New patient registration',
          html: `<p>A new patient registration (${id}) has been submitted. Log in to the dashboard, Clinic tab, to review it.</p>`,
        });
      } catch (err) {
        console.log('Registration notification email not sent:', err.message);
      }
    }

    res.json({ ok: true, reference: id });
  } catch (err) {
    console.error('register-patient failed:', err);
    res.status(500).json({ error: 'Something went wrong saving your registration. Please try again.' });
  }
});

// ---------------------------------------------------------------- public: walk-in check-in
router.post('/walk-in', formLimiter.limit('walkin'), async (req, res) => {
  try {
    // No online check-ins before the Newbridge clinic opens (Admin → Website settings → clinic open switch).
    if (!(await seo.clinic()).clinicOpen) {
      return res.status(409).json({ error: "Our Newbridge clinic isn't open yet. You can see a GP online now." });
    }
    const b = req.body || {};
    const fullName = clean(b.fullName, 255);
    const dob = clean(b.dob, 20);
    const phone = clean(b.phone, 64);
    const email = clean(b.email, 255).toLowerCase();
    const reason = clean(b.reason, 500);
    const arrivalMinutes = Number(b.arrivalMinutes);

    if (!fullName || !dob || !phone || !reason) {
      return res.status(400).json({ error: 'Please fill in all required fields (marked with *).' });
    }
    if (!isPlausibleDob(dob)) return res.status(400).json({ error: 'Please enter a valid date of birth.' });
    if (email && !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address, or leave it blank.' });
    if (!ARRIVAL_MINUTES.includes(arrivalMinutes)) return res.status(400).json({ error: 'Please choose when you expect to arrive.' });
    if (b.notEmergency !== true) {
      return res.status(400).json({ error: 'Please confirm this is not an emergency. In an emergency call 112 or 999.' });
    }
    if (b.consent !== true) {
      return res.status(400).json({ error: 'Please tick the box to agree to the Privacy Notice.' });
    }

    const id = newId('WI');
    await db.run(`
      INSERT INTO walkin_checkins (id, full_name, dob, phone, email, reason, arrival_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, fullName, dob, phone, email || null, db.encrypt(reason), arrivalMinutes]);

    res.json({ ok: true, reference: id });
  } catch (err) {
    console.error('walk-in failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again, or just come in and check in at reception.' });
  }
});

// ---------------------------------------------------------------- staff (doctor login required)
router.get('/doctor/clinic/summary', requireDoctor, async (req, res) => {
  const regs = await db.get("SELECT COUNT(*) AS n FROM patient_registrations WHERE status = 'new'");
  const walkins = await db.get(`
    SELECT COUNT(*) AS n FROM walkin_checkins
    WHERE status IN ('expected', 'arrived') AND created_at > (NOW() - INTERVAL 24 HOUR)
  `);
  res.json({ newRegistrations: regs.n, activeWalkIns: walkins.n });
});

router.get('/doctor/clinic/walk-ins', requireDoctor, async (req, res) => {
  const rows = await db.all(`
    SELECT id, status, full_name, dob, phone, email, reason, arrival_minutes, booking_id, created_at
    FROM walkin_checkins
    WHERE created_at > (NOW() - INTERVAL 24 HOUR)
    ORDER BY created_at ASC
  `);
  res.json(rows);
});

router.post('/doctor/clinic/walk-ins/:id/status', requireDoctor, async (req, res) => {
  const { status } = req.body || {};
  if (!WALKIN_STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status' });
  const result = await db.run('UPDATE walkin_checkins SET status = ?, updated_at = NOW() WHERE id = ?', [status, req.params.id]);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  await applyWalkInStatus(req.params.id, status);
  res.json({ ok: true });
});

// "Open chart" from the walk-in queue: the patient is treated as arrived, a booking is created if there isn't one
// yet, and its id is returned so the dashboard can open the chart straight away.
router.post('/doctor/clinic/walk-ins/:id/open', requireDoctor, async (req, res) => {
  const w = await db.get('SELECT status FROM walkin_checkins WHERE id = ?', [req.params.id]);
  if (!w) return res.status(404).json({ error: 'Not found' });
  if (w.status === 'expected' || w.status === 'cancelled') {
    await db.run("UPDATE walkin_checkins SET status = 'arrived', updated_at = NOW() WHERE id = ?", [req.params.id]);
    await applyWalkInStatus(req.params.id, 'arrived');
  }
  res.json({ ok: true, bookingId: await ensureWalkInBooking(req.params.id) });
});

router.get('/doctor/clinic/registrations', requireDoctor, async (req, res) => {
  const rows = await db.all(`
    SELECT * FROM patient_registrations
    ORDER BY (status = 'new') DESC, created_at DESC
    LIMIT 100
  `);
  res.json(rows.map((r) => {
    const parse = (v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
    return { ...r, next_of_kin: parse(r.next_of_kin), family_members: parse(r.family_members) || [] };
  }));
});

router.post('/doctor/clinic/registrations/:id/status', requireDoctor, async (req, res) => {
  const { status } = req.body || {};
  if (!['new', 'processed'].includes(status)) return res.status(400).json({ error: 'Unknown status' });
  const result = await db.run(
    'UPDATE patient_registrations SET status = ?, processed_at = ? WHERE id = ?',
    [status, status === 'processed' ? db.toMySQLDateTime(new Date().toISOString()) : null, req.params.id]
  );
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
