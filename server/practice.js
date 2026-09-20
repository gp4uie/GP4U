/*
 * The clinic's own details for anything the server produces — PDFs (prescriptions, sick certificates, referral
 * letters), the printable versions, and emails. One source of truth: the built-in defaults in public/js/clinic.js
 * overlaid with whatever an admin has saved in Admin -> Website settings. So changing the phone number or address
 * there changes every letterhead too.
 */
const fs = require('fs');
const path = require('path');
const db = require('./db');

// clinic.js is a browser script that starts with `const CLINIC = { ... };` — read the defaults straight from it so there is
// only one list of defaults in the whole project.
let defaults = null;
function loadDefaults() {
  if (defaults) return defaults;
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'clinic.js'), 'utf8');
  const start = src.indexOf('const CLINIC = ');
  const end = src.indexOf('\n};', start);
  if (start < 0 || end < 0) throw new Error('could not read the clinic defaults from public/js/clinic.js');
  defaults = new Function('return ' + src.slice(start + 'const CLINIC = '.length, end + 2))();
  return defaults;
}

async function getPractice() {
  let overrides = {};
  try {
    const row = await db.get("SELECT data FROM site_config WHERE name = 'clinic'");
    if (row) overrides = JSON.parse(row.data) || {};
  } catch (err) { /* fall back to the defaults */ }
  const c = { ...loadDefaults(), ...overrides };
  const website = (process.env.BASE_URL || 'https://www.gp4u.ie').replace(/^https?:\/\//, '').replace(/\/$/, '');
  // Until a street address has been entered only the town and county are shown (same rule as the website).
  const addressLines = c.streetAddress ? [c.streetAddress, c.town, c.county, c.eircode].filter(Boolean) : [c.town, c.county].filter(Boolean);
  const company = [
    c.companyName,
    c.companyNumber && `Registered in Ireland, company no. ${c.companyNumber}`,
    c.registeredOffice && `Registered office: ${c.registeredOffice}`,
  ].filter(Boolean);
  return { name: c.name, tagline: c.tagline, addressLines, address: addressLines.join(', '), phone: c.phone || '', email: c.email || '', website, company };
}

const escapeHtml = (v) => String(v === null || v === undefined ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// The line at the top of every email the clinic sends.
const emailHeader = (p) => `<p><strong>${escapeHtml(p.name)}</strong> — ${escapeHtml(p.tagline)} — ${escapeHtml(p.website)}</p>`;

// Fill in what a walk-in (or anyone) did not type on the booking itself, from their clinic registration or portal profile:
// address, allergies and current medicines. Never overwrites something that is already there.
async function enrichBooking(booking) {
  if (!booking) return booking;
  const out = { ...booking };
  const need = ['patient_address', 'allergies', 'current_medications'].filter((k) => !String(out[k] || '').trim());
  if (!need.length) return out;
  let profile = null;
  if (out.patient_email) {
    profile = await db.get('SELECT address, allergies, current_medications FROM patients WHERE email = ?', [out.patient_email]);
  }
  const reg = await db.get(
    'SELECT address, allergies, current_medications FROM patient_registrations WHERE LOWER(TRIM(full_name)) = ? AND dob = ? ORDER BY created_at DESC LIMIT 1',
    [String(out.patient_name || '').trim().toLowerCase(), out.patient_dob]
  );
  const pick = (a, b) => (String(a || '').trim() ? a : (String(b || '').trim() ? b : ''));
  if (need.includes('patient_address')) out.patient_address = pick(profile && profile.address, reg && reg.address);
  if (need.includes('allergies')) out.allergies = pick(profile && profile.allergies, reg && reg.allergies);
  if (need.includes('current_medications')) out.current_medications = pick(profile && profile.current_medications, reg && reg.current_medications);
  return out;
}

// A file name that is safe in an HTTP header and on any computer: accents removed, everything else that is not a letter or digit becomes "-".
const fileSafe = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'document';

module.exports = { getPractice, escapeHtml, emailHeader, enrichBooking, fileSafe };
