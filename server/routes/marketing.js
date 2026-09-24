/*
 * Marketing email sign-ups (GDPR-conscious):
 *   POST /api/updates-signup      { email, topic, consent: true, source }   — public, rate-limited
 *   GET  /api/unsubscribe?token=… — one-click unsubscribe (link goes in every marketing email)
 *   GET  /api/admin/signups       — admin: counts; ?format=csv downloads the active list for your email tool
 *
 * Holds only: email, topic, where they signed up, the exact consent wording shown, and timestamps.
 * Nothing from bookings or consultations is ever added to this list — patients are only emailed marketing if they
 * signed up here themselves. Service emails (booking confirmations etc.) are separate and unaffected.
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const formLimiter = require('../formLimiter');
const { requireAdmin } = require('./admin');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// What people can sign up for, and the consent sentence shown next to the tick box (stored with each sign-up).
const TOPICS = {
  clinic_opening: 'Email me when the GP4U clinic in Newbridge opens, and with occasional GP4U updates. I can unsubscribe at any time.',
  news: 'Email me occasional GP4U updates and health information. I can unsubscribe at any time.',
};

router.post('/updates-signup', formLimiter.limit('signup'), async (req, res) => {
  try {
    const b = req.body || {};
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase().slice(0, 255) : '';
    const topic = TOPICS[b.topic] ? b.topic : 'news';
    const source = typeof b.source === 'string' ? b.source.replace(/[^a-z0-9_\-/]/gi, '').slice(0, 64) : null;
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (b.consent !== true) return res.status(400).json({ error: 'Please tick the box so we have your permission to email you.' });
    const existing = await db.get('SELECT id, unsubscribed_at FROM marketing_signups WHERE email = ? AND topic = ?', [email, topic]);
    if (existing) {
      // Re-subscribing after an unsubscribe is a fresh consent: record the new wording and time.
      if (existing.unsubscribed_at) {
        await db.run('UPDATE marketing_signups SET unsubscribed_at = NULL, consent_text = ?, source = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?', [TOPICS[topic], source, existing.id]);
      }
      return res.json({ ok: true });
    }
    await db.run('INSERT INTO marketing_signups (email, topic, source, consent_text, unsubscribe_token) VALUES (?, ?, ?, ?, ?)',
      [email, topic, source, TOPICS[topic], crypto.randomBytes(24).toString('hex')]);
    res.json({ ok: true });
  } catch (err) {
    console.error('signup failed:', err.message);
    res.status(500).json({ error: 'Something went wrong — please try again.' });
  }
});

router.get('/unsubscribe', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  let ok = false;
  if (/^[a-f0-9]{48}$/.test(token)) {
    const r = await db.run('UPDATE marketing_signups SET unsubscribed_at = COALESCE(unsubscribed_at, CURRENT_TIMESTAMP) WHERE unsubscribe_token = ?', [token]);
    ok = !!(r && (r.affectedRows || r.changes));
  }
  res.set('X-Robots-Tag', 'noindex').type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Unsubscribe | GP4U</title><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/clinic.css"></head><body class="clinic-page on-light"><main id="main"><section class="phero"><div class="container page-note"><p class="eyebrow">GP4U</p><h1>${ok ? "You're unsubscribed" : 'That link has expired'}</h1><p class="lead">${ok ? "You won't get any more marketing emails from GP4U. Emails about your own bookings aren't affected." : 'If you still get emails you don’t want, reply to any of them or write to admin@gp4u.ie and we’ll remove you.'}</p><p><a class="btn btn-primary" href="/">Back to GP4U</a></p></div></section></main></body></html>`);
});

router.get('/admin/signups', requireAdmin, async (req, res) => {
  const rows = await db.all('SELECT email, topic, source, consent_text, unsubscribe_token, created_at FROM marketing_signups WHERE unsubscribed_at IS NULL ORDER BY created_at');
  if (req.query.format === 'csv') {
    const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const base = process.env.BASE_URL || 'https://www.gp4u.ie';
    const csv = ['email,topic,source,signed_up,consent_text,unsubscribe_link']
      .concat(rows.map((r) => [r.email, r.topic, r.source, new Date(r.created_at).toISOString(), r.consent_text, `${base}/api/unsubscribe?token=${r.unsubscribe_token}`].map(q).join(',')))
      .join('\n');
    return res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="gp4u-email-signups.csv"').send(csv);
  }
  const byTopic = {};
  rows.forEach((r) => { byTopic[r.topic] = (byTopic[r.topic] || 0) + 1; });
  res.json({ total: rows.length, byTopic });
});

module.exports = { router, TOPICS };
