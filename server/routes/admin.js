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
// "Online" is derived from a recent heartbeat (see requireDoctor in routes/doctor.js) rather than
// a stored boolean — there's no reliable server-side signal for a browser tab just closing.
const ONLINE_WINDOW_MS = 3 * 60 * 1000;

router.get('/doctors', requireAdmin, async (req, res) => {
  const doctors = await db.all(
    'SELECT id, name, reg_number, email, active, last_login_at, last_active_at, totp_enabled, created_at FROM doctors ORDER BY created_at ASC'
  );
  res.json(doctors.map((d) => ({
    ...d,
    online: !!d.last_active_at && (Date.now() - new Date(d.last_active_at).getTime()) < ONLINE_WINDOW_MS,
  })));
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

// Deactivate is the primary way to remove a doctor's access now — it blocks login immediately
// (requireDoctor/login both check `active`) while keeping the account itself, its schedule, and
// its link in chart_access_log/tasks intact for reference. Hard delete (below) still exists for
// genuine cleanup (e.g. a duplicate account created by mistake) but is no longer the first tool
// reached for "this doctor left the practice".
router.post('/doctors/:id/deactivate', requireAdmin, async (req, res) => {
  const countRow = await db.get('SELECT COUNT(*) AS n FROM doctors WHERE active = 1 AND id != ?', [req.params.id]);
  if (countRow.n < 1) return res.status(400).json({ error: 'Cannot deactivate the only remaining active doctor account' });
  await db.run('UPDATE doctors SET active = 0 WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

router.post('/doctors/:id/reactivate', requireAdmin, async (req, res) => {
  await db.run('UPDATE doctors SET active = 1 WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// Lost-device recovery for a doctor's 2FA — same pragmatic pattern as password resets elsewhere
// in this app (an admin can always step in when the doctor's own recovery path is blocked).
router.post('/doctors/:id/disable-totp', requireAdmin, async (req, res) => {
  await db.run('UPDATE doctors SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
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

// --- Analytics: practice-level activity and revenue snapshot for the admin dashboard. Every
// number here is computed fresh from live booking/clinical data — nothing is stored separately,
// so it's always up to date. ---
// --- Internal staff chat: one shared board between admins and doctors (not patient-facing) ---
router.get('/internal-messages', requireAdmin, async (req, res) => {
  const messages = await db.all('SELECT * FROM internal_messages ORDER BY created_at ASC');
  res.json(messages);
});

router.post('/internal-messages', requireAdmin, async (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Message cannot be empty' });
  const admin = await db.get('SELECT name FROM admins WHERE id = ?', [req.session.adminId]);
  await db.run("INSERT INTO internal_messages (sender_type, sender_name, body) VALUES ('admin', ?, ?)", [admin.name, body.trim()]);
  res.json({ ok: true });
});

router.get('/analytics', requireAdmin, async (req, res) => {
  // "Seen" = a consultation that actually happened (status completed), counted by the
  // appointment's own slot_start date, not by name/whether it's a repeat.
  const patientsSeenToday = await db.get(
    "SELECT COUNT(DISTINCT patient_email) AS n FROM bookings WHERE status = 'completed' AND DATE(slot_start) = CURDATE()"
  );
  const patientsSeenWeek = await db.get(
    "SELECT COUNT(DISTINCT patient_email) AS n FROM bookings WHERE status = 'completed' AND YEARWEEK(slot_start, 1) = YEARWEEK(CURDATE(), 1)"
  );
  const patientsSeenMonth = await db.get(
    "SELECT COUNT(DISTINCT patient_email) AS n FROM bookings WHERE status = 'completed' AND YEAR(slot_start) = YEAR(CURDATE()) AND MONTH(slot_start) = MONTH(CURDATE())"
  );

  // Revenue is counted from the moment payment succeeds (status paid or completed), attributed
  // to when the booking was made (created_at) rather than the future appointment date.
  const revenueToday = await db.get(
    "SELECT COALESCE(SUM(amount_cents), 0) AS cents FROM bookings WHERE status IN ('paid', 'completed') AND DATE(created_at) = CURDATE()"
  );
  const revenueWeek = await db.get(
    "SELECT COALESCE(SUM(amount_cents), 0) AS cents FROM bookings WHERE status IN ('paid', 'completed') AND YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)"
  );
  const revenueMonth = await db.get(
    "SELECT COALESCE(SUM(amount_cents), 0) AS cents FROM bookings WHERE status IN ('paid', 'completed') AND YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())"
  );

  // Per doctor: how many distinct consultations each doctor has a clinical note on — the most
  // reliable "this doctor actually saw this patient" signal, since every real consultation should
  // get a note but stamped doctor_name survives even if that doctor account is later removed.
  const perDoctorTotal = await db.all(
    'SELECT doctor_name, COUNT(DISTINCT booking_id) AS n FROM clinical_notes GROUP BY doctor_name ORDER BY n DESC'
  );
  const perDoctorMonth = await db.all(`
    SELECT cn.doctor_name, COUNT(DISTINCT cn.booking_id) AS n
    FROM clinical_notes cn
    JOIN bookings b ON b.id = cn.booking_id
    WHERE YEAR(b.slot_start) = YEAR(CURDATE()) AND MONTH(b.slot_start) = MONTH(CURDATE())
    GROUP BY cn.doctor_name
  `);
  const monthByDoctor = {};
  perDoctorMonth.forEach((r) => { monthByDoctor[r.doctor_name] = r.n; });
  const perDoctor = perDoctorTotal.map((r) => ({
    doctorName: r.doctor_name,
    totalSeen: r.n,
    seenThisMonth: monthByDoctor[r.doctor_name] || 0,
  }));

  // Which consultation types are actually booked, and how much revenue each brings in.
  const serviceBreakdown = await db.all(`
    SELECT service_type, COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS cents
    FROM bookings WHERE status IN ('paid', 'completed')
    GROUP BY service_type ORDER BY n DESC
  `);

  // New vs returning this month: "new" = their very first ever booking falls in the current
  // month; "returning" = they booked before this month and booked again this month.
  const firstBookingByPatient = await db.all(`
    SELECT patient_email, MIN(created_at) AS first_booking
    FROM bookings WHERE status IN ('paid', 'completed')
    GROUP BY patient_email
  `);
  const bookedThisMonth = await db.all(`
    SELECT DISTINCT patient_email FROM bookings
    WHERE status IN ('paid', 'completed')
      AND YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())
  `);
  const firstBookingMap = {};
  firstBookingByPatient.forEach((r) => { firstBookingMap[r.patient_email] = new Date(r.first_booking); });
  const now = new Date();
  let newThisMonth = 0;
  let returningThisMonth = 0;
  bookedThisMonth.forEach((r) => {
    const first = firstBookingMap[r.patient_email];
    const isNew = first && first.getFullYear() === now.getFullYear() && first.getMonth() === now.getMonth();
    if (isNew) newThisMonth++; else returningThisMonth++;
  });

  // A few extra operational numbers worth having on one screen.
  const totalPatients = await db.get('SELECT COUNT(*) AS n FROM patients');
  const totalCompleted = await db.get("SELECT COUNT(*) AS n FROM bookings WHERE status = 'completed'");
  const upcoming = await db.get(
    "SELECT COUNT(*) AS n FROM bookings WHERE status = 'paid' AND slot_start > NOW()"
  );

  res.json({
    patientsSeen: { today: patientsSeenToday.n, week: patientsSeenWeek.n, month: patientsSeenMonth.n },
    revenueCents: { today: revenueToday.cents, week: revenueWeek.cents, month: revenueMonth.cents },
    perDoctor,
    serviceBreakdown,
    newVsReturning: { newThisMonth, returningThisMonth },
    totalPatients: totalPatients.n,
    totalCompleted: totalCompleted.n,
    upcoming: upcoming.n,
  });
});

// --- Patients: every patient who has ever booked, with a compiled clinical summary that can
// be emailed to an external GP for continuity of care. ---
// A single search box matches partial name (first, last, or both), email, phone number, or
// partial date of birth (e.g. "1990" or "1990-05"), whichever the admin typed.
router.get('/patients', requireAdmin, async (req, res) => {
  const q = (req.query.q || '').trim();
  const like = `%${q}%`;
  const patients = q
    ? await db.all(`
        SELECT email, name, dob, phone, created_at FROM patients
        WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? OR dob LIKE ?
        ORDER BY name ASC
      `, [like, like, like, like])
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
      ${prescriptions.length ? `<p><strong>Prescriptions:</strong><br>${prescriptions.map((p) => `${p.medication} ${p.dose}, ${p.frequency}, ${p.duration} — ${p.instructions}`).join('<br>')}</p>` : ''}
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

// --- Prescriptions & Summaries: practice-wide view, not scoped to a single patient search
// like the Patients tab above. ---
router.get('/prescriptions', requireAdmin, async (req, res) => {
  const prescriptions = await db.all(`
    SELECT p.*, b.patient_name, b.pharmacy_name FROM prescriptions p
    JOIN bookings b ON b.id = p.booking_id
    ORDER BY p.issued_at DESC LIMIT 100
  `);
  res.json(prescriptions);
});

// Who opened which patient's chart, and when — complements the clinical tables (which already
// record who wrote what) with a record of access itself. See chart_access_log in server/db.js
// and the write side in routes/doctor.js's GET /bookings/:id.
router.get('/access-log', requireAdmin, async (req, res) => {
  const log = await db.all(`
    SELECT cal.id, cal.viewed_at, d.name AS doctor_name, d.email AS doctor_email,
           b.id AS booking_id, b.patient_name, b.service_type
    FROM chart_access_log cal
    JOIN doctors d ON d.id = cal.doctor_id
    JOIN bookings b ON b.id = cal.booking_id
    ORDER BY cal.viewed_at DESC
    LIMIT 200
  `);
  res.json(log);
});

router.get('/completed-summaries', requireAdmin, async (req, res) => {
  const bookings = await db.all(`
    SELECT * FROM bookings WHERE status = 'completed' ORDER BY slot_start DESC LIMIT 50
  `);
  const summaries = [];
  for (const b of bookings) {
    const notes = await db.all('SELECT note_text FROM clinical_notes WHERE booking_id = ? ORDER BY created_at ASC', [b.id]);
    const prescriptions = await db.all('SELECT medication, dose, frequency, duration FROM prescriptions WHERE booking_id = ? ORDER BY issued_at ASC', [b.id]);
    const documents = await db.all('SELECT doc_type, fields FROM documents WHERE booking_id = ? ORDER BY created_at ASC', [b.id]);
    const sickCerts = documents.filter((d) => d.doc_type === 'sick_cert').map((d) => {
      const f = JSON.parse(d.fields);
      const days = Math.round((new Date(f.dateTo) - new Date(f.dateFrom)) / (1000 * 60 * 60 * 24)) + 1;
      return { days, dateFrom: f.dateFrom, dateTo: f.dateTo, fitForWork: f.fitForWork, diagnosis: f.diagnosis };
    });
    summaries.push({
      bookingId: b.id, patientName: b.patient_name, serviceType: b.service_type, slotStart: b.slot_start,
      reason: b.reason, notes, prescriptions, sickCerts,
    });
  }
  res.json(summaries);
});

module.exports = { router, requireAdmin };
