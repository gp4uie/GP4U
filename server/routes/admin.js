const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const mailer = require('../mailer');

const router = express.Router();

// Also guards against a session referencing an admin account that's since been removed.
async function requireAdmin(req, res, next) {
  if (!req.session || !req.session.adminId) return res.status(401).json({ error: 'Not logged in' });
  const admin = await db.get('SELECT id FROM admins WHERE id = ?', [req.session.adminId]);
  if (!admin) {
    req.session = null;
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const admin = email && await db.get('SELECT * FROM admins WHERE email = ?', [email.toLowerCase().trim()]);
  if (!admin || !bcrypt.compareSync(password || '', admin.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  req.session.adminId = admin.id;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/me', async (req, res) => {
  if (!req.session || !req.session.adminId) return res.json({ loggedIn: false });
  const admin = await db.get('SELECT * FROM admins WHERE id = ?', [req.session.adminId]);
  if (!admin) {
    req.session = null;
    return res.json({ loggedIn: false });
  }
  res.json({ loggedIn: true, adminName: admin.name, practiceName: process.env.PRACTICE_NAME });
});

// --- Forgot / reset password ---
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const admin = email && await db.get('SELECT * FROM admins WHERE email = ?', [email.toLowerCase().trim()]);
  // Always respond the same way whether or not the email matches, so this can't be used to
  // find out which addresses have an account.
  if (admin) {
    const token = crypto.randomBytes(32).toString('hex');
    await db.run(
      'UPDATE admins SET reset_token = ?, reset_token_expires = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?',
      [token, admin.id]
    );
    try {
      await mailer.sendMail({
        to: admin.email,
        subject: `Reset your ${process.env.PRACTICE_NAME || 'GP4U'} admin login`,
        html: `<p>Click below to set a new password. This link expires in 1 hour.</p>
          <p><a href="${process.env.BASE_URL}/reset-password.html?type=admin&token=${token}">Reset password</a></p>`,
      });
    } catch (err) {
      // Mailer not configured — nothing more we can do automatically.
    }
  }
  res.json({ ok: true, message: 'If that email has an admin account, a reset link has been sent.' });
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const admin = token && await db.get(
    'SELECT * FROM admins WHERE reset_token = ? AND reset_token_expires > NOW()',
    [token]
  );
  if (!admin) return res.status(400).json({ error: 'This reset link is invalid or has expired' });
  const hash = bcrypt.hashSync(password, 10);
  await db.run('UPDATE admins SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?', [hash, admin.id]);
  req.session.adminId = admin.id;
  res.json({ ok: true });
});

// --- Onboard / manage doctors ---
router.get('/doctors', requireAdmin, async (req, res) => {
  const doctors = await db.all('SELECT id, name, reg_number, email, created_at FROM doctors ORDER BY created_at ASC');
  res.json(doctors);
});

router.post('/doctors', requireAdmin, async (req, res) => {
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

router.delete('/doctors/:id', requireAdmin, async (req, res) => {
  const countRow = await db.get('SELECT COUNT(*) AS n FROM doctors');
  if (countRow.n <= 1) return res.status(400).json({ error: 'Cannot remove the only remaining doctor account' });
  await db.run('DELETE FROM doctor_availability WHERE doctor_id = ?', [req.params.id]);
  await db.run('DELETE FROM doctors WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// --- Any doctor's schedule (admin can set on a doctor's behalf; supports split shifts —
// multiple time ranges on the same day, e.g. 12:00-13:00 and 19:00-23:00). ---
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

router.get('/doctors/:id/availability', requireAdmin, async (req, res) => {
  const rows = await db.all(
    'SELECT id, day_of_week, start_time, end_time FROM doctor_availability WHERE doctor_id = ? ORDER BY day_of_week ASC, start_time ASC',
    [req.params.id]
  );
  res.json(rows.map((r) => ({ ...r, start_time: r.start_time.slice(0, 5), end_time: r.end_time.slice(0, 5) })));
});

// Body: { ranges: [{ dayOfWeek, startTime, endTime }, ...] } — replaces this doctor's entire
// week in one go. Multiple entries with the same dayOfWeek are allowed (split shifts).
router.put('/doctors/:id/availability', requireAdmin, async (req, res) => {
  const { ranges } = req.body;
  if (!Array.isArray(ranges)) return res.status(400).json({ error: 'ranges must be an array' });
  const doctor = await db.get('SELECT id FROM doctors WHERE id = ?', [req.params.id]);
  if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
  for (const r of ranges) {
    if (!Number.isInteger(r.dayOfWeek) || r.dayOfWeek < 0 || r.dayOfWeek > 6) {
      return res.status(400).json({ error: `Invalid day of week: ${r.dayOfWeek}` });
    }
    if (!TIME_RE.test(r.startTime) || !TIME_RE.test(r.endTime)) {
      return res.status(400).json({ error: `Invalid time for ${DAY_NAMES[r.dayOfWeek]}` });
    }
    if (r.startTime >= r.endTime) {
      return res.status(400).json({ error: `${DAY_NAMES[r.dayOfWeek]}: start time must be before end time` });
    }
  }
  await db.run('DELETE FROM doctor_availability WHERE doctor_id = ?', [req.params.id]);
  for (const r of ranges) {
    await db.run(
      'INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)',
      [req.params.id, r.dayOfWeek, r.startTime, r.endTime]
    );
  }
  res.json({ ok: true });
});

// --- Patients: every patient who has ever booked, with a compiled clinical summary that can
// be emailed to an external GP for continuity of care. ---
router.get('/patients', requireAdmin, async (req, res) => {
  const q = (req.query.q || '').trim();
  const like = `%${q}%`;
  const patients = q
    ? await db.all(`
        SELECT email, name, dob, phone, created_at FROM patients
        WHERE name LIKE ? OR email LIKE ? OR phone LIKE ?
        ORDER BY name ASC
      `, [like, like, like])
    : await db.all('SELECT email, name, dob, phone, created_at FROM patients ORDER BY name ASC');
  res.json(patients);
});

router.get('/patients/:email/summary', requireAdmin, async (req, res) => {
  const email = req.params.email.toLowerCase().trim();
  const patient = await db.get('SELECT * FROM patients WHERE email = ?', [email]);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  const bookings = await db.all(`
    SELECT id, service_type, reason, slot_start, status FROM bookings
    WHERE patient_email = ? ORDER BY slot_start DESC
  `, [email]);

  const consultations = [];
  for (const b of bookings) {
    consultations.push({
      ...b,
      notes: await db.all('SELECT * FROM clinical_notes WHERE booking_id = ? ORDER BY created_at DESC', [b.id]),
      prescriptions: await db.all('SELECT * FROM prescriptions WHERE booking_id = ? ORDER BY issued_at DESC', [b.id]),
      documents: await db.all('SELECT * FROM documents WHERE booking_id = ? ORDER BY created_at DESC', [b.id]),
    });
  }

  const lastSend = await db.get(
    'SELECT sent_to_email, sent_at FROM patient_summary_log WHERE patient_email = ? ORDER BY sent_at DESC LIMIT 1',
    [email]
  );

  res.json({ patient, consultations, lastSend: lastSend || null });
});

router.post('/patients/:email/send-summary', requireAdmin, async (req, res) => {
  const email = req.params.email.toLowerCase().trim();
  const { toEmail } = req.body;
  if (!toEmail) return res.status(400).json({ error: "The receiving GP's email address is required" });
  const patient = await db.get('SELECT * FROM patients WHERE email = ?', [email]);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  const bookings = await db.all(`
    SELECT id, service_type, reason, slot_start, status FROM bookings
    WHERE patient_email = ? ORDER BY slot_start DESC
  `, [email]);

  const sections = [];
  for (const b of bookings) {
    const notes = await db.all('SELECT * FROM clinical_notes WHERE booking_id = ? ORDER BY created_at DESC', [b.id]);
    const prescriptions = await db.all('SELECT * FROM prescriptions WHERE booking_id = ? ORDER BY issued_at DESC', [b.id]);
    const documents = await db.all('SELECT * FROM documents WHERE booking_id = ? ORDER BY created_at DESC', [b.id]);
    sections.push(`
      <h3>${new Date(b.slot_start).toLocaleDateString('en-IE')} — ${b.service_type.replace('_', ' ')}</h3>
      <p>Reason: ${b.reason || 'N/A'}</p>
      ${notes.length ? `<p><strong>Clinical notes:</strong><br>${notes.map((n) => `${n.note_text} (${n.doctor_name}, ${new Date(n.created_at).toLocaleDateString('en-IE')})`).join('<br>')}</p>` : ''}
      ${prescriptions.length ? `<p><strong>Prescriptions:</strong><br>${prescriptions.map((p) => `${p.medication} ${p.dose} — ${p.instructions}`).join('<br>')}</p>` : ''}
      ${documents.length ? `<p><strong>Documents issued:</strong> ${documents.map((d) => d.doc_type).join(', ')}</p>` : ''}
    `);
  }

  try {
    await mailer.sendMail({
      to: toEmail,
      subject: `Patient summary: ${patient.name} — ${process.env.PRACTICE_NAME || 'GP4U'}`,
      html: `
        <p><strong>${process.env.PRACTICE_NAME || 'GP4U'}</strong> — One Tap. Real Care. — www.gp4u.ie</p>
        <p><strong>Patient summary for:</strong> ${patient.name} (DOB ${patient.dob || 'N/A'})<br>
        Phone: ${patient.phone || 'N/A'}<br>Email: ${patient.email}</p>
        <hr>
        ${sections.join('<hr>') || '<p>No consultation history on file.</p>'}
      `,
    });
    await db.run(
      'INSERT INTO patient_summary_log (patient_email, sent_to_email, sent_by_admin_name) VALUES (?, ?, ?)',
      [email, toEmail, (await db.get('SELECT name FROM admins WHERE id = ?', [req.session.adminId])).name]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(err.code === 'MAILER_NOT_CONFIGURED' ? 400 : 500).json({ error: err.message });
  }
});

module.exports = { router, requireAdmin };
