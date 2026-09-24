/*
 * Search-engine plumbing for the public site (see server/pages.js for the page list):
 *   - one address per page: gp4u.ie -> www.gp4u.ie, old /page.html -> /clean-url/ (301), /clean-url -> /clean-url/
 *   - serves each public page at its clean URL, with the clinic's structured data (MedicalClinic: name, address,
 *     phone, opening hours, closures) and its address / opening hours written into the HTML from the LIVE settings
 *     (Admin -> Website settings), so search engines see the same details patients do, even without running scripts
 *   - /sitemap.xml built from server/pages.js
 *   - a real 404 page (status 404, noindex) for unknown addresses
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ORIGIN, PAGES, BY_URL, REDIRECTS } = require('./pages');
const S = require('./siteSettings');

const PUBLIC = path.join(__dirname, '..', 'public');
const CANONICAL_HOST = new URL(ORIGIN).host; // www.gp4u.ie
const BARE_HOST = CANONICAL_HOST.replace(/^www\./, '');

// ---------------------------------------------------------------- clinic details (built-in defaults + admin edits)
// The built-in defaults live in public/js/clinic.js (the browser's copy); read that same object here so the two
// can never disagree.
let DEFAULTS = null;
function clinicDefaults() {
  if (DEFAULTS) return DEFAULTS;
  try {
    const src = fs.readFileSync(path.join(PUBLIC, 'js', 'clinic.js'), 'utf8');
    const m = src.match(/const CLINIC = (\{[\s\S]*?\n\});/);
    DEFAULTS = vm.runInNewContext(`(${m[1]})`);
  } catch (err) {
    console.error('seo: could not read clinic defaults from clinic.js:', err.message);
    DEFAULTS = { name: 'GP4U Clinic', town: 'Newbridge', county: 'Co. Kildare', email: '', hours: {}, closures: [] };
  }
  return DEFAULTS;
}
async function clinic() {
  const c = JSON.parse(JSON.stringify(clinicDefaults()));
  try {
    const live = (await S.getPublic()).clinic || {};
    Object.keys(live).forEach((k) => { c[k] = live[k]; });
  } catch (err) { /* database unavailable: built-in values */ }
  return c;
}

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const fmt = (t) => { const [h, m] = t.split(':').map(Number); const s = h >= 12 ? 'pm' : 'am'; const h12 = h % 12 || 12; return m ? `${h12}:${String(m).padStart(2, '0')}${s}` : `${h12}${s}`; };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dublinToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function clinicLd(c) {
  const hours = c.hours || {};
  const groups = new Map(); // "10:00-21:00" -> [days]
  ORDER.forEach((d) => { if (hours[d]) { const k = hours[d].join('-'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(DAY[d]); } });
  const today = dublinToday();
  const closures = (c.closures || []).filter((x) => (x.to || x.from) >= today);
  const address = { '@type': 'PostalAddress', addressLocality: c.town, addressRegion: c.county, addressCountry: 'IE' };
  if (c.streetAddress) address.streetAddress = c.streetAddress;
  if (c.eircode) address.postalCode = c.eircode;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'MedicalClinic',
    '@id': `${ORIGIN}/#clinic`,
    name: c.name,
    slogan: 'GP care when you need it.',
    description: `Walk-in GP clinic and family practice in ${c.town}, ${c.county}. No appointment needed during opening hours.`,
    url: `${ORIGIN}/walk-in-gp-newbridge/`,
    image: `${ORIGIN}/img/clinic/walk-in-consult.jpg`,
    logo: `${ORIGIN}/img/gp4u-logo-card.png`,
    medicalSpecialty: 'https://schema.org/PrimaryCare',
    isAcceptingNewPatients: true,
    address,
    parentOrganization: { '@id': `${ORIGIN}/#organization` },
    openingHoursSpecification: [...groups].map(([k, days]) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: days, opens: k.split('-')[0], closes: k.split('-')[1] })),
  };
  if (c.email) ld.email = c.email;
  if (c.phone) ld.telephone = c.phone;
  if (c.streetAddress) ld.hasMap = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([c.name, c.streetAddress, c.town, c.county, c.eircode].filter(Boolean).join(', '));
  if (closures.length) {
    ld.specialOpeningHoursSpecification = closures.map((x) => ({ '@type': 'OpeningHoursSpecification', opens: '00:00', closes: '00:00', validFrom: x.from, validThrough: x.to || x.from }));
  }
  // GP4U as a whole: the online service across Ireland plus the Newbridge clinic
  const org = {
    '@type': 'MedicalOrganization',
    '@id': `${ORIGIN}/#organization`,
    name: 'GP4U',
    alternateName: c.name,
    url: `${ORIGIN}/`,
    logo: `${ORIGIN}/img/gp4u-logo-card.png`,
    slogan: 'One tap. Real care.',
    description: `GP-led care in Ireland: online GP consultations by video or phone, and a walk-in GP clinic and family practice in ${c.town}, ${c.county}.`,
    medicalSpecialty: 'https://schema.org/PrimaryCare',
    areaServed: { '@type': 'Country', name: 'Ireland' },
    address,
  };
  if (c.email) org.email = c.email;
  if (c.phone) org.telephone = c.phone;
  if (c.companyName) org.legalName = c.companyName;
  delete ld['@context'];
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': [org, ld] }, null, 2).split('<').join('\\u003c');
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

// Static versions of what public/js/clinic.js fills in (it replaces them in the browser with the same values).
function hoursTable(c) {
  const rows = ORDER.map((d) => { const h = (c.hours || {})[d]; return `<tr><th scope="row">${DAY[d]}</th><td>${h ? `${fmt(h[0])} – ${fmt(h[1])}` : 'Closed'}</td></tr>`; }).join('');
  return `<table class="hours-table"><tbody>${rows}</tbody></table>`;
}
function hoursText(c) {
  const groups = [];
  ORDER.forEach((d) => { const h = (c.hours || {})[d]; const key = h ? h.join('-') : 'closed'; const last = groups[groups.length - 1]; if (last && last.key === key) last.days.push(d); else groups.push({ key, days: [d], h }); });
  return groups.map((g) => { const a = DAY[g.days[0]]; const b = DAY[g.days[g.days.length - 1]]; const label = g.days.length === 1 ? a : g.days.length === 2 ? `${a} and ${b}` : `${a} to ${b}`; return `${label} ${g.h ? `${fmt(g.h[0])} – ${fmt(g.h[1])}` : '(closed)'}`; }).join(', ');
}

async function render(file) {
  let html = fs.readFileSync(path.join(PUBLIC, file), 'utf8');
  if (!/data-clinic-|<!-- @clinic-ld -->/.test(html)) return html;
  const c = await clinic();
  const addr = [c.streetAddress, c.town, c.county, c.eircode].filter(Boolean);
  const addrText = c.streetAddress ? addr.map(esc).join('<br>') : `${esc(c.town)}, ${esc(c.county)}`;
  html = html
    .replace('<!-- @clinic-ld -->', clinicLd(c))
    .replace(/(<(div|span|dd|li)\b[^>]*\sdata-clinic-address>)(<\/\2>)/g, `$1${addrText}$3`)
    .replace(/(<(div)\b[^>]*\sdata-clinic-hours>)(<\/\2>)/g, `$1${hoursTable(c)}$3`)
    .replace(/(<span data-clinic-hours-text>)[^<]*(<\/span>)/g, `$1${esc(hoursText(c))}$2`);
  if (c.email) html = html.replace(/(<(li|dd|p)\b[^>]*\sdata-clinic-email>)(<\/\2>)/g, `$1<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>$3`);
  return html;
}

function sitemap() {
  const today = dublinToday();
  const lastmod = (file) => { try { return fs.statSync(path.join(PUBLIC, file)).mtime.toISOString().slice(0, 10); } catch (e) { return today; } };
  const urls = PAGES.filter((p) => p.index).map((p) => `  <url><loc>${ORIGIN}${p.url}</loc><lastmod>${lastmod(p.file)}</lastmod><changefreq>${p.changefreq || 'monthly'}</changefreq><priority>${(p.priority || 0.5).toFixed(2)}</priority></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

// ---------------------------------------------------------------- middleware
function redirects(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const q = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  // gp4u.ie -> www.gp4u.ie (only on the real domain; localhost and test hosts are left alone)
  // (one hop straight to the final address, e.g. gp4u.ie/walk-in.html -> www.gp4u.ie/walk-in-gp-newbridge/)
  const target = REDIRECTS.get(req.path) || (!req.path.endsWith('/') && BY_URL.has(req.path + '/') ? req.path + '/' : null);
  if (req.hostname === BARE_HOST) return res.redirect(301, `${ORIGIN}${target || req.path}${q}`);
  if (target) return res.redirect(301, target + q);
  next();
}

async function pages(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path === '/sitemap.xml') return res.type('application/xml').set('Cache-Control', 'no-cache').send(sitemap());
  const page = BY_URL.get(req.path);
  if (!page || page.keepUrl) return next();
  try {
    const html = await render(page.file);
    res.type('html').set('Cache-Control', 'no-cache').send(html);
  } catch (err) { next(err); }
}

// Unknown public addresses: a helpful page with a real 404 status (API calls keep their own JSON/plain errors).
function notFound(req, res, next) {
  if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api/')) return next();
  res.status(404).type('html').set('Cache-Control', 'no-cache').sendFile(path.join(PUBLIC, '404.html'));
}

module.exports = { redirects, pages, notFound, render, sitemap, clinicLd, clinic };
