const express = require('express');
const db = require('../db');
const { requireDoctor } = require('./doctor');

const router = express.Router();

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

// Doctor-protected — used by content-editor.html.
router.put('/doctor/content', requireDoctor, async (req, res) => {
  const { heroTitle, heroSubtitle, aboutText } = req.body;
  const upsertSql = 'INSERT INTO site_content (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)';
  if (heroTitle !== undefined) await db.run(upsertSql, ['hero_title', heroTitle]);
  if (heroSubtitle !== undefined) await db.run(upsertSql, ['hero_subtitle', heroSubtitle]);
  if (aboutText !== undefined) await db.run(upsertSql, ['about_text', aboutText]);
  res.json({ ok: true });
});

router.post('/doctor/blog-posts', requireDoctor, async (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Title and body are required' });
  const info = await db.run('INSERT INTO blog_posts (title, body) VALUES (?, ?)', [title, body]);
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.put('/doctor/blog-posts/:id', requireDoctor, async (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Title and body are required' });
  await db.run('UPDATE blog_posts SET title = ?, body = ? WHERE id = ?', [title, body, req.params.id]);
  res.json({ ok: true });
});

router.delete('/doctor/blog-posts/:id', requireDoctor, async (req, res) => {
  await db.run('DELETE FROM blog_posts WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
