require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');

const bookingRoutes = require('./routes/booking');
const { router: doctorRoutes } = require('./routes/doctor');
const { router: patientRoutes } = require('./routes/patient');
const contentRoutes = require('./routes/content');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(cookieSession({
  name: 'gp4u_session',
  secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
  maxAge: 8 * 60 * 60 * 1000,
}));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/config', (req, res) => {
  res.json({
    practiceName: process.env.PRACTICE_NAME || 'GP4U',
    stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
  });
});

app.use('/api', bookingRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api', contentRoutes);

app.listen(PORT, () => {
  console.log(`GP4U server running at http://localhost:${PORT}`);
  if (!process.env.STRIPE_SECRET_KEY) {
    console.log('NOTE: No Stripe key set yet — bookings will auto-confirm in demo mode. See README.md.');
  }
});
