/*
 * What an admin can edit on the public website — one list, used by three things:
 *   - scripts/tag-cms.js marks the matching element on each page (data-cms="key") and FAILS if the page's real
 *     text no longer equals the default written here, so this list and the pages can never drift apart;
 *   - the admin "Website" editor (which shows these defaults and the current override);
 *   - the server, which only accepts keys that are in this list.
 *
 * TEXT:   { key, page, group, label, text (the default), nth (which matching element on that page, from 0), long }
 * IMAGES: { slot, label, group, pages: [...], src (a substring of the picture's file name), nth, hint }
 *
 * Deliberately NOT editable: the emergency notice, the "No appointment is required" explanation, and legal/privacy
 * text — wording that must stay exactly as reviewed. Change those in the code, not from the admin screen.
 */
const T = (key, page, group, label, text, extra = {}) => ({ key, page, group, label, text, nth: 0, long: false, ...extra });

const TEXT = [
  // ---------------------------------------------------------------- Home page
  T('home.pill', 'index.html', 'Home page', 'Small tag above the headline', 'GP4U Clinic · Newbridge, Co. Kildare'),
  T('home.hero.title', 'index.html', 'Home page', 'Main headline', 'GP care, when you need it.'),
  T('home.hero.lead', 'index.html', 'Home page', 'Sentence under the headline', 'A walk-in clinic and comprehensive family practice in Newbridge — plus online GP consultations from home.', { long: true }),
  T('home.btn.online', 'index.html', 'Home page', 'Top button 1', 'Online GP'),
  T('home.btn.walkin', 'index.html', 'Home page', 'Top button 2', 'Walk-In Clinic'),
  T('home.btn.register', 'index.html', 'Home page', 'Top button 3', 'Register with GP'),
  T('home.chip.1', 'index.html', 'Home page', 'Trust chip 1', 'Irish-registered GPs'),
  T('home.chip.2', 'index.html', 'Home page', 'Trust chip 2', 'Open 7 days'),
  T('home.chip.3', 'index.html', 'Home page', 'Trust chip 3', 'No appointment needed at the clinic'),
  T('home.chip.4', 'index.html', 'Home page', 'Trust chip 4', 'Private & secure'),
  T('home.hours.walkin.title', 'index.html', 'Home page', 'Walk-in hours box: title', 'Walk-in clinic hours'),
  T('home.hours.walkin.note', 'index.html', 'Home page', 'Walk-in hours box: note', 'No appointment needed. Hours may differ on public holidays.'),
  T('home.hours.online.title', 'index.html', 'Home page', 'Online GP box: title', 'Online GP', { nth: 1 }),
  T('home.help.title', 'index.html', 'Home page', 'Three cards: heading', 'How can we help you today?'),
  T('home.card.online.title', 'index.html', 'Home page', 'Online card: title', 'I want to speak to a GP online'),
  T('home.card.online.sub', 'index.html', 'Home page', 'Online card: line under title', 'Video or phone · anywhere in Ireland'),
  T('home.card.online.go', 'index.html', 'Home page', 'Online card: link text', 'Online GP', { nth: 2 }),
  T('home.card.walkin.title', 'index.html', 'Home page', 'Walk-in card: title', 'I need to see a GP today'),
  T('home.card.walkin.sub', 'index.html', 'Home page', 'Walk-in card: line under title', 'Walk-in clinic · Newbridge · No appointment needed'),
  T('home.card.walkin.go', 'index.html', 'Home page', 'Walk-in card: link text', 'Visit the walk-in clinic'),
  T('home.card.register.title', 'index.html', 'Home page', 'Register card: title', 'I want to register with GP4U'),
  T('home.card.register.sub', 'index.html', 'Home page', 'Register card: line under title', 'Comprehensive family practice · register your family'),
  T('home.card.register.go', 'index.html', 'Home page', 'Register card: link text', 'Register with GP', { nth: 1 }),
  T('home.trust.1', 'index.html', 'Home page', 'Trust bar 1', 'GP-led care'),
  T('home.trust.2', 'index.html', 'Home page', 'Trust bar 2', 'Irish-registered doctors'),
  T('home.trust.3', 'index.html', 'Home page', 'Trust bar 3', 'In-person & online'),
  T('home.trust.4', 'index.html', 'Home page', 'Trust bar 4', 'Clear pricing'),
  T('home.trust.5', 'index.html', 'Home page', 'Trust bar 5', 'Secure & private'),
  T('home.how.eyebrow', 'index.html', 'Home page', 'How it works: small heading', 'Walk-in clinic'),
  T('home.how.title', 'index.html', 'Home page', 'How it works: heading', 'How it works'),
  T('home.how.1.title', 'index.html', 'Home page', 'Step 1: title', 'Walk in or check in online'),
  T('home.how.1.text', 'index.html', 'Home page', 'Step 1: text', "Come in during opening hours, or let us know you're on your way.", { long: true }),
  T('home.how.2.title', 'index.html', 'Home page', 'Step 2: title', 'Check in at reception'),
  T('home.how.2.text', 'index.html', 'Home page', 'Step 2: text', "Give our team your details and tell us why you're here.", { long: true }),
  T('home.how.3.title', 'index.html', 'Home page', 'Step 3: title', 'See a GP'),
  T('home.how.3.text', 'index.html', 'Home page', 'Step 3: text', 'Your GP will assess you and, where needed, arrange prescriptions, certificates or referrals.', { long: true }),
  T('home.banner.title', 'index.html', 'Home page', 'Photo card: title', 'Real people. Real care.'),
  T('home.banner.text', 'index.html', 'Home page', 'Photo card: text', 'GP care for you and your family, close to home in Newbridge.', { long: true }),
  T('home.banner.btn', 'index.html', 'Home page', 'Photo card: button', 'About GP4U'),
  T('home.panel.eyebrow', 'index.html', 'Home page', 'Family panel: small heading', 'Comprehensive family practice'),
  T('home.panel.title', 'index.html', 'Home page', 'Family panel: heading', 'Family care, for every stage.'),
  T('home.panel.text', 'index.html', 'Home page', 'Family panel: text', 'Join our family practice in Newbridge for ongoing, joined-up GP care — not just one-off visits.', { long: true }),
  T('home.panel.b1', 'index.html', 'Home page', 'Family panel: bullet 1', 'Register your whole family in one go — up to eight people'),
  T('home.panel.b2', 'index.html', 'Home page', 'Family panel: bullet 2', 'Ongoing care and reviews for long-term conditions'),
  T('home.panel.b3', 'index.html', 'Home page', 'Family panel: bullet 3', 'One record across your walk-in and online visits'),
  T('home.panel.b4', 'index.html', 'Home page', 'Family panel: bullet 4', 'Takes just a few minutes'),
  T('home.panel.btn', 'index.html', 'Home page', 'Family panel: button', 'Register with GP', { nth: 2 }),
  T('home.find.eyebrow', 'index.html', 'Home page', 'Find us: small heading', 'Find us'),
  T('home.find.title', 'index.html', 'Home page', 'Find us: heading', 'Visit our clinic in Newbridge'),
  T('home.cta.title', 'index.html', 'Home page', 'Bottom band: heading', 'GP care when you need it.'),
  T('home.cta.text', 'index.html', 'Home page', 'Bottom band: text', 'Walk in, see a GP online, or register your family.'),
  T('home.cta.btn.book', 'index.html', 'Home page', 'Bottom band: button 1', 'Book a GP'),
  T('home.cta.btn.register', 'index.html', 'Home page', 'Bottom band: button 2', 'Register with GP', { nth: 3 }),

  // ---------------------------------------------------------------- Walk-in clinic page
  T('walkin.eyebrow', 'walk-in.html', 'Walk-in clinic page', 'Small heading', 'Walk-in clinic'),
  T('walkin.title', 'walk-in.html', 'Walk-in clinic page', 'Headline', 'See a GP today. No appointment needed.'),
  T('walkin.lead', 'walk-in.html', 'Walk-in clinic page', 'Sentence under the headline', "Come in any day of the week during opening hours — or check in online so we know you're on your way.", { long: true }),
  T('walkin.btn1', 'walk-in.html', 'Walk-in clinic page', 'Button 1', 'Check in online'),
  T('walkin.btn2', 'walk-in.html', 'Walk-in clinic page', 'Button 2', 'Opening hours'),

  // ---------------------------------------------------------------- Online GP page
  T('online.eyebrow', 'online.html', 'Online GP page', 'Small heading', 'Online GP'),
  T('online.title', 'online.html', 'Online GP page', 'Headline', 'See a GP online, from anywhere in Ireland.'),
  T('online.lead', 'online.html', 'Online GP page', 'Sentence under the headline', 'GP4U connects you with Irish-registered GPs for video and phone consultations, repeat prescriptions and sick certs — quick to book, no waiting room.', { long: true }),
  T('online.btn1', 'online.html', 'Online GP page', 'Button 1', 'Book an Online GP Consultation'),
  T('online.btn2', 'online.html', 'Online GP page', 'Button 2', 'Request a repeat prescription'),
  T('online.how.title', 'online.html', 'Online GP page', 'How it works: heading', 'Your online consultation, step by step'),
  T('online.how.1.title', 'online.html', 'Online GP page', 'Step 1: title', 'Choose a service'),
  T('online.how.1.text', 'online.html', 'Online GP page', 'Step 1: text', 'Video, phone, repeat prescription or a sick cert.', { long: true }),
  T('online.how.2.title', 'online.html', 'Online GP page', 'Step 2: title', "Tell us what's going on"),
  T('online.how.2.text', 'online.html', 'Online GP page', 'Step 2: text', 'A short, private questionnaire so your GP is prepared before you speak.', { long: true }),
  T('online.how.3.title', 'online.html', 'Online GP page', 'Step 3: title', 'Pick a time & pay securely'),
  T('online.how.3.text', 'online.html', 'Online GP page', 'Step 3: text', 'Choose a slot that suits you and pay by card — processed securely by Stripe.', { long: true }),
  T('online.how.4.title', 'online.html', 'Online GP page', 'Step 4: title', 'Have your consultation'),
  T('online.how.4.text', 'online.html', 'Online GP page', 'Step 4: text', 'Join your private video or phone call from your confirmation page.', { long: true }),

  // ---------------------------------------------------------------- Services page
  T('services.eyebrow', 'services.html', 'Services page', 'Small heading', 'Our services'),
  T('services.title', 'services.html', 'Services page', 'Headline', 'How can we help?'),
  T('services.lead', 'services.html', 'Services page', 'Sentence under the headline', 'Everyday illness and the ongoing care your family needs — at our walk-in clinic in Newbridge, or online from home.', { long: true }),
  T('services.btn1', 'services.html', 'Services page', 'Button 1', 'Walk-In Clinic'),
  T('services.btn2', 'services.html', 'Services page', 'Button 2', 'See a GP Online'),

  // ---------------------------------------------------------------- About page
  T('about.eyebrow', 'about.html', 'About page', 'Small heading', 'About GP4U'),
  T('about.title', 'about.html', 'About page', 'Headline', 'Built by a GP. Designed around patients.'),
  T('about.lead', 'about.html', 'About page', 'Sentence under the headline', 'GP4U was set up by a practising Irish GP to make everyday GP care more convenient — without losing the careful, personal approach of a good family doctor.', { long: true }),
  T('about.btn1', 'about.html', 'About page', 'Button 1', 'Walk-In Clinic'),
  T('about.btn2', 'about.html', 'About page', 'Button 2', 'See a GP Online'),

  // ---------------------------------------------------------------- Register page
  T('register.eyebrow', 'new-patients.html', 'Register page', 'Small heading', 'Comprehensive family practice'),
  T('register.title', 'new-patients.html', 'Register page', 'Headline', 'Join our comprehensive family practice'),
  T('register.lead', 'new-patients.html', 'Register page', 'Sentence under the headline', 'Register with GP4U Clinic for continuing care for you and your whole family — from babies and children to older adults.', { long: true }),
  T('register.btn1', 'new-patients.html', 'Register page', 'Button 1', 'Start registration'),
  T('register.btn2', 'new-patients.html', 'Register page', 'Button 2', 'Need to be seen today?'),

  // ---------------------------------------------------------------- Fees / FAQ / Contact / Book a GP
  T('fees.eyebrow', 'fees.html', 'Fees page', 'Small heading', 'Fees'),
  T('fees.title', 'fees.html', 'Fees page', 'Headline', 'Clear prices, shown before you book'),
  T('fees.lead', 'fees.html', 'Fees page', 'Sentence under the headline', 'See exactly what an online consultation costs. Prices are shown again before you pay.', { long: true }),
  T('faq.eyebrow', 'faq.html', 'FAQ page', 'Small heading', 'FAQs'),
  T('faq.title', 'faq.html', 'FAQ page', 'Headline', 'Frequently asked questions'),
  T('contact.eyebrow', 'contact.html', 'Contact page', 'Small heading', 'Contact'),
  T('contact.title', 'contact.html', 'Contact page', 'Headline', 'Contact GP4U Clinic'),
  T('contact.lead', 'contact.html', 'Contact page', 'Sentence under the headline', 'Everything you need to reach us or plan your visit.', { long: true }),
  T('booknow.eyebrow', 'book-now.html', 'Book a GP page', 'Small heading', 'Book a GP'),
  T('booknow.title', 'book-now.html', 'Book a GP page', 'Headline', 'How would you like to see a GP?'),
  T('booknow.lead', 'book-now.html', 'Book a GP page', 'Sentence under the headline', 'Choose online from home, or in person at our clinic in Newbridge.', { long: true }),
];

// ---------------------------------------------------------------- Pictures
const I = (slot, group, label, pages, src, extra = {}) => ({ slot, group, label, pages, src, nth: 0, hint: 'Landscape photo, at least 1400 pixels wide (JPG, PNG or WebP, up to 4 MB).', ...extra });
const IMAGES = [
  I('home.hero', 'Home page', 'Top of the home page (large photo on the right)', ['index.html'], 'clinic-room.jpg'),
  I('home.card.online', 'Home page', 'Online GP card', ['index.html'], 'online-gp-home.jpg'),
  I('home.card.walkin', 'Home page', 'Walk-in clinic card', ['index.html'], 'walk-in-consult.jpg'),
  I('home.card.register', 'Home page', 'Register card', ['index.html'], 'gp-family-exam.jpg', { hint: 'Faces should be in the upper half of the photo; it is cropped wide (JPG, PNG or WebP, up to 4 MB).' }),
  I('home.banner', 'Home page', '"Real people. Real care." photo', ['index.html'], 'mother-baby.webp', { hint: 'Light left side works best, because text sits over it (JPG, PNG or WebP, up to 4 MB).' }),
  I('home.panel', 'Home page', 'Family care panel photo', ['index.html'], 'family-sofa.webp'),
  I('page.walkin', 'Other pages', 'Walk-in clinic page header', ['walk-in.html'], 'walk-in-consult.jpg'),
  I('page.online', 'Other pages', 'Online GP page header', ['online.html'], 'online-gp-home.jpg'),
  I('page.services', 'Other pages', 'Services page header', ['services.html'], 'gp-family-exam.jpg'),
  I('page.about', 'Other pages', 'About page header', ['about.html'], 'clinic-room.jpg'),
  I('page.register', 'Other pages', 'Register page header', ['new-patients.html'], 'family-sofa.webp'),
  I('page.simple', 'Other pages', 'Fees, FAQs, Contact and Book a GP page headers (shared photo)', ['fees.html', 'faq.html', 'contact.html', 'book-now.html'], 'clinic-room.jpg'),
];

const TEXT_BY_KEY = new Map(TEXT.map((t) => [t.key, t]));
const IMAGE_BY_SLOT = new Map(IMAGES.map((i) => [i.slot, i]));

module.exports = { TEXT, IMAGES, TEXT_BY_KEY, IMAGE_BY_SLOT };
