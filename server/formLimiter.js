// Simple in-memory per-IP limiter for the public sign-up forms (new-patient registration and
// walk-in check-in), so nobody can flood the staff dashboard with junk. Same tradeoff as
// loginLimiter.js: a restart clears it, which is fine for a single-process app.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 10;
const hits = new Map(); // "<bucket>:<ip>" -> { count, windowStart }

function limit(bucket) {
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now - entry.windowStart > WINDOW_MS) hits.delete(key);
    }
    const key = `${bucket}:${req.ip}`;
    const entry = hits.get(key);
    if (!entry) {
      hits.set(key, { count: 1, windowStart: now });
      return next();
    }
    if (entry.count >= MAX_PER_WINDOW) {
      return res.status(429).json({ error: 'Too many submissions from this network. Please try again later.' });
    }
    entry.count += 1;
    next();
  };
}

module.exports = { limit };
