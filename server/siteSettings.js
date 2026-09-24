/*
 * Website settings an admin can edit: storage, validation and the public view of them.
 * Everything an admin sends is checked here — types, lengths, formats — before it is stored, and what the public
 * site receives (window.GP4U_SETTINGS via /api/site-settings.js) contains nothing but these already-cleaned values.
 */
const db = require('./db');
const { TEXT_BY_KEY, IMAGE_BY_SLOT } = require('./siteRegistry');

class BadInput extends Error {}
const bad = (msg) => { throw new BadInput(msg); };

const NAMES = ['clinic', 'text', 'faq', 'banner'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isRealDate = (v) => { if (!DATE_RE.test(v)) return false; const d = new Date(v + 'T00:00:00Z'); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; };

const str = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const strKeepLines = (v, max) => (typeof v === 'string' ? v.replace(/\r/g, '').trim().slice(0, max) : '');

// Clinic details are shown as plain text on the website, so angle brackets are never allowed in them.
function stripAngles(v) {
  if (typeof v === 'string') return v.replace(/[<>]/g, '');
  if (Array.isArray(v)) return v.map(stripAngles);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, stripAngles(x)]));
  return v;
}

function cleanHours(h, label) {
  if (h === null) return null;
  if (typeof h !== 'object' || Array.isArray(h)) bad(`${label}: hours must be a list of days`);
  const out = {};
  for (let d = 0; d <= 6; d += 1) {
    const v = h[d];
    if (v === null || v === undefined) { out[d] = null; continue; }
    if (!Array.isArray(v) || v.length !== 2 || !TIME_RE.test(v[0]) || !TIME_RE.test(v[1])) bad(`${label}: use times like 09:00 and 17:30 (day ${d})`);
    if (v[0] >= v[1]) bad(`${label}: closing time must be later than opening time`);
    out[d] = [v[0], v[1]];
  }
  return out;
}

function cleanClinic(input) {
  if (!input || typeof input !== 'object') bad('Nothing to save');
  const out = {};
  const set = (k, v) => { out[k] = v; };
  if ('clinicOpen' in input) set('clinicOpen', !!input.clinicOpen);
  if ('name' in input) { const v = str(input.name, 80); if (!v) bad('The clinic name cannot be empty'); set('name', v); }
  if ('tagline' in input) set('tagline', str(input.tagline, 140));
  if ('streetAddress' in input) set('streetAddress', str(input.streetAddress, 120));
  if ('town' in input) set('town', str(input.town, 60));
  if ('county' in input) set('county', str(input.county, 60));
  if ('eircode' in input) {
    const v = str(input.eircode, 10).toUpperCase();
    if (v && !/^[A-Z0-9 ]{3,10}$/.test(v)) bad('Eircode looks wrong (e.g. R56 AB12)');
    set('eircode', v);
  }
  if ('phone' in input) {
    const v = str(input.phone, 24);
    if (v && !/^[0-9 +()\-]{5,24}$/.test(v)) bad('Phone number can only contain digits, spaces, + ( ) and -');
    set('phone', v);
  }
  if ('email' in input) {
    const v = str(input.email, 120).toLowerCase();
    if (!EMAIL_RE.test(v)) bad('Please enter a valid contact email address');
    set('email', v);
  }
  if ('companyName' in input) set('companyName', str(input.companyName, 120));
  if ('companyNumber' in input) set('companyNumber', str(input.companyNumber, 30));
  if ('registeredOffice' in input) set('registeredOffice', str(input.registeredOffice, 200));
  if ('hoursNote' in input) set('hoursNote', str(input.hoursNote, 160));
  if ('onlineNote' in input) set('onlineNote', str(input.onlineNote, 200));
  if ('showMap' in input) set('showMap', !!input.showMap);
  if ('hours' in input) {
    const h = cleanHours(input.hours, 'Walk-in clinic hours');
    if (h === null) bad('Walk-in clinic hours are required (mark a day as closed instead)');
    set('hours', h);
  }
  if ('onlineHours' in input) set('onlineHours', cleanHours(input.onlineHours, 'Online GP hours'));
  if ('fees' in input) {
    const list = Array.isArray(input.fees && input.fees.walkIn) ? input.fees.walkIn : [];
    if (list.length > 20) bad('Too many fees (20 at most)');
    set('fees', { walkIn: list.map((f) => ({ label: str(f && f.label, 80), price: str(f && f.price, 20) })).filter((f) => f.label && f.price) });
  }
  if ('founder' in input) {
    const f = input.founder || {};
    const quals = (Array.isArray(f.qualifications) ? f.qualifications : []).slice(0, 10).map((q) => str(q, 120)).filter(Boolean);
    set('founder', { name: str(f.name, 100), role: str(f.role, 100), bio: strKeepLines(f.bio, 1500), qualifications: quals, medicalCouncilNumber: str(f.medicalCouncilNumber, 30), photo: '' });
  }
  if ('closures' in input) {
    const list = Array.isArray(input.closures) ? input.closures : [];
    if (list.length > 40) bad('Too many closure dates (40 at most)');
    set('closures', list.map((c) => {
      const from = str(c && c.from, 10); const to = str((c && c.to) || (c && c.from), 10);
      if (!isRealDate(from) || !isRealDate(to)) bad('Closure dates must be real dates');
      if (to < from) bad('A closure cannot end before it starts');
      return { from, to, label: str(c && c.label, 80) };
    }));
  }
  return stripAngles(out);
}

function cleanText(input) {
  const values = input && input.values;
  if (!values || typeof values !== 'object') bad('Nothing to save');
  const out = {};
  for (const [key, raw] of Object.entries(values)) {
    const entry = TEXT_BY_KEY.get(key);
    if (!entry) bad(`Unknown text: ${key}`);
    const v = str(raw, entry.long ? 600 : 200);
    out[key] = v; // '' means "use the original wording"
  }
  return out;
}

// FAQ answers may contain a few simple tags (links, bold, lists). Everything else is removed, links are limited to this
// site / https / mail / phone, and stray "<" or ">" become plain text — so an answer can never carry a script.
function sanitizeAnswer(html) {
  const ALLOWED = new Set(['a', 'strong', 'b', 'em', 'i', 'br', 'ul', 'ol', 'li', 'p']);
  const escText = (t) => t.replace(/&(?!(?:amp|lt|gt|quot|#39|nbsp);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)\s*(\/?)>/g;
  let out = ''; let last = 0; let m;
  while ((m = re.exec(html))) {
    out += escText(html.slice(last, m.index)); last = re.lastIndex;
    const closing = m[1] === '/'; const tag = m[2].toLowerCase();
    if (!ALLOWED.has(tag)) continue;
    if (closing) { if (tag !== 'br') out += `</${tag}>`; continue; }
    if (tag === 'br') { out += '<br>'; continue; }
    if (tag === 'a') {
      const h = (m[3].match(/href\s*=\s*"([^"]*)"/i) || m[3].match(/href\s*=\s*'([^']*)'/i) || [])[1];
      out += h && /^(\/(?!\/)|https:\/\/|mailto:|tel:|#)/i.test(h) ? `<a href="${h.replace(/"/g, '&quot;')}">` : '<a>';
      continue;
    }
    out += `<${tag}>`;
  }
  return out + escText(html.slice(last));
}

function cleanFaq(input) {
  const groups = input && input.groups;
  if (groups === null) return null; // back to the built-in FAQs
  if (!Array.isArray(groups)) bad('Nothing to save');
  if (groups.length > 12) bad('Too many FAQ sections (12 at most)');
  const seen = new Set();
  return groups.map((g, gi) => {
    const title = str(g && g.title, 80);
    if (!title) bad(`FAQ section ${gi + 1} needs a title`);
    let id = str(g && g.id, 40).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || `section-${gi + 1}`;
    while (seen.has(id)) id += '-x';
    seen.add(id);
    const items = (Array.isArray(g.items) ? g.items : []).slice(0, 40).map((it) => ({ q: str(it && it.q, 200), a: sanitizeAnswer(strKeepLines(it && it.a, 3000)) })).filter((it) => it.q && it.a);
    return { id, title, items };
  });
}

function cleanBanner(input) {
  if (!input || typeof input !== 'object') bad('Nothing to save');
  const linkUrl = str(input.linkUrl, 300);
  if (linkUrl && !/^(\/(?!\/)|https:\/\/|mailto:|tel:)/i.test(linkUrl)) bad('The link must start with / (a page on this site) or https://');
  return {
    enabled: !!input.enabled,
    text: str(input.text, 240),
    tone: input.tone === 'warning' ? 'warning' : 'info',
    linkText: str(input.linkText, 40),
    linkUrl,
  };
}

const CLEANERS = { clinic: cleanClinic, text: cleanText, faq: cleanFaq, banner: cleanBanner };

// ---------------------------------------------------------------- storage
let cache = null;
const invalidate = () => { cache = null; };

async function readConfig(name) {
  const row = await db.get('SELECT data FROM site_config WHERE name = ?', [name]);
  if (!row) return null;
  try { return JSON.parse(row.data); } catch { return null; }
}

// The current settings as the public site sees them.
async function getPublic() {
  if (cache && Date.now() - cache.at < 10000) return cache.value;
  const value = { clinic: (await readConfig('clinic')) || {}, text: (await readConfig('text')) || {}, faq: await readConfig('faq'), banner: await readConfig('banner'), images: {} };
  for (const k of Object.keys(value.text)) if (!value.text[k] || !TEXT_BY_KEY.has(k)) delete value.text[k];
  const imgs = await db.all('SELECT slot, updated_at FROM site_images');
  imgs.forEach((r) => { if (IMAGE_BY_SLOT.has(r.slot)) value.images[r.slot] = new Date(r.updated_at).getTime(); });
  cache = { at: Date.now(), value };
  return value;
}

async function logChange(adminName, action, detail, historyId) {
  await db.run('INSERT INTO site_change_log (admin_name, action, detail, history_id) VALUES (?, ?, ?, ?)', [adminName || null, action.slice(0, 80), detail ? String(detail).slice(0, 500) : null, historyId || null]);
}

// Save one settings document. The previous version is kept (for undo) and the change is logged.
async function save(name, data, adminName, summary) {
  const prev = await db.get('SELECT data FROM site_config WHERE name = ?', [name]);
  let historyId = null;
  if (prev) {
    const info = await db.run('INSERT INTO site_config_history (name, data, saved_by) VALUES (?, ?, ?)', [name, prev.data, adminName || null]);
    historyId = info.lastInsertRowid;
    await db.run(`DELETE FROM site_config_history WHERE name = ? AND id NOT IN (SELECT id FROM (SELECT id FROM site_config_history WHERE name = ? ORDER BY id DESC LIMIT 30) t)`, [name, name]);
  }
  await db.run('INSERT INTO site_config (name, data, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP', [name, JSON.stringify(data), adminName || null]);
  await logChange(adminName, `Edited ${name}`, summary, historyId);
  invalidate();
}

async function reset(name, adminName) {
  const prev = await db.get('SELECT data FROM site_config WHERE name = ?', [name]);
  if (!prev) return false;
  const info = await db.run('INSERT INTO site_config_history (name, data, saved_by) VALUES (?, ?, ?)', [name, prev.data, adminName || null]);
  await db.run('DELETE FROM site_config WHERE name = ?', [name]);
  await logChange(adminName, `Reset ${name} to the original`, null, info.lastInsertRowid);
  invalidate();
  return true;
}

module.exports = { NAMES, CLEANERS, BadInput, getPublic, readConfig, save, reset, logChange, invalidate, sanitizeAnswer };
