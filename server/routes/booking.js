const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const Stripe = require('stripe');
const db = require('../db');
const { getServices, getService } = require('../services');
const { getAvailableSlots } = require('../slots');
const { upsertPatient } = require('../patients');
const mailer = require('../mailer');
const { getPractice, escapeHtml: esc, emailHeader, emailFooter, emailButton, siteUrl, enrichBooking } = require('../practice');
const { notifyDoctorsOfBooking } = require('../claims');
const { detectImage, sendUpload } = require('../imageCheck');
const formLimiter = require('../formLimiter');
const signatures = require('../signatures');
const vouchers = require('../vouchers');

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// Photos are kept in memory only long enough to write them into the database as a BLOB —
// never written to the app server's own disk, which some hosts wipe on every redeploy.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

// No spaces, quotes, angle brackets or other characters that could turn an address into HTML or script.
const EMAIL_RE = /^[^\s@<>"`()\\,;:]+@[^\s@<>"'`()\\,;:]+\.[^\s@<>"'`()\\,;:]+$/;

const { isRxService } = require('../rxServices');

// Plausibility check, not an identity check — just rejects the obviously-impossible dates a typo
// or placeholder value produces (e.g. a test record with DOB "1111-11-11"). Mirrors the
// min="1900-01-01" on the client's date input; enforced again here since the client check is
// only a UI convenience.
function isPlausibleDob(dob) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const date = new Date(dob + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return false;
  const minDate = new Date('1900-01-01T00:00:00');
  return date >= minDate && date <= new Date();
}

function newId(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`.toUpperCase();
}

// Best-effort: a missing/broken email setup should never break the booking flow itself.
async function notifyBookingPaid(booking) {
  const service = await getService(booking.service_type);
  const serviceLabel = service ? service.label : booking.service_type;

  await db.run(`
    INSERT INTO notifications (type, booking_id, message)
    VALUES ('new_booking', ?, ?)
  `, [booking.id, `New booking: ${booking.patient_name} — ${serviceLabel}`]);

  const link = `${siteUrl()}/confirmation.html?id=${booking.id}&token=${booking.patient_token}`;
  if (isRxService(booking.service_type)) {
    // A prescription request: no appointment time, nothing to join.
    try {
      const practice = await getPractice();
      await mailer.sendMail({
        to: booking.patient_email,
        subject: `We've received your prescription request — ${practice.name}`,
        html: `
          ${emailHeader(practice)}
          <p>Hi ${esc(booking.patient_name)},</p>
          <p>Thank you — your <strong>${esc(serviceLabel)}</strong> request has been sent to our GPs.<br>Reference: <strong>${esc(booking.id)}</strong></p>
          <p>A GP will review it. If it is approved, our team sends the prescription directly to your pharmacy (${esc(booking.pharmacy_name || 'the pharmacy you named')}) — you don't need to collect anything from us. If the GP needs more information, they will message you and we'll email you.</p>
          ${emailButton(link, 'View my request')}
          <p>Keep this email safe — this link is your private access to your request. Please don't forward it.</p>
          ${emailFooter(practice)}
        `,
      });
    } catch (err) { console.log('Prescription request confirmation email not sent:', err.message); }
    try { await notifyDoctorsOfBooking(booking, serviceLabel); } catch (err) { console.log('Doctor notification not sent:', err.message); }
    return;
  }
  try {
    const practice = await getPractice();
    await mailer.sendMail({
      to: booking.patient_email,
      subject: `Your ${practice.name} booking is confirmed`,
      html: `
        ${emailHeader(practice)}
        <p>Hi ${esc(booking.patient_name)},</p>
        <p>Your <strong>${esc(serviceLabel)}</strong> booking is confirmed for
        <strong>${esc(new Date(booking.slot_start).toLocaleString('en-IE', { timeZone: 'Europe/Dublin', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}</strong> (Irish time).<br>
        Booking reference: <strong>${esc(booking.id)}</strong></p>
        <p>Use the link below any time to view your booking, message your GP, join your call when your GP starts it,
        and download anything they issue you:</p>
        ${emailButton(link, 'View my booking')}
        <p>At your appointment time, open this link and keep the page open. We'll also email you when your GP starts the call.</p>
        <p>Keep this email safe — this link is your private access to your booking. Please don't forward it.</p>
        ${emailFooter(practice)}
      `,
    });
  } catch (err) {
    console.log('Booking confirmation email not sent:', err.message);
  }

  // Every doctor scheduled at that time gets a personal "claim this case" link (see server/claims.js).
  try {
    await notifyDoctorsOfBooking(booking, serviceLabel);
  } catch (err) {
    console.log('Doctor notification not sent:', err.message);
  }
}

// One place that turns a paid Stripe Checkout session into a confirmed booking — used by the patient's return to
// the confirmation page AND by Stripe's webhook (whichever arrives first; the other does nothing). Checks the amount
// and currency against the booking, so a session can never confirm a booking it wasn't made for.
async function markPaidFromSession(session) {
  const bookingId = session && session.metadata && session.metadata.bookingId;
  if (!bookingId || session.payment_status !== 'paid') return false;
  const booking = await db.get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
  if (!booking || booking.stripe_session_id !== session.id) return false;
  if (Number(session.amount_total) !== Number(booking.amount_cents) || String(session.currency).toLowerCase() !== 'eur') {
    console.error('Stripe session amount/currency does not match booking', bookingId, session.amount_total, session.currency);
    return false;
  }
  const pi = typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent && session.payment_intent.id) || null;
  const r = await db.run("UPDATE bookings SET status = 'paid', stripe_payment_intent = COALESCE(stripe_payment_intent, ?) WHERE id = ? AND status IN ('pending_payment', 'payment_expired')", [pi, booking.id]);
  if (r.changes) await notifyBookingPaid(booking);
  return true;
}

// Stripe calls this (server to server) when a payment completes or a card page expires. The body must be the raw
// bytes Stripe sent, so this is mounted in index.js before the JSON body reader. Signed with STRIPE_WEBHOOK_SECRET.
async function stripeWebhook(req, res) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return res.status(503).send('Stripe webhook not configured');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
  } catch (err) {
    return res.status(400).send('Invalid signature');
  }
  try {
    const session = event.data && event.data.object;
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      await markPaidFromSession(session);
    } else if (event.type === 'checkout.session.expired' && session && session.metadata && session.metadata.bookingId) {
      // The patient never paid: release the time (the booking is kept, marked so, in case they get in touch).
      await db.run("UPDATE bookings SET status = 'payment_expired' WHERE id = ? AND stripe_session_id = ? AND status = 'pending_payment'", [session.metadata.bookingId, session.id]);
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook handling failed:', err);
    res.status(500).send('Webhook handling failed'); // Stripe retries
  }
}

router.get('/services', async (req, res) => {
  res.json(await getServices());
});

router.get('/slots', async (req, res) => {
  const { service } = req.query;
  if (!(await getService(service))) return res.status(400).json({ error: 'Unknown service type' });
  res.json(await getAvailableSlots(service));
});

// "Apply" on the payment step: checks a voucher code and says what the price would be. Limited per network so codes
// can't be guessed by trying thousands of them.
router.post('/vouchers/check', formLimiter.limit('voucher', 40), async (req, res) => {
  const service = await getService(req.body && req.body.serviceType);
  if (!service) return res.status(400).json({ error: 'Unknown service type' });
  const result = await vouchers.evaluate(req.body.code, service.priceCents);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ code: result.code, label: result.label, priceCents: service.priceCents, discountCents: result.discountCents, finalCents: result.finalCents });
});

// Create a pending booking + a Stripe Checkout session for it.
router.post('/bookings', formLimiter.limit('booking', 30), async (req, res) => {
  try {
    const {
      serviceType, patientName, patientDob, patientPhone, patientEmail, patientAddress, pharmacyName,
      reason, symptomsDuration, currentMedications, allergies, extraDetails,
      rxAsPrescribed, rxHealthChanges, conditionAnswers,
      slotStart, slotEnd, voucherCode,
    } = req.body;

    const service = await getService(serviceType);
    if (!service) return res.status(400).json({ error: 'Unknown service type' });
    const pharmacyRequired = isRxService(serviceType);
    const addressRequired = serviceType === 'sick_cert';
    const rxRequest = isRxService(serviceType);
    if (
      !patientName || !patientPhone || !patientEmail || !reason || !patientDob || (!rxRequest && (!slotStart || !slotEnd))
      || (pharmacyRequired && !pharmacyName)
      || (addressRequired && !patientAddress)
    ) {
      return res.status(400).json({ error: 'Please fill in all required fields (marked with *).' });
    }
    if (!isPlausibleDob(patientDob)) {
      return res.status(400).json({ error: 'Please enter a valid date of birth.' });
    }
    if (!EMAIL_RE.test(patientEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (serviceType === 'repeat_rx' && (!rxAsPrescribed || !rxHealthChanges)) {
      return res.status(400).json({ error: 'Please complete the prescription renewal safety check.' });
    }
    const safetyAnswers = (rxAsPrescribed || rxHealthChanges)
      ? `Taking medication exactly as prescribed: ${rxAsPrescribed || 'Not answered'}\nChanges since last prescription: ${rxHealthChanges || 'Not answered'}`
      : (conditionAnswers || '');

    // Voucher: the price is always worked out here, never taken from the browser.
    let voucher = null;
    if (voucherCode && String(voucherCode).trim()) {
      voucher = await vouchers.evaluate(voucherCode, service.priceCents);
      if (!voucher.ok) return res.status(400).json({ error: voucher.error });
    }
    const amountCents = voucher ? voucher.finalCents : service.priceCents;

    // A prescription request has no appointment time: it is filed at the moment it is sent (and doesn't use a slot).
    const rxNow = new Date();
    const slotStartSql = db.toMySQLDateTime(rxRequest ? rxNow.toISOString() : slotStart);
    const slotEndSql = db.toMySQLDateTime(rxRequest ? new Date(rxNow.getTime() + service.durationMins * 60000).toISOString() : slotEnd);

    if (!rxRequest) {
      // Re-check the slot is still free (someone else may have taken it just now) — by the same rule the time list uses.
      const wanted = new Date(slotStart).getTime();
      const stillFree = (await getAvailableSlots(serviceType)).some((s) => new Date(s.start).getTime() === wanted);
      if (!stillFree) return res.status(409).json({ error: 'That slot was just booked by someone else. Please pick another.' });
    }

    const id = newId('GP4U');
    const patientToken = crypto.randomBytes(16).toString('hex');

    await db.run(`
      INSERT INTO bookings (id, patient_token, service_type, patient_name, patient_dob, patient_phone,
        patient_email, patient_address, pharmacy_name, reason, symptoms_duration, current_medications, allergies, extra_details,
        safety_answers, slot_start, slot_end, amount_cents, voucher_code, discount_cents, rx_status, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending_payment')
    `, [id, patientToken, serviceType, patientName, patientDob, patientPhone, patientEmail, db.encrypt(patientAddress || ''), pharmacyName,
      db.encrypt(reason), db.encrypt(symptomsDuration || ''), db.encrypt(currentMedications || ''), db.encrypt(allergies || ''), db.encrypt(extraDetails || ''),
      db.encrypt(safetyAnswers),
      slotStartSql, slotEndSql, amountCents, voucher ? voucher.code : null, voucher ? voucher.discountCents : 0, rxRequest ? 'requested' : null]);

    await upsertPatient({ email: patientEmail, name: patientName, dob: patientDob, phone: patientPhone, address: patientAddress || '' });

    if (amountCents === 0) {
      // Fully covered by a voucher: nothing to pay, so skip the card page. The confirmation page confirms it.
      return res.json({ bookingId: id, patientToken, free: true, checkoutUrl: `/confirmation.html?id=${id}&token=${patientToken}` });
    }

    if (!stripe) {
      // No Stripe key configured yet — let the demo continue without real payment so the
      // rest of the site can still be tried out. See README for adding real Stripe keys.
      return res.json({ bookingId: id, patientToken, checkoutUrl: `/confirmation.html?id=${id}&token=${patientToken}&demo=1` });
    }

    let session;
    try {
      session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // No fixed list of payment methods: Stripe offers whatever is switched on in the Stripe Dashboard
      // (cards, Apple Pay, Google Pay…) for the patient's device.
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: `GP4U — ${service.label}` + (voucher ? ` (voucher ${voucher.code}: ${voucher.label})` : '') },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      customer_email: patientEmail,
      // The card page closes after 30 minutes (Stripe's minimum); the time slot is held for that long only.
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      payment_intent_data: {
        receipt_email: patientEmail, // Stripe emails a payment receipt (when receipts are on in the Dashboard)
        description: `GP4U ${service.label} — booking ${id}`,
        metadata: { bookingId: id },
      },
      // Optional: a proper Stripe invoice (PDF) for every payment. Stripe charges a small fee per invoice, so it is
      // only switched on when STRIPE_INVOICES=1 is set in the hosting settings.
      ...(process.env.STRIPE_INVOICES === '1' ? { invoice_creation: { enabled: true, invoice_data: { description: `GP4U ${service.label} — booking ${id}`, metadata: { bookingId: id } } } } : {}),
      success_url: `${siteUrl()}/confirmation.html?id=${id}&token=${patientToken}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/book.html?cancelled=1`,
      metadata: { bookingId: id },
      });
    } catch (stripeErr) {
      // Stripe refused to open the payment page (e.g. card payments not yet approved on the account). Release the
      // time straight away and tell the patient plainly, instead of a generic error and a slot held for 35 minutes.
      console.error('Stripe Checkout could not be created:', stripeErr.message);
      await db.run("UPDATE bookings SET status = 'payment_unavailable' WHERE id = ?", [id]).catch(() => {});
      return res.status(503).json({ error: "Online card payment isn't available right now, so we couldn't complete your booking and you have not been charged. Please try again a little later, or contact us and we'll help you book." });
    }

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

    // The confirmation page calls this every time it is opened, including long after the consultation.
    // Only a booking still waiting for payment may be confirmed — otherwise reopening the link would
    // reset a 'completed' consultation back to 'paid' (reopening messaging and re-notifying the doctor).
    if (booking.status !== 'pending_payment' && booking.status !== 'payment_expired') return res.json({ status: booking.status });

    if (Number(booking.amount_cents) === 0 && booking.voucher_code) {
      // Fully paid by a voucher (the €0 price was set by the server when the booking was made) — nothing to charge.
      const r = await db.run("UPDATE bookings SET status = 'paid' WHERE id = ? AND status = 'pending_payment'", [booking.id]);
      if (r.changes) await notifyBookingPaid(booking);
      return res.json({ status: 'paid', free: true });
    }
    if (stripe && !booking.stripe_session_id) {
      // Payments are switched on but this booking never reached the card page (e.g. Stripe was briefly
      // unreachable when it was made). It must never be confirmed without payment.
      return res.json({ status: 'pending_payment' });
    }
    if (!stripe) {
      // Demo mode without Stripe configured: mark as paid so the flow can be tried end to end.
      // Only the request that actually flips the status sends the emails (two page loads at once must not double-send).
      const r = await db.run("UPDATE bookings SET status = 'paid' WHERE id = ? AND status = 'pending_payment'", [booking.id]);
      if (r.changes) await notifyBookingPaid(booking);
      return res.json({ status: 'paid', demo: true });
    }

    const session = await stripe.checkout.sessions.retrieve(booking.stripe_session_id);
    if (await markPaidFromSession(session)) return res.json({ status: 'paid' });
    res.json({ status: session.payment_status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not confirm payment status.' });
  }
});

async function requirePatientToken(req, res, next) {
  const booking = await db.get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  const token = String(req.query.token || (req.body && req.body.token) || '');
  const expected = String(booking.patient_token || '');
  if (!token || token.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    return res.status(403).json({ error: 'Invalid access token' });
  }
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
  safeBooking.audio_only = await require('../services').bookingIsAudioOnly(req.booking);
  safeBooking.is_rx = isRxService(req.booking.service_type);
  // Opening the booking counts as "viewed" for the unread badge shown in the patient portal.
  await db.run('UPDATE bookings SET patient_last_viewed_at = NOW() WHERE id = ?', [req.params.id]);
  res.json({ booking: safeBooking, messages, prescriptions, documents, attachments });
});

// Photo attachments — uploaded right after the booking is created, before payment.
// Stored as a BLOB directly in the database (see note on `upload` above).
router.post('/bookings/:id/attachments', requirePatientToken, upload.array('photos', 5), async (req, res) => {
  const files = req.files || [];
  const existing = await db.get('SELECT COUNT(*) AS n FROM attachments WHERE booking_id = ?', [req.params.id]);
  if (Number(existing.n) + files.length > 5) return res.status(400).json({ error: 'You can add up to 5 photos to a booking.' });
  // Every file must really be a photo (checked from its contents, not its name or claimed type).
  const checked = files.map((f) => ({ f, kind: detectImage(f.buffer) }));
  if (checked.some((c) => !c.kind)) return res.status(400).json({ error: 'Please upload photos only (JPG, PNG, WebP, GIF or iPhone HEIC).' });
  for (const { f, kind } of checked) {
    const name = String(f.originalname || 'photo').replace(/[\u0000-\u001f<>"'`\\/]/g, '_').slice(0, 120) || 'photo';
    await db.run(
      'INSERT INTO attachments (booking_id, original_name, mime_type, data) VALUES (?,?,?,?)',
      [req.params.id, name, kind.mime, f.buffer]
    );
  }
  res.json({ ok: true, count: files.length });
});

router.get('/bookings/:id/attachments/:attId', requirePatientToken, async (req, res) => {
  const att = await db.get('SELECT * FROM attachments WHERE id = ? AND booking_id = ?', [req.params.attId, req.params.id]);
  if (!att) return res.status(404).json({ error: 'Not found' });
  sendUpload(res, att);
});

router.post('/bookings/:id/messages', requirePatientToken, async (req, res) => {
  if (req.booking.status === 'completed') {
    return res.status(403).json({ error: 'This consultation is now closed, so messages can no longer be sent for it. Please book a new consultation if you need further care.' });
  }
  const { body } = req.body;
  if (typeof body !== 'string' || !body.trim()) return res.status(400).json({ error: 'Message cannot be empty' });
  if (body.length > 5000) return res.status(400).json({ error: 'That message is too long (5,000 characters at most).' });
  await db.run("INSERT INTO messages (booking_id, sender, body) VALUES (?, 'patient', ?)", [req.params.id, body.trim()]);
  await db.run(`
    INSERT INTO notifications (type, booking_id, message)
    VALUES ('new_message', ?, ?)
  `, [req.params.id, `New message from ${req.booking.patient_name}`]);

  // Tell the doctor who has the case (or the practice's notification address if nobody has claimed it yet).
  // The message itself is NOT put in the email — health details stay inside the secure dashboard.
  try {
    const recipients = new Set();
    if (req.booking.claimed_by) {
      const doc = await db.get('SELECT email FROM doctors WHERE id = ? AND active = 1', [req.booking.claimed_by]);
      if (doc && doc.email) recipients.add(doc.email.toLowerCase());
    }
    if (!recipients.size && process.env.DOCTOR_EMAIL) recipients.add(process.env.DOCTOR_EMAIL.toLowerCase());
    if (recipients.size) {
      const practice = await getPractice();
      const link = `${siteUrl()}/dashboard.html?open=${encodeURIComponent(req.booking.id)}&tab=messages`;
      for (const to of recipients) {
        await mailer.sendMail({
          to,
          subject: `New patient message — ${req.booking.patient_name} (${req.booking.id})`,
          html: `
            ${emailHeader(practice)}
            <p><strong>${esc(req.booking.patient_name)}</strong> has sent a new message about booking ${esc(req.booking.id)}.</p>
            <p>For privacy the message is not included in this email. Sign in to read and reply:</p>
            ${emailButton(link, 'Open the consultation')}
          `,
        });
      }
    }
  } catch (err) {
    console.log('Doctor message notification email not sent:', err.message);
  }
  res.json({ ok: true });
});

// Polled by the patient's confirmation page and consult page — the patient never starts a call
// themselves, only reacts to the doctor having started one (see doctor.js's /start-call).
router.get('/bookings/:id/call-status', requirePatientToken, async (req, res) => {
  res.json({
    started: !!req.booking.call_started_at,
    mode: (await require('../services').bookingIsAudioOnly(req.booking)) ? 'audio' : (req.booking.call_mode || 'video'),
    // Only handed out once the doctor has started the call, and only to the holder of the patient token.
    room: req.booking.call_started_at ? (req.booking.call_room || null) : null,
    // Doxy.me room of the doctor who claimed this consultation (or the practice's room), once the call has started.
    videoRoomUrl: req.booking.call_started_at ? await require('../videoRoom').roomForBooking(req.booking) : null,
  });
});

// Connection helpers for the call (STUN + the relay server, see server/turn.js) — only once the GP has started it.
router.get('/bookings/:id/call-ice', requirePatientToken, async (req, res) => {
  if (!req.booking.call_started_at) return res.status(409).json({ error: 'The call has not started yet.' });
  res.json(await require('../turn').iceServers());
});

router.get('/bookings/:id/account-status', requirePatientToken, async (req, res) => {
  const patient = await db.get('SELECT password_hash FROM patients WHERE email = ?', [req.booking.patient_email]);
  res.json({ hasPassword: !!(patient && patient.password_hash) });
});

// Patient-side read access to a single prescription/document for printing — proven by the
// same booking token used for the confirmation page, so no separate login is required.
// Every prescription goes to the pharmacy (via the practice team / Healthlink), never to the patient, so patients can't
// open or print one. Letters and certificates (below) stay available to them.
router.get('/bookings/:id/prescriptions/:rxId', requirePatientToken, (req, res) => {
  res.status(403).json({ error: 'Your prescription is sent directly to your pharmacy, so it isn\'t available to download.' });
});

router.get('/bookings/:id/documents/:docId', requirePatientToken, async (req, res) => {
  const doc = await db.get('SELECT * FROM documents WHERE id = ? AND booking_id = ?', [req.params.docId, req.params.id]);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  const { patient_token, ...safeBooking } = await enrichBooking(req.booking);
  res.json({ document: { ...doc, fields: JSON.parse(doc.fields), signature_image: await signatures.dataUrl(doc.signature_id) }, booking: safeBooking, practice: await getPractice() });
});

module.exports = router;
module.exports.stripeWebhook = stripeWebhook;
