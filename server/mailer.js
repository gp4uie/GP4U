// Loaded on first use rather than at start-up: if the email library ever failed to load on the host (e.g. an
// older Node.js version), only email would stop working — the website itself would still start.
let nodemailer = null;

// Reads SMTP settings from .env. Point these at a real Healthmail account (or any
// mailbox) to send for real — see README "Sending prescriptions and letters by email".
function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transport = null;
function getTransport() {
  if (!transport) {
    if (!nodemailer) nodemailer = require('nodemailer');
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

// The GP4U Clinic logo at the top of every email, sent inside the email itself (not loaded from the website), so it
// shows even in mail apps that block outside pictures. The plain-text copy is unaffected.
const path = require('path');
const fs = require('fs');
const LOGO_FILE = path.join(__dirname, '..', 'public', 'img', 'gp4u-logo.png');
const LOGO_CID = 'gp4u-logo@gp4u.ie';
let logoBuffer;
function emailLogo() {
  if (logoBuffer === undefined) { try { logoBuffer = fs.readFileSync(LOGO_FILE); } catch (err) { logoBuffer = null; } }
  return logoBuffer;
}
function withLogo(html, attachments) {
  const logo = emailLogo();
  if (!html || !logo) return { html, attachments };
  const top = `<p style="margin:0 0 20px;"><img src="cid:${LOGO_CID}" alt="GP4U Clinic" width="216" height="48" style="display:block;border:0;outline:none;width:216px;height:48px;"></p>`;
  return { html: top + html, attachments: [...(attachments || []), { filename: 'gp4u-clinic-logo.png', content: logo, cid: LOGO_CID, contentType: 'image/png', contentDisposition: 'inline' }] };
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
    text: text || htmlToText(html),
    ...withLogo(html, attachments),
  });
}

module.exports = { isConfigured, sendMail, htmlToText, withLogo };
