// Doctors' working hours and the times patients are offered are Irish local time, whatever timezone the server itself runs in.
process.env.TZ = 'Europe/Dublin';
require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');

const db = require('./db');
const bookingRoutes = require('./routes/booking');
const { router: doctorRoutes } = require('./routes/doctor');
const { router: patientRoutes } = require('./routes/patient');
const { router: adminRoutes } = require('./routes/admin');
const contentRoutes = require('./routes/content');
const siteRoutes = require('./routes/site');
const clinicRoutes = require('./routes/clinic');
const { router: receptionRoutes } = require('./routes/reception');
const seo = require('./seo');
const { router: marketingRoutes } = require('./routes/marketing');

const app = express();
const PORT = process.env.PORT || 4000;
const isHttps = (process.env.BASE_URL || '').startsWith('https');
// Don't advertise the server software to attackers.
app.disable('x-powered-by');

// The session cookie is signed with a secret key. A missing or well-known key would let anyone forge a signed-in
// cookie (e.g. pose as a doctor), so the old public fallback string is never used. SESSION_SECRET from the hosting
// settings is used when it is set properly (16+ characters, matching the admin setup checklist); otherwise a strong key
// is generated once and kept in the database, so sign-ins survive restarts and work across several server processes.
// The key is loaded before the server starts listening (see the bottom of this file); sessionKeys is read per request.
const envSecret = process.env.SESSION_SECRET || '';
const envSecretOk = envSecret.length >= 16 && envSecret !== 'dev-only-secret-change-me';
const sessionKeys = [envSecretOk ? envSecret : require('crypto').randomBytes(48).toString('hex')];
app.locals.sessionKeySource = envSecretOk ? 'hosting' : 'pending';

// Hostinger's reverse proxy terminates TLS and forwards plain HTTP internally. Without this,
// Express (and the `cookies` package cookie-session relies on) sees every request as insecure,
// which silently prevents the session cookie's `secure` flag from ever being set — logins would
// appear to succeed but the session cookie never actually reaches the browser.
app.set('trust proxy', 1);
// Remembers the public address visitors arrive on, as a safety net for links in emails (see siteUrl in practice.js).
app.use(require('./practice').noteRequestHost);

// Baseline security headers (GDPR Article 32 "appropriate technical measures"). No
// Content-Security-Policy here deliberately — this app relies on inline <script> blocks
// throughout its pages, and a default CSP would break them; tightening that properly needs a
// dedicated pass to move every inline script to external files first.
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Camera and microphone are only for this site's own consultation page (and the practice's Doxy.me room shown
  // inside it, when DOXY_ROOM_URL is set); nothing else may use them.
  res.setHeader('Permissions-Policy', 'camera=(self "https://doxy.me"), microphone=(self "https://doxy.me"), display-capture=(self "https://doxy.me"), geolocation=(), payment=(), usb=()');
  if (isHttps) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  next();
});

// One address per page (www, clean URLs, 301s from the old .html addresses), then the public pages themselves
// with the live clinic details written in — before the static files, so /walk-in.html never serves a duplicate.
app.use(seo.redirects);
app.use(seo.pages);

// Stripe's payment notifications must be read as the exact bytes Stripe sent (to check its signature), so this one
// route comes before the JSON body reader. Set the endpoint in Stripe to https://www.gp4u.ie/api/stripe/webhook.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), (req, res) => bookingRoutes.stripeWebhook(req, res));
app.use(express.json({ limit: '200kb' }));
// Patient and clinical data must never be kept in a shared or browser cache.
app.use('/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
// Sessions last until the user explicitly logs out, not on a timer — a long maxAge rather than
// removing it entirely, since cookie-session requires some expiry and an unbounded cookie isn't
// meaningfully different in practice for this app's usage pattern. `secure` is tied to BASE_URL
// so the cookie still works over plain http on localhost but is HTTPS-only in production.
app.use(cookieSession({
  name: 'gp4u_session',
  keys: sessionKeys,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  secure: isHttps,
}));

// `no-cache` (not "don't cache" despite the name) tells browsers/CDNs they must revalidate with
// the origin on every request instead of trusting a locally cached copy for some TTL — cheap
// (a 304 if nothing changed) and guarantees a deploy is never masked by a stale cached .js/.css
// file. This app has no build step to fingerprint asset filenames, so this is the simplest way
// to keep a redeploy from silently not reaching patients (see book.js/questionnaires.js history).
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res, filePath) => {
    if (/\.(js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
    // Photos and icons rarely change — let browsers keep them for a week (repeat visits load faster).
    // If you replace a photo, give it a new filename, or it will refresh within a week.
    if (/\.(webp|jpg|jpeg|png|svg)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  },
}));

app.get('/api/config', (req, res) => {
  res.json({
    practiceName: process.env.PRACTICE_NAME || 'GP4U',
    stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
    emailConfigured: require('./mailer').isConfigured(),
    // Optional: hold video/audio consultations in the practice's Doxy.me room instead of the built-in call page.
    videoRoomUrl: require('./videoRoom').clinicRoom(),
  });
});

app.use('/api', bookingRoutes);
app.use('/api', clinicRoutes);
app.use('/api/reception', receptionRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', contentRoutes);
app.use('/api', siteRoutes);
app.use('/api', marketingRoutes);
app.use(seo.notFound);

// Last-resort error handler: log the details for us, but never send stack traces or internal messages to the browser.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) {
    return res.status(err.status || 400).json({ error: err.type === 'entity.too.large' ? 'That request is too large.' : 'The request could not be read.' });
  }
  if (err && err.name === 'MulterError') {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Each photo must be 8 MB or smaller.' : 'Those photos could not be uploaded (up to 5 photos, 8 MB each).' });
  }
  console.error('Unhandled error on', req.method, req.originalUrl.replace(/token=[^&]+/g, 'token=…'), err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

db.initSchema()
  .then(async () => {
    if (!envSecretOk) {
      sessionKeys[0] = await db.getOrCreateSecret('session_secret');
      app.locals.sessionKeySource = 'database';
      console.log('NOTE: SESSION_SECRET is not set (or shorter than 16 characters) in the hosting settings, so the sign-in key stored in the database is used. Sign-ins survive restarts.');
    }
    app.listen(PORT, () => {
      console.log(`GP4U server running at http://localhost:${PORT}`);
      if (!process.env.STRIPE_SECRET_KEY) {
        console.log('NOTE: No Stripe key set yet — bookings will auto-confirm in demo mode. See README.md.');
      }
    });
  })
  .catch((err) => {
    console.error('Could not connect to the database. Check DB_HOST/DB_USER/DB_PASSWORD/DB_NAME in .env:', err.message);
    process.exit(1);
  });
