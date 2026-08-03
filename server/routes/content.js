const express = require('express');
const db = require('../db');
const { getServices } = require('../services');
const { requireAdmin } = require('./admin');

const router = express.Router();

// Every key an admin can currently edit from the content editor. Keeping this as an explicit
// list (rather than accepting any key the client sends) means a stray/typo'd key can't silently
// create junk rows in site_content.
const EDITABLE_KEYS = [
  'hero_title', 'hero_subtitle', 'about_text',
  'hero_badge_1', 'hero_badge_2', 'hero_badge_3',
  'hero_card_title', 'hero_card_text',
  'services_section_title', 'services_section_subtitle',
  'how_it_works_1_title', 'how_it_works_1_text',
  'how_it_works_2_title', 'how_it_works_2_text',
  'how_it_works_3_title', 'how_it_works_3_text',
  'how_it_works_4_title', 'how_it_works_4_text',
  'footer_contact_email', 'footer_legal_text',
];

async function getContent() {
  const rows = await db.all('SELECT `key`, value FROM site_content');
  const content = {};
  rows.forEach((r) => { content[r.key] = r.value; });
  content.posts = await db.all('SELECT * FROM blog_posts ORDER BY created_at DESC');
  return content;
}

// Public — used by index.html and blog.html to render current text.
router.get('/content', async (req, res) => {
  res.json(await getContent());
});

// Admin-only — used by content-editor.html. Body may include any subset of EDITABLE_KEYS,
// camelCased (e.g. heroTitle -> hero_title).
router.put('/admin/content', requireAdmin, async (req, res) => {
  const upsertSql = 'INSERT INTO site_content (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)';
  for (const key of EDITABLE_KEYS) {
    const camelKey = key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
    if (req.body[camelKey] !== undefined) {
      await db.run(upsertSql, [key, req.body[camelKey]]);
    }
  }
  res.json({ ok: true });
});

router.post('/admin/blog-posts', requireAdmin, async (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Title and body are required' });
  const info = await db.run('INSERT INTO blog_posts (title, body) VALUES (?, ?)', [title, body]);
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.put('/admin/blog-posts/:id', requireAdmin, async (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Title and body are required' });
  await db.run('UPDATE blog_posts SET title = ?, body = ? WHERE id = ?', [title, body, req.params.id]);
  res.json({ ok: true });
});

router.delete('/admin/blog-posts/:id', requireAdmin, async (req, res) => {
  await db.run('DELETE FROM blog_posts WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// --- Services & pricing ---
router.get('/admin/services', requireAdmin, async (req, res) => {
  const rows = await db.all('SELECT * FROM services ORDER BY sort_order ASC, `key` ASC');
  res.json(rows);
});

router.post('/admin/services', requireAdmin, async (req, res) => {
  const { key, label, durationMins, priceCents } = req.body;
  if (!key || !label || !durationMins || priceCents === undefined) {
    return res.status(400).json({ error: 'Key, label, duration and price are all required' });
  }
  if (!/^[a-z0-9_]+$/.test(key)) {
    return res.status(400).json({ error: 'Key must be lowercase letters, numbers and underscores only (e.g. general, repeat_rx)' });
  }
  const existing = await db.get('SELECT `key` FROM services WHERE `key` = ?', [key]);
  if (existing) return res.status(409).json({ error: 'A service with that key already exists' });
  const maxOrder = await db.get('SELECT COALESCE(MAX(sort_order), 0) AS n FROM services');
  await db.run(
    'INSERT INTO services (`key`, label, duration_mins, price_cents, sort_order) VALUES (?, ?, ?, ?, ?)',
    [key, label, durationMins, priceCents, maxOrder.n + 1]
  );
  res.json({ ok: true });
});

router.put('/admin/services/:key', requireAdmin, async (req, res) => {
  const { label, durationMins, priceCents, sortOrder } = req.body;
  if (!label || !durationMins || priceCents === undefined) {
    return res.status(400).json({ error: 'Label, duration and price are all required' });
  }
  const result = await db.run(
    'UPDATE services SET label = ?, duration_mins = ?, price_cents = ?, sort_order = COALESCE(?, sort_order) WHERE `key` = ?',
    [label, durationMins, priceCents, sortOrder ?? null, req.params.key]
  );
  if (result.changes === 0) return res.status(404).json({ error: 'Service not found' });
  res.json({ ok: true });
});

router.delete('/admin/services/:key', requireAdmin, async (req, res) => {
  const countRow = await db.get('SELECT COUNT(*) AS n FROM services');
  if (countRow.n <= 1) return res.status(400).json({ error: 'Cannot remove the only remaining service' });
  await db.run('DELETE FROM services WHERE `key` = ?', [req.params.key]);
  res.json({ ok: true });
});

module.exports = router;
