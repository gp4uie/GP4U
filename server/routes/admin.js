const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const mailer = require('../mailer');
const { getPractice, escapeHtml: esc, emailHeader, enrichBooking } = require('../practice');

const router = express.Router();

// Also guards against a session referencing an admin account that's since been removed.
async function requireAdmin(req, res, next) {
  if (!req.session || !req.session.adminId) return res.status(401).json({ error: 'Not logged in' });
  const admin = await db.get('SELECT id FROM admins WHERE id = ?', [req.session.adminId]);
  if (!admin) {
    req.session = null;
    return res.status(401).json({ error: 'Not logged in' });
  }
  // Fire-and-forget heartbeat for the "who's online" view on the doctor side's Team Messages tab.
  db.run('UPDATE admins SET last_active_at = NOW() WHERE id = ?', [req.session.adminId]).catch(() => {});
  next();
}

// Shared "recently active" presence window — kept in sync with the identical copy in
// routes/doctor.js (see that file's comment for why it isn't a shared module).
const ONLINE_WINDOW_MS = 3 * 60 * 1000;
function isOnline(lastActiveAt) {
  return !!lastActiveAt && (Date.now() - new Date(lastActiveAt).getTime()) < ONLINE_WINDOW_MS;
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
  res.json({ loggedIn: true, adminId: admin.id, adminName: admin.name, adminEmail: admin.email, practiceName: process.env.PRACTICE_NAME });
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
  const doctors = await db.all(
    'SELECT id, name, reg_number, email, active, last_login_at, last_active_at, totp_enabled, created_at FROM doctors ORDER BY created_at ASC'
  );
  res.json(doctors.map((d) => ({ ...d, online: isOnline(d.last_active_at) })));
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
// --- Internal staff chat: a broadcast "Everyone" board plus 1:1 DMs between admins and doctors
// (never patient-facing). `with=<type>:<id>` (e.g. "doctor:5") selects a private conversation with
// one person; omitted means the broadcast board. See routes/doctor.js for the doctor-side mirror. ---
router.get('/staff-directory', requireAdmin, async (req, res) => {
  const doctors = await db.all('SELECT id, name, last_active_at FROM doctors WHERE active = 1 ORDER BY name ASC');
  const admins = await db.all('SELECT id, name, last_active_at FROM admins ORDER BY name ASC');
  res.json([
    ...admins.map((a) => ({ type: 'admin', id: a.id, name: a.name, online: isOnline(a.last_active_at) })),
    ...doctors.map((d) => ({ type: 'doctor', id: d.id, name: d.name, online: isOnline(d.last_active_at) })),
  ]);
});

router.get('/internal-messages', requireAdmin, async (req, res) => {
  const myId = req.session.adminId;
  if (!req.query.with) {
    const messages = await db.all('SELECT * FROM internal_messages WHERE recipient_type IS NULL ORDER BY created_at ASC');
    return res.json(messages);
  }
  const [otherType, otherIdStr] = String(req.query.with).split(':');
  const otherId = Number(otherIdStr);
  const messages = await db.all(`
    SELECT * FROM internal_messages
    WHERE (sender_type = 'admin' AND sender_id = ? AND recipient_type = ? AND recipient_id = ?)
       OR (sender_type = ? AND sender_id = ? AND recipient_type = 'admin' AND recipient_id = ?)
    ORDER BY created_at ASC
  `, [myId, otherType, otherId, otherType, otherId, myId]);
  res.json(messages);
});

router.post('/internal-messages', requireAdmin, async (req, res) => {
  const { body, with: withParam } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Message cannot be empty' });
  const admin = await db.get('SELECT * FROM admins WHERE id = ?', [req.session.adminId]);
  let recipientType = null, recipientId = null;
  if (withParam) {
    const [rt, ridStr] = String(withParam).split(':');
    recipientType = rt;
    recipientId = Number(ridStr);
  }
  await db.run(
    'INSERT INTO internal_messages (sender_type, sender_id, sender_name, recipient_type, recipient_id, body) VALUES (?,?,?,?,?,?)',
    ['admin', admin.id, admin.name, recipientType, recipientId, body.trim()]
  );
  res.json({ ok: true });
});

router.get('/analytics', requireAdmin, async (req, res) => {
  // "Seen" = a consultation that actually happened (status completed), counted by the
  // appointment's own slot_start date, not by name/whether it's a repeat.
  const patientsSeenToday = await db.get(
    "SELECT COUNT(DISTINCT COALESCE(NULLIF(patient_email, ''), CONCAT(patient_name, '|', patient_dob))) AS n FROM bookings WHERE status = 'completed' AND DATE(slot_start) = CURDATE()"
  );
  const patientsSeenWeek = await db.get(
    "SELECT COUNT(DISTINCT COALESCE(NULLIF(patient_email, ''), CONCAT(patient_name, '|', patient_dob))) AS n FROM bookings WHERE status = 'completed' AND YEARWEEK(slot_start, 1) = YEARWEEK(CURDATE(), 1)"
  );
  const patientsSeenMonth = await db.get(
    "SELECT COUNT(DISTINCT COALESCE(NULLIF(patient_email, ''), CONCAT(patient_name, '|', patient_dob))) AS n FROM bookings WHERE status = 'completed' AND YEAR(slot_start) = YEAR(CURDATE()) AND MONTH(slot_start) = MONTH(CURDATE())"
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
    SELECT COALESCE(NULLIF(patient_email, ''), CONCAT(patient_name, '|', patient_dob)) AS patient_key, MIN(created_at) AS first_booking
    FROM bookings WHERE status IN ('paid', 'completed')
    GROUP BY patient_key
  `);
  const bookedThisMonth = await db.all(`
    SELECT DISTINCT COALESCE(NULLIF(patient_email, ''), CONCAT(patient_name, '|', patient_dob)) AS patient_key FROM bookings
    WHERE status IN ('paid', 'completed')
      AND YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())
  `);
  const firstBookingMap = {};
  firstBookingByPatient.forEach((r) => { firstBookingMap[r.patient_key] = new Date(r.first_booking); });
  const now = new Date();
  let newThisMonth = 0;
  let returningThisMonth = 0;
  bookedThisMonth.forEach((r) => {
    const first = firstBookingMap[r.patient_key];
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
      <h3>${esc(new Date(b.slot_start).toLocaleDateString('en-IE', { timeZone: 'Europe/Dublin' }))} — ${esc(b.service_type === 'walk_in' ? 'Walk-in visit' : b.service_type.replace('_', ' '))}</h3>
      <p>Reason: ${esc(b.reason || 'N/A')}</p>
      ${notes.length ? `<p><strong>Clinical notes:</strong><br>${notes.map((n) => esc(`${n.note_text} (${n.doctor_name}, ${new Date(n.created_at).toLocaleDateString('en-IE', { timeZone: 'Europe/Dublin' })})`)).join('<br>')}</p>` : ''}
      ${prescriptions.length ? `<p><strong>Prescriptions:</strong><br>${prescriptions.map((p) => esc(`${p.medication} ${p.dose}, ${p.frequency}, ${p.duration} — ${p.instructions}`)).join('<br>')}</p>` : ''}
      ${documents.length ? `<p><strong>Documents issued:</strong> ${documents.map((d) => d.doc_type).join(', ')}</p>` : ''}
    `);
  }

  try {
    await mailer.sendMail({
      to: toEmail,
      subject: `Patient summary: ${patient.name} — ${(await getPractice()).name}`,
      html: `
        ${emailHeader(await getPractice())}
        <p><strong>Patient summary for:</strong> ${esc(patient.name)} (DOB ${esc(patient.dob || 'N/A')})<br>
        Phone: ${esc(patient.phone || 'N/A')}<br>Email: ${esc(patient.email)}</p>
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

// --- Reception (front-desk) accounts: created and managed by an admin, never by the receptionist themselves ---
router.get('/receptionists', requireAdmin, async (req, res) => {
  const rows = await db.all('SELECT id, name, email, active, last_login_at, last_active_at, created_at FROM receptionists ORDER BY created_at ASC');
  res.json(rows.map((r) => ({ ...r, online: isOnline(r.last_active_at) })));
});

router.post('/receptionists', requireAdmin, async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are all required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const clean = email.toLowerCase().trim();
  if (await db.get('SELECT id FROM receptionists WHERE email = ?', [clean])) return res.status(409).json({ error: 'A reception account with that email already exists' });
  const info = await db.run('INSERT INTO receptionists (name, email, password_hash) VALUES (?, ?, ?)', [name.trim(), clean, bcrypt.hashSync(password, 10)]);
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.post('/receptionists/:id/deactivate', requireAdmin, async (req, res) => {
  await db.run('UPDATE receptionists SET active = 0 WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

router.post('/receptionists/:id/reactivate', requireAdmin, async (req, res) => {
  await db.run('UPDATE receptionists SET active = 1 WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// Set a new password for a receptionist (e.g. forgotten) — the admin chooses it and passes it on in person.
router.post('/receptionists/:id/password', requireAdmin, async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const result = await db.run('UPDATE receptionists SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(password, 10), req.params.id]);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// --- Go-live checklist: what still needs setting up for the clinic to run for real. Only yes/no answers are returned —
// never the values of any secret. ---
router.get('/setup-status', requireAdmin, async (req, res) => {
  const { getPractice } = require('../practice');
  const practice = await getPractice();
  const clinicRow = await db.get("SELECT data FROM site_config WHERE name = 'clinic'");
  const o = clinicRow ? JSON.parse(clinicRow.data) : {};
  const doctors = await db.all('SELECT id, totp_enabled FROM doctors WHERE active = 1');
  const withHours = await db.get('SELECT COUNT(DISTINCT doctor_id) AS n FROM doctor_availability');
  const item = (key, group, label, ok, todo, why) => ({ key, group, label, ok: !!ok, todo, why });
  const items = [
    item('payments', 'Online bookings', 'Card payments are switched on', !!process.env.STRIPE_SECRET_KEY,
      'Add your Stripe keys (STRIPE_SECRET_KEY and the webhook secret) in the hosting settings.',
      'Until then, online bookings are confirmed WITHOUT taking payment (demo mode).'),
    item('email', 'Online bookings', 'Email sending is set up', !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
      'Add SMTP_HOST, SMTP_USER and SMTP_PASS in the hosting settings.',
      'Without it no emails go out: booking confirmations, password resets, prescription copies, registration confirmations.'),
    item('availability', 'Online bookings', 'A doctor has online appointment hours', withHours.n > 0,
      'Admin → Doctors → Edit Schedule.', 'Patients can only book times that a doctor has made available.'),
    item('notify', 'Online bookings', 'Notification email address for new bookings and registrations', !!process.env.DOCTOR_EMAIL,
      'Set DOCTOR_EMAIL in the hosting settings.', 'Otherwise nobody is emailed when a booking, message or registration arrives (the dashboards still show them).'),
    item('address', 'Website', 'Street address entered', !!o.streetAddress,
      'Admin → Website settings → Clinic details.', 'Until then the website says "Address coming soon" and prescriptions/letters show only "Newbridge, Co. Kildare".'),
    item('phone', 'Website', 'Phone number entered', !!practice.phone, 'Admin → Website settings → Clinic details.', 'Patients and pharmacies have no number to ring.'),
    item('company', 'Website', 'Company details entered (name, CRO number, registered office)', !!(o.companyName && o.companyNumber && o.registeredOffice),
      'Admin → Website settings → Clinic details.', 'Irish company law expects these on a company website; they also print in the footer of letters.'),
    item('fees', 'Website', 'Walk-in fees entered', !!(o.fees && o.fees.walkIn && o.fees.walkIn.length),
      'Admin → Website settings → Fees & lead GP.', 'The Fees page otherwise just asks people to contact the clinic.'),
    item('leadgp', 'Website', 'Lead GP details entered', !!(o.founder && o.founder.name),
      'Admin → Website settings → Fees & lead GP.', 'The About page has no named doctor.'),
    item('twofa', 'Security', 'Every doctor has two-factor sign-in switched on', doctors.length > 0 && doctors.every((d) => d.totp_enabled),
      'Each doctor: Doctor dashboard → Security.', 'Protects patient records if a password is guessed or leaked.'),
    item('secrets', 'Security', 'Encryption key and session secret are set', !!(process.env.ENCRYPTION_KEY && process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16),
      'Set ENCRYPTION_KEY and SESSION_SECRET in the hosting settings — and keep a copy of the encryption key somewhere safe.', 'Without the key, saved clinical notes cannot be read.'),
    item('https', 'Security', 'The site address is https', /^https:\/\//.test(process.env.BASE_URL || ''),
      'Set BASE_URL=https://www.gp4u.ie in the hosting settings.', 'Links in emails and cookies need it.'),
  ];
  res.json({ done: items.filter((i) => i.ok).length, total: items.length, items });
});

// --- Edit people: an admin can correct a doctor's or receptionist's details, reset a password, or remove a receptionist ---
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanStr = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

router.put('/doctors/:id', requireAdmin, async (req, res) => {
  const name = cleanStr(req.body.name, 255); const regNumber = cleanStr(req.body.regNumber, 64); const email = cleanStr(req.body.email, 255).toLowerCase();
  if (!name || !regNumber || !email) return res.status(400).json({ error: 'Name, registration number and email are all required' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address' });
  const clash = await db.get('SELECT id FROM doctors WHERE email = ? AND id <> ?', [email, req.params.id]);
  if (clash) return res.status(409).json({ error: 'Another doctor already uses that email' });
  const result = await db.run('UPDATE doctors SET name = ?, reg_number = ?, email = ? WHERE id = ?', [name, regNumber, email, req.params.id]);
  if (!result.changes) return res.status(404).json({ error: 'Doctor not found' });
  res.json({ ok: true });
});

router.post('/doctors/:id/password', requireAdmin, async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const result = await db.run('UPDATE doctors SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(password, 10), req.params.id]);
  if (!result.changes) return res.status(404).json({ error: 'Doctor not found' });
  res.json({ ok: true });
});

router.put('/receptionists/:id', requireAdmin, async (req, res) => {
  const name = cleanStr(req.body.name, 255); const email = cleanStr(req.body.email, 255).toLowerCase();
  if (!name || !email) return res.status(400).json({ error: 'Name and email are both required' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address' });
  const clash = await db.get('SELECT id FROM receptionists WHERE email = ? AND id <> ?', [email, req.params.id]);
  if (clash) return res.status(409).json({ error: 'Another reception account already uses that email' });
  const result = await db.run('UPDATE receptionists SET name = ?, email = ? WHERE id = ?', [name, email, req.params.id]);
  if (!result.changes) return res.status(404).json({ error: 'Account not found' });
  res.json({ ok: true });
});

router.delete('/receptionists/:id', requireAdmin, async (req, res) => {
  const result = await db.run('DELETE FROM receptionists WHERE id = ?', [req.params.id]);
  if (!result.changes) return res.status(404).json({ error: 'Account not found' });
  res.json({ ok: true });
});

// The signed-in admin's own account
router.put('/me', requireAdmin, async (req, res) => {
  const name = cleanStr(req.body.name, 255); const email = cleanStr(req.body.email, 255).toLowerCase();
  if (!name || !email) return res.status(400).json({ error: 'Name and email are both required' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address' });
  const clash = await db.get('SELECT id FROM admins WHERE email = ? AND id <> ?', [email, req.session.adminId]);
  if (clash) return res.status(409).json({ error: 'Another admin already uses that email' });
  await db.run('UPDATE admins SET name = ?, email = ? WHERE id = ?', [name, email, req.session.adminId]);
  res.json({ ok: true });
});

router.post('/me/password', requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'The new password must be at least 8 characters' });
  const me = await db.get('SELECT password_hash FROM admins WHERE id = ?', [req.session.adminId]);
  if (!me || !bcrypt.compareSync(currentPassword || '', me.password_hash)) return res.status(403).json({ error: 'Your current password is not correct' });
  await db.run('UPDATE admins SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(newPassword, 10), req.session.adminId]);
  res.json({ ok: true });
});

// Front-desk activity: receptionists can see health information, so what they viewed and changed is reviewable here.
router.get('/reception-log', requireAdmin, async (req, res) => {
  const log = await db.all(`
    SELECT l.id, l.action, l.detail, l.created_at, r.name AS receptionist_name
    FROM reception_access_log l
    LEFT JOIN receptionists r ON r.id = l.receptionist_id
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT 200
  `);
  res.json(log);
});

module.exports = { router, requireAdmin };
