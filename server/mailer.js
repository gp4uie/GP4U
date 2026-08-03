const nodemailer = require('nodemailer');

// Reads SMTP settings from .env. Point these at a real Healthmail account (or any
// mailbox) to send for real — see README "Sending prescriptions and letters by email".
function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendMail({ to, subject, html, attachments }) {
  if (!isConfigured()) {
    const err = new Error(
      'Email sending isn\'t set up yet. Add SMTP_HOST, SMTP_USER and SMTP_PASS to .env — see README.'
    );
    err.code = 'MAILER_NOT_CONFIGURED';
    throw err;
  }
  const transport = getTransport();
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
    attachments,
  });
}

module.exports = { isConfigured, sendMail };
