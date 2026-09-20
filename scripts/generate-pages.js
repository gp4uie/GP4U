#!/usr/bin/env node
/*
 * Generates six of the public pages from one file: index, online, book-now, fees, about, faq.
 * The FAQ answers live in the FAQ array below and feed BOTH the FAQ page and the search-engine FAQ data,
 * plus the short FAQ lists on the homepage and Online GP page.
 *
 * Usage:   node scripts/generate-pages.js && node scripts/build-pages.js     (or: npm run generate)
 *
 * NOTE: these six pages are OVERWRITTEN each time this runs — edit the text here, not in the HTML.
 * (walk-in, services, new-patients, contact and the older pages are plain HTML you can edit directly.)
 */
const fs = require('fs');
const PUB = require('path').join(__dirname, '..', 'public') + '/';
const read = (f) => fs.readFileSync(PUB + f, 'utf8');
const write = (f, s) => fs.writeFileSync(PUB + f, s);
const ORG = 'https://www.gp4u.ie';

// ------------------------------------------------------------------ icons
const P = {
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  door: '<path d="M14 3H7a2 2 0 0 0-2 2v16h14V8z"/><path d="M14 3v5h5"/><circle cx="10" cy="13" r="0.6"/>',
  video: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  thermo: '<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  plus: '<rect x="3" y="3" width="18" height="18" rx="3"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  mail: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  badge: '<circle cx="12" cy="8" r="6"/><path d="M15.48 12.89L17 22l-5-3-5 3 1.52-9.11"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  card: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  droplet: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
  clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
};
const ico = (n) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;
const chip = (n) => `<span class="ico-chip">${ico(n)}</span>`;

// ------------------------------------------------------------------ FAQ content (single source)
const NO_APPT = `No appointment is required. You can simply walk in during opening hours. Checking in online lets us know you're on your way and helps us prepare for your visit, but it does not reserve a specific appointment time.`;
const FAQ = [
  { id: 'online', title: 'Online GP', items: [
    [`What is an online GP consultation?`, `A consultation with a GP by video or phone instead of at the clinic. You book a time online, pay securely, and join from your phone, tablet or computer.`],
    [`Can I see a GP online?`, `Yes. You can book a video or phone consultation with one of our Irish-registered GPs from anywhere in Ireland. Choose <a href="/book.html">Book Online</a>, pick a service and a time that suits you.`],
    [`How do I book an online GP consultation?`, `Choose <a href="/book.html">Book Online</a>, pick a service, tell us briefly what's going on, choose a time and pay by card. You'll get a confirmation with a private link to your consultation.`],
    [`What happens during an online consultation?`, `At your appointment time you join a private video or phone call using the link on your confirmation page. Your GP will talk through what's going on, ask the questions they need to, and advise on next steps. Where clinically appropriate that may include a prescription, a certificate, a letter or a referral — or a recommendation to be seen in person.`],
    [`What do I need for a video consultation?`, `A phone, tablet or computer with a camera and microphone, a stable internet connection, and somewhere private. For a phone consultation you just need your phone.`],
    [`Is an online consultation right for every problem?`, `No. Some problems need to be examined in person. If your GP thinks you need an in-person examination they will tell you, and you can be seen at our walk-in clinic.`],
  ] },
  { id: 'walk-in', title: 'Walk-in clinic', items: [
    [`Do I need an appointment?`, `${NO_APPT} You can <a href="/walk-in.html#book-in">check in online</a> if you'd like to.`],
    [`How does the walk-in clinic work?`, `Walk in during opening hours, check in at reception, and see a GP. If you'd like, you can <a href="/walk-in.html#book-in">check in online</a> first so we know you're on your way. Waiting times vary depending on how busy we are.`],
    [`When is the walk-in clinic open?`, `We're open <span data-clinic-hours-text>seven days a week</span>. Hours may differ on public holidays.`],
    [`How long will I wait?`, `Waiting times vary depending on how busy we are. Checking in online lets us know you're coming, but it doesn't reserve a set appointment time.`],
    [`What should I bring to the clinic?`, `A list of any medicines you take, and anything relevant such as recent test results or letters from other doctors.`],
  ] },
  { id: 'appointments', title: 'Appointments & registration', items: [
    [`How do I register as a family practice patient?`, `Complete our short <a href="/new-patients.html">registration form</a>. Our team will review your details and get in touch, and you'll receive a confirmation email with a reference number.`],
    [`Can I register my family?`, `Yes. The registration form lets you add your partner, children and other family members — up to eight people in one go.`],
  ] },
  { id: 'prescriptions', title: 'Prescriptions', items: [
    [`Can I get a prescription?`, `Yes, where your GP considers it clinically appropriate. You can request a repeat prescription online, or speak to your GP during a consultation. For online consultations, prescriptions are sent to the pharmacy you name.`],
    [`How do repeat prescriptions work online?`, `Choose your condition on the <a href="/repeat-prescription.html">repeat prescription page</a>, answer a few safety questions and pick a time. If your GP approves the request, they email the prescription directly to the pharmacy you name.`],
    [`Will I always be given a prescription?`, `No. A prescription is only issued where your GP considers it clinically appropriate and safe for you.`],
  ] },
  { id: 'certificates', title: 'Medical certificates', items: [
    [`Can I get a medical certificate?`, `Yes, where your GP considers it appropriate. You can request a sick certificate through our online booking, or ask your GP during a walk-in visit. Your GP can also write medical letters where clinically appropriate.`],
    [`What do I need for a sick certificate?`, `Your name, date of birth and address as they should appear on the certificate. Your GP will ask about your illness and the dates involved.`],
  ] },
  { id: 'referrals', title: 'Referrals', items: [
    [`Can you refer me to a specialist?`, `Where your GP considers a referral appropriate, they can write a referral letter after assessing you.`],
  ] },
  { id: 'results', title: 'Test results', items: [
    [`How will I get my test results?`, `If your GP arranges tests, they will explain at your consultation how you'll receive the results. If you're unsure, please <a href="/contact.html">contact us</a>.`],
  ] },
  { id: 'payments', title: 'Payments', items: [
    [`How much does a consultation cost?`, `Online consultation prices are shown on our <a href="/fees.html">Fees page</a> and again before you pay. For walk-in and family practice fees, please <a href="/contact.html">contact us</a> or ask at reception.`],
    [`How do I pay for an online consultation?`, `By card when you book. Payment is processed securely by Stripe — GP4U never sees or stores your card details.`],
  ] },
  { id: 'children', title: 'Children', items: [
    [`Do you see children?`, `Our family practice cares for children as well as adults, and children can be brought to the walk-in clinic. For an online consultation for a child, please <a href="/contact.html">contact us</a> first.`],
  ] },
  { id: 'privacy', title: 'Privacy', items: [
    [`Is my health information private?`, `Yes. Your health information is encrypted and handled in line with GDPR, and access is restricted to authorised staff. Read our <a href="/privacy.html">Privacy &amp; GDPR Notice</a> for full details.`],
  ] },
  { id: 'cancellations', title: 'Cancellations', items: [
    [`What if I need to cancel or change my booking?`, `Please <a href="/contact.html">contact us</a> as soon as you can and we'll help you.`],
  ] },
  { id: 'emergencies', title: 'Emergencies', items: [
    [`What should I do in an emergency?`, `GP4U is not an emergency service. In an emergency call <strong>112</strong> or <strong>999</strong>, or go to your nearest Emergency Department — for example for chest pain, severe difficulty breathing, signs of a stroke, heavy bleeding or loss of consciousness.`],
    [`What if my symptoms get worse after I book?`, `If you feel worse or unsafe at any point, don't wait for your appointment — call 112 or 999, or go to your nearest Emergency Department.`],
  ] },
];

const stripTags = (h) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const faqHtml = (items) => `<div class="faq">${items.map(([q, a]) => `
  <details><summary>${q}</summary><p>${a}</p></details>`).join('')}
</div>`;
const pick = (ids) => ids.map((q) => { for (const g of FAQ) for (const it of g.items) if (it[0].startsWith(q)) return it; throw new Error('faq missing ' + q); });

// ------------------------------------------------------------------ page shell
function page({ title, desc, url, image = '/img/clinic/family-sofa.webp', body, scripts = '', jsonld = '', extraHead = '', sticky = true }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${extraHead}<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${ORG}${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="GP4U Clinic">
<meta property="og:locale" content="en_IE">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${ORG}${url}">
<meta property="og:image" content="${ORG}${image}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="/img/gp4u-icon.svg">
<!-- @head -->
<!-- @/head -->
${jsonld}</head>
<body class="clinic-page on-light"${sticky ? '' : ' data-sticky="off"'}>
<!-- @topbar -->
<!-- @/topbar -->
<!-- @header -->
<!-- @/header -->
<main id="main">
${body}
</main>

<!-- @footer -->
<!-- @/footer -->
<!-- @sticky -->
<!-- @/sticky -->

${scripts}<script src="/js/clinic.js"></script>
<script src="/js/nav-toggle.js"></script>
</body>
</html>
`;
}
const ld = (o) => `<script type="application/ld+json">\n${JSON.stringify(o, null, 2)}\n</script>\n`;
const EMERGENCY = `<div class="notice-strip"><strong>In an emergency, call 112 or 999</strong> or go to your nearest Emergency Department. GP4U is not an emergency service.</div>`;

const clinicLd = {
  '@context': 'https://schema.org', '@type': 'MedicalClinic', name: 'GP4U Clinic', url: `${ORG}/`,
  image: `${ORG}/img/clinic/family-sofa.webp`,
  description: 'Walk-in clinic and comprehensive family practice in Newbridge, Co. Kildare, with online GP consultations.',
  medicalSpecialty: 'GeneralPractice', areaServed: { '@type': 'Country', name: 'Ireland' },
  address: { '@type': 'PostalAddress', addressLocality: 'Newbridge', addressRegion: 'Co. Kildare', addressCountry: 'IE' },
  openingHoursSpecification: [
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '10:00', closes: '21:00' },
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday', 'Sunday'], opens: '12:00', closes: '19:00' },
  ],
};

const onlineBand = `<section class="sec">
  <div class="container">
    <div class="band">
      <img src="/img/clinic/doctor-video.webp" alt="A GP on a video consultation with a patient at home" loading="lazy" width="1300" height="731">
      <div class="band-inner">
        <p class="eyebrow">Online GP</p>
        <h2>Can't get to the clinic? See a GP from home.</h2>
        <p>Video and phone consultations, repeat prescriptions and sick certs — book in minutes.</p>
        <a href="/book.html" class="btn btn-light btn-lg">Book an Online GP Consultation</a>
      </div>
    </div>
  </div>
</section>`;

// ------------------------------------------------------------------ shared building blocks (v3)
// "How can we help?" — the 12 service categories (shown on the homepage and the Services page)
const SERVICES12 = [
  ['coughs', 'thermo', 'Coughs, colds & infections', 'Assessment and treatment of everyday infections, from chesty coughs to sore throats.'],
  ['children', 'smile', "Children's health", 'Care for childhood illnesses, with clear advice for parents.'],
  ['womens', 'heart', "Women's health", "Contraception and women's health care, with confidential advice."],
  ['mens', 'shield', "Men's health", "Confidential advice and care for men's health concerns."],
  ['skin', 'sun', 'Skin conditions', 'Assessment of rashes, skin infections and long-standing skin problems.'],
  ['injuries', 'plus', 'Minor injuries', 'Assessment of cuts, sprains and everyday injuries.'],
  ['stomach', 'droplet', 'Stomach problems', 'Help with tummy upsets, vomiting and digestive symptoms.'],
  ['long-term', 'activity', 'Long-term conditions', 'Ongoing care and reviews for asthma, diabetes, blood pressure and more.'],
  ['prescriptions', 'refresh', 'Prescriptions', 'Repeat and new prescriptions, where your GP considers them clinically appropriate.'],
  ['certificates', 'file', 'Medical certificates', 'Sick certificates, issued where your GP considers it appropriate.'],
  ['letters', 'clipboard', 'Medical letters', 'Medical letters written by your GP, where clinically appropriate.'],
  ['referrals', 'send', 'Referrals', 'Referral letters to specialist and hospital services, where your GP considers it appropriate.'],
];
const serviceCards = (withLinks, ids) => SERVICES12.filter(([id]) => !ids || ids.includes(id)).map(([id, icon, name, text]) => `
      <div class="svc" id="${id}">${chip(icon)}<h3>${name}</h3><p>${text}</p>${withLinks ? `<a class="learn" href="/services.html#${id}" aria-label="Learn more about ${name}">Learn more →</a>` : ''}</div>`).join('');

// Clinic location + opening hours. Address, phone, map and directions fill in from public/js/clinic.js.
const locationBlock = () => `<div class="loc">
      <div class="loc-card">
        <div data-open-status></div>
        <h3>GP4U Clinic</h3>
        <p style="margin:0;">Walk-in clinic and comprehensive family practice</p>
        <dl>
          <div><dt>Address</dt><dd><span data-clinic-address></span></dd></div>
          <div class="contact-item"><dt>Phone</dt><dd data-clinic-phone></dd></div>
          <div><dt>Email</dt><dd data-clinic-email></dd></div>
        </dl>
        <p style="margin:22px 0 0;"><a href="#" data-clinic-directions class="btn btn-tertiary">Get directions</a><span class="soft" data-if-no-street>Directions coming soon</span></p>
        <div class="loc-map" data-clinic-map hidden></div>
      </div>
      <div class="loc-card">
        <h3>Opening hours</h3>
        <div data-clinic-hours></div>
        <p class="hours-note" data-clinic-hours-note></p>
      </div>
    </div>`;

// Closing call to action
const seeAGpBand = `<section class="sec">
  <div class="container">
    <div class="cta-band">
      <h2>Need to see a GP?</h2>
      <p>Walk in during opening hours, or see a GP online from home.</p>
      <div class="cta-actions">
        <a href="/walk-in.html" class="btn btn-primary btn-lg">Walk-In Clinic</a>
        <a href="/online.html" class="btn btn-outline-light btn-lg">See a GP Online</a>
      </div>
    </div>
  </div>
</section>`;

// ================================================================== HOME
write('index.html', page({
  title: 'GP4U Clinic — Walk-In GP &amp; Online GP | Newbridge, Co. Kildare',
  desc: 'Walk-in GP clinic and comprehensive family practice in Newbridge, Co. Kildare, plus online GP consultations from home. No appointment needed at the clinic. Open 7 days.',
  url: '/',
  extraHead: '<meta name="google-site-verification" content="ub7hnibZETNhoVlnaToNVXdh1WpZFs5eSjIv7njwld0" />\n<link rel="preload" as="image" href="/img/clinic/family-sofa.webp" fetchpriority="high">\n',
  jsonld: ld(clinicLd),
  body: `
<section class="hero2">
  <div class="container hero2-grid">
    <div class="hero2-text">
      <p class="eyebrow">GP4U Clinic · Newbridge, Co. Kildare</p>
      <h1>GP care, when you need it.</h1>
      <p class="lead">A walk-in clinic and comprehensive family practice in Newbridge — plus online GP consultations from home.</p>
      <div class="hero2-actions">
        <a href="/new-patients.html" class="btn btn-primary btn-lg">Register with us</a>
        <a href="/walk-in.html" class="btn btn-secondary btn-lg">Walk-In Clinic</a>
        <a href="/online.html" class="btn btn-tertiary">See a GP Online</a>
      </div>
      <p class="hero2-meta">Open 7 days <span class="dot">·</span> No appointment needed <span class="dot">·</span> Irish-registered GPs</p>
    </div>
    <div class="hero2-media">
      <img src="/img/clinic/family-sofa.webp" alt="A smiling family of three sitting together on a sofa" width="1500" height="844" fetchpriority="high">
      <div class="hero2-card">
        ${chip('clock')}
        <div>
          <div data-open-status></div>
          <div data-clinic-hours-summary></div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="sec" id="register" style="padding-top:8px;">
  <div class="container">
    <div class="family-feature">
      <div class="ff-media"><img src="/img/clinic/doctor-family.webp" alt="A GP talking with a mother and her young son" loading="lazy" width="1300" height="731"></div>
      <div class="ff-body">
        <p class="eyebrow">Comprehensive family practice</p>
        <h2>Register with GP4U for care that stays with you and your family.</h2>
        <p>Join our family practice in Newbridge for ongoing, joined-up GP care — not just one-off visits.</p>
        <ul class="check-list">
          <li>Register your whole family in one go — up to eight people</li>
          <li>Ongoing care and reviews for long-term conditions</li>
          <li>One record across your walk-in and online visits</li>
          <li>Takes just a few minutes</li>
        </ul>
        <div class="ff-actions">
          <a href="/new-patients.html" class="btn btn-primary btn-lg">Register as a new patient</a>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="sec" id="choose" style="padding-top:8px;">
  <div class="container">
    <div class="sec-head center">
      <h2>Need to see a GP today?</h2>
      <p>Choose what suits you — the same GP-led care, either way.</p>
    </div>
    <div class="choose-grid">
      <article class="choose-card">
        <div class="choose-media">
          <img src="/img/clinic/doctor-consult.webp" alt="A GP listening carefully to a patient during a consultation at the clinic" loading="lazy" width="1300" height="731">
          <span class="badge-chip is-inperson">${ico('pin')} In person · Newbridge, Co. Kildare</span>
        </div>
        <div class="choose-body">
          <h3>Visit our clinic</h3>
          <p><strong>Walk-in GP care in Newbridge, Co. Kildare.</strong><br>No appointment required.</p>
          <div class="choose-actions">
            <a href="/walk-in.html" class="btn btn-primary btn-lg">Visit the Walk-In Clinic</a>
            <a href="#" data-clinic-directions class="btn btn-tertiary">Get directions</a>
            <span class="soft" data-if-no-street>Directions coming soon</span>
          </div>
        </div>
      </article>
      <article class="choose-card">
        <div class="choose-media">
          <img src="/img/clinic/doctor-video.webp" alt="A GP on a video consultation with a patient at home" loading="lazy" width="1300" height="731">
          <span class="badge-chip">${ico('video')} Online · from home</span>
        </div>
        <div class="choose-body">
          <h3>See a GP online</h3>
          <p><strong>Speak to an Irish-registered GP from the comfort of home.</strong><br>Video or phone consultation.</p>
          <div class="choose-actions">
            <a href="/book.html" class="btn btn-primary btn-lg">Book Online</a>
            <span class="soft"><span data-min-price hidden></span></span>
          </div>
        </div>
      </article>
    </div>
    <p class="choose-note">Not sure which to choose? If you need to be examined in person, visit the walk-in clinic.</p>
  </div>
</section>

<section class="trustbar" aria-label="Why patients choose GP4U">
  <div class="container">
    <ul>
      <li>${ico('badge')} GP-led care</li>
      <li>${ico('check')} Irish-registered doctors</li>
      <li>${ico('users')} In-person &amp; online</li>
      <li>${ico('card')} Clear pricing</li>
      <li>${ico('lock')} Secure &amp; private</li>
    </ul>
  </div>
</section>

<section class="sec sec-alt" id="services">
  <div class="container">
    <div class="sec-head center">
      <p class="eyebrow">Our services</p>
      <h2>How can we help?</h2>
    </div>
    <div class="svc-grid svc-12">${serviceCards(true, ['coughs', 'children', 'womens', 'mens', 'skin', 'long-term', 'prescriptions', 'certificates'])}
    </div>
    <p class="svc-foot"><a href="/services.html" class="btn btn-tertiary">See all services</a></p>
  </div>
</section>

<section class="sec">
  <div class="container">
    <div class="sec-head center">
      <p class="eyebrow">Walk-in clinic</p>
      <h2>How it works</h2>
    </div>
    <ol class="timeline">
      <li><span class="tnum" aria-hidden="true">01</span><h3>Walk in or check in online</h3><p>Come in during opening hours, or let us know you're on your way.</p></li>
      <li><span class="tnum" aria-hidden="true">02</span><h3>Check in at reception</h3><p>Give our team your details and tell us why you're here.</p></li>
      <li><span class="tnum" aria-hidden="true">03</span><h3>See a GP</h3><p>Your GP will assess you and, where needed, arrange prescriptions, certificates or referrals.</p></li>
    </ol>
    <p class="explain"><strong>No appointment is required.</strong> You can simply walk in during opening hours. Checking in online lets us know you're on your way and helps us prepare for your visit, but it does not reserve a specific appointment time.</p>
    <p style="text-align:center;margin:26px 0 0;"><a href="/walk-in.html#book-in" class="btn btn-secondary btn-lg">Check in for your visit</a></p>
  </div>
</section>

<section class="sec" id="find-us">
  <div class="container">
    <div class="sec-head center">
      <p class="eyebrow">Find us</p>
      <h2>Your local GP clinic</h2>
    </div>
    ${locationBlock()}
  </div>
</section>

<section class="sec sec-white">
  <div class="container">
    <div class="sec-head center">
      <p class="eyebrow">Good to know</p>
      <h2>Common questions</h2>
    </div>
    ${faqHtml(pick(['Do I need an appointment?', 'Can I see a GP online', 'How much does a consultation cost', 'Can I register my family']))}
    <p style="text-align:center;margin:28px 0 0;"><a class="btn btn-tertiary" href="/faq.html">See all FAQs</a></p>
  </div>
</section>

<section class="sec sec-tight"><div class="container">${EMERGENCY}</div></section>`,
  scripts: '<script src="/js/questionnaires.js"></script>\n<script src="/js/services-list.js"></script>\n',
}));

// ================================================================== BOOK NOW (step 1: choose)
write('book-now.html', page({
  title: 'Book a GP — Online or Walk-In Clinic | GP4U Clinic',
  desc: 'Book a GP with GP4U Clinic. Choose an online GP consultation from home, or visit our walk-in clinic in Newbridge, Co. Kildare.',
  url: '/book-now.html', sticky: false,
  body: `
<section class="phero phero-simple">
  <div class="container">
    <p class="eyebrow">Book a GP</p>
    <h1>How would you like to see a GP?</h1>
    <p class="lead">Choose online from home, or in person at our clinic in Newbridge.</p>
  </div>
</section>

<section class="sec sec-tight">
  <div class="container">
    <div class="opt-grid">
      <article class="opt is-online">
        <span class="badge-chip">${ico('video')} Online · from home</span>
        <h2>Online GP consultation</h2>
        <p>Speak to a GP by video or phone. You'll pick a service, choose a time and pay securely — about five minutes.</p>
        <ul class="tick-list">
          <li>Video or phone, wherever you are</li>
          <li>Repeat prescriptions and sick certs, where appropriate</li>
          <li>Pay by card when you book</li>
        </ul>
        <div class="opt-foot">
          <p class="price-line"><span data-min-price hidden></span> <small>· <a href="/fees.html">see all fees</a></small></p>
          <a href="/book.html" class="btn btn-primary btn-lg">Book an Online GP Consultation</a>
        </div>
      </article>
      <article class="opt is-inperson">
        <span class="badge-chip">${ico('pin')} In person · Newbridge, Co. Kildare</span>
        <h2>Walk-in clinic</h2>
        <p>Come in and see a doctor — no appointment needed. You can check in online so we know you're on your way.</p>
        <ul class="tick-list">
          <li>Open seven days a week</li>
          <li>Everyday illness and minor injuries</li>
          <li>No payment needed to check in</li>
        </ul>
        <div class="opt-foot">
          <p class="price-line" data-open-status-inline>Opening hours: <a href="/contact.html">see when we're open</a></p>
          <a href="/walk-in.html" class="btn btn-secondary btn-lg">Visit the Walk-In Clinic</a>
          <p style="margin:12px 0 0;text-align:center;"><a href="/walk-in.html#book-in">Check in online (optional)</a></p>
        </div>
      </article>
    </div>
  </div>
</section>

<section class="sec sec-tight">
  <div class="container">
    <div class="sec-head"><p class="eyebrow">Something else?</p><h2 style="font-size:1.6rem;">Other things you can do</h2></div>
    <div class="tiles">
      <a class="tile" href="/new-patients.html">${chip('users')}<h3>Register as a patient</h3><p>Join our comprehensive family practice.</p><span class="go">Register →</span></a>
      <a class="tile" href="/repeat-prescription.html">${chip('file')}<h3>Repeat prescription</h3><p>Request an ongoing prescription online.</p><span class="go">Request →</span></a>
      <a class="tile" href="/patient-login.html">${chip('lock')}<h3>Patient login</h3><p>View your consultations and messages.</p><span class="go">Log in →</span></a>
      <a class="tile" href="/contact.html">${chip('mail')}<h3>Contact us</h3><p>Questions before you book? Get in touch.</p><span class="go">Contact →</span></a>
    </div>
    <div style="margin-top:28px;">${EMERGENCY}</div>
  </div>
</section>`,
  scripts: '<script src="/js/questionnaires.js"></script>\n<script src="/js/services-list.js"></script>\n',
}));

// ================================================================== FEES
const skelRows = (n) => `<span class="sr-only">Loading prices…</span>` + Array.from({ length: n }, () => '<div class="skeleton skel-row" aria-hidden="true"></div>').join('');
write('fees.html', page({
  title: 'Fees — Online GP &amp; Walk-In Clinic Prices | GP4U Clinic',
  desc: 'Clear GP4U Clinic fees. See the price of every online GP consultation before you book, and how online and walk-in care differ.',
  url: '/fees.html',
  body: `
<section class="phero phero-simple">
  <div class="container">
    <p class="eyebrow">Fees</p>
    <h1>Clear prices, shown before you book</h1>
    <p class="lead">See exactly what an online consultation costs. Prices are shown again before you pay.</p>
  </div>
</section>

<section class="sec sec-tight">
  <div class="container" style="max-width:900px;">
    <div class="sec-head"><span class="badge-chip">${ico('video')} Online · from home</span><h2 style="font-size:1.8rem;">Online GP consultations</h2></div>
    <div class="price-list" data-services="prices" aria-live="polite" aria-busy="true">${skelRows(6)}</div>
    <p style="margin:18px 0 0;font-size:.95rem;">Pay by card when you book — processed securely by Stripe. GP4U never sees or stores your card details.</p>
  </div>
</section>

<section class="sec sec-tight">
  <div class="container" style="max-width:900px;">
    <div class="sec-head"><span class="badge-chip is-inperson">${ico('pin')} In person · Newbridge, Co. Kildare</span><h2 style="font-size:1.8rem;">Walk-in clinic &amp; family practice</h2></div>
    <div class="price-list" data-walkin-fees hidden></div>
    <div class="callout" data-if-no-fees>
      <p><strong>Walk-in and family practice fees.</strong> Please <a href="/contact.html">contact us</a> or ask at reception for our current fees.</p>
    </div>
  </div>
</section>

<section class="sec sec-alt">
  <div class="container" style="max-width:900px;">
    <div class="sec-head"><p class="eyebrow">At a glance</p><h2 style="font-size:1.8rem;">Online or in person?</h2></div>
    <div class="table-wrap">
      <table class="compare">
        <caption class="sr-only">Comparison of online GP and walk-in clinic</caption>
        <thead><tr><th scope="col"><span class="sr-only">Feature</span></th><th scope="col">Online GP</th><th scope="col">Walk-in clinic</th></tr></thead>
        <tbody>
          <tr><th scope="row">Where</th><td>From home, by video or phone</td><td>At the clinic in Newbridge, Co. Kildare</td></tr>
          <tr><th scope="row">Appointment</th><td>Book a time online</td><td>No appointment required — you can check in online if you like</td></tr>
          <tr><th scope="row">Payment</th><td>By card when you book</td><td>At the clinic</td></tr>
          <tr><th scope="row">Best for</th><td>Advice, repeat prescriptions, certificates, follow-ups</td><td>Problems that need to be examined in person</td></tr>
        </tbody>
      </table>
    </div>
    <div style="margin-top:20px;" class="callout"><p>Prescriptions, certificates and referral letters are issued only where your GP considers them clinically appropriate.</p></div>
    <div style="margin-top:28px;display:flex;gap:12px;flex-wrap:wrap;">
      <a href="/book.html" class="btn btn-primary btn-lg">Book Online</a>
      <a href="/walk-in.html" class="btn btn-secondary btn-lg">Visit the Walk-In Clinic</a>
    </div>
  </div>
</section>`,
  scripts: '<script src="/js/questionnaires.js"></script>\n<script src="/js/services-list.js"></script>\n',
}));

// ================================================================== ABOUT
write('about.html', page({
  title: 'About GP4U — GP-Led Walk-In &amp; Online Care in Ireland',
  desc: 'GP4U is a GP-led healthcare service: a walk-in clinic and comprehensive family practice in Newbridge, Co. Kildare, with online GP consultations across Ireland.',
  url: '/about.html', image: '/img/clinic/doctor-desk.webp',
  body: `
<section class="phero">
  <div class="container phero-grid">
    <div>
      <p class="eyebrow">About GP4U</p>
      <h1>Built by a GP. Designed around patients.</h1>
      <p class="lead">GP4U was set up by a practising Irish GP to make everyday GP care more convenient — without losing the careful, personal approach of a good family doctor.</p>
      <div class="hero2-actions">
        <a href="/walk-in.html" class="btn btn-primary btn-lg">Walk-In Clinic</a>
        <a href="/online.html" class="btn btn-secondary btn-lg">See a GP Online</a>
      </div>
    </div>
    <div class="phero-media"><img src="/img/clinic/doctor-desk.webp" alt="A GP seated at her desk in a bright consulting room" width="1100" height="619" fetchpriority="high"></div>
  </div>
</section>

<section class="sec sec-tight">
  <div class="container">
    <div class="sec-head"><p class="eyebrow">Who we are</p><h2>One service, three ways to get care</h2></div>
    <div class="grid-3">
      <div class="info-card">${chip('plus')}<h3 style="margin-top:16px;">Walk-in clinic</h3><p style="margin:0;">See a GP in Newbridge, Co. Kildare without an appointment, seven days a week.</p></div>
      <div class="info-card">${chip('users')}<h3 style="margin-top:16px;">Comprehensive family practice</h3><p style="margin:0;">Register yourself and your family for continuing care, from children to older adults.</p></div>
      <div class="info-card">${chip('video')}<h3 style="margin-top:16px;">Online GP</h3><p style="margin:0;">Video and phone consultations, repeat prescriptions and certificates from home.</p></div>
    </div>
  </div>
</section>

<section class="sec sec-alt">
  <div class="container split">
    <div>
      <p class="eyebrow">Medical leadership</p>
      <h2>Led by a practising GP</h2>
      <p class="lead">GP4U is led by a practising Irish GP. Every consultation is carried out by a doctor registered with the Medical Council of Ireland.</p>
      <ul class="feat-list">
        <li>${chip('badge')}<div><h4>Registered doctors</h4><p>Doctors practise on the register of the Medical Council of Ireland.</p></div></li>
        <li>${chip('heart')}<div><h4>Patient first</h4><p>Clear explanations, sensible advice and honest recommendations — including when you need to be seen in person.</p></div></li>
        <li>${chip('lock')}<div><h4>Private &amp; secure</h4><p>Your health information is encrypted and handled in line with GDPR. <a href="/privacy.html">Privacy notice</a></p></div></li>
      </ul>
    </div>
    <div class="split-media"><img src="/img/clinic/doctor-family.webp" alt="A GP talking with a mother and her young son" loading="lazy" width="1300" height="731"></div>
  </div>
  <div class="container" style="margin-top:36px;"><div class="founder" data-founder hidden></div></div>
</section>

<section class="sec">
  <div class="container">
    <div class="sec-head center"><p class="eyebrow">Our approach</p><h2>Why GP4U was created</h2><p>To give patients a simpler way to see a GP — in person or online — with the personal, careful approach of a good family doctor.</p></div>
    <div class="why-grid why-3">
      <div class="why-item">${chip('heart')}<h3>Personal and careful</h3><p>The approach of a good family doctor, whichever way you see us.</p></div>
      <div class="why-item">${chip('clock')}<h3>Convenient</h3><p>Walk in at the clinic, or see a GP from home.</p></div>
      <div class="why-item">${chip('info')}<h3>Clear</h3><p>Services and prices explained plainly, before you book.</p></div>
    </div>
  </div>
</section>

<section class="sec sec-alt">
  <div class="container">
    <div class="sec-head center"><p class="eyebrow">What patients can expect</p><h2>How your care works</h2></div>
    <div class="steps3">
      <div class="step3"><div class="num">1</div><h3>Choose how you'd like to be seen</h3><p>Book an online GP consultation, or walk in at the clinic — no appointment required.</p></div>
      <div class="step3"><div class="num">2</div><h3>Be seen by a registered GP</h3><p>Your GP listens, assesses you, and explains their advice. If you need to be examined in person, they'll tell you.</p></div>
      <div class="step3"><div class="num">3</div><h3>Follow-up where needed</h3><p>Prescriptions, certificates or referral letters are issued where clinically appropriate, and online patients can message their GP securely.</p></div>
    </div>
    <div style="text-align:center;margin-top:40px;display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
      <a href="/faq.html" class="btn btn-secondary btn-lg">Read our FAQs</a>
      <a href="/contact.html" class="btn btn-secondary btn-lg">Contact us</a>
    </div>
  </div>
</section>

${seeAGpBand}

<section class="sec sec-tight"><div class="container">${EMERGENCY}</div></section>`,
}));

// ================================================================== FAQ
write('faq.html', page({
  title: 'FAQs — Online GP, Walk-In, Prescriptions | GP4U Clinic',
  desc: 'Answers to common questions about GP4U Clinic: online GP consultations, the walk-in clinic, prescriptions, sick certificates, payments, privacy and emergencies.',
  url: '/faq.html',
  jsonld: ld({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: FAQ.flatMap((g) => g.items.map(([q, a]) => ({ '@type': 'Question', name: stripTags(q), acceptedAnswer: { '@type': 'Answer', text: stripTags(a) } }))),
  }),
  body: `
<section class="phero phero-simple">
  <div class="container">
    <p class="eyebrow">FAQs</p>
    <h1>Frequently asked questions</h1>
    <p class="lead">Quick answers about booking, the walk-in clinic, online consultations and more. Can't find what you need? <a href="/contact.html">Get in touch</a>.</p>
  </div>
</section>

<section class="sec sec-tight" style="padding-top:8px;">
  <div class="container" style="max-width:820px;">
    <nav class="faq-cats" aria-label="FAQ topics">${FAQ.map((g) => `<a href="#${g.id}">${g.title}</a>`).join('')}</nav>
    ${FAQ.map((g) => `<div class="faq-group" id="${g.id}">
      <h2>${g.title}</h2>
      ${faqHtml(g.items)}
    </div>`).join('\n    ')}
    <div class="callout" style="margin-top:8px;"><p><strong>Still have a question?</strong> <a href="/contact.html">Contact us</a>, or <a href="/book-now.html">book a GP</a> to see a GP.</p></div>
    <div style="margin-top:28px;">${EMERGENCY}</div>
  </div>
</section>`,
  scripts: '',
}));

// ================================================================== ONLINE GP
write('online.html', page({
  title: 'Online GP Ireland — Video &amp; Phone GP Consultations | GP4U Clinic',
  desc: 'See a GP online in Ireland. Video and phone GP consultations, repeat prescriptions and sick certs from home, with Medical Council registered doctors.',
  url: '/online.html', image: '/img/clinic/doctor-video.webp',
  jsonld: ld({
    '@context': 'https://schema.org', '@type': 'MedicalBusiness', name: 'GP4U Clinic — Online GP', url: `${ORG}/online.html`,
    description: 'Online GP consultations in Ireland: video and phone appointments, repeat prescriptions and sick certificates.',
    areaServed: { '@type': 'Country', name: 'Ireland' }, medicalSpecialty: 'GeneralPractice',
    parentOrganization: { '@type': 'MedicalClinic', name: 'GP4U Clinic', url: `${ORG}/` },
  }),
  body: `
<section class="phero">
  <div class="container phero-grid">
    <div>
      <p class="eyebrow">Online GP</p>
      <h1 id="heroTitle">See a GP online, from anywhere in Ireland.</h1>
      <p class="lead" id="heroSubtitle">GP4U connects you with Irish-registered GPs for video and phone consultations, repeat prescriptions and sick certs — quick to book, no waiting room.</p>
      <div class="hero2-actions">
        <a href="/book.html" class="btn btn-primary btn-lg">Book an Online GP Consultation</a>
        <a href="/repeat-prescription.html" class="btn btn-secondary btn-lg">Request a repeat prescription</a>
      </div>
      <div class="trust-row">
        <span>${ico('video')} Video or phone</span>
        <span>${ico('lock')} Private &amp; secure</span>
        <span>${ico('card')} Pay by card at booking</span>
      </div>
    </div>
    <div class="phero-media"><img src="/img/clinic/doctor-video.webp" alt="A GP on a video consultation with a patient at home" width="1300" height="731" fetchpriority="high"></div>
  </div>
</section>

<section class="sec">
  <div class="container">
    <div class="sec-head center"><p class="eyebrow">Choose a consultation</p><h2>What would you like to see a GP about?</h2><p>Prices are shown upfront — no surprises.</p></div>
    <div class="svc-cards" data-services="cards" aria-live="polite" aria-busy="true"><span class="sr-only">Loading services…</span>${Array.from({ length: 8 }, () => '<div class="skel-card" aria-hidden="true"><div class="skeleton skel-chip"></div><div class="skeleton skel-line w80"></div><div class="skeleton skel-line w40"></div><div class="skeleton skel-line w60"></div><div class="skeleton skel-btn"></div></div>').join('')}</div>
    <p style="text-align:center;margin:28px 0 0;"><a class="link-arrow" href="/fees.html">See all fees →</a></p>
  </div>
</section>

<section class="sec sec-alt">
  <div class="container">
    <div class="sec-head center"><p class="eyebrow">Common conditions</p><h2>Treatment for everyday conditions, online</h2><p>Answer a few safety questions and your GP can assess whether a prescription is appropriate.</p></div>
    <div class="chip-links" style="justify-content:center;">
      <a href="/uti.html">UTI / cystitis</a><a href="/contraception.html">Contraception</a><a href="/period-delay.html">Delaying your period</a>
      <a href="/asthma.html">Asthma</a><a href="/migraine.html">Migraine</a><a href="/hay-fever.html">Hay fever</a>
      <a href="/eczema-psoriasis.html">Eczema &amp; psoriasis</a><a href="/acne.html">Acne</a><a href="/cold-sores.html">Cold sores</a>
      <a href="/hair-loss.html">Hair loss</a><a href="/ed.html">Erectile dysfunction</a><a href="/hypothyroidism.html">Underactive thyroid</a>
      <a href="/stop-smoking.html">Stopping smoking</a>
    </div>
  </div>
</section>

<section class="sec">
  <div class="container">
    <div class="sec-head center"><p class="eyebrow">How it works</p><h2>Your online consultation, step by step</h2></div>
    <div class="steps3 steps4">
      <div class="step3"><div class="num">1</div><h3 id="howItWorks1Title">Choose a service</h3><p id="howItWorks1Text">Video, phone, repeat prescription or a sick cert.</p></div>
      <div class="step3"><div class="num">2</div><h3 id="howItWorks2Title">Tell us what's going on</h3><p id="howItWorks2Text">A short, private questionnaire so your GP is prepared before you speak.</p></div>
      <div class="step3"><div class="num">3</div><h3 id="howItWorks3Title">Pick a time &amp; pay securely</h3><p id="howItWorks3Text">Choose a slot that suits you and pay by card — processed securely by Stripe.</p></div>
      <div class="step3"><div class="num">4</div><h3 id="howItWorks4Title">Have your consultation</h3><p id="howItWorks4Text">Join your private video or phone call from your confirmation page.</p></div>
    </div>
  </div>
</section>

<section class="sec sec-alt">
  <div class="container split">
    <div>
      <p class="eyebrow">What to expect</p>
      <h2>Good to know before you book</h2>
      <ul class="feat-list">
        <li>${chip('video')}<div><h4>What you'll need</h4><p>A phone, tablet or computer with a camera and microphone (or just a phone for a phone consultation), and somewhere private.</p></div></li>
        <li>${chip('shield')}<div><h4>Safety comes first</h4><p>If your GP thinks you need to be examined in person, they'll tell you — and you can be seen at our walk-in clinic.</p></div></li>
        <li>${chip('file')}<div><h4>Prescriptions &amp; certificates</h4><p>Issued only where your GP considers them clinically appropriate. Prescriptions go to the pharmacy you name.</p></div></li>
      </ul>
      <a href="/book.html" class="btn btn-primary btn-lg">Book an Online GP Consultation</a>
    </div>
    <div class="split-media"><img src="/img/clinic/doctor-desk.webp" alt="A GP seated at her desk in a bright consulting room" loading="lazy" width="1100" height="619"></div>
  </div>
</section>

<section class="sec">
  <div class="container">
    <div class="sec-head center"><p class="eyebrow">Online GP questions</p><h2>Common questions</h2></div>
    ${faqHtml(FAQ[0].items.concat(pick(['How do I pay for an online', 'Will I always be given a prescription'])))}
    <p style="text-align:center;margin:28px 0 0;"><a class="link-arrow" href="/faq.html">See all FAQs →</a></p>
  </div>
</section>

<section class="sec sec-tight">
  <div class="container">
    <div class="callout"><p><strong>Prefer to be seen in person?</strong> GP4U Clinic is a walk-in clinic and comprehensive family practice in Newbridge, Co. Kildare — no appointment needed. <a href="/walk-in.html">Visit our walk-in clinic</a></p></div>
    <div style="margin-top:20px;">${EMERGENCY}</div>
  </div>
</section>`,
  scripts: `<script src="/js/questionnaires.js"></script>
<script src="/js/services-list.js"></script>
<script>
// Headline, intro and the four "how it works" steps are editable from the admin content editor.
fetch('/api/content').then((r) => r.json()).then((c) => {
  const set = (id, v) => { const e = document.getElementById(id); if (e && v) e.textContent = v; };
  set('heroTitle', c.hero_title);
  set('heroSubtitle', c.hero_subtitle);
  [1, 2, 3, 4].forEach((n) => { set('howItWorks' + n + 'Title', c['how_it_works_' + n + '_title']); set('howItWorks' + n + 'Text', c['how_it_works_' + n + '_text']); });
}).catch(() => { /* the built-in text above stays */ });
</script>
`,
}));

// ================================================================== SERVICES
write('services.html', page({
  title: 'GP Services Newbridge — Walk-In, Family &amp; Online | GP4U',
  desc: 'Walk-in GP care, comprehensive family practice, women\'s and men\'s health, child health and online consultations at GP4U Clinic, Newbridge, Co. Kildare.',
  url: '/services.html', image: '/img/clinic/doctor-family.webp',
  body: `
<section class="phero">
  <div class="container phero-grid">
    <div>
      <p class="eyebrow">Our services</p>
      <h1>How can we help?</h1>
      <p class="lead">Everyday illness and the ongoing care your family needs — at our walk-in clinic in Newbridge, or online from home.</p>
      <div class="hero2-actions">
        <a href="/walk-in.html" class="btn btn-primary btn-lg">Walk-In Clinic</a>
        <a href="/online.html" class="btn btn-secondary btn-lg">See a GP Online</a>
      </div>
    </div>
    <div class="phero-media"><img src="/img/clinic/doctor-family.webp" alt="A GP talking with a mother and her young son in the consulting room" width="1300" height="731" fetchpriority="high"></div>
  </div>
</section>

<section class="sec sec-tight">
  <div class="container">
    <div class="svc-grid svc-12">${serviceCards(false)}
    </div>
  </div>
</section>

<section class="sec sec-alt">
  <div class="container split">
    <div>
      <p class="eyebrow">Comprehensive family practice</p>
      <h2>One practice for the whole family</h2>
      <p class="lead">Register yourself, your children and your family for continuing care — from childhood illnesses to long-term conditions in later life.</p>
      <p style="margin:24px 0 0;"><a href="/new-patients.html" class="btn btn-primary btn-lg">Register your family</a></p>
    </div>
    <div class="steps-card">
      <h3>Where would you like to be seen?</h3>
      <p>The same GP-led care, either way.</p>
      <ul class="feat-list" style="margin:0;">
        <li>${chip('plus')}<div><h4>Walk-in clinic</h4><p>No appointment required. <a href="/walk-in.html">Visit the walk-in clinic</a></p></div></li>
        <li>${chip('video')}<div><h4>Online GP</h4><p>Video or phone from home. <a href="/online.html">See a GP online</a></p></div></li>
      </ul>
    </div>
  </div>
</section>

${seeAGpBand}

<section class="sec sec-tight"><div class="container">${EMERGENCY}</div></section>`,
  scripts: '',
}));

// ================================================================== CONTACT
write('contact.html', page({
  title: 'Contact GP4U Clinic — Newbridge, Co. Kildare',
  desc: 'Contact GP4U Clinic, a walk-in clinic and comprehensive family practice in Newbridge, Co. Kildare. Opening hours, email and how to see a GP.',
  url: '/contact.html',
  body: `
<section class="phero phero-simple">
  <div class="container">
    <p class="eyebrow">Contact</p>
    <h1>Contact GP4U Clinic</h1>
    <p class="lead">Everything you need to reach us or plan your visit.</p>
  </div>
</section>

<section class="sec sec-tight">
  <div class="container">
    ${locationBlock()}
  </div>
</section>

<section class="sec sec-alt">
  <div class="container">
    <div class="sec-head center"><h2>Need a GP?</h2><p>Choose how you'd like to be seen.</p></div>
    <div class="pcards pcards-2">
      <article class="pcard"><div class="pcard-body"><p class="eyebrow">No appointment required</p><h3>Walk-In Clinic</h3><p>Visit our clinic in Newbridge during opening hours.</p><a class="btn btn-primary" href="/walk-in.html">Walk-In Clinic</a></div></article>
      <article class="pcard"><div class="pcard-body"><p class="eyebrow">From home</p><h3>Online GP</h3><p>Video or phone consultation with an Irish-registered GP.</p><a class="btn btn-primary" href="/online.html">See a GP Online</a></div></article>
    </div>
    <div style="margin-top:28px;">${EMERGENCY}</div>
  </div>
</section>`,
}));

// ================================================================== re-wrap the pages we keep
function rewrap(f, { sticky = true } = {}) {
  let s = read(f);
  if (s.includes('<!-- @head -->')) return; // already wrapped — never wrap twice
  s = s.replace(/<div class="topbar">[\s\S]*?<\/div><\/div>\n/, '');
  s = s.replace(/<link rel="stylesheet" href="\/css\/style\.css">\s*<link rel="stylesheet" href="\/css\/clinic\.css">\s*/, '<!-- @head -->\n<!-- @/head -->\n');
  s = s.replace(/<body class="([^"]*)">/, `<body class="$1"${sticky ? '' : ' data-sticky="off"'}>`);
  s = s.replace(/<header class="site-header">[\s\S]*?<\/header>/, '<!-- @topbar -->\n<!-- @/topbar -->\n<!-- @header -->\n<!-- @/header -->\n<main id="main">');
  s = s.replace(/<footer class="site-footer">[\s\S]*?<\/footer>/, '</main>\n\n<!-- @footer -->\n<!-- @/footer -->\n<!-- @sticky -->\n<!-- @/sticky -->');
  if (!s.includes('<!-- @head -->') || !s.includes('<main id="main">') || !s.includes('<!-- @footer -->')) throw new Error('rewrap failed: ' + f);
  write(f, s);
}
rewrap('walk-in.html', { sticky: false });
rewrap('new-patients.html', { sticky: false });
console.log('site pages built');
