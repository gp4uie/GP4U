const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAdmin } = require('./admin');
const { TEXT, IMAGES, IMAGE_BY_SLOT } = require('../siteRegistry');
const S = require('../siteSettings');
const { FAQ: FAQ_DEFAULTS } = require('../faqDefaults');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 1 } });

// The public site reads its editable settings from this tiny script (loaded before clinic.js on every page).
// It contains only the cleaned override values — no secrets — and is never cached, so an edit shows straight away.
router.get('/site-settings.js', async (req, res) => {
  let settings = { clinic: {}, text: {}, faq: null, banner: null, images: {} };
  try { settings = await S.getPublic(); } catch (err) { console.error('site settings unavailable:', err.message); }
  // Measurement IDs for public/js/consent.js (nothing loads until a visitor consents). Only well-formed IDs pass.
  const id = (v, re) => (re.test(v || '') ? v : '');
  settings = { ...settings, analytics: {
    ga4: id(process.env.GA4_MEASUREMENT_ID, /^G-[A-Z0-9]{4,20}$/),
    meta: id(process.env.META_PIXEL_ID, /^\d{6,20}$/),
    tiktok: id(process.env.TIKTOK_PIXEL_ID, /^[A-Z0-9]{10,30}$/),
  } };
  // keep the script safe to embed: no raw < and no line-separator characters
  const LS = String.fromCharCode(0x2028); const PS = String.fromCharCode(0x2029);
  const json = JSON.stringify(settings).split("<").join("\\u003c").split(LS).join("\\u2028").split(PS).join("\\u2029");
  res.set('Content-Type', 'application/javascript; charset=utf-8').set('Cache-Control', 'no-cache').send(`window.GP4U_SETTINGS = ${json};`);
});

// Pictures an admin has uploaded (versioned URL => cacheable for a year; unversioned => always re-checked)
router.get('/site-image/:slot', async (req, res) => {
  if (!IMAGE_BY_SLOT.has(req.params.slot)) return res.status(404).end();
  const row = await db.get('SELECT mime, data FROM site_images WHERE slot = ?', [req.params.slot]);
  if (!row) return res.status(404).end();
  res.set('Content-Type', row.mime).set('X-Content-Type-Options', 'nosniff').set('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'no-cache').send(row.data);
});

async function adminName(req) {
  const a = await db.get('SELECT name FROM admins WHERE id = ?', [req.session.adminId]);
  return a ? a.name : 'Admin';
}
const fail = (res, err) => {
  if (err instanceof S.BadInput) return res.status(400).json({ error: err.message });
  console.error('site settings error:', err);
  return res.status(500).json({ error: 'Something went wrong saving that. Please try again.' });
};

// Everything the editor screen needs in one call
router.get('/admin/site', requireAdmin, async (req, res) => {
  const current = await S.getPublic();
  res.json({ ...current, registry: { text: TEXT.map(({ key, group, label, text, long, page }) => ({ key, group, label, text, long, page })), images: IMAGES.map(({ slot, group, label, hint, src }) => ({ slot, group, label, hint, defaultUrl: '/img/clinic/' + src })), faqDefaults: FAQ_DEFAULTS.map((g) => ({ id: g.id, title: g.title, items: g.items.map(([q, a]) => ({ q, a })) })) } });
});

router.put('/admin/site/clinic', requireAdmin, async (req, res) => {
  try {
    const cleaned = S.CLEANERS.clinic(req.body || {});
    if (!Object.keys(cleaned).length) return res.status(400).json({ error: 'Nothing to save' });
    const merged = { ...((await S.readConfig('clinic')) || {}), ...cleaned };
    await S.save('clinic', merged, await adminName(req), `Changed: ${Object.keys(cleaned).join(', ')}`);
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
});

router.put('/admin/site/text', requireAdmin, async (req, res) => {
  try {
    const cleaned = S.CLEANERS.text(req.body || {});
    const merged = { ...((await S.readConfig('text')) || {}) };
    for (const [k, v] of Object.entries(cleaned)) { if (v) merged[k] = v; else delete merged[k]; }
    await S.save('text', merged, await adminName(req), `Changed: ${Object.keys(cleaned).join(', ')}`);
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
});

router.put('/admin/site/faq', requireAdmin, async (req, res) => {
  try {
    const cleaned = S.CLEANERS.faq(req.body || {});
    if (cleaned === null) { await S.reset('faq', await adminName(req)); return res.json({ ok: true }); }
    await S.save('faq', cleaned, await adminName(req), `${cleaned.length} sections, ${cleaned.reduce((n, g) => n + g.items.length, 0)} questions`);
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
});

router.put('/admin/site/banner', requireAdmin, async (req, res) => {
  try {
    const cleaned = S.CLEANERS.banner(req.body || {});
    await S.save('banner', cleaned, await adminName(req), cleaned.enabled ? `Shown: ${cleaned.text}` : 'Turned off');
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
});

// Back to the built-in wording / details for one group
router.post('/admin/site/reset/:name', requireAdmin, async (req, res) => {
  if (!S.NAMES.includes(req.params.name)) return res.status(404).json({ error: 'Unknown settings group' });
  await S.reset(req.params.name, await adminName(req));
  res.json({ ok: true });
});

// ---- pictures
function looksLikeImage(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}
router.post('/admin/site/images/:slot', requireAdmin, (req, res) => {
  if (!IMAGE_BY_SLOT.has(req.params.slot)) return res.status(404).json({ error: 'Unknown picture' });
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'That picture is over 4 MB. Please use a smaller file.' : 'Upload failed. Please try again.' });
    if (!req.file) return res.status(400).json({ error: 'Choose a picture first' });
    const mime = looksLikeImage(req.file.buffer);
    if (!mime) return res.status(400).json({ error: 'Please upload a JPG, PNG or WebP picture' });
    const name = await adminName(req);
    await db.run('INSERT INTO site_images (slot, mime, data, updated_by) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE mime = VALUES(mime), data = VALUES(data), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP', [req.params.slot, mime, req.file.buffer, name]);
    await S.logChange(name, 'Changed a picture', `${IMAGE_BY_SLOT.get(req.params.slot).label} (${Math.round(req.file.size / 1024)} KB)`);
    S.invalidate();
    res.json({ ok: true });
  });
});
router.delete('/admin/site/images/:slot', requireAdmin, async (req, res) => {
  if (!IMAGE_BY_SLOT.has(req.params.slot)) return res.status(404).json({ error: 'Unknown picture' });
  const r = await db.run('DELETE FROM site_images WHERE slot = ?', [req.params.slot]);
  if (r.changes) await S.logChange(await adminName(req), 'Put a picture back to the original', IMAGE_BY_SLOT.get(req.params.slot).label);
  S.invalidate();
  res.json({ ok: true });
});

// ---- change history (who changed what) and undo
router.get('/admin/site/history', requireAdmin, async (req, res) => {
  const log = await db.all('SELECT id, admin_name, action, detail, history_id, created_at FROM site_change_log ORDER BY id DESC LIMIT 100');
  res.json(log);
});
router.post('/admin/site/history/:id/restore', requireAdmin, async (req, res) => {
  const h = await db.get('SELECT id, name, data FROM site_config_history WHERE id = ?', [req.params.id]);
  if (!h || !S.NAMES.includes(h.name)) return res.status(404).json({ error: 'That earlier version is no longer available' });
  const name = await adminName(req);
  const cur = await db.get('SELECT data FROM site_config WHERE name = ?', [h.name]);
  if (cur) await db.run('INSERT INTO site_config_history (name, data, saved_by) VALUES (?, ?, ?)', [h.name, cur.data, name]);
  await db.run('INSERT INTO site_config (name, data, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP', [h.name, h.data, name]);
  await S.logChange(name, `Restored an earlier version of ${h.name}`, null);
  S.invalidate();
  res.json({ ok: true });
});

module.exports = router;
