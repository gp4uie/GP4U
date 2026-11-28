// Refunds a booking's payment in full. Never automatic: only called when a doctor/admin presses "Refund" (e.g. after
// declining a prescription request). Free (100% voucher) bookings have nothing to refund. Without Stripe configured
// (demo/local) the booking is just marked refunded.
const Stripe = require('stripe');
const db = require('./db');

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

async function refundBooking(booking, byWho) {
  if (!booking) return { ok: false, status: 404, error: 'Not found' };
  if (booking.refunded_at) return { ok: false, status: 409, error: 'This payment has already been refunded.' };
  if (booking.status !== 'paid' && booking.status !== 'completed') return { ok: false, status: 400, error: 'There is no completed payment on this request to refund.' };
  const amount = Number(booking.amount_cents) || 0;
  if (amount <= 0) return { ok: false, status: 400, error: 'Nothing to refund — the patient did not pay (free voucher).' };

  let refundId = null;
  if (stripe && (booking.stripe_payment_intent || booking.stripe_session_id)) {
    let pi = booking.stripe_payment_intent;
    if (!pi) {
      const session = await stripe.checkout.sessions.retrieve(booking.stripe_session_id);
      pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent && session.payment_intent.id;
    }
    if (!pi) return { ok: false, status: 400, error: 'Could not find the card payment for this request in Stripe.' };
    try {
      const refund = await stripe.refunds.create({ payment_intent: pi, metadata: { bookingId: String(booking.id), by: String(byWho || '') } }, { idempotencyKey: 'refund-' + booking.id });
      refundId = refund.id;
    } catch (err) {
      console.error('Stripe refund failed', booking.id, err.message);
      return { ok: false, status: 502, error: 'Stripe could not make the refund: ' + err.message };
    }
  }
  const r = await db.run('UPDATE bookings SET refunded_at = NOW(), refund_cents = ?, refund_id = ?, refunded_by = ? WHERE id = ? AND refunded_at IS NULL',
    [amount, refundId, String(byWho || '').slice(0, 255), booking.id]);
  if (!r.changes) return { ok: false, status: 409, error: 'This payment has already been refunded.' };
  return { ok: true, amount, refundId };
}

module.exports = { refundBooking };
