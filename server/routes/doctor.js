const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const mailer = require('../mailer');
const { generateSickCertPdf, generateReferralPdf, generatePrescriptionPdf } = require('../pdf');
const { DOCUMENT_TYPES } = require('../documentTypes');
const { MEDICATIONS } = require('../medications');
const { getDayHoursRange } = require('../slots');
const loginLimiter = require('../loginLimiter');
const totp = require('../totp');

const router = express.Router();
const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';

// The session cookie itself lasts 30 days ("remember me" on a personal device), but a doctor's
// account being open and idle on a shared clinic machine is a different risk — this closes that
// gap independently, by stamping req.session.lastActivityAt on every authenticated request and
// rejecting once it's gone stale, without touching the cookie's own longer-lived expiry.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

// Also guards against a session referencing a doctor account that's since been removed, or
// deactivated by an admin while still logged in elsewhere.
async function requireDoctor(req, res, next) {
  if (!req.session || !req.session.doctorId) return res.status(401).json({ error: 'Not logged in' });
  const now = Date.now();
  if (req.session.lastActivityAt && now - req.session.lastActivityAt > IDLE_TIMEOUT_MS) {
    req.session = null;
    return res.status(401).json({ error: 'Session expired due to inactivity' });
  }
  const doctor = await db.get('SELECT id, active FROM doctors WHERE id = ?', [req.session.doctorId]);
  if (!doctor || doctor.active === 0) {
    req.session = null;
    return res.status(401).json({ error: 'Not logged in' });
  }
  req.session.lastActivityAt = now;
  // Fire-and-forget heartbeat for the admin "who's online" view — never worth delaying or
  // failing the actual request over.
  db.run('UPDATE doctors SET last_active_at = NOW() WHERE id = ?', [req.session.doctorId]).catch(() => {});
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
  const accountKey = (email || '').toLowerCase().trim();

  const limit = loginLimiter.checkLimit(accountKey, req.ip);
  if (limit.blocked) {
    const minutes = Math.ceil(limit.retryAfterMs / 60000);
    return res.status(429).json({
      error: limit.reason === 'account'
        ? `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or use "Forgot your password?".`
        : `Too many login attempts from this network. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    });
  }

  const doctor = accountKey && await db.get('SELECT * FROM doctors WHERE email = ?', [accountKey]);
  if (!doctor || !bcrypt.compareSync(password || '', doctor.password_hash)) {
    loginLimiter.recordFailure(accountKey, req.ip);
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  if (doctor.active === 0) {
    // Deliberately not rate-limited/recorded as a failure — the password was correct, this
    // isn't a guessing attempt, just an access decision.
    return res.status(403).json({ error: 'This account has been deactivated. Contact your practice administrator.' });
  }
  loginLimiter.recordSuccess(accountKey);

  if (doctor.totp_enabled) {
    // Password is correct but the session isn't authenticated yet — pendingDoctorId (not
    // doctorId) is deliberately a different key so requireDoctor can't be satisfied by it; only
    // POST /login/verify-totp promotes this to a real session.
    req.session.pendingDoctorId = doctor.id;
    return res.json({ ok: true, requiresTotp: true });
  }
  req.session.doctorId = doctor.id;
  req.session.lastActivityAt = Date.now();
  await db.run('UPDATE doctors SET last_login_at = NOW() WHERE id = ?', [doctor.id]);
  res.json({ ok: true });
});

router.post('/login/verify-totp', async (req, res) => {
  const { code } = req.body;
  if (!req.session || !req.session.pendingDoctorId) return res.status(401).json({ error: 'Not logged in' });
  const doctor = await db.get('SELECT * FROM doctors WHERE id = ?', [req.session.pendingDoctorId]);
  if (!doctor || !doctor.totp_enabled || doctor.active === 0) {
    req.session = null;
    return res.status(401).json({ error: 'Not logged in' });
  }

  const limitKey = 'totp:' + doctor.email;
  const limit = loginLimiter.checkLimit(limitKey, req.ip);
  if (limit.blocked) {
    const minutes = Math.ceil(limit.retryAfterMs / 60000);
    return res.status(429).json({ error: `Too many incorrect codes. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` });
  }

  if (!totp.verifyTotp(doctor.totp_secret, code)) {
    loginLimiter.recordFailure(limitKey, req.ip);
    return res.status(401).json({ error: 'Incorrect code' });
  }
  loginLimiter.recordSuccess(limitKey);
  req.session.doctorId = doctor.id;
  req.session.pendingDoctorId = null;
  req.session.lastActivityAt = Date.now();
  await db.run('UPDATE doctors SET last_login_at = NOW() WHERE id = ?', [doctor.id]);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/me', async (req, res) => {
  if (!req.session || !req.session.doctorId) return res.json({ loggedIn: false });
  if (req.session.lastActivityAt && Date.now() - req.session.lastActivityAt > IDLE_TIMEOUT_MS) {
    req.session = null;
    return res.json({ loggedIn: false });
  }
  const doctor = await getCurrentDoctor(req);
  if (!doctor || doctor.active === 0) {
    req.session = null;
    return res.json({ loggedIn: false });
  }
  req.session.lastActivityAt = Date.now();
  res.json({
    loggedIn: true,
    doctorName: doctor.name,
    doctorRegNumber: doctor.reg_number,
    doctorEmail: doctor.email,
    practiceName: process.env.PRACTICE_NAME,
    mailerConfigured: mailer.isConfigured(),
    totpEnabled: !!doctor.totp_enabled,
  });
});

// --- Two-factor authentication (TOTP) ---
// Enrollment is two steps on purpose: /totp/setup only stores the secret, /totp/confirm only
// flips totp_enabled on after the doctor proves they can actually generate a valid code from it —
// so a doctor who closes the tab mid-setup (never confirms) is never locked out by a secret they
// don't have safely saved in an app yet.
router.post('/totp/setup', requireDoctor, async (req, res) => {
  const doctor = await getCurrentDoctor(req);
  const secret = totp.generateSecret();
  await db.run('UPDATE doctors SET totp_secret = ?, totp_enabled = 0 WHERE id = ?', [secret, doctor.id]);
  res.json({ secret, otpauthUrl: totp.otpauthUrl(doctor.email, secret, process.env.PRACTICE_NAME || 'GP4U') });
});

router.post('/totp/confirm', requireDoctor, async (req, res) => {
  const { code } = req.body;
  const doctor = await getCurrentDoctor(req);
  if (!doctor.totp_secret) return res.status(400).json({ error: 'Start setup first.' });
  if (!totp.verifyTotp(doctor.totp_secret, code)) {
    return res.status(400).json({ error: 'Incorrect code — check the time on your phone and try the newest code shown.' });
  }
  await db.run('UPDATE doctors SET totp_enabled = 1 WHERE id = ?', [doctor.id]);
  res.json({ ok: true });
});

router.post('/totp/disable', requireDoctor, async (req, res) => {
  const { password } = req.body;
  const doctor = await getCurrentDoctor(req);
  if (!bcrypt.compareSync(password || '', doctor.password_hash)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  await db.run('UPDATE doctors SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?', [doctor.id]);
  res.json({ ok: true });
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

// Note: adding/removing doctors and setting any doctor's schedule is admin-only now — see
// server/routes/admin.js. Doctors have no self-service access to either.

// Starter medication list for the prescription search/autocomplete — see server/medications.js
// for what this is (and isn't).
router.get('/medications', requireDoctor, (req, res) => {
  res.json(MEDICATIONS);
});

router.get('/bookings', requireDoctor, async (req, res) => {
  const bookings = await db.all("SELECT * FROM bookings WHERE status = 'paid' ORDER BY slot_start ASC");
  res.json(bookings.map(({ patient_token, ...b }) => b));
});

// Schedule view for one day — used by the main dashboard's 15-minute-slot calendar. Includes the
// actual working-hours span for that day of week (see slots.js) so the calendar sizes itself to
// real hours instead of a fixed 9-5 window — e.g. an evening shift shows in full, not cut off.
router.get('/schedule', requireDoctor, async (req, res) => {
  const date = req.query.date; // 'YYYY-MM-DD'
  if (!date) return res.status(400).json({ error: 'date is required' });
  const bookings = await db.all(`
    SELECT id, patient_name, service_type, reason, slot_start, slot_end, status
    FROM bookings
    WHERE status IN ('paid', 'completed') AND DATE(slot_start) = ?
    ORDER BY slot_start ASC
  `, [date]);
  const dayOfWeek = new Date(date + 'T00:00:00').getDay();
  const hours = await getDayHoursRange(dayOfWeek);
  res.json({ bookings, dayStartMins: hours.startMins, dayEndMins: hours.endMins });
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

// --- Tasks: currently only auto-created when a prescription is issued (see
// POST /bookings/:id/prescriptions below) — each doctor only sees their own. ---
router.get('/tasks', requireDoctor, async (req, res) => {
  const tasks = await db.all(`
    SELECT t.*, b.patient_name FROM tasks t
    JOIN bookings b ON b.id = t.booking_id
    WHERE t.doctor_id = ?
    ORDER BY (t.status = 'pending') DESC, t.created_at DESC
    LIMIT 100
  `, [req.session.doctorId]);
  res.json(tasks);
});

router.post('/tasks/:id/complete', requireDoctor, async (req, res) => {
  const result = await db.run(
    "UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE id = ? AND doctor_id = ?",
    [req.params.id, req.session.doctorId]
  );
  if (result.changes === 0) return res.status(404).json({ error: 'Task not found' });
  res.json({ ok: true });
});

// Patient record search — a single box matches partial name (first, last, or both), partial
// phone number, or partial date of birth (e.g. "1990" or "1990-05"), whichever the doctor typed.
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
      AND (patient_name LIKE ? OR patient_phone LIKE ? OR patient_dob LIKE ?)
    ORDER BY slot_start DESC
  `, [like, like, like]);
  res.json(results);
});

router.get('/bookings/:id', requireDoctor, async (req, res) => {
  const booking = await db.get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
  if (!booking) return res.status(404).json({ error: 'Not found' });

  // Record the access, but collapse repeats within a short window into one row — the dashboard
  // polls this same endpoint every 20s while a chart stays open (see doctorFetch's background
  // refresh in dashboard.js), and logging every poll would drown the "who opened this chart"
  // signal in near-duplicates rather than capturing it.
  const recentView = await db.get(
    'SELECT id FROM chart_access_log WHERE doctor_id = ? AND booking_id = ? AND viewed_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)',
    [req.session.doctorId, req.params.id]
  );
  if (!recentView) {
    await db.run('INSERT INTO chart_access_log (doctor_id, booking_id) VALUES (?, ?)', [req.session.doctorId, req.params.id]);
  }

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

  // The patient's own standing medical profile (allergies/current medications/known
  // conditions/address, kept up to date by the patient in their portal) — distinct from this
  // visit's intake answers on the booking itself, and visible regardless of which booking is open.
  const patientProfile = await db.get(
    'SELECT address, allergies, current_medications, known_conditions FROM patients WHERE email = ?',
    [booking.patient_email]
  );

  const { patient_token, ...safeBooking } = booking;
  res.json({ booking: safeBooking, messages, prescriptions, notes, documents, attachments, previousConsultations, patientProfile });
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

// --- Internal staff chat: one shared board between admins and doctors (not patient-facing) ---
router.get('/internal-messages', requireDoctor, async (req, res) => {
  const messages = await db.all('SELECT * FROM internal_messages ORDER BY created_at ASC');
  res.json(messages);
});

router.post('/internal-messages', requireDoctor, async (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Message cannot be empty' });
  const doctor = await getCurrentDoctor(req);
  await db.run("INSERT INTO internal_messages (sender_type, sender_name, body) VALUES ('doctor', ?, ?)", [doctor.name, body.trim()]);
  res.json({ ok: true });
});

// Only the doctor can start a call — the patient's consult page and confirmation page both poll
// for call_started_at rather than connecting on their own (see public/js/consult.js,
// public/confirmation.html). Called when the doctor clicks "Join Video/Audio Consultation" in
// the dashboard, before their own call window opens.
router.post('/bookings/:id/start-call', requireDoctor, async (req, res) => {
  const mode = req.body.mode === 'audio' ? 'audio' : 'video';
  const booking = await db.get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  await db.run("UPDATE bookings SET call_started_at = NOW(), call_mode = ? WHERE id = ?", [mode, req.params.id]);

  // Best-effort — reaches the patient even if they don't have the confirmation page open.
  try {
    const link = `${BASE_URL}/confirmation.html?id=${booking.id}&token=${booking.patient_token}`;
    await mailer.sendMail({
      to: booking.patient_email,
      subject: `${process.env.PRACTICE_NAME || 'GP4U'}: your GP is ready — join your call now`,
      html: `
        <p>Hi ${booking.patient_name},</p>
        <p>Your GP has started your ${mode} consultation. Join now: <a href="${link}">${link}</a></p>
      `,
    });
  } catch (err) {
    console.log('Call-started email not sent:', err.message);
  }

  res.json({ ok: true });
});

router.post('/bookings/:id/complete', requireDoctor, async (req, res) => {
  const booking = await db.get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
  const wasAlreadyCompleted = booking.status === 'completed';
  await db.run("UPDATE bookings SET status = 'completed' WHERE id = ?", [req.params.id]);

  // Best-effort, and only once per booking (consultation_summary_log guards against a repeat
  // "Mark Complete" click re-sending it) — a summary of presentation, medication issued, and any
  // sick cert days, sent to every admin for their records.
  if (!wasAlreadyCompleted) {
    try {
      const alreadyLogged = await db.get('SELECT 1 AS x FROM consultation_summary_log WHERE booking_id = ?', [req.params.id]);
      if (!alreadyLogged) {
        const notes = await db.all('SELECT * FROM clinical_notes WHERE booking_id = ? ORDER BY created_at ASC', [req.params.id]);
        const prescriptions = await db.all('SELECT * FROM prescriptions WHERE booking_id = ? ORDER BY issued_at ASC', [req.params.id]);
        const documents = await db.all('SELECT * FROM documents WHERE booking_id = ? ORDER BY created_at ASC', [req.params.id]);
        const practiceName = process.env.PRACTICE_NAME || 'GP4U';

        const sickCertLines = documents
          .filter((d) => d.doc_type === 'sick_cert')
          .map((d) => {
            const f = JSON.parse(d.fields);
            const days = Math.round((new Date(f.dateTo) - new Date(f.dateFrom)) / (1000 * 60 * 60 * 24)) + 1;
            return `${days} day(s) (${new Date(f.dateFrom).toLocaleDateString('en-IE')} to ${new Date(f.dateTo).toLocaleDateString('en-IE')}), ${f.fitForWork}, diagnosis: ${f.diagnosis}`;
          });
        const referralLines = documents
          .filter((d) => d.doc_type !== 'sick_cert')
          .map((d) => DOCUMENT_TYPES[d.doc_type] ? DOCUMENT_TYPES[d.doc_type].label : d.doc_type);

        const admins = await db.all('SELECT email FROM admins');
        for (const admin of admins) {
          await mailer.sendMail({
            to: admin.email,
            subject: `Consultation summary: ${booking.patient_name} — ${practiceName}`,
            html: `
              <p><strong>${practiceName}</strong> — One Tap. Real Care. — www.gp4u.ie</p>
              <p><strong>Patient:</strong> ${booking.patient_name} (DOB ${booking.patient_dob})<br>
              <strong>Service:</strong> ${booking.service_type.replace('_', ' ')}<br>
              <strong>Seen:</strong> ${new Date(booking.slot_start).toLocaleString('en-IE')}</p>
              <p><strong>Presentation/reason:</strong> ${booking.reason || 'N/A'}</p>
              ${notes.length ? `<p><strong>Clinical notes:</strong><br>${notes.map((n) => n.note_text).join('<br>')}</p>` : ''}
              ${prescriptions.length ? `<p><strong>Medication issued:</strong><br>${prescriptions.map((p) => `${p.medication} ${p.dose}, ${p.frequency}, ${p.duration}`).join('<br>')}</p>` : '<p><strong>Medication issued:</strong> None</p>'}
              ${sickCertLines.length ? `<p><strong>Sick cert issued:</strong><br>${sickCertLines.join('<br>')}</p>` : ''}
              ${referralLines.length ? `<p><strong>Referral letters issued:</strong> ${referralLines.join(', ')}</p>` : ''}
            `,
          });
        }
        await db.run('INSERT INTO consultation_summary_log (booking_id) VALUES (?)', [req.params.id]);
      }
    } catch (err) {
      console.log('Consultation summary to admin not sent:', err.message);
    }
  }

  res.json({ ok: true });
});

// --- Clinical notes: append-only. No edit/delete route on purpose — see server/db.js comment. ---
router.post('/bookings/:id/notes', requireDoctor, async (req, res) => {
  const { noteText } = req.body;
  if (!noteText || !noteText.trim()) return res.status(400).json({ error: 'Note cannot be empty' });
  const doctor = await getCurrentDoctor(req);
  const info = await db.run(`
    INSERT INTO clinical_notes (booking_id, note_text, doctor_name) VALUES (?, ?, ?)
  `, [req.params.id, db.encrypt(noteText.trim()), doctor.name]);
  res.json({ ok: true, id: info.lastInsertRowid });
});

// --- Prescriptions ---
router.post('/bookings/:id/prescriptions', requireDoctor, async (req, res) => {
  const { medication, dose, frequency, duration, instructions, quantity } = req.body;
  if (!medication || !dose || !frequency || !duration || !instructions || !quantity) {
    return res.status(400).json({ error: 'All prescription fields are required' });
  }
  const doctor = await getCurrentDoctor(req);
  const booking = await db.get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
  const info = await db.run(`
    INSERT INTO prescriptions (booking_id, medication, dose, frequency, duration, instructions, quantity, doctor_name, doctor_reg_number)
    VALUES (?,?,?,?,?,?,?,?,?)
  `, [req.params.id, db.encrypt(medication), db.encrypt(dose), db.encrypt(frequency), db.encrypt(duration), db.encrypt(instructions), quantity, doctor.name, doctor.reg_number]);

  await db.run(
    `INSERT INTO tasks (doctor_id, booking_id, type, description, related_id) VALUES (?, ?, 'send_prescription', ?, ?)`,
    [doctor.id, req.params.id, `Send prescription to pharmacy: ${medication} (${dose}) for ${booking.patient_name}`, info.lastInsertRowid]
  );

  // Best-effort: every admin gets a copy so they can forward it to the pharmacy (e.g. over
  // Healthmail, which this app can't send through directly — see server/pdf.js).
  try {
    const practiceName = process.env.PRACTICE_NAME || 'GP4U';
    const pdfBuffer = await generatePrescriptionPdf({
      rx: { medication, dose, frequency, duration, instructions, quantity, doctor_name: doctor.name, doctor_reg_number: doctor.reg_number, issued_at: new Date() },
      booking, practiceName,
    });
    const admins = await db.all('SELECT email FROM admins');
    for (const admin of admins) {
      await mailer.sendMail({
        to: admin.email,
        subject: `Prescription to send: ${booking.patient_name} — ${booking.pharmacy_name || 'pharmacy not given'}`,
        html: `
          <p><strong>${practiceName}</strong> — One Tap. Real Care. — www.gp4u.ie</p>
          <p>A new prescription was issued for <strong>${booking.patient_name}</strong>.</p>
          <p><strong>Pharmacy:</strong> ${booking.pharmacy_name || 'Not given — check with the patient'}</p>
          <p>Please find the prescription attached as a PDF to forward on.</p>
          <p>Prescribed by ${doctor.name} (${doctor.reg_number})</p>
        `,
        attachments: [{ filename: `Prescription-${booking.patient_name.replace(/\s+/g, '-')}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
      });
    }
  } catch (err) {
    console.log('Prescription copy to admin not sent:', err.message);
  }

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

// Lets the doctor download the same PDF that would be emailed — for cases like sending a
// prescription to a pharmacy over Healthmail, where the doctor attaches it manually rather
// than through this app's own SMTP (Healthmail doesn't offer SMTP relay access).
router.get('/prescriptions/:rxId/pdf', requireDoctor, async (req, res) => {
  const rx = await db.get('SELECT * FROM prescriptions WHERE id = ?', [req.params.rxId]);
  if (!rx) return res.status(404).json({ error: 'Not found' });
  const booking = await db.get('SELECT * FROM bookings WHERE id = ?', [rx.booking_id]);
  const practiceName = process.env.PRACTICE_NAME || 'GP4U';
  const pdfBuffer = await generatePrescriptionPdf({ rx, booking, practiceName });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Prescription-${booking.patient_name.replace(/\s+/g, '-')}.pdf"`);
  res.send(pdfBuffer);
});

router.post('/prescriptions/:rxId/send', requireDoctor, async (req, res) => {
  const { toEmail } = req.body;
  if (!toEmail) return res.status(400).json({ error: 'Pharmacy email address is required' });
  const rx = await db.get('SELECT * FROM prescriptions WHERE id = ?', [req.params.rxId]);
  if (!rx) return res.status(404).json({ error: 'Not found' });
  const booking = await db.get('SELECT * FROM bookings WHERE id = ?', [rx.booking_id]);

  try {
    const practiceName = process.env.PRACTICE_NAME || 'GP4U';
    const pdfBuffer = await generatePrescriptionPdf({ rx, booking, practiceName });
    await mailer.sendMail({
      to: toEmail,
      subject: `Prescription for ${booking.patient_name} — ${practiceName}`,
      html: `
        <p><strong>${practiceName}</strong> — One Tap. Real Care. — www.gp4u.ie</p>
        <p>Please find the prescription for ${booking.patient_name} attached as a PDF.</p>
        <p>Prescribed by ${rx.doctor_name} (${rx.doctor_reg_number}) on ${new Date(rx.issued_at).toLocaleString('en-IE')}</p>
      `,
      attachments: [{ filename: `Prescription-${booking.patient_name.replace(/\s+/g, '-')}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
    });
    await db.run("UPDATE prescriptions SET sent_to_email = ?, sent_at = NOW() WHERE id = ?", [toEmail, req.params.rxId]);
    // Sending it counts as the associated task being done, whether or not the doctor also
    // ticks it off manually.
    await db.run(
      "UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE type = 'send_prescription' AND related_id = ? AND status = 'pending'",
      [req.params.rxId]
    );
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
  `, [req.params.id, docType, db.encrypt(JSON.stringify(fields)), doctor.name, doctor.reg_number]);
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
  const practiceName = process.env.PRACTICE_NAME || 'GP4U';
  const doctor = { name: doc.doctor_name, reg_number: doc.doctor_reg_number };

  try {
    const pdfBuffer = doc.doc_type === 'sick_cert'
      ? await generateSickCertPdf({ fields, booking, doctor, practiceName })
      : await generateReferralPdf({ fields, booking, doctor, practiceName, isAE: doc.doc_type === 'referral_ae' });

    await mailer.sendMail({
      to: toEmail,
      subject: `${label} — ${booking.patient_name} — ${practiceName}`,
      html: `
        <p><strong>${practiceName}</strong> — One Tap. Real Care. — www.gp4u.ie</p>
        <p>Please find the ${label.toLowerCase()} for ${booking.patient_name} attached as a PDF.</p>
        <p>${doc.doctor_name} (${doc.doctor_reg_number})</p>
      `,
      attachments: [{ filename: `${label.replace(/\s+/g, '-')}-${booking.patient_name.replace(/\s+/g, '-')}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
    });
    await db.run("UPDATE documents SET sent_to_email = ?, sent_at = NOW() WHERE id = ?", [toEmail, req.params.docId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.code === 'MAILER_NOT_CONFIGURED' ? 400 : 500).json({ error: err.message });
  }
});

module.exports = { router, requireDoctor };
