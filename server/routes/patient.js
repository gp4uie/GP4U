const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { getPatient } = require('../patients');

const router = express.Router();

function requirePatient(req, res, next) {
  if (!req.session || !req.session.patientEmail) return res.status(401).json({ error: 'Not logged in' });
  next();
}

router.get('/me', async (req, res) => {
  if (!req.session || !req.session.patientEmail) return res.json({ loggedIn: false });
  const patient = await getPatient(req.session.patientEmail);
  res.json({ loggedIn: true, email: req.session.patientEmail, name: patient ? patient.name : '' });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const patient = email && await getPatient(email.toLowerCase().trim());
  if (!patient || !patient.password_hash || !bcrypt.compareSync(password || '', patient.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  req.session.patientEmail = patient.email;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/bookings', requirePatient, async (req, res) => {
  // hasUnread: a doctor message or an issued document arrived after the patient last opened
  // this booking (patient_last_viewed_at is updated by GET /api/bookings/:id — see booking.js).
  const bookings = await db.all(`
    SELECT
      id, patient_token AS token, service_type, slot_start, status,
      EXISTS(
        SELECT 1 FROM messages
        WHERE messages.booking_id = bookings.id AND messages.sender = 'doctor'
          AND messages.created_at > COALESCE(bookings.patient_last_viewed_at, '1970-01-01 00:00:00')
      ) OR EXISTS(
        SELECT 1 FROM documents
        WHERE documents.booking_id = bookings.id
          AND documents.created_at > COALESCE(bookings.patient_last_viewed_at, '1970-01-01 00:00:00')
      ) AS hasUnread
    FROM bookings WHERE patient_email = ? ORDER BY slot_start DESC
  `, [req.session.patientEmail]);
  res.json(bookings.map((b) => ({ ...b, hasUnread: !!b.hasUnread })));
});

// Every prescription and document across all of this patient's bookings, newest first —
// the "Documents Issued" tab in the patient portal.
router.get('/documents', requirePatient, async (req, res) => {
  const documents = await db.all(`
    SELECT documents.id, documents.doc_type, documents.created_at,
      bookings.id AS booking_id, bookings.patient_token AS token, bookings.service_type
    FROM documents JOIN bookings ON documents.booking_id = bookings.id
    WHERE bookings.patient_email = ?
    ORDER BY documents.created_at DESC
  `, [req.session.patientEmail]);
  const prescriptions = await db.all(`
    SELECT prescriptions.id, prescriptions.medication, prescriptions.issued_at AS created_at,
      bookings.id AS booking_id, bookings.patient_token AS token, bookings.service_type
    FROM prescriptions JOIN bookings ON prescriptions.booking_id = bookings.id
    WHERE bookings.patient_email = ?
    ORDER BY prescriptions.issued_at DESC
  `, [req.session.patientEmail]);
  res.json({ documents, prescriptions });
});

// Lets a patient set a password using their booking link as proof of email ownership —
// only works while no password is set yet (first time). To change an existing password,
// a proper "forgot password" email flow would need to be added later.
router.post('/set-password', async (req, res) => {
  const { bookingId, token, password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const booking = await db.get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
  if (!booking || booking.patient_token !== token) {
    return res.status(403).json({ error: 'Invalid access link' });
  }
  const patient = await getPatient(booking.patient_email);
  if (patient && patient.password_hash) {
    return res.status(409).json({ error: 'A password is already set for this email — please log in instead.' });
  }
  const hash = bcrypt.hashSync(password, 10);
  // Every booking creates its patients row via upsertPatient, but fail loudly rather than
  // silently no-op if that's ever not the case (e.g. a booking made before this feature existed).
  const result = await db.run('UPDATE patients SET password_hash = ? WHERE email = ?', [hash, booking.patient_email]);
  if (result.changes === 0) {
    return res.status(500).json({ error: 'No patient record found for this email — please make a new booking first.' });
  }
  req.session.patientEmail = booking.patient_email;
  res.json({ ok: true });
});

module.exports = { router, requirePatient };
