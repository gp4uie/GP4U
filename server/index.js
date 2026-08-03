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

const app = express();
const PORT = process.env.PORT || 4000;
const isHttps = (process.env.BASE_URL || '').startsWith('https');

// Baseline security headers (GDPR Article 32 "appropriate technical measures"). No
// Content-Security-Policy here deliberately — this app relies on inline <script> blocks
// throughout its pages, and a default CSP would break them; tightening that properly needs a
// dedicated pass to move every inline script to external files first.
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (isHttps) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  next();
});

app.use(express.json());
// Sessions last until the user explicitly logs out, not on a timer — a long maxAge rather than
// removing it entirely, since cookie-session requires some expiry and an unbounded cookie isn't
// meaningfully different in practice for this app's usage pattern. `secure` is tied to BASE_URL
// so the cookie still works over plain http on localhost but is HTTPS-only in production.
app.use(cookieSession({
  name: 'gp4u_session',
  secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
  maxAge: 30 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  secure: isHttps,
}));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/_cookietest', (req, res) => {
  res.cookie('cookietest', 'hello', { httpOnly: true, sameSite: 'lax', secure: isHttps });
  res.json({ set: true, sawIncoming: req.headers.cookie || null });
});

app.get('/api/config', (req, res) => {
  res.json({
    practiceName: process.env.PRACTICE_NAME || 'GP4U',
    stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
  });
});

app.use('/api', bookingRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', contentRoutes);

db.initSchema()
  .then(() => {
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
