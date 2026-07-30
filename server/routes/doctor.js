const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const mailer = require('../mailer');
const { DOCUMENT_TYPES } = require('../documentTypes');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');

const router = express.Router();

function requireDoctor(req, res, next) {
  if (!req.session || !req.session.doctor) return res.status(401).json({ error: 'Not logged in' });
  next();
}

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password && password === process.env.DOCTOR_PASSWORD) {
    req.session.doctor = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Incorrect password' });
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({
    loggedIn: !!(req.session && req.session.doctor),
    doctorName: process.env.DOCTOR_NAME,
    practiceName: process.env.PRACTICE_NAME,
    mailerConfigured: mailer.isConfigured(),
  });
});

router.get('/bookings', requireDoctor, (req, res) => {
  const bookings = db.prepare("SELECT * FROM bookings WHERE status = 'paid' ORDER BY slot_start ASC").all();
  res.json(bookings.map(({ patient_token, ...b }) => b));
});

// Schedule view for one day — used by the main dashboard's 15-minute-slot calendar.
router.get('/schedule', requireDoctor, (req, res) => {
  const date = req.query.date; // 'YYYY-MM-DD'
  if (!date) return res.status(400).json({ error: 'date is required' });
  const bookings = db.prepare(`
    SELECT id, patient_name, service_type, reason, slot_start, slot_end, status
    FROM bookings
    WHERE status IN ('paid', 'completed') AND date(slot_start) = date(?)
    ORDER BY slot_start ASC
  `).all(date);
  res.json(bookings);
});

// Most recently handled cases (paid or completed), newest first — the "Recent Cases" tab.
router.get('/recent', requireDoctor, (req, res) => {
  const bookings = db.prepare(`
    SELECT id, patient_name, patient_dob, patient_phone, service_type, slot_start, status
    FROM bookings WHERE status IN ('paid', 'completed')
    ORDER BY slot_start DESC LIMIT 40
  `).all();
  res.json(bookings);
});

router.get('/notifications', requireDoctor, (req, res) => {
  const notifications = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 30').all();
  const unreadCount = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE read_at IS NULL').get().n;
  res.json({ notifications, unreadCount });
});

router.post('/notifications/:id/read', requireDoctor, (req, res) => {
  db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

router.post('/notifications/read-all', requireDoctor, (req, res) => {
  db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE read_at IS NULL").run();
  res.json({ ok: true });
});

// Patient record search — matches partial name, partial phone, or exact date of birth (YYYY-MM-DD).
// Note: this matches on name/DOB/phone text, not a dedicated patient ID, since there is no separate
// patient registration system yet. Double-check you have the right patient if names are common.
router.get('/search', requireDoctor, (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  const like = `%${q}%`;
  const results = db.prepare(`
    SELECT id, patient_name, patient_dob, patient_phone, service_type, slot_start, status
    FROM bookings
    WHERE status IN ('paid', 'completed')
      AND (patient_name LIKE ? OR patient_phone LIKE ? OR patient_dob = ?)
    ORDER BY slot_start DESC
  `).all(like, like, q);
  res.json(results);
});

router.get('/bookings/:id', requireDoctor, (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Not found' });
  const messages = db.prepare('SELECT sender, body, created_at FROM messages WHERE booking_id = ? ORDER BY created_at ASC').all(req.params.id);
  const prescriptions = db.prepare('SELECT * FROM prescriptions WHERE booking_id = ? ORDER BY issued_at DESC').all(req.params.id);
  const notes = db.prepare('SELECT * FROM clinical_notes WHERE booking_id = ? ORDER BY created_at DESC').all(req.params.id);
  const documents = db.prepare('SELECT * FROM documents WHERE booking_id = ? ORDER BY created_at DESC').all(req.params.id);
  const attachments = db.prepare('SELECT id, original_name, mime_type, created_at FROM attachments WHERE booking_id = ?').all(req.params.id);
  const previousConsultations = db.prepare(`
    SELECT id, service_type, reason, slot_start, status FROM bookings
    WHERE patient_email = ? AND id != ? AND status IN ('paid', 'completed')
    ORDER BY slot_start DESC LIMIT 20
  `).all(booking.patient_email, req.params.id);
  const { patient_token, ...safeBooking } = booking;
  res.json({ booking: safeBooking, messages, prescriptions, notes, documents, attachments, previousConsultations });
});

router.get('/attachments/:attId', requireDoctor, (req, res) => {
  const att = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.attId);
  if (!att) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Content-Type', att.mime_type);
  fs.createReadStream(path.join(UPLOADS_DIR, att.filename)).pipe(res);
});

router.post('/bookings/:id/messages', requireDoctor, (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Message cannot be empty' });
  db.prepare("INSERT INTO messages (booking_id, sender, body) VALUES (?, 'doctor', ?)").run(req.params.id, body.trim());
  res.json({ ok: true });
});

router.post('/bookings/:id/complete', requireDoctor, (req, res) => {
  db.prepare("UPDATE bookings SET status = 'completed' WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// --- Clinical notes: append-only. No edit/delete route on purpose — see server/db.js comment. ---
router.post('/bookings/:id/notes', requireDoctor, (req, res) => {
  const { noteText } = req.body;
  if (!noteText || !noteText.trim()) return res.status(400).json({ error: 'Note cannot be empty' });
  const info = db.prepare(`
    INSERT INTO clinical_notes (booking_id, note_text, doctor_name) VALUES (?, ?, ?)
  `).run(req.params.id, noteText.trim(), process.env.DOCTOR_NAME);
  res.json({ ok: true, id: info.lastInsertRowid });
});

// --- Prescriptions ---
router.post('/bookings/:id/prescriptions', requireDoctor, (req, res) => {
  const { medication, dose, instructions, quantity } = req.body;
  if (!medication || !dose || !instructions || !quantity) {
    return res.status(400).json({ error: 'All prescription fields are required' });
  }
  const info = db.prepare(`
    INSERT INTO prescriptions (booking_id, medication, dose, instructions, quantity, doctor_name, doctor_reg_number)
    VALUES (?,?,?,?,?,?,?)
  `).run(req.params.id, medication, dose, instructions, quantity, process.env.DOCTOR_NAME, process.env.DOCTOR_REG_NUMBER);
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.get('/prescriptions/:rxId', requireDoctor, (req, res) => {
  const rx = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(req.params.rxId);
  if (!rx) return res.status(404).json({ error: 'Not found' });
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(rx.booking_id);
  const { patient_token, ...safeBooking } = booking;
  res.json({
    prescription: rx,
    booking: safeBooking,
    practice: { name: process.env.PRACTICE_NAME, address: process.env.PRACTICE_ADDRESS, phone: process.env.PRACTICE_PHONE },
  });
});

router.post('/prescriptions/:rxId/send', requireDoctor, async (req, res) => {
  const { toEmail } = req.body;
  if (!toEmail) return res.status(400).json({ error: 'Pharmacy email address is required' });
  const rx = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(req.params.rxId);
  if (!rx) return res.status(404).json({ error: 'Not found' });
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(rx.booking_id);

  try {
    await mailer.sendMail({
      to: toEmail,
      subject: `Prescription for ${booking.patient_name} — ${process.env.PRACTICE_NAME}`,
      html: `
        <p><strong>${process.env.PRACTICE_NAME}</strong> — ${process.env.PRACTICE_ADDRESS || ''} — ${process.env.PRACTICE_PHONE || ''}</p>
        <p>Patient: ${booking.patient_name} (DOB ${booking.patient_dob})<br>Address: ${booking.patient_address || 'N/A'}</p>
        <p><strong>${rx.medication}</strong> — ${rx.dose}<br>Quantity: ${rx.quantity}<br>Instructions: ${rx.instructions}</p>
        <p>Prescribed by ${rx.doctor_name} (${rx.doctor_reg_number}) on ${new Date(rx.issued_at).toLocaleString('en-IE')}</p>
      `,
    });
    db.prepare('UPDATE prescriptions SET sent_to_email = ?, sent_at = datetime(\'now\') WHERE id = ?').run(toEmail, req.params.rxId);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.code === 'MAILER_NOT_CONFIGURED' ? 400 : 500).json({ error: err.message });
  }
});

// --- Documents: sick certs and referral letters ---
router.post('/bookings/:id/documents', requireDoctor, (req, res) => {
  const { docType, fields } = req.body;
  if (!DOCUMENT_TYPES[docType]) return res.status(400).json({ error: 'Unknown document type' });
  if (!fields || typeof fields !== 'object') return res.status(400).json({ error: 'Missing document fields' });
  const info = db.prepare(`
    INSERT INTO documents (booking_id, doc_type, fields, doctor_name, doctor_reg_number)
    VALUES (?,?,?,?,?)
  `).run(req.params.id, docType, JSON.stringify(fields), process.env.DOCTOR_NAME, process.env.DOCTOR_REG_NUMBER);
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.get('/documents/:docId', requireDoctor, (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.docId);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(doc.booking_id);
  const { patient_token, ...safeBooking } = booking;
  res.json({
    document: { ...doc, fields: JSON.parse(doc.fields) },
    booking: safeBooking,
    practice: { name: process.env.PRACTICE_NAME, address: process.env.PRACTICE_ADDRESS, phone: process.env.PRACTICE_PHONE },
  });
});

router.post('/documents/:docId/send', requireDoctor, async (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.docId);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(doc.booking_id);
  // Sick certs are always addressed to the patient — fall back to their email if none was given.
  const toEmail = req.body.toEmail || (doc.doc_type === 'sick_cert' ? booking.patient_email : null);
  if (!toEmail) return res.status(400).json({ error: 'Recipient email address is required' });
  const fields = JSON.parse(doc.fields);
  const label = DOCUMENT_TYPES[doc.doc_type].label;

  try {
    await mailer.sendMail({
      to: toEmail,
      subject: `${label} — ${booking.patient_name} — ${process.env.PRACTICE_NAME}`,
      html: `
        <p><strong>${process.env.PRACTICE_NAME}</strong> — ${process.env.PRACTICE_ADDRESS || ''} — ${process.env.PRACTICE_PHONE || ''}</p>
        <p><strong>${label}</strong></p>
        <p>Re: ${booking.patient_name} (DOB ${booking.patient_dob})<br>Address: ${booking.patient_address || 'N/A'}</p>
        <pre style="font-family:inherit; white-space:pre-wrap;">${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n')}</pre>
        <p>${doc.doctor_name} (${doc.doctor_reg_number})</p>
      `,
    });
    db.prepare('UPDATE documents SET sent_to_email = ?, sent_at = datetime(\'now\') WHERE id = ?').run(toEmail, req.params.docId);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.code === 'MAILER_NOT_CONFIGURED' ? 400 : 500).json({ error: err.message });
  }
});

module.exports = { router, requireDoctor };
