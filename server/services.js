// Service catalogue for GP4U — editable from the admin content editor (see routes/admin.js and
// content-editor.html), backed by the `services` table instead of a static object.
const db = require('./db');

function rowToService(row) {
  return { label: row.label, durationMins: row.duration_mins, priceCents: row.price_cents };
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

module.exports = { getServices, getService };
