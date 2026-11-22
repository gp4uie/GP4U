// Permanently removes one booking and every row that hangs off it. Used only by admin clean-up tools
// (the "ZZ LIVE TEST" sweep and the pre-launch "Delete test consultations" list) — never by any
// clinical workflow, since real medical records must be kept.
const db = require('./db');

// Every table with a booking_id column. Children first: several have a foreign key to bookings(id).
const CHILD_TABLES = [
  'messages', 'prescriptions', 'clinical_notes', 'documents', 'attachments', 'notifications',
  'chart_access_log', 'consultation_summary_log', 'tasks', 'booking_claim_links',
];

async function deleteBookingCascade(bookingId) {
  for (const t of CHILD_TABLES) {
    try { await db.run(`DELETE FROM ${t} WHERE booking_id = ?`, [bookingId]); } catch (err) { /* table without that column */ }
  }
  // A walk-in that was turned into this booking goes with it (it only exists as part of that visit).
  let walkIns = 0;
  try { walkIns = (await db.run('DELETE FROM walkin_checkins WHERE booking_id = ?', [bookingId])).changes || 0; } catch (err) { /* older schema */ }
  const r = await db.run('DELETE FROM bookings WHERE id = ?', [bookingId]);
  return { bookings: r.changes || 0, walkIns };
}

module.exports = { deleteBookingCascade };
