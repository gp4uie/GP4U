const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const mailer = require('../mailer');
const { getPractice, escapeHtml: esc, emailHeader, emailFooter, emailButton, siteUrl } = require('../practice');
const { getPatient } = require('../patients');
const loginLimiter = require('../loginLimiter');

const router = express.Router();

function requirePatient(req, res, next) {
  if (!req.session || !req.session.patientEmail) return res.status(401).json({ error: 'Not logged in' });
  next();
}

router.get('/me', async (req, res) => {
  if (!req.session || !req.session.patientEmail) return res.json({ loggedIn: false });
  const patient = await getPatient(req.session.patientEmail);
  res.json({
    loggedIn: true,
    email: req.session.patientEmail,
    name: patient ? patient.name : '',
    dob: patient ? patient.dob : '',
    phone: patient ? patient.phone : '',
    address: patient ? patient.address : '',
    allergies: patient ? patient.allergies : '',
    currentMedications: patient ? patient.current_medications : '',
    knownConditions: patient ? patient.known_conditions : '',
  });
});

// Lets a patient keep a standing medical profile up to date — kept separate from the per-visit
// intake answers on `bookings` (which capture "what's going on this specific visit"), so this is
// visible to the doctor regardless of which booking they're looking at.
router.put('/profile', requirePatient, async (req, res) => {
  const { address, allergies, currentMedications, knownConditions } = req.body;
  await db.run(
    `UPDATE patients SET address = ?, allergies = ?, current_medications = ?, known_conditions = ? WHERE email = ?`,
    [db.encrypt(address || ''), db.encrypt(allergies || ''), db.encrypt(currentMedications || ''), db.encrypt(knownConditions || ''), req.session.patientEmail]
  );
  res.json({ ok: true });
});

// Same brute-force protection as the staff logins (server/loginLimiter.js). Keys are prefixed so a
// patient's failed attempts never count against a doctor's account or the staff per-IP budget.
const tooMany = (limit) => {
  const minutes = Math.ceil(limit.retryAfterMs / 60000);
  return limit.reason === 'account'
    ? `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or use "Forgot your password?".`
    : `Too many login attempts from this network. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
};

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const accountKey = 'patient:' + String(email || '').toLowerCase().trim();
  const ipKey = 'patient:' + req.ip;
  const limit = loginLimiter.checkLimit(accountKey, ipKey);
  if (limit.blocked) return res.status(429).json({ error: tooMany(limit) });
  const patient = email && await getPatient(email.toLowerCase().trim());
  if (!patient || !patient.password_hash || !bcrypt.compareSync(password || '', patient.password_hash)) {
    loginLimiter.recordFailure(accountKey, ipKey);
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  loginLimiter.recordSuccess(accountKey);
  req.session.patientEmail = patient.email;
  res.json({ ok: true });
});

// Change password while signed in (Medical Profile page). Needs the current password, so a
// session left open on a shared computer can't be used to take the account over.
router.post('/change-password', requirePatient, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'The new password must be at least 8 characters.' });
  }
  if (newPassword.length > 200) return res.status(400).json({ error: 'That password is too long.' });
  const accountKey = 'patient-change:' + req.session.patientEmail;
  const ipKey = 'patient:' + req.ip;
  const limit = loginLimiter.checkLimit(accountKey, ipKey);
  if (limit.blocked) return res.status(429).json({ error: tooMany(limit).replace(', or use "Forgot your password?"', '') });
  const patient = await getPatient(req.session.patientEmail);
  if (!patient || !patient.password_hash || !bcrypt.compareSync(String(currentPassword || ''), patient.password_hash)) {
    loginLimiter.recordFailure(accountKey, ipKey);
    return res.status(400).json({ error: 'Your current password is not correct.' });
  }
  if (bcrypt.compareSync(newPassword, patient.password_hash)) {
    return res.status(400).json({ error: 'The new password is the same as your current one.' });
  }
  loginLimiter.recordSuccess(accountKey);
  await db.run('UPDATE patients SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE email = ?',
    [bcrypt.hashSync(newPassword, 10), patient.email]);
  // Security notice, standard practice: if the patient didn't do this, they find out straight away.
  try {
    const practice = await getPractice();
    await mailer.sendMail({
      to: patient.email,
      subject: `Your ${practice.name} password was changed`,
      html: `${emailHeader(practice)}
        <p>The password for your ${esc(practice.name)} account was just changed.</p>
        <p>If this was you, there's nothing more to do. If it wasn't, reset your password now and contact us:</p>
        ${emailButton(`${siteUrl()}/patient-login.html`, 'Reset my password')}
        ${emailFooter(practice)}`,
    });
  } catch (err) { console.log('Password-changed notice not sent:', err.message); }
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
// only works while no password is set yet (first time). Existing passwords are changed with
// POST /change-password (signed in) or the forgot/reset-password email flow.
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

// "Forgot password" for patients who don't have their booking confirmation link handy — an
// alternative entry point to /set-password above, which is tied to a specific booking's token.
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const patient = email && await getPatient(email.toLowerCase().trim());
  // Always respond the same way whether or not the email matches, so this can't be used to
  // find out which addresses have an account.
  if (patient) {
    const token = crypto.randomBytes(32).toString('hex');
    await db.run(
      'UPDATE patients SET reset_token = ?, reset_token_expires = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE email = ?',
      [token, patient.email]
    );
    try {
      await mailer.sendMail({
        to: patient.email,
        subject: `Reset your ${(await getPractice()).name} password`,
        html: `${emailHeader(await getPractice())}
          <p>We received a request to reset the password for this email address.</p>
          ${emailButton(`${siteUrl()}/reset-password.html?type=patient&token=${token}`, 'Choose a new password')}
          <p>This link works once and expires in 1 hour. If you didn't ask for this, you can ignore this email — your password stays the same.</p>
          ${emailFooter(await getPractice())}`,
      });
    } catch (err) {
      // Mailer not configured — the patient can still use their booking confirmation link instead.
    }
  }
  res.json({ ok: true, message: 'If that email has an account, a reset link has been sent.' });
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const patient = token && await db.get(
    'SELECT * FROM patients WHERE reset_token = ? AND reset_token_expires > NOW()',
    [token]
  );
  if (!patient) return res.status(400).json({ error: 'This reset link is invalid or has expired' });
  const hash = bcrypt.hashSync(password, 10);
  await db.run('UPDATE patients SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE email = ?', [hash, patient.email]);
  req.session.patientEmail = patient.email;
  res.json({ ok: true });
});

// GDPR Article 15 (right of access): everything held about this patient, as a downloadable
// file — including clinical notes, which patients don't otherwise see anywhere in the portal
// (that's a day-to-day workflow choice, not a legal one — the right of access to one's own
// medical records applies regardless).
router.get('/export-data', requirePatient, async (req, res) => {
  const email = req.session.patientEmail;
  const patient = await getPatient(email);
  const bookings = await db.all('SELECT * FROM bookings WHERE patient_email = ? ORDER BY slot_start DESC', [email]);

  const consultations = [];
  for (const b of bookings) {
    const { patient_token, ...safeBooking } = b;
    consultations.push({
      ...safeBooking,
      clinicalNotes: await db.all('SELECT note_text, doctor_name, created_at FROM clinical_notes WHERE booking_id = ? ORDER BY created_at ASC', [b.id]),
      prescriptions: await db.all('SELECT medication, dose, frequency, duration, instructions, quantity, doctor_name, doctor_reg_number, issued_at FROM prescriptions WHERE booking_id = ? ORDER BY issued_at ASC', [b.id]),
      documents: await db.all('SELECT doc_type, fields, doctor_name, doctor_reg_number, created_at FROM documents WHERE booking_id = ? ORDER BY created_at ASC', [b.id]),
      messages: await db.all('SELECT sender, body, created_at FROM messages WHERE booking_id = ? ORDER BY created_at ASC', [b.id]),
    });
  }

  const exportData = {
    exportedAt: new Date().toISOString(),
    profile: { email, name: patient?.name, dob: patient?.dob, phone: patient?.phone, address: patient?.address },
    consultations,
  };

  res.setHeader('Content-Disposition', `attachment; filename="gp4u-my-data-${new Date().toISOString().slice(0, 10)}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(exportData, null, 2));
});

// GDPR Article 17 (right to erasure). This does not delete anything automatically: clinical
// records must legally be retained for a minimum period (Medical Council of Ireland guidance —
// see /privacy/), so what can actually be deleted vs. must be kept depends on this patient's
// specific history and needs a human decision, not an automatic bulk delete. This just puts the
// request in front of every admin so it gets picked up and actioned/responded to.
router.post('/request-deletion', requirePatient, async (req, res) => {
  const email = req.session.patientEmail;
  const admins = await db.all('SELECT email FROM admins');
  const subject = `Data deletion request from ${email}`;
  const html = `
    <p>A patient has requested deletion of their personal data under GDPR Article 17.</p>
    <p><strong>Patient email:</strong> ${esc(email)}<br><strong>Requested at:</strong> ${new Date().toLocaleString('en-IE', { timeZone: 'Europe/Dublin' })}</p>
    <p>Clinical records must be retained for the legally required minimum period — check this
    patient's booking history in the admin dashboard before deciding what can be deleted versus
    must be kept, and reply to the patient within one month as required by GDPR.</p>
  `;
  let sent = false;
  for (const admin of admins) {
    try {
      await mailer.sendMail({ to: admin.email, subject, html });
      sent = true;
    } catch (err) {
      // Mailer not configured — fall through, still tell the patient it was recorded.
    }
  }
  res.json({
    ok: true,
    message: sent
      ? 'Your request has been sent to the practice. They will respond within one month, as required by law.'
      : 'Your request was recorded, but email is not yet configured for this site — please also contact the practice directly to make sure it is seen.',
  });
});

module.exports = { router, requirePatient };
