#!/usr/bin/env node
/*
 * Builds the GP4U marketing emails (email-safe HTML: tables + inline styles) into marketing/email/templates/.
 *   node marketing/email/build-emails.js
 * Placeholders for your email platform: {{first_name_or_there}} and {{unsubscribe_url}} — map them to your tool's merge
 * tags (e.g. Mailchimp *|FNAME|* / *|UNSUB|*; Brevo {{ contact.FIRSTNAME }} / {{ unsubscribe }}).
 * The unsubscribe link from the website export (/api/admin/signups?format=csv) also works — use one or the other.
 */
const fs = require('fs');
const path = require('path');

const C = { cream: '#FBF7F0', ink: '#12303A', muted: '#4D646D', teal: '#0F6E6E', deep: '#0A4D4D', line: '#EADFCD', soft: '#E2F1EF' };
const LOGO = 'https://www.gp4u.ie/img/gp4u-logo-card.png';
const utm = (content) => `utm_source=email&utm_medium=email&utm_campaign=welcome_series&utm_content=${content}`;

function layout({ preheader, title, body, cta, ctaUrl }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:${C.cream};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${C.line};border-radius:14px;">
  <tr><td style="padding:28px 32px 8px;"><img src="${LOGO}" width="140" alt="GP4U" style="display:block;border:0;"></td></tr>
  <tr><td style="padding:8px 32px 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.2;color:${C.ink};font-weight:bold;">${title}</td></tr>
  <tr><td style="padding:14px 32px 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${C.ink};">${body}</td></tr>
  ${cta ? `<tr><td style="padding:12px 32px 28px;"><a href="${ctaUrl}" style="display:inline-block;background:${C.deep};color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;padding:14px 24px;border-radius:999px;">${cta}</a></td></tr>` : ''}
  <tr><td style="padding:18px 32px;background:${C.soft};border-radius:0 0 14px 14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${C.muted};">
    <strong style="color:${C.deep};font-family:Georgia,serif;font-size:15px;">One tap. Real care.</strong><br>
    GP4U is not an emergency service. In an emergency, call 112 or 999 or go to your nearest Emergency Department.<br><br>
    You're getting this because you signed up for GP4U emails at gp4u.ie. We never use consultation or booking information for marketing.
    <a href="{{unsubscribe_url}}" style="color:${C.teal};">Unsubscribe</a> · <a href="https://www.gp4u.ie/privacy/#email-updates" style="color:${C.teal};">Privacy</a><br>
    GP4U · Ireland · admin@gp4u.ie
  </td></tr>
</table></td></tr></table>
</body></html>
`;
}
const p = (t) => `<p style="margin:0 0 14px;">${t}</p>`;
const li = (items) => `<ul style="margin:0 0 14px;padding-left:20px;">${items.map((i) => `<li style="margin:0 0 6px;">${i}</li>`).join('')}</ul>`;

const EMAILS = [
  ['01-welcome', 'Day 0', 'Welcome to GP4U', 'Welcome to GP4U', 'Real doctors. Real care. Made easier.',
    p('Hi {{first_name_or_there}},') + p('Thanks for signing up. GP4U is an Irish GP service run by Irish-registered doctors — built so that getting to a GP isn\'t the hard part.') + p('Right now you can see a GP online, by video or phone, 7 days a week, from wherever you are in Ireland. And our new walk-in GP clinic in Newbridge, Co. Kildare is opening soon — you\'ll be among the first to hear.') + p('Over the next couple of weeks we\'ll send a few short emails about how it all works. No spam, and you can unsubscribe any time.') + p('The GP4U team'),
    'See how GP4U works', `https://www.gp4u.ie/online-gp/?${utm('e1_cta')}`],
  ['02-how-online-gp-works', 'Day 2', 'How online GP works (4 steps)', 'How seeing a GP online works', 'Four steps, about five minutes to book.',
    li(['<strong>Choose a service</strong> — video, phone, repeat prescription or sick cert.', '<strong>Tell us what\'s going on</strong> — a short, private questionnaire so your GP is prepared.', '<strong>Pick a time and pay securely</strong> — the price is shown before you pay.', '<strong>Speak to your GP</strong> — join from the link on your confirmation page.']) + p('Where your GP considers it appropriate, prescriptions go to the pharmacy you choose, and sick certs and referral letters are issued securely. If you need to be examined in person, your GP will tell you.'),
    'Book an online GP', `https://www.gp4u.ie/book.html?${utm('e2_cta')}`],
  ['03-when-online-gp-helps', 'Day 5', 'When an online GP can be useful', 'When is an online GP a good choice?', 'And when it isn\'t.',
    p('Online consultations suit lots of everyday, non-emergency concerns — for example:') + li(['advice about symptoms that aren\'t improving', 'many common infections', 'contraception reviews and repeat prescriptions', 'sick certificates', 'follow-up questions']) + p('Some problems need hands-on examination or tests — your GP will tell you honestly if that\'s the case. And anything like chest pain, severe difficulty breathing or signs of a stroke is an emergency: call 112 or 999.') + p('<em>General information, reviewed by a GP. Not personal medical advice.</em>'),
    'See what we can help with', `https://www.gp4u.ie/online-gp/?${utm('e3_cta')}`],
  ['04-meet-gp4u', 'Day 9', 'Meet GP4U', 'Meet the people behind GP4U', 'Why we built it.',
    p('[Founder note in their own words — 3 short paragraphs: who they are, why they built GP4U, what "real care" means to them. Add a real photo. Include Medical Council registration if they wish to show it.]') + p('We\'re also building something in Newbridge, Co. Kildare — a new walk-in GP clinic. We\'ll share the opening date, hours and address with you first.'),
    'About GP4U', `https://www.gp4u.ie/about/?${utm('e4_cta')}`],
  ['05-book-when-you-need-us', 'Day 14', 'Book when you need us', 'Here when you need a GP', 'Save this for the next time you need a GP.',
    p('No pressure — just a reminder that GP4U is here when you need it:') + li(['Irish-registered GPs, by video or phone', '7 days a week, from anywhere in Ireland', 'Prices shown before you book — <a href="https://www.gp4u.ie/fees/?' + utm('e5_fees') + '" style="color:#0F6E6E;">see all fees</a>', 'Private and secure']) + p('Save gp4u.ie in your phone, or follow us on Instagram and Facebook for plain-English GP advice.'),
    'Book an online GP', `https://www.gp4u.ie/book.html?${utm('e5_cta')}`],
  ['clinic-opening-announcement', 'PHASE 3 — send on launch approval only', 'Our Newbridge clinic is open', 'Our Newbridge clinic is open', 'GP care when you need it.',
    p('Hi {{first_name_or_there}},') + p('You asked us to tell you first — the GP4U walk-in GP clinic in Newbridge, Co. Kildare is now open.') + p('<strong>Address:</strong> [APPROVED ADDRESS]<br><strong>Opening hours:</strong> [APPROVED HOURS]<br><strong>Fees:</strong> [LINK TO /fees/]') + p('No appointment needed — just walk in during opening hours. You can also check in online so we know you\'re on your way.') + p('GP care when you need it. See you soon.'),
    'Get directions and hours', 'https://www.gp4u.ie/walk-in-gp-newbridge/?utm_source=email&utm_medium=email&utm_campaign=clinic_launch&utm_content=opening_announcement'],
];

const OUT = path.join(__dirname, 'templates');
fs.mkdirSync(OUT, { recursive: true });
for (const [file, , subject, title, preheader, body, cta, ctaUrl] of EMAILS) {
  fs.writeFileSync(path.join(OUT, `${file}.html`), layout({ preheader, title, body, cta, ctaUrl }).replace('<title>' + title, `<title>${subject}`));
}
console.log(EMAILS.map(([f, when, subject]) => `${f}.html  (${when}) — subject: ${subject}`).join('\n'));
