/*
 * New online bookings: who is told, and who takes the case.
 *
 * When an online booking is confirmed, every active doctor who is scheduled to work at that time (their own
 * availability covers the slot) gets an email with a personal "claim this case" link. The first doctor to claim it
 * owns the case; from then on everyone else's link is inactive and says who has it. If nobody's schedule covers the
 * slot (e.g. hours were changed after it was offered), every active doctor is emailed instead so it can't be missed.
 * The claim itself is one atomic database update, so two doctors clicking at the same moment cannot both win.
 * A doctor can release a case they claimed, which makes the other links live again.
 */
const crypto = require('crypto');
const db = require('./db');
const mailer = require('./mailer');
const { getPractice, escapeHtml: esc, emailHeader } = require('./practice');

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';

// Day of week (0 = Sunday) and minutes since midnight, in Irish time.
function dublinParts(date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Dublin', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(date));
  const get = (t) => parts.find((p) => p.type === t).value;
  return { dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')), mins: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
}
const toMins = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };

// Active doctors whose working hours cover the booking; all active doctors if nobody's do.
async function scheduledDoctors(booking) {
  const start = dublinParts(booking.slot_start);
  const end = dublinParts(booking.slot_end);
  const rows = await db.all(`
    SELECT d.id, d.name, d.email, a.start_time, a.end_time
    FROM doctor_availability a JOIN doctors d ON d.id = a.doctor_id
    WHERE d.active = 1 AND a.day_of_week = ?`, [start.dow]);
  const covering = new Map();
  rows.forEach((r) => { if (toMins(r.start_time) <= start.mins && toMins(r.end_time) >= end.mins) covering.set(r.id, { id: r.id, name: r.name, email: r.email }); });
  if (covering.size) return { doctors: [...covering.values()], scheduled: true };
  const all = await db.all('SELECT id, name, email FROM doctors WHERE active = 1');
  return { doctors: all, scheduled: false };
}

const whenText = (iso) => new Date(iso).toLocaleString('en-IE', { timeZone: 'Europe/Dublin', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

// Best-effort: a missing or broken email setup never stops a booking. The claim links are stored either way, so the
// doctor dashboard can still list cases waiting to be claimed.
async function notifyDoctorsOfBooking(booking, serviceLabel) {
  if (!booking || booking.service_type === 'walk_in') return;
  const already = await db.get('SELECT 1 AS x FROM booking_claim_links WHERE booking_id = ? LIMIT 1', [booking.id]);
  if (already) return;
  const practice = await getPractice();
  const { doctors, scheduled } = await scheduledDoctors(booking);
  const notified = new Set();
  for (const d of doctors) {
    const token = crypto.randomBytes(24).toString('hex');
    await db.run('INSERT INTO booking_claim_links (booking_id, doctor_id, token) VALUES (?, ?, ?)', [booking.id, d.id, token]);
    if (!d.email) continue;
    notified.add(d.email.toLowerCase());
    const link = `${BASE_URL}/dashboard.html?claim=${token}`;
    try {
      await mailer.sendMail({
        to: d.email,
        subject: `New online booking: ${booking.patient_name} — ${whenText(booking.slot_start)}`,
        html: `
          ${emailHeader(practice)}
          <p>Hi ${esc(d.name)},</p>
          <p>A new online booking needs a doctor${scheduled ? ' (you are scheduled at this time)' : ''}:</p>
          <p><strong>${esc(booking.patient_name)}</strong> — ${esc(serviceLabel)}<br>${esc(whenText(booking.slot_start))}</p>
          <p><a href="${link}" style="display:inline-block;background:#0a4d4d;color:#ffffff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold;">Claim this case</a></p>
          <p style="color:#555;font-size:13px;">The first doctor to claim it takes the case, and the link then stops working for everyone else. You will be asked to sign in first. Link: ${link}</p>
        `,
      });
    } catch (err) {
      console.log('Doctor booking email not sent:', err.message);
    }
  }
  // An address kept in settings for information (not one of the doctors above) still gets a plain notice.
  if (process.env.DOCTOR_EMAIL && !notified.has(process.env.DOCTOR_EMAIL.toLowerCase())) {
    try {
      await mailer.sendMail({
        to: process.env.DOCTOR_EMAIL,
        subject: `New booking: ${booking.patient_name}`,
        html: `${emailHeader(practice)}<p>${esc(booking.patient_name)} booked a ${esc(serviceLabel)} for ${esc(whenText(booking.slot_start))}. The scheduled doctors have been emailed a link to claim it.</p>`,
      });
    } catch (err) { console.log('Booking notification copy not sent:', err.message); }
  }
}

// What a claim link means right now: open | mine | claimed | cancelled | invalid
async function linkStatus(token) {
  if (!/^[0-9a-f]{48}$/.test(String(token || ''))) return { state: 'invalid' };
  const row = await db.get(`
    SELECT l.doctor_id, l.booking_id, b.claimed_by, b.status, d.name AS claimed_by_name
    FROM booking_claim_links l JOIN bookings b ON b.id = l.booking_id LEFT JOIN doctors d ON d.id = b.claimed_by
    WHERE l.token = ?`, [token]);
  if (!row) return { state: 'invalid' };
  const base = { bookingId: row.booking_id, doctorId: row.doctor_id, claimedByName: row.claimed_by_name || null };
  if (row.status === 'cancelled') return { ...base, state: 'cancelled' };
  if (!row.claimed_by) return { ...base, state: 'open' };
  return { ...base, state: row.claimed_by === row.doctor_id ? 'mine' : 'claimed' };
}

// Take a case. One statement decides the winner; afterwards we read back who holds it.
async function claimBooking(bookingId, doctorId) {
  await db.run('UPDATE bookings SET claimed_by = ?, claimed_at = NOW() WHERE id = ? AND claimed_by IS NULL', [doctorId, bookingId]);
  const row = await db.get('SELECT b.claimed_by, d.name AS claimed_by_name FROM bookings b LEFT JOIN doctors d ON d.id = b.claimed_by WHERE b.id = ?', [bookingId]);
  if (!row) return { ok: false, notFound: true };
  return { ok: row.claimed_by === doctorId, claimedBy: row.claimed_by, claimedByName: row.claimed_by_name };
}

async function releaseBooking(bookingId, doctorId) {
  const r = await db.run('UPDATE bookings SET claimed_by = NULL, claimed_at = NULL WHERE id = ? AND claimed_by = ?', [bookingId, doctorId]);
  return r.changes > 0;
}

module.exports = { notifyDoctorsOfBooking, linkStatus, claimBooking, releaseBooking, scheduledDoctors };
