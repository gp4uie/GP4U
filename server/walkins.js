const crypto = require('crypto');
const db = require('./db');

/*
 * Walk-in patients become real bookings.
 *
 * Doctors chart everything against a booking (notes, prescriptions, letters, history), so a walk-in who is at the
 * clinic needs one. It is created (service 'walk_in', status 'paid', €0) when the person is added at the desk or first
 * marked "arrived" / "seen" — never for someone who has only checked in online and hasn't turned up. The booking is
 * timed "now" for 15 minutes, so the doctor sees it on today's schedule and in Recent Cases, and it correctly takes
 * up some of that doctor's time when online slots are offered.
 */
const WALK_IN_MINUTES = 15;

async function ensureWalkInBooking(walkinId) {
  const w = await db.get('SELECT * FROM walkin_checkins WHERE id = ?', [walkinId]);
  if (!w) return null;
  if (w.booking_id) return w.booking_id;

  const bookingId = `WALK-${crypto.randomBytes(4).toString('hex')}`.toUpperCase();
  // Claim the link first so two staff pressing "arrived" at the same moment cannot create two bookings.
  const claim = await db.run('UPDATE walkin_checkins SET booking_id = ? WHERE id = ? AND booking_id IS NULL', [bookingId, walkinId]);
  if (!claim.changes) return (await db.get('SELECT booking_id FROM walkin_checkins WHERE id = ?', [walkinId])).booking_id;

  try {
    const start = new Date();
    const end = new Date(start.getTime() + WALK_IN_MINUTES * 60 * 1000);
    await db.run(`
      INSERT INTO bookings
        (id, patient_token, service_type, patient_name, patient_dob, patient_phone, patient_email, reason,
         slot_start, slot_end, amount_cents, status)
      VALUES (?, ?, 'walk_in', ?, ?, ?, ?, ?, ?, ?, 0, 'paid')`,
    [bookingId, crypto.randomBytes(16).toString('hex'), w.full_name, w.dob, w.phone, w.email || '', db.encrypt(w.reason),
      db.toMySQLDateTime(start.toISOString()), db.toMySQLDateTime(end.toISOString())]);
    // Doctor's notification bell
    await db.run("INSERT INTO notifications (type, booking_id, message) VALUES ('walk_in', ?, ?)", [bookingId, `Walk-in patient: ${w.full_name}`]);
    return bookingId;
  } catch (err) {
    await db.run('UPDATE walkin_checkins SET booking_id = NULL WHERE id = ? AND booking_id = ?', [walkinId, bookingId]);
    throw err;
  }
}

// Keep the booking in step when a walk-in is cancelled / no-show, seen, or reopened.
async function syncWalkInBookingStatus(walkinId, walkinStatus) {
  const w = await db.get('SELECT booking_id FROM walkin_checkins WHERE id = ?', [walkinId]);
  if (!w || !w.booking_id) return;
  if (walkinStatus === 'cancelled') {
    await db.run("UPDATE bookings SET status = 'cancelled' WHERE id = ? AND status IN ('paid', 'completed')", [w.booking_id]);
  } else if (walkinStatus === 'seen') {
    // "Seen" means the visit is finished, so the booking is completed and counts in the patient's history and the stats.
    await db.run("UPDATE bookings SET status = 'completed' WHERE id = ? AND status = 'paid'", [w.booking_id]);
  } else {
    await db.run("UPDATE bookings SET status = 'paid' WHERE id = ? AND status IN ('cancelled', 'completed')", [w.booking_id]);
  }
}

// Called whenever staff change a walk-in's status (front desk or doctor).
async function applyWalkInStatus(walkinId, status) {
  if (status === 'arrived' || status === 'seen') await ensureWalkInBooking(walkinId);
  await syncWalkInBookingStatus(walkinId, status);
}

module.exports = { ensureWalkInBooking, applyWalkInStatus };
