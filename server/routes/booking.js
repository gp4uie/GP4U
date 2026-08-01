const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const Stripe = require('stripe');
const db = require('../db');
const { SERVICES } = require('../services');
const { getAvailableSlots } = require('../slots');
const { upsertPatient } = require('../patients');
const mailer = require('../mailer');

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';

// Photos are kept in memory only long enough to write them into the database as a BLOB —
// never written to the app server's own disk, which some hosts wipe on every redeploy.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function newId(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`.toUpperCase();
}

// Best-effort: a missing/broken email setup should never break the booking flow itself.
async function notifyBookingPaid(booking) {
  await db.run(`
    INSERT INTO notifications (type, booking_id, message)
    VALUES ('new_booking', ?, ?)
  `, [booking.id, `New booking: ${booking.patient_name} — ${SERVICES[booking.service_type].label}`]);

  const link = `${BASE_URL}/confirmation.html?id=${booking.id}&token=${booking.patient_token}`;
  try {
    await mailer.sendMail({
      to: booking.patient_email,
      subject: `Your ${process.env.PRACTICE_NAME || 'GP4U'} booking is confirmed`,
      html: `
        <p>Hi ${booking.patient_name},</p>
        <p>Your <strong>${SERVICES[booking.service_type].label}</strong> booking is confirmed for
        ${new Date(booking.slot_start).toLocaleString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.</p>
        <p>Use this link any time to view your booking, join your video call, message your GP, or
        download anything they issue you: <a href="${link}">${link}</a></p>
        <p>Keep this email safe — this link is how you access your booking.</p>
      `,
    });
  } catch (err) {
    console.log('Booking confirmation email not sent:', err.message);
  }

  if (process.env.DOCTOR_EMAIL) {
    try {
      await mailer.sendMail({
        to: process.env.DOCTOR_EMAIL,
        subject: `New booking: ${booking.patient_name}`,
        html: `<p>${booking.patient_name} booked a ${SERVICES[booking.service_type].label} for ${new Date(booking.slot_start).toLocaleString('en-IE')}.</p>`,
      });
    } catch (err) {
      console.log('Doctor notification email not sent:', err.message);
    }
  }
}

router.get('/services', (req, res) => {
  res.json(SERVICES);
});

router.get('/slots', async (req, res) => {
  const { service } = req.query;
  if (!SERVICES[service]) return res.status(400).json({ error: 'Unknown service type' });
  res.json(await getAvailableSlots(service));
});

// Create a pending booking + a Stripe Checkout session for it.
router.post('/bookings', async (req, res) => {
  try {
    const {
      serviceType, patientName, patientDob, patientPhone, patientEmail, patientAddress, pharmacyName,
      reason, symptomsDuration, currentMedications, allergies, extraDetails,
      slotStart, slotEnd,
    } = req.body;

    const service = SERVICES[serviceType];
    if (!service) return res.status(400).json({ error: 'Unknown service type' });
    if (!patientName || !patientPhone || !patientEmail || !pharmacyName || !reason || !patientDob || !slotStart || !slotEnd) {
      return res.status(400).json({ error: 'Please fill in all required fields (marked with *).' });
    }
    if (!EMAIL_RE.test(patientEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const slotStartSql = db.toMySQLDateTime(slotStart);
    const slotEndSql = db.toMySQLDateTime(slotEnd);

    // Re-check the slot is still free (someone else may have taken it just now).
    const clash = await db.get(
      "SELECT 1 AS x FROM bookings WHERE status IN ('paid','pending_payment') AND slot_start = ?",
      [slotStartSql]
    );
    if (clash) return res.status(409).json({ error: 'That slot was just booked by someone else. Please pick another.' });

    const id = newId('GP4U');
    const patientToken = crypto.randomBytes(16).toString('hex');

    await db.run(`
      INSERT INTO bookings (id, patient_token, service_type, patient_name, patient_dob, patient_phone,
        patient_email, patient_address, pharmacy_name, reason, symptoms_duration, current_medications, allergies, extra_details,
        slot_start, slot_end, amount_cents, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending_payment')
    `, [id, patientToken, serviceType, patientName, patientDob, patientPhone, patientEmail, patientAddress || '', pharmacyName,
      reason, symptomsDuration || '', currentMedications || '', allergies || '', extraDetails || '',
      slotStartSql, slotEndSql, service.priceCents]);

    await upsertPatient({ email: patientEmail, name: patientName, dob: patientDob, phone: patientPhone, address: patientAddress || '' });

    if (!stripe) {
      // No Stripe key configured yet — let the demo continue without real payment so the
      // rest of the site can still be tried out. See README for adding real Stripe keys.
      return res.json({ bookingId: id, patientToken, checkoutUrl: `/confirmation.html?id=${id}&token=${patientToken}&demo=1` });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: `GP4U — ${service.label}` },
          unit_amount: service.priceCents,
        },
        quantity: 1,
      }],
      customer_email: patientEmail,
      success_url: `${BASE_URL}/confirmation.html?id=${id}&token=${patientToken}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/book.html?cancelled=1`,
      metadata: { bookingId: id },
    });

    await db.run('UPDATE bookings SET stripe_session_id = ? WHERE id = ?', [session.id, id]);

    res.json({ bookingId: id, patientToken, checkoutUrl: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the booking.' });
  }
});

// Confirms payment status directly with Stripe (works fine on localhost, no webhook needed).
router.post('/bookings/:id/confirm-payment', async (req, res) => {
  try {
    const booking = await db.get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (booking.status === 'paid') return res.json({ status: 'paid' });

    if (!stripe || !booking.stripe_session_id) {
      // Demo mode without Stripe configured: mark as paid so the flow can be tried end to end.
      await db.run("UPDATE bookings SET status = 'paid' WHERE id = ?", [booking.id]);
      await notifyBookingPaid(booking);
      return res.json({ status: 'paid', demo: true });
    }

    const session = await stripe.checkout.sessions.retrieve(booking.stripe_session_id);
    if (session.payment_status === 'paid') {
      await db.run("UPDATE bookings SET status = 'paid' WHERE id = ?", [booking.id]);
      await notifyBookingPaid(booking);
      return res.json({ status: 'paid' });
    }
    res.json({ status: session.payment_status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not confirm payment status.' });
  }
});

async function requirePatientToken(req, res, next) {
  const booking = await db.get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  const token = req.query.token || req.body.token;
  if (!token || token !== booking.patient_token) return res.status(403).json({ error: 'Invalid access token' });
  req.booking = booking;
  next();
}

router.get('/bookings/:id', requirePatientToken, async (req, res) => {
  const messages = await db.all('SELECT sender, body, created_at FROM messages WHERE booking_id = ? ORDER BY created_at ASC', [req.params.id]);
  const prescriptions = await db.all('SELECT id, medication, dose, instructions, quantity, issued_at FROM prescriptions WHERE booking_id = ?', [req.params.id]);
  // Clinical notes are deliberately NOT included here — they stay doctor-side only.
  const documents = await db.all('SELECT id, doc_type, created_at FROM documents WHERE booking_id = ?', [req.params.id]);
  const attachments = await db.all('SELECT id, original_name, mime_type, created_at FROM attachments WHERE booking_id = ?', [req.params.id]);
  const { patient_token, ...safeBooking } = req.booking;
  // Opening the booking counts as "viewed" for the unread badge shown in the patient portal.
  await db.run('UPDATE bookings SET patient_last_viewed_at = NOW() WHERE id = ?', [req.params.id]);
  res.json({ booking: safeBooking, messages, prescriptions, documents, attachments });
});

// Photo attachments — uploaded right after the booking is created, before payment.
// Stored as a BLOB directly in the database (see note on `upload` above).
router.post('/bookings/:id/attachments', requirePatientToken, upload.array('photos', 5), async (req, res) => {
  for (const f of req.files || []) {
    await db.run(
      'INSERT INTO attachments (booking_id, original_name, mime_type, data) VALUES (?,?,?,?)',
      [req.params.id, f.originalname, f.mimetype, f.buffer]
    );
  }
  res.json({ ok: true, count: (req.files || []).length });
});

router.get('/bookings/:id/attachments/:attId', requirePatientToken, async (req, res) => {
  const att = await db.get('SELECT * FROM attachments WHERE id = ? AND booking_id = ?', [req.params.attId, req.params.id]);
  if (!att) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Content-Type', att.mime_type);
  res.send(att.data);
});

router.post('/bookings/:id/messages', requirePatientToken, async (req, res) => {
  if (req.booking.status === 'completed') {
    return res.status(403).json({ error: 'This consultation is now closed, so messages can no longer be sent for it. Please book a new consultation if you need further care.' });
  }
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Message cannot be empty' });
  await db.run("INSERT INTO messages (booking_id, sender, body) VALUES (?, 'patient', ?)", [req.params.id, body.trim()]);
  await db.run(`
    INSERT INTO notifications (type, booking_id, message)
    VALUES ('new_message', ?, ?)
  `, [req.params.id, `New message from ${req.booking.patient_name}`]);

  if (process.env.DOCTOR_EMAIL) {
    try {
      await mailer.sendMail({
        to: process.env.DOCTOR_EMAIL,
        subject: `New message from ${req.booking.patient_name}`,
        html: `<p>${body.trim()}</p>`,
      });
    } catch (err) {
      console.log('Doctor message notification email not sent:', err.message);
    }
  }
  res.json({ ok: true });
});

router.get('/bookings/:id/account-status', requirePatientToken, async (req, res) => {
  const patient = await db.get('SELECT password_hash FROM patients WHERE email = ?', [req.booking.patient_email]);
  res.json({ hasPassword: !!(patient && patient.password_hash) });
});

// Patient-side read access to a single prescription/document for printing — proven by the
// same booking token used for the confirmation page, so no separate login is required.
router.get('/bookings/:id/prescriptions/:rxId', requirePatientToken, async (req, res) => {
  const rx = await db.get('SELECT * FROM prescriptions WHERE id = ? AND booking_id = ?', [req.params.rxId, req.params.id]);
  if (!rx) return res.status(404).json({ error: 'Not found' });
  const { patient_token, ...safeBooking } = req.booking;
  res.json({
    prescription: rx,
    booking: safeBooking,
    practice: { name: process.env.PRACTICE_NAME, address: process.env.PRACTICE_ADDRESS, phone: process.env.PRACTICE_PHONE },
  });
});

router.get('/bookings/:id/documents/:docId', requirePatientToken, async (req, res) => {
  const doc = await db.get('SELECT * FROM documents WHERE id = ? AND booking_id = ?', [req.params.docId, req.params.id]);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  const { patient_token, ...safeBooking } = req.booking;
  res.json({
    document: { ...doc, fields: JSON.parse(doc.fields) },
    booking: safeBooking,
    practice: { name: process.env.PRACTICE_NAME, address: process.env.PRACTICE_ADDRESS, phone: process.env.PRACTICE_PHONE },
  });
});

module.exports = router;
