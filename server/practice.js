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
// The public web address used in every link the site emails out (booking links, claim links, password resets).
// BASE_URL in the hosting settings wins. Two safety nets so a patient is never emailed a dead link:
//   - BASE_URL missing or malformed → https://www.gp4u.ie
//   - BASE_URL still says "localhost" (copied from a dev .env) while real visitors are arriving on a public
//     address → use that public address instead (noted from incoming requests by noteRequestHost below).
const DEFAULT_SITE = 'https://www.gp4u.ie';
let seenPublicSite = null;
function siteUrl() {
  let u = String(process.env.BASE_URL || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/\s]+$/i.test(u)) u = DEFAULT_SITE;
  if (/\/\/(localhost|127\.0\.0\.1)(:|$)/i.test(u) && seenPublicSite) u = seenPublicSite;
  // The site's single address is www.gp4u.ie — emailed links must never use the bare domain.
  u = u.replace(/^https?:\/\/gp4u\.ie$/i, 'https://www.gp4u.ie');
  return u;
}
function noteRequestHost(req, res, next) {
  const host = String(req.get('host') || '').toLowerCase();
  if (!seenPublicSite && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) && !/^(localhost|127\.)/.test(host)) {
    seenPublicSite = `https://${host === 'gp4u.ie' ? 'www.gp4u.ie' : host}`;
  }
  next();
}

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
  const website = siteUrl().replace(/^https?:\/\//, '');
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
// The logo itself is added above this by the mailer (server/mailer.js), so the name is not repeated in the HTML.
const emailHeader = (p) => `<p style="color:#555;font-size:13px;margin:0 0 18px;"><span style="display:none;">${escapeHtml(p.name)} — </span>${escapeHtml(p.tagline)} · ${escapeHtml(p.website)}</p>`;

// The line at the bottom of patient-facing emails: how to reach the clinic, and that this is an automated message.
const emailFooter = (p) => {
  const contact = [p.phone, p.email].filter(Boolean).join(' · ');
  return `<p style="color:#555;font-size:13px;margin-top:24px;">${contact ? `Questions? ${escapeHtml(contact)}<br>` : ''}This is an automated message from ${escapeHtml(p.name)} (${escapeHtml(p.website)}). In an emergency call 112 or 999.</p>`;
};

// A link written out both as a button and as plain text, so it still works in mail apps that strip buttons.
const emailButton = (href, label) => `<p><a href="${escapeHtml(href)}" style="display:inline-block;background:#0a4d4d;color:#ffffff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold;">${escapeHtml(label)}</a></p>
  <p data-html-only style="color:#555;font-size:13px;">If the button doesn't work, copy this link into your browser:<br><a href="${escapeHtml(href)}">${escapeHtml(href)}</a></p>`;

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

module.exports = { getPractice, escapeHtml, emailHeader, emailFooter, emailButton, siteUrl, noteRequestHost, enrichBooking, fileSafe };
