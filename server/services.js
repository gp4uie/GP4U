// Service catalogue for GP4U — editable from the admin content editor (see routes/admin.js and
// content-editor.html), backed by the `services` table instead of a static object.
const db = require('./db');

// A phone consultation is paid for as audio only, so its call is always audio (no video option for patient or GP).
// The built-in "general" service is the Phone Consultation; any other service whose name says "phone" counts too.
function isAudioOnly(key, label) {
  return key === 'general' || /\bphone\b/i.test(String(label || ''));
}

function rowToService(row) {
  return { label: row.label, durationMins: row.duration_mins, priceCents: row.price_cents, audioOnly: isAudioOnly(row.key, row.label) };
}

// For a booking: is its service a phone (audio-only) consultation?
async function bookingIsAudioOnly(booking) {
  if (!booking || booking.service_type === 'walk_in') return false;
  const row = await db.get('SELECT `key`, label FROM services WHERE `key` = ?', [booking.service_type]);
  return isAudioOnly(booking.service_type, row && row.label);
}

// Returns { [key]: { label, durationMins, priceCents } }, ordered by sort_order.
async function getServices() {
  const rows = await db.all('SELECT * FROM services ORDER BY sort_order ASC, `key` ASC');
  const services = {};
  rows.forEach((r) => { services[r.key] = rowToService(r); });
  return services;
}

async function getService(key) {
  const row = await db.get('SELECT * FROM services WHERE `key` = ?', [key]);
  return row ? rowToService(row) : null;
}

module.exports = { getServices, getService, isAudioOnly, bookingIsAudioOnly };
