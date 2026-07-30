const express = require('express');
const db = require('../db');
const { requireDoctor } = require('./doctor');

const router = express.Router();

function getContent() {
  const rows = db.prepare('SELECT key, value FROM site_content').all();
  const content = {};
  rows.forEach((r) => { content[r.key] = r.value; });
  content.posts = db.prepare('SELECT * FROM blog_posts ORDER BY created_at DESC').all();
  return content;
}

// Public — used by index.html and blog.html to render current text.
router.get('/content', (req, res) => {
  res.json(getContent());
});

// Doctor-protected — used by content-editor.html.
router.put('/doctor/content', requireDoctor, (req, res) => {
  const { heroTitle, heroSubtitle, aboutText } = req.body;
  const upsert = db.prepare('INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  if (heroTitle !== undefined) upsert.run('hero_title', heroTitle);
  if (heroSubtitle !== undefined) upsert.run('hero_subtitle', heroSubtitle);
  if (aboutText !== undefined) upsert.run('about_text', aboutText);
  res.json({ ok: true });
});

router.post('/doctor/blog-posts', requireDoctor, (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Title and body are required' });
  const info = db.prepare('INSERT INTO blog_posts (title, body) VALUES (?, ?)').run(title, body);
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.put('/doctor/blog-posts/:id', requireDoctor, (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Title and body are required' });
  db.prepare('UPDATE blog_posts SET title = ?, body = ? WHERE id = ?').run(title, body, req.params.id);
  res.json({ ok: true });
});

router.delete('/doctor/blog-posts/:id', requireDoctor, (req, res) => {
  db.prepare('DELETE FROM blog_posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
