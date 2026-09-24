/*
 * The public pages of www.gp4u.ie — ONE list, used by:
 *   - the server (server/seo.js): clean URL -> HTML file, and a 301 redirect from every old address (/walk-in.html etc.)
 *   - scripts/build-pages.js: writes each page's <title>, description, canonical, Open Graph / X tags,
 *     visible breadcrumbs and breadcrumb structured data between the <!-- @seo --> / <!-- @crumbs --> markers
 *   - the XML sitemap (/sitemap.xml is built from this list, indexable pages only)
 *
 * To change a page's title or description: edit it here, run `npm run pages`, commit.
 * Titles: what the page is, for the person searching, then "GP4U". Descriptions: one or two plain sentences, no claims
 * the service doesn't make.
 *
 * Page HTML files are in /pages (see PAGES_DIR below); book.html and private pages are in /public.
 *
 * Fields: url (canonical, with trailing slash), file (in /public), title, description, crumb (breadcrumb label),
 * parent (url of the parent page, for breadcrumbs), image (social preview, /img/...), index (false = noindex + not in
 * sitemap), priority / changefreq (sitemap hints), whenOpen ({ title, description, image } used instead once the
 * Newbridge clinic is switched to open in Admin → Website settings — until then the page describes it as opening soon).
 */
const fs = require('fs');
const path = require('path');

const ORIGIN = 'https://www.gp4u.ie';
// The public pages' HTML lives in /pages, NOT /public: Hostinger's front end serves any file in /public directly,
// which would bypass the app — so /walk-in.html would never reach the 301 to /walk-in-gp-newbridge/. Only book.html
// (address unchanged) and the private pages stay in /public.
const PAGES_DIR = path.join(__dirname, '..', 'pages');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const pagePath = (file) => { const p = path.join(PAGES_DIR, file); return fs.existsSync(p) ? p : path.join(PUBLIC_DIR, file); };
const SOCIAL = '/img/social/gp4u-online-gp-ireland.jpg';
const SOCIAL_CLINIC = '/img/social/gp4u-walk-in-newbridge.jpg';

// Online condition pages: [url slug, file, crumb label]
const CONDITIONS = [
  ['uti', 'uti.html', 'UTI / cystitis'],
  ['contraception', 'contraception.html', 'Contraception'],
  ['period-delay', 'period-delay.html', 'Period delay'],
  ['erectile-dysfunction', 'ed.html', 'Erectile dysfunction'],
  ['hair-loss', 'hair-loss.html', 'Hair loss'],
  ['acne', 'acne.html', 'Acne'],
  ['asthma', 'asthma.html', 'Asthma'],
  ['migraine', 'migraine.html', 'Migraine'],
  ['underactive-thyroid', 'hypothyroidism.html', 'Underactive thyroid'],
  ['stop-smoking', 'stop-smoking.html', 'Stopping smoking'],
  ['hay-fever', 'hay-fever.html', 'Hay fever'],
  ['cold-sores', 'cold-sores.html', 'Cold sores'],
  ['eczema-psoriasis', 'eczema-psoriasis.html', 'Eczema & psoriasis'],
];

// Condition page titles/descriptions (the wording the pages already had)
const CONDITION_META = {
  'uti.html': [
    "UTI & Cystitis Treatment Online in Ireland | GP4U",
    "Think you have a urine infection (UTI/cystitis)? An Irish GP can assess your symptoms online and issue treatment where appropriate."
  ],
  'contraception.html': [
    "Contraceptive Pill, Patch & Ring Online in Ireland | GP4U",
    "Continue your contraceptive pill, patch, or ring online with an Irish GP. Quick safety screening, prescription emailed to your pharmacy where appropriate."
  ],
  'period-delay.html': [
    "Period Delay Online in Ireland | GP4U",
    "Need to delay your period for an event, holiday, or exam? Get an online GP review in Ireland with GP4U."
  ],
  'ed.html': [
    "Erectile Dysfunction Treatment Online in Ireland | GP4U",
    "Confidential online GP review for erectile dysfunction in Ireland, with a prescription issued where clinically appropriate."
  ],
  'hair-loss.html': [
    "Hair Loss Treatment Online in Ireland | GP4U",
    "Online GP review for typical pattern hair loss in Ireland — treatment options discussed and prescribed where suitable."
  ],
  'acne.html': [
    "Acne Treatment Online in Ireland | GP4U",
    "Ongoing acne that hasn’t settled with over-the-counter products? Get an online GP review and treatment options with GP4U."
  ],
  'asthma.html': [
    "Asthma Review Online in Ireland | GP4U",
    "Online asthma review and inhaler prescription with an Irish GP — quick safety screening included."
  ],
  'migraine.html': [
    "Migraine Treatment Online in Ireland | GP4U",
    "Established migraine diagnosis? Get an online GP review and treatment prescription with GP4U Ireland."
  ],
  'hypothyroidism.html': [
    "Underactive Thyroid (Hypothyroidism) Review Online | GP4U",
    "Online review of your thyroid medication for an established hypothyroidism diagnosis, with an Irish GP."
  ],
  'stop-smoking.html': [
    "Stop Smoking Support Online in Ireland | GP4U",
    "Ready to quit smoking? Speak to an Irish GP online about stop-smoking medication options."
  ],
  'hay-fever.html': [
    "Hay Fever & Allergy Treatment Online in Ireland | GP4U",
    "Hay fever or allergy symptoms not settling with over-the-counter antihistamines? Get an online GP review with GP4U."
  ],
  'cold-sores.html': [
    "Cold Sore Treatment Online in Ireland | GP4U",
    "Recurring cold sore outbreak? Get an online GP review and treatment with GP4U Ireland."
  ],
  'eczema-psoriasis.html': [
    "Eczema & Psoriasis Review Online in Ireland | GP4U",
    "Online review of a previously diagnosed eczema or psoriasis flare, with an Irish GP."
  ]
};

const PAGES = [
  {
    url: '/', file: 'index.html', crumb: 'Home', priority: 1.0, changefreq: 'weekly', image: SOCIAL,
    title: 'GP4U | See a GP Online in Ireland — One tap. Real care.',
    description: 'See an Irish-registered GP online by video or phone, from anywhere in Ireland, 7 days a week. Our new walk-in GP clinic in Newbridge, Co. Kildare is opening soon.',
    whenOpen: {
      title: 'GP4U | Online GP & Walk-In GP Clinic in Newbridge, Kildare',
      description: 'Online GP consultations across Ireland, and a walk-in GP clinic in Newbridge, Co. Kildare — no appointment needed. Ongoing family GP care too.',
    },
  },
  {
    url: '/online-gp/', file: 'online.html', crumb: 'Online GP', parent: '/', priority: 0.95, image: SOCIAL,
    title: 'Online GP Ireland | Video & Phone GP Consultations | GP4U',
    description: 'See a GP online from anywhere in Ireland. Book a video or phone consultation with an Irish-registered GP, with prescriptions and sick certs where appropriate. Prices shown upfront.',
  },
  {
    url: '/walk-in-gp-newbridge/', file: 'walk-in.html', crumb: 'Walk-in GP Newbridge', parent: '/', priority: 0.95, image: SOCIAL,
    title: 'Walk-In GP Clinic Newbridge, Co. Kildare — Opening Soon | GP4U',
    description: 'A new GP4U walk-in GP clinic is opening soon in Newbridge, Co. Kildare. Get opening news by email, and see a GP online from anywhere in Ireland in the meantime.',
    whenOpen: {
      title: 'Walk-In GP Newbridge, Co. Kildare | No Appointment Needed | GP4U',
      description: 'Walk-in GP clinic in Newbridge, Co. Kildare, open seven days a week. No appointment needed — come in during opening hours or check in online. Hours, services and what to expect.',
      image: SOCIAL_CLINIC,
    },
  },
  {
    url: '/family-gp/', file: 'new-patients.html', crumb: 'Family GP', parent: '/', priority: 0.9, image: SOCIAL,
    title: 'Family GP Newbridge — Register Your Interest | GP4U',
    description: 'GP4U’s family practice opens with our new clinic in Newbridge, Co. Kildare. Register your interest for you and your family now — and see a GP online in the meantime.',
    whenOpen: {
      title: 'Family GP Newbridge | Register with GP4U, Co. Kildare',
      description: 'Register with GP4U’s family practice in Newbridge, Co. Kildare for ongoing GP care for you and your family, from babies to older adults. Add up to eight family members in one online form.',
      image: SOCIAL_CLINIC,
    },
  },
  {
    url: '/services/', file: 'services.html', crumb: 'Services', parent: '/', priority: 0.85, image: SOCIAL,
    title: 'GP Services Online & in Newbridge | GP4U',
    description: 'GP4U services: online GP consultations by video or phone across Ireland — advice, prescriptions, sick certs and referrals where appropriate — with a new clinic opening soon in Newbridge, Co. Kildare.',
    whenOpen: {
      title: 'GP Services in Newbridge & Online | GP4U',
      description: 'GP services at GP4U: walk-in care in Newbridge, Co. Kildare, family GP care, women’s, men’s and children’s health, prescriptions, certificates, referrals and online consultations.',
    },
  },
  {
    url: '/fees/', file: 'fees.html', crumb: 'Fees', parent: '/', priority: 0.85, image: SOCIAL,
    title: 'GP4U Fees | Online GP Consultation Prices',
    description: 'See the price of every GP4U online GP consultation before you book. Fees for our new Newbridge clinic will be published before it opens.',
    whenOpen: {
      title: 'GP4U Fees | Online GP & Walk-In GP Prices',
      description: 'See the price of every GP4U online consultation before you book, and how to find out walk-in clinic and family GP fees in Newbridge, Co. Kildare.',
    },
  },
  {
    url: '/about/', file: 'about.html', crumb: 'About', parent: '/', priority: 0.7, image: SOCIAL,
    title: 'About GP4U | Irish Online GP Service',
    description: 'GP4U is a GP-led Irish service: online GP consultations across Ireland from doctors registered with the Medical Council, with a new walk-in clinic opening soon in Newbridge, Co. Kildare.',
    whenOpen: {
      title: 'About GP4U | Irish Online & Walk-In GP Service',
      description: 'GP4U is a GP-led service: a walk-in clinic and family practice in Newbridge, Co. Kildare, with online GP consultations across Ireland from doctors registered with the Medical Council.',
    },
  },
  {
    url: '/faq/', file: 'faq.html', crumb: 'FAQs', parent: '/', priority: 0.8, image: SOCIAL,
    title: 'GP4U FAQs | Online GP, Prescriptions & Our Newbridge Clinic',
    description: 'Answers to common questions about GP4U: online GP consultations, prescriptions, sick certs, fees, privacy, and our new walk-in clinic opening soon in Newbridge.',
    whenOpen: {
      title: 'GP4U FAQs | Online GP, Walk-In Clinic & Family GP',
      description: 'Answers to common questions about GP4U: online GP consultations, the Newbridge walk-in clinic, registering as a family patient, prescriptions, sick certs, fees and privacy.',
    },
  },
  {
    url: '/contact/', file: 'contact.html', crumb: 'Contact', parent: '/', priority: 0.8, image: SOCIAL,
    title: 'Contact GP4U | Online GP Ireland & Newbridge Clinic',
    description: 'Contact GP4U: email, how to see a GP online from anywhere in Ireland, and news about our new walk-in GP clinic opening soon in Newbridge, Co. Kildare.',
    whenOpen: {
      title: 'Contact GP4U | Walk-In GP Clinic, Newbridge, Co. Kildare',
      description: 'Contact GP4U Clinic in Newbridge, Co. Kildare: opening hours, email, and how to see a GP in person at the walk-in clinic or online from home.',
    },
  },
  {
    url: '/online-gp/repeat-prescription/', file: 'repeat-prescription.html', crumb: 'Repeat prescriptions', parent: '/online-gp/', priority: 0.85, image: SOCIAL,
    title: 'Repeat Prescription Online in Ireland | GP4U',
    description: 'Request a repeat prescription online from a GP registered with the Medical Council. Choose your condition, answer a few safety questions and pick a time.',
  },
  ...CONDITIONS.map(([slug, file, crumb]) => ({
    url: `/online-gp/${slug}/`, file, crumb, parent: '/online-gp/', priority: 0.7, image: SOCIAL,
    title: CONDITION_META[file][0], description: CONDITION_META[file][1],
  })),
  {
    url: '/privacy/', file: 'privacy.html', crumb: 'Privacy notice', parent: '/', priority: 0.3, changefreq: 'yearly', image: SOCIAL,
    title: 'Privacy & GDPR Notice | GP4U',
    description: 'How GP4U collects, uses, and protects your personal and health information, and your rights under GDPR.',
  },
  // Booking steps: useful to patients, not search landing pages — noindex, left out of the sitemap.
  {
    url: '/book/', file: 'book-now.html', crumb: 'Book a GP', parent: '/', index: false, image: SOCIAL,
    title: 'Book a GP Online | GP4U',
    description: 'Book an online GP consultation with GP4U by video or phone. Our new walk-in clinic in Newbridge, Co. Kildare is opening soon.',
    whenOpen: {
      title: 'Book a GP — Online or at the Walk-In Clinic | GP4U',
      description: 'Choose how to see a GP4U doctor: an online GP consultation from home, or the walk-in clinic in Newbridge, Co. Kildare.',
    },
  },
  {
    url: '/book.html', file: 'book.html', crumb: 'Book online', parent: '/online-gp/', index: false, keepUrl: true, image: SOCIAL,
    title: 'Book an Online GP Consultation | GP4U',
    description: 'Book an online GP consultation with GP4U: choose a service, answer a few questions, pick a time and pay securely.',
  },
];

PAGES.forEach((p) => { if (p.index === undefined) p.index = true; });
const BY_URL = new Map(PAGES.map((p) => [p.url, p]));
const BY_FILE = new Map(PAGES.map((p) => [p.file, p]));

// Old address -> new address (301). Every page's old /<file> address, plus /index.html.
const REDIRECTS = new Map();
PAGES.forEach((p) => { if (!p.keepUrl && `/${p.file}` !== p.url) REDIRECTS.set(`/${p.file}`, p.url); });

// Where a public .html link should now point (used to rewrite links in pages, scripts and FAQ answers).
const urlFor = (file) => (BY_FILE.get(file) || {}).url || `/${file}`;

function crumbsFor(page) {
  const chain = [];
  for (let p = page; p; p = p.parent ? BY_URL.get(p.parent) : null) chain.unshift(p);
  return chain;
}

module.exports = { ORIGIN, PAGES_DIR, PUBLIC_DIR, pagePath, PAGES, BY_URL, BY_FILE, REDIRECTS, CONDITIONS, urlFor, crumbsFor };
