const nodemailer = require('nodemailer');

// Reads SMTP settings from .env. Point these at a real Healthmail account (or any
// mailbox) to send for real — see README "Sending prescriptions and letters by email".
function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transport = null;
function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    });
  }
  return transport;
}

// A plain-text copy of every email. Mail providers (Gmail, Outlook) are more likely to treat HTML-only mail as spam,
// and some patients read email in text-only apps. Links are kept as full addresses so they can still be opened.
function htmlToText(html) {
  const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  return decode(String(html || '')
    .replace(/<p data-html-only[\s\S]*?<\/p>/gi, '') // the "copy this link" fallback under buttons — the text version already shows the link
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, inner) => {
      const label = inner.replace(/<[^>]+>/g, '').trim();
      return label && decode(label) !== decode(href) ? `${label}: ${href}` : href;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr[^>]*>/gi, '\n----------\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|table)>/gi, '\n\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// "GP4U Clinic <bookings@…>" rather than a bare address, unless SMTP_FROM already carries a name.
async function fromHeader() {
  const addr = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (/</.test(addr)) return addr;
  let name = 'GP4U Clinic';
  try { name = (await require('./practice').getPractice()).name || name; } catch (err) { /* keep the default */ }
  return { name, address: addr };
}

async function sendMail({ to, subject, html, text, attachments, replyTo }) {
  if (!isConfigured()) {
    const err = new Error(
      'Email sending isn\'t set up yet. Add SMTP_HOST, SMTP_USER and SMTP_PASS to .env — see README.'
    );
    err.code = 'MAILER_NOT_CONFIGURED';
    throw err;
  }
  let reply = replyTo;
  if (!reply) {
    try { reply = (await require('./practice').getPractice()).email || undefined; } catch (err) { /* none */ }
  }
  await getTransport().sendMail({
    from: await fromHeader(),
    to,
    replyTo: reply,
    subject,
    html,
    text: text || htmlToText(html),
    attachments,
  });
}

module.exports = { isConfigured, sendMail, htmlToText };
