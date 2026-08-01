const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const mailer = require('../mailer');
const { DOCUMENT_TYPES } = require('../documentTypes');
const { MEDICATIONS } = require('../medications');

const router = express.Router();

// Also guards against a session referencing a doctor account that's since been removed
// (e.g. an admin deleted a colleague while they were still logged in elsewhere).
async function requireDoctor(req, res, next) {
  if (!req.session || !req.session.doctorId) return res.status(401).json({ error: 'Not logged in' });
  const doctor = await db.get('SELECT id FROM doctors WHERE id = ?', [req.session.doctorId]);
  if (!doctor) {
    req.session = null;
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

// Every route below that stamps a doctor's name/reg number on a record calls this to get the
// currently logged-in doctor, rather than a single site-wide env var — see server/db.js for the
// `doctors` table this reads from.
async function getCurrentDoctor(req) {
  return db.get('SELECT * FROM doctors WHERE id = ?', [req.session.doctorId]);
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const doctor = email && await db.get('SELECT * FROM doctors WHERE email = ?', [email.toLowerCase().trim()]);
  if (!doctor || !bcrypt.compareSync(password || '', doctor.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  req.session.doctorId = doctor.id;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/me', async (req, res) => {
  if (!req.session || !req.session.doctorId) return res.json({ loggedIn: false });
  const doctor = await getCurrentDoctor(req);
  if (!doctor) {
    req.session = null;
    return res.json({ loggedIn: false });
  }
  res.json({
    loggedIn: true,
    doctorName: doctor.name,
    doctorRegNumber: doctor.reg_number,
    practiceName: process.env.PRACTICE_NAME,
    mailerConfigured: mailer.isConfigured(),
  });
});

// --- Forgot / reset password ---
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const doctor = email && await db.get('SELECT * FROM doctors WHERE email = ?', [email.toLowerCase().trim()]);
  // Always respond the same way whether or not the email matches, so this can't be used to
  // find out which addresses have an account.
  if (doctor) {
    const token = crypto.randomBytes(32).toString('hex');
    await db.run(
      'UPDATE doctors SET reset_token = ?, reset_token_expires = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?',
      [token, doctor.id]
    );
    try {
      await mailer.sendMail({
        to: doctor.email,
        subject: `Reset your ${process.env.PRACTICE_NAME || 'GP4U'} doctor login`,
        html: `<p>Click below to set a new password. This link expires in 1 hour.</p>
          <p><a href="${process.env.BASE_URL}/reset-password.html?type=doctor&token=${token}">Reset password</a></p>`,
      });
    } catch (err) {
      // Mailer not configured — nothing more we can do automatically; an admin will need to
      // reset the password directly via the environment variables instead.
    }
  }
  res.json({ ok: true, message: 'If that email has a doctor account, a reset link has been sent.' });
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const doctor = token && await db.get(
    'SELECT * FROM doctors WHERE reset_token = ? AND reset_token_expires > NOW()',
    [token]
  );
  if (!doctor) return res.status(400).json({ error: 'This reset link is invalid or has expired' });
  const hash = bcrypt.hashSync(password, 10);
  await db.run('UPDATE doctors SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?', [hash, doctor.id]);
  res.json({ ok: true });
});

// --- Manage doctors (add/remove colleagues) ---
router.get('/doctors', requireDoctor, async (req, res) => {
  const doctors = await db.all('SELECT id, name, reg_number, email, created_at FROM doctors ORDER BY created_at ASC');
  res.json(doctors);
});

router.post('/doctors', requireDoctor, async (req, res) => {
  const { name, regNumber, email, password } = req.body;
  if (!name || !regNumber || !email || !password) {
    return res.status(400).json({ error: 'Name, registration number, email and password are all required' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const existing = await db.get('SELECT id FROM doctors WHERE email = ?', [email.toLowerCase().trim()]);
  if (existing) return res.status(409).json({ error: 'A doctor with that email already exists' });
  const hash = bcrypt.hashSync(password, 10);
  const info = await db.run(
    'INSERT INTO doctors (name, reg_number, email, password_hash) VALUES (?, ?, ?, ?)',
    [name.trim(), regNumber.trim(), email.toLowerCase().trim(), hash]
  );
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.delete('/doctors/:id', requireDoctor, async (req, res) => {
  const countRow = await db.get('SELECT COUNT(*) AS n FROM doctors');
  if (countRow.n <= 1) return res.status(400).json({ error: 'Cannot remove the only remaining doctor account' });
  await db.run('DELETE FROM doctors WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// Starter medication list for the prescription search/autocomplete — see server/medications.js
// for what this is (and isn't).
router.get('/medications', requireDoctor, (req, res) => {
  res.json(MEDICATIONS);
});

router.get('/bookings', requireDoctor, async (req, res) => {
  const bookings = await db.all("SELECT * FROM bookings WHERE status = 'paid' ORDER BY slot_start ASC");
  res.json(bookings.map(({ patient_token, ...b }) => b));
});

// Schedule view for one day — used by the main dashboard's 15-minute-slot calendar.
router.get('/schedule', requireDoctor, async (req, res) => {
  const date = req.query.date; // 'YYYY-MM-DD'
  if (!date) return res.status(400).json({ error: 'date is required' });
  const bookings = await db.all(`
    SELECT id, patient_name, service_type, reason, slot_start, slot_end, status
    FROM bookings
    WHERE status IN ('paid', 'completed') AND DATE(slot_start) = ?
    ORDER BY slot_start ASC
  `, [date]);
  res.json(bookings);
});

// Most recently handled cases (paid or completed), newest first — the "Recent Cases" tab.
router.get('/recent', requireDoctor, async (req, res) => {
  const bookings = await db.all(`
    SELECT id, patient_name, patient_dob, patient_phone, service_type, slot_start, status
    FROM bookings WHERE status IN ('paid', 'completed')
    ORDER BY slot_start DESC LIMIT 40
  `);
  res.json(bookings);
});

router.get('/notifications', requireDoctor, async (req, res) => {
  const notifications = await db.all('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 30');
  const unreadRow = await db.get('SELECT COUNT(*) AS n FROM notifications WHERE read_at IS NULL');
  res.json({ notifications, unreadCount: unreadRow.n });
});

router.post('/notifications/:id/read', requireDoctor, async (req, res) => {
  await db.run('UPDATE notifications SET read_at = NOW() WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

router.post('/notifications/read-all', requireDoctor, async (req, res) => {
  await db.run('UPDATE notifications SET read_at = NOW() WHERE read_at IS NULL');
  res.json({ ok: true });
});

// Patient record search — matches partial name, partial phone, or exact date of birth (YYYY-MM-DD).
// Note: this matches on name/DOB/phone text, not a dedicated patient ID, since there is no separate
// patient registration system yet. Double-check you have the right patient if names are common.
router.get('/search', requireDoctor, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  const like = `%${q}%`;
  const results = await db.all(`
    SELECT id, patient_name, patient_dob, patient_phone, service_type, slot_start, status
    FROM bookings
    WHERE status IN ('paid', 'completed')
      AND (patient_name LIKE ? OR patient_phone LIKE ? OR patient_dob = ?)
    ORDER BY slot_start DESC
  `, [like, like, q]);
  res.json(results);
});

router.get('/bookings/:id', requireDoctor, async (req, res) => {
  const booking = await db.get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
  if (!booking) return res.status(404).json({ error: 'Not found' });
  const messages = await db.all('SELECT sender, body, created_at FROM messages WHERE booking_id = ? ORDER BY created_at ASC', [req.params.id]);
  const prescriptions = await db.all('SELECT * FROM prescriptions WHERE booking_id = ? ORDER BY issued_at DESC', [req.params.id]);
  const notes = await db.all('SELECT * FROM clinical_notes WHERE booking_id = ? ORDER BY created_at DESC', [req.params.id]);
  const documents = await db.all('SELECT * FROM documents WHERE booking_id = ? ORDER BY created_at DESC', [req.params.id]);
  const attachments = await db.all('SELECT id, original_name, mime_type, created_at FROM attachments WHERE booking_id = ?', [req.params.id]);

  // Full continuity-of-care history: every other visit this patient has had, each with its own
  // notes/prescriptions/documents attached, so the doctor sees the whole picture on opening a chart
  // without having to click into each past booking separately.
  const previousBookings = await db.all(`
    SELECT id, service_type, reason, slot_start, status FROM bookings
    WHERE patient_email = ? AND id != ? AND status IN ('paid', 'completed')
    ORDER BY slot_start DESC LIMIT 20
  `, [booking.patient_email, req.params.id]);
  const previousConsultations = [];
  for (const b of previousBookings) {
    previousConsultations.push({
      ...b,
      notes: await db.all('SELECT * FROM clinical_notes WHERE booking_id = ? ORDER BY created_at DESC', [b.id]),
      prescriptions: await db.all('SELECT * FROM prescriptions WHERE booking_id = ? ORDER BY issued_at DESC', [b.id]),
      documents: await db.all('SELECT * FROM documents WHERE booking_id = ? ORDER BY created_at DESC', [b.id]),
    });
  }

  const { patient_token, ...safeBooking } = booking;
  res.json({ booking: safeBooking, messages, prescriptions, notes, documents, attachments, previousConsultations });
});

router.get('/attachments/:attId', requireDoctor, async (req, res) => {
  const att = await db.get('SELECT * FROM attachments WHERE id = ?', [req.params.attId]);
  if (!att) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Content-Type', att.mime_type);
  res.send(att.data);
});

router.post('/bookings/:id/messages', requireDoctor, async (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Message cannot be empty' });
  await db.run("INSERT INTO messages (booking_id, sender, body) VALUES (?, 'doctor', ?)", [req.params.id, body.trim()]);
  res.json({ ok: true });
});

router.post('/bookings/:id/complete', requireDoctor, async (req, res) => {
  await db.run("UPDATE bookings SET status = 'completed' WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// --- Clinical notes: append-only. No edit/delete route on purpose — see server/db.js comment. ---
router.post('/bookings/:id/notes', requireDoctor, async (req, res) => {
  const { noteText } = req.body;
  if (!noteText || !noteText.trim()) return res.status(400).json({ error: 'Note cannot be empty' });
  const doctor = await getCurrentDoctor(req);
  const info = await db.run(`
    INSERT INTO clinical_notes (booking_id, note_text, doctor_name) VALUES (?, ?, ?)
  `, [req.params.id, noteText.trim(), doctor.name]);
  res.json({ ok: true, id: info.lastInsertRowid });
});

// --- Prescriptions ---
router.post('/bookings/:id/prescriptions', requireDoctor, async (req, res) => {
  const { medication, dose, instructions, quantity } = req.body;
  if (!medication || !dose || !instructions || !quantity) {
    return res.status(400).json({ error: 'All prescription fields are required' });
  }
  const doctor = await getCurrentDoctor(req);
  const info = await db.run(`
    INSERT INTO prescriptions (booking_id, medication, dose, instructions, quantity, doctor_name, doctor_reg_number)
    VALUES (?,?,?,?,?,?,?)
  `, [req.params.id, medication, dose, instructions, quantity, doctor.name, doctor.reg_number]);
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.get('/prescriptions/:rxId', requireDoctor, async (req, res) => {
  const rx = await db.get('SELECT * FROM prescriptions WHERE id = ?', [req.params.rxId]);
  if (!rx) return res.status(404).json({ error: 'Not found' });
  const booking = await db.get('SELECT * FROM bookings WHERE id = ?', [rx.booking_id]);
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
  const rx = await db.get('SELECT * FROM prescriptions WHERE id = ?', [req.params.rxId]);
  if (!rx) return res.status(404).json({ error: 'Not found' });
  const booking = await db.get('SELECT * FROM bookings WHERE id = ?', [rx.booking_id]);

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
    await db.run("UPDATE prescriptions SET sent_to_email = ?, sent_at = NOW() WHERE id = ?", [toEmail, req.params.rxId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.code === 'MAILER_NOT_CONFIGURED' ? 400 : 500).json({ error: err.message });
  }
});

// --- Documents: sick certs and referral letters ---
router.post('/bookings/:id/documents', requireDoctor, async (req, res) => {
  const { docType, fields } = req.body;
  if (!DOCUMENT_TYPES[docType]) return res.status(400).json({ error: 'Unknown document type' });
  if (!fields || typeof fields !== 'object') return res.status(400).json({ error: 'Missing document fields' });
  const doctor = await getCurrentDoctor(req);
  const info = await db.run(`
    INSERT INTO documents (booking_id, doc_type, fields, doctor_name, doctor_reg_number)
    VALUES (?,?,?,?,?)
  `, [req.params.id, docType, JSON.stringify(fields), doctor.name, doctor.reg_number]);
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.get('/documents/:docId', requireDoctor, async (req, res) => {
  const doc = await db.get('SELECT * FROM documents WHERE id = ?', [req.params.docId]);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  const booking = await db.get('SELECT * FROM bookings WHERE id = ?', [doc.booking_id]);
  const { patient_token, ...safeBooking } = booking;
  res.json({
    document: { ...doc, fields: JSON.parse(doc.fields) },
    booking: safeBooking,
    practice: { name: process.env.PRACTICE_NAME, address: process.env.PRACTICE_ADDRESS, phone: process.env.PRACTICE_PHONE },
  });
});

router.post('/documents/:docId/send', requireDoctor, async (req, res) => {
  const doc = await db.get('SELECT * FROM documents WHERE id = ?', [req.params.docId]);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  const booking = await db.get('SELECT * FROM bookings WHERE id = ?', [doc.booking_id]);
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
    await db.run("UPDATE documents SET sent_to_email = ?, sent_at = NOW() WHERE id = ?", [toEmail, req.params.docId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.code === 'MAILER_NOT_CONFIGURED' ? 400 : 500).json({ error: err.message });
  }
});

module.exports = { router, requireDoctor };
