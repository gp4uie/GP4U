#!/usr/bin/env node
/*
 * GP4U end-to-end tests — drives a real Chrome browser like a patient and a doctor would.
 * No dependencies: talks to Chrome over the DevTools protocol (Node 22+, Chrome installed).
 *
 *   node scripts/e2e.js                       full run against http://localhost:4000 (needs the app + database running)
 *   node scripts/e2e.js --live https://www.gp4u.ie
 *                                            safe subset for the live site: pages, links, navigation and the two
 *                                            clinic forms (creates clearly-labelled "ZZ TEST" records)
 *
 * The full local run also needs a staff test account (create one in your LOCAL database only):
 *   E2E_DOCTOR_EMAIL=... E2E_DOCTOR_PASSWORD=... node scripts/e2e.js
 * Exit code is 0 when everything passes.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);
const LIVE = args.includes('--live');
const BASE = (args.find((a) => a.startsWith('http')) || 'http://localhost:4000').replace(/\/$/, '');
const DOCTOR_EMAIL = process.env.E2E_DOCTOR_EMAIL;
const DOCTOR_PASSWORD = process.env.E2E_DOCTOR_PASSWORD;
const STAMP = Date.now().toString().slice(-6);
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ----------------------------------------------------------------------------- tiny DevTools client
class Tab {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = new Map(); this.errors = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id); this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        (this.listeners.get(msg.method) || []).slice().forEach((fn) => fn(msg.params));
        if (msg.method === 'Runtime.exceptionThrown') this.errors.push('exception: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text).split('\n')[0]);
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') this.errors.push('console.error: ' + msg.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 160));
        if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') this.errors.push('log: ' + msg.params.entry.text + ' ' + (msg.params.entry.url || '').slice(0, 100));
      }
    });
  }
  send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++this.id; this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  once(method) { return new Promise((resolve) => { const fn = (p) => { this.listeners.set(method, (this.listeners.get(method) || []).filter((f) => f !== fn)); resolve(p); }; this.listeners.set(method, [...(this.listeners.get(method) || []), fn]); }); }
  async goto(url) { this.errors = []; const loaded = this.once('Page.loadEventFired'); await this.send('Page.navigate', { url: url.startsWith('http') ? url : BASE + url }); await Promise.race([loaded, sleep(20000)]); await sleep(700); }
  async ev(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n')[0]);
    return r.result.value;
  }
  async waitFor(expr, ms = 12000, label) { const t = Date.now(); let last; while (Date.now() - t < ms) { try { if (await this.ev(expr)) return true; } catch (e) { last = e.message; } await sleep(250); } throw new Error(`timed out waiting for: ${label || expr}${last ? ' (' + last + ')' : ''}`); }
  async clickNav(expr) { const loaded = this.once('Page.loadEventFired'); await this.ev(`(${expr}).click()`); await Promise.race([loaded, sleep(15000)]); await sleep(700); }
  set(sel, value) { return this.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error('no element ${sel.replace(/'/g, '')}'); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`); }
  async shot(name) {
    if (!process.env.E2E_SHOTS) return;
    fs.mkdirSync(process.env.E2E_SHOTS, { recursive: true });
    // scroll the whole page once so lazy-loaded pictures are fetched before the photo is taken
    await this.ev("(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); })()").catch(() => {});
    await this.ev("document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in'))").catch(() => {});
    await new Promise((res) => setTimeout(res, 800)); // let the scroll-reveal fades finish so the picture shows everything
    const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(process.env.E2E_SHOTS, name + '.png'), Buffer.from(r.data, 'base64'));
  }
  async mobile(on) {
    if (on) await this.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    else await this.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  }
}

async function launchChrome() {
  const candidates = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const exe = candidates.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('Chrome/Edge not found');
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gp4u-e2e-'));
  const proc = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-allow-origins=*', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`, '--window-size=1366,900', 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(500);
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
  }
  if (!target) throw new Error('could not reach Chrome');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const tab = new Tab(ws);
  await Promise.all(['Page', 'Runtime', 'Log', 'Network'].map((d) => tab.send(d + '.enable')));
  return { tab, close: () => { try { ws.close(); proc.kill(); } catch { /* ignore */ } } };
}

// ----------------------------------------------------------------------------- test plumbing
const results = [];
let section = '';
const heading = (t) => { section = t; console.log(`\n■ ${t}`); };
async function test(name, fn) {
  try { await fn(); results.push({ section, name, ok: true }); console.log(`  ✓ ${name}`); }
  catch (e) { results.push({ section, name, ok: false, err: e.message }); console.log(`  ✗ ${name}\n      → ${e.message}`); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const ctx = {};

// ----------------------------------------------------------------------------- the tests
async function main() {
  console.log(`GP4U end-to-end tests — ${LIVE ? 'LIVE SITE (safe subset)' : 'local full run'}\nTarget: ${BASE}   Stamp: ${STAMP}`);
  const res = await fetch(BASE + '/sitemap.xml').catch(() => null);
  if (!res || !res.ok) { console.error('Cannot reach ' + BASE + ' — is the app running?'); process.exit(2); }
  const sitemap = await res.text();
  const pages = [...new Set([...sitemap.matchAll(/<loc>https?:\/\/[^/]+(\/[^<]*)<\/loc>/g)].map((m) => m[1] || '/').concat(['/patient-login.html', '/reset-password.html']))];
  const { tab, close } = await launchChrome();
  const hrefs = new Set();

  try {
    // ---------------------------------------------------------------- 1. every public page, desktop + phone
    for (const [label, mobile] of (process.env.E2E_SKIP_PAGES ? [] : [['desktop 1366px', false], ['phone 390px', true]])) {
      heading(`Public pages — ${label} (${pages.length} pages)`);
      await tab.mobile(mobile);
      for (const p of pages) {
        await test(p, async () => {
          await tab.goto(p);
          const info = await tab.ev(`(() => { const d = document.documentElement; const nav = performance.getEntriesByType('navigation')[0];
            document.querySelectorAll('a[href^="/"]').forEach((a) => window.__h = (window.__h || new Set()).add(a.getAttribute('href')));
            return { status: nav && nav.responseStatus, title: document.title, h1: document.querySelectorAll('h1').length, main: !!document.querySelector('main#main'),
              overflow: d.scrollWidth - d.clientWidth, text: document.body.innerText, footerAddr: (document.querySelector('footer [data-clinic-address]') || {}).textContent,
              brokenImgs: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).map((i) => i.currentSrc.slice(-40)),
              styled: !document.body.classList.contains('clinic-page') || (getComputedStyle(document.body).backgroundColor === 'rgb(251, 247, 240)' && (!document.querySelector('.skip-link') || document.querySelector('.skip-link').getBoundingClientRect().bottom <= 0)),
              unversioned: [...document.querySelectorAll('link[rel=stylesheet][href^="/css/"], script[src^="/js/"]')].map((e) => e.getAttribute('href') || e.getAttribute('src')).filter((u) => !u.includes('?v=')),
              stickyOk: document.body.dataset.sticky === 'off' || !document.querySelector('.sticky-cta') || getComputedStyle(document.querySelector('.sticky-cta')).display !== 'none',
              hrefs: [...(window.__h || [])] }; })()`);
          if (p === '/') await tab.shot('home-' + (mobile ? 'phone' : 'desktop'));
          info.hrefs.forEach((h) => hrefs.add(h));
          assert(info.status === 200, 'HTTP ' + info.status);
          assert(info.title && info.title.length > 5, 'missing <title>');
          assert(info.h1 === 1, `expected exactly one <h1>, found ${info.h1}`);
          assert(info.main, 'missing <main id="main">');
          assert(info.overflow <= 1, `horizontal overflow of ${info.overflow}px`);
          assert(!/George Street/i.test(info.text), 'street name is visible');
          {
            const scrubbed = info.text.replace(/Address coming soon|Directions coming soon|very shortly/g, '');
            const bad = scrubbed.match(/coming soon|shortly|will be published|will be added|to be confirmed|TODO|lorem ipsum|Update this section|once confirmed|Patient reviews/i);
            assert(!bad, 'placeholder or drafting wording on this page: "' + (bad && bad[0]) + '"');
          }
          assert(!/book(ed)? in for (our |the )?walk-in|you.re booked in|walk-in appointment/i.test(info.text), 'old walk-in wording ("book in") is still on this page');
          if (info.footerAddr !== undefined) assert(info.footerAddr === 'Address coming soon', `footer address shows "${info.footerAddr}"`);
          assert(info.brokenImgs.length === 0, 'broken images: ' + info.brokenImgs.join(', '));
          assert(info.styled, 'page is not styled correctly (stylesheet missing/stale — "Skip to main content" would show at top left)');
          assert(info.unversioned.length === 0, 'CSS/JS links without a version stamp (browsers may show stale files): ' + info.unversioned.join(', ') + ' — run: npm run pages');
          if (mobile) assert(info.stickyOk, 'mobile booking bar is not visible');
          assert(tab.errors.length === 0, 'browser errors: ' + tab.errors.join(' | '));
        });
      }
    }
    await tab.mobile(false);

    // ---------------------------------------------------------------- 2. links
    heading('Links');
    await test(`every internal link (${hrefs.size} unique) works`, async () => {
      await tab.goto('/');
      const list = [...hrefs].filter((h) => !h.startsWith('/api/'));
      const bad = await tab.ev(`(async () => { const bad = []; for (const h of ${JSON.stringify(list)}) { const path = h.split('#')[0] || '/'; const r = await fetch(path); if (!r.ok) { bad.push(h + ' → ' + r.status); continue; }
        const anchor = h.split('#')[1]; if (anchor) { const t = await r.text(); if (!t.includes('id="' + anchor + '"')) bad.push(h + ' → anchor missing'); } } return bad; })()`);
      assert(bad.length === 0, bad.join('; '));
    });

    // ---------------------------------------------------------------- 3. navigation journeys
    heading('Navigation & patient pathways');
    await test('header: Book a GP button + Patient Login link, then choose online → online booking page', async () => {
      await tab.goto('/');
      assert(await tab.ev(`(() => { const nav = document.querySelector('nav.main-nav'); const b = [...nav.querySelectorAll('a.btn-primary')].find((a) => a.offsetParent !== null); const l = document.getElementById('patientLoginLink'); return !!b && b.textContent.trim() === 'Book a GP' && !!l && l.offsetParent !== null && l.textContent.trim() === 'Patient Login'; })()`), 'header should show a visible Book a GP button and a Patient Login link');
      assert(await tab.ev(`getComputedStyle(document.querySelector('.header-book')).display === 'none'`), 'the phone-only Book a GP button is showing on desktop (duplicate)');
      assert(await tab.ev(`document.querySelector('.brand').textContent.replace(/\\s+/g, ' ').trim() === 'GP4U Clinic'`), 'logo text should read "GP4U Clinic" with a single space');
      await tab.clickNav(`[...document.querySelectorAll('nav.main-nav a.btn-primary')].find((a) => a.offsetParent !== null)`);
      assert(await tab.ev('location.pathname') === '/book-now.html', 'Book a GP did not open /book-now.html');
      const both = await tab.ev(`!!([...document.querySelectorAll('a')].find((a) => /Book an Online GP Consultation/.test(a.textContent))) && !!([...document.querySelectorAll('a')].find((a) => /Visit the Walk-In Clinic/i.test(a.textContent)))`);
      assert(both, 'both options (online + walk-in) should be offered');
      await tab.clickNav(`[...document.querySelectorAll('main a')].find((a) => /Book an Online GP Consultation/.test(a.textContent))`);
      assert(await tab.ev('location.pathname') === '/book.html', 'did not reach /book.html');
      assert(await tab.ev(`/not an appointment at the clinic/i.test(document.body.innerText)`), 'booking page should say it is an online booking');
    });
    await test('Book a GP → walk-in option → optional online check-in form', async () => {
      await tab.goto('/book-now.html');
      await tab.clickNav(`[...document.querySelectorAll('main a')].find((a) => /Check in online/i.test(a.textContent))`);
      assert((await tab.ev('location.pathname + location.hash')) === '/walk-in.html#book-in', 'wrong destination');
      assert(await tab.ev(`!!document.getElementById('bookInForm')`), 'walk-in form missing');
    });
    await test('homepage: hero with three equal buttons (Online, Walk-in, Register), three photo columns', async () => {
      await tab.goto('/');
      const r = await tab.ev(`({ h1: document.querySelector('h1').textContent.trim(), ctas: [...document.querySelectorAll('.hero2-actions a')].map((a) => a.textContent.trim()), meta: (document.querySelector('.hero2-meta') || {}).textContent, cards: [...document.querySelectorAll('.need-card')].map((c) => c.querySelector('h3').textContent.trim() + ' | ' + c.querySelector('.need-go').textContent.trim() + ' | ' + c.getAttribute('href')), heading: (document.querySelector('#choose h2') || {}).textContent, tiles: document.querySelectorAll('.tile').length })`);
      assert(r.h1 === 'GP care, when you need it.', 'hero headline wrong: ' + r.h1);
      assert(r.ctas.join(' | ') === 'Online GP | Walk-In Clinic | Register with GP', 'hero actions wrong: ' + r.ctas.join(' | '));
      assert(await tab.ev(`[...document.querySelectorAll('.hero2-actions a')].every((a) => a.className === 'btn btn-primary btn-lg')`), 'the three hero buttons should look identical (equal importance)');
      assert(/Open 7 days/.test(r.meta) && /No appointment needed/.test(r.meta) && /Irish-registered GPs/.test(r.meta), 'hero details line wrong: ' + r.meta);
      assert(r.heading === 'How can we help you today?', 'central section heading wrong');
      assert(r.cards.length === 3 && r.cards[0].startsWith('I want to speak to a GP online | Online GP | /online.html') && r.cards[1].startsWith('I need to see a GP today | Visit the walk-in clinic | /walk-in.html') && r.cards[2].startsWith('I want to register with GP4U | Register with GP | /new-patients.html'), 'the three columns should be Online, Walk-in, Register (right): ' + r.cards.join(' || '));
      assert(await tab.ev(`[...document.querySelectorAll('.need-card')].every((c) => !!c.querySelector('img'))`), 'each column needs an image');
    });
    await test('homepage flow: trust bar, 01-02-03 steps, location — no services list, no FAQ', async () => {
      await tab.goto('/');
      await tab.waitFor(`document.querySelectorAll('[data-open-status]').length > 0 && !!document.querySelector('.loc .hours-table')`, 6000, 'location component');
      const r = await tab.ev(`({
        trust: [...document.querySelectorAll('.trustbar li')].map((li) => li.textContent.trim()),
        why: document.querySelector('#choose ~ section h2, .why-grid') ? [...document.querySelectorAll('.why-item h3')].map((h) => h.textContent.trim()) : [],
        whyHead: [...document.querySelectorAll('h2')].map((h) => h.textContent.trim()),
        services: [...document.querySelectorAll('#services .svc h3')].map((h) => h.textContent.trim()),
        steps: [...document.querySelectorAll('.timeline .tnum')].map((n) => n.textContent.trim()),
        online: (document.querySelector('.online-sec h2') || {}).textContent,
        onlineCta: [...document.querySelectorAll('.online-sec a.btn-primary')].map((a) => a.textContent.trim()),
        addr: (document.querySelector('.loc [data-clinic-address]') || {}).textContent,
        hoursRows: document.querySelectorAll('.loc .hours-table tr').length,
        faq: document.querySelectorAll('.faq details').length,
        band: [...document.querySelectorAll('.cta-band a.btn')].map((a) => a.textContent.trim()),
        explain: (document.querySelector('.explain') || {}).textContent,
      })`);
      assert(r.trust.length === 5 && /GP-led care/.test(r.trust[0]) && /Secure/.test(r.trust[4]), 'trust bar wrong: ' + r.trust.join(' | '));
      assert(r.services.length === 0 && !r.whyHead.includes('How can we help?'), 'the services list should not be on the homepage, got ' + r.services.length);
      assert(r.steps.join(',') === '01,02,03', 'how-it-works steps wrong: ' + r.steps.join(','));
      assert(/No appointment is required\./.test(r.explain) && /does not reserve a specific appointment time/.test(r.explain), 'walk-in explanation wording is missing');
      assert(r.addr === 'Address coming soon', 'location should say the address is coming soon: ' + r.addr);
      assert(r.hoursRows === 7, 'opening hours should list 7 days');
      assert(r.faq === 0, 'the FAQ should not be on the homepage, got ' + r.faq);
      assert(await tab.ev(`!document.querySelector('a[href="/blog.html"]')`), 'Health Info should not be in the navigation or footer');
    });
    await test('current page is marked in the navigation', async () => {
      await tab.goto('/fees.html');
      assert(await tab.ev(`document.querySelector('nav.main-nav a[aria-current="page"]')?.textContent.trim()`) === 'Fees', 'Fees link not marked current');
    });
    await test('Fees page shows live prices in euro (skeleton replaced) and a clean walk-in fees section', async () => {
      await tab.goto('/fees.html');
      await tab.waitFor(`document.querySelectorAll('.price-list[data-services] .price-row').length >= 5 && document.querySelectorAll('.skeleton').length === 0`, 8000, 'price rows');
      assert(await tab.ev(`document.querySelector('[data-if-no-fees]') !== null && /contact us|reception/i.test(document.querySelector('[data-if-no-fees]').textContent)`), 'walk-in fees section should ask people to contact the clinic');
      assert(await tab.ev(`/€\\d/.test(document.querySelector('.price-list').innerText)`), 'no € prices shown');
    });
    await test('About page: headline, no invented founder, Medical Council statement', async () => {
      await tab.goto('/about.html');
      const r = await tab.ev(`({ h1: document.querySelector('h1').textContent.trim(), founderHidden: document.querySelector('[data-founder]').hidden, text: document.body.innerText })`);
      assert(r.h1 === 'Built by a GP. Designed around patients.', 'about headline wrong: ' + r.h1);
      assert(r.founderHidden, 'founder card must stay hidden until real details are configured');
      assert(/registered with the Medical Council of Ireland/.test(r.text), 'medical leadership statement missing');
    });
    await test('Contact page: address status, hours, email, and "Need a GP?" choices', async () => {
      await tab.goto('/contact.html');
      const r = await tab.ev(`({ addr: document.querySelector('[data-clinic-address]').textContent, rows: document.querySelectorAll('.loc .hours-table tr').length, email: !!document.querySelector('.loc a[href^="mailto:"]'), ctas: [...document.querySelectorAll('.pcards a.btn')].map((a) => a.textContent.trim()), phoneHidden: document.querySelector('.loc .contact-item').hidden })`);
      assert(r.addr === 'Address coming soon' && r.rows === 7 && r.email, 'contact details incomplete: ' + JSON.stringify(r));
      assert(r.ctas.join(' | ') === 'Walk-In Clinic | See a GP Online', 'Need a GP? choices wrong');
      assert(r.phoneHidden, 'phone must stay hidden until configured (no invented number)');
    });
    await test('Privacy notice: no drafting language or unconfirmed retention figures', async () => {
      await tab.goto('/privacy.html');
      const t = await tab.ev('document.body.innerText');
      assert(!/Update this section|once confirmed|8 years|Article 9/i.test(t), 'privacy page still contains drafting language or unconfirmed specifics');
      assert(/Cookies/.test(t) && /Who we share it with/.test(t), 'privacy sections missing');
    });
    await test('services page: 12 cards with anchors; walk-in explanation on walk-in page', async () => {
      await tab.goto('/services.html');
      assert(await tab.ev(`document.querySelectorAll('.svc').length === 12 && !!document.getElementById('certificates')`), 'expected 12 service cards with anchors');
      await tab.goto('/walk-in.html');
      const t = await tab.ev('document.getElementById("book-in").innerText');
      assert(/Check in for your visit/.test(t) && /does not reserve a specific appointment time/.test(t), 'walk-in check-in wording wrong');
    });
    await test('reduced motion: no scroll-reveal is applied when the device asks for less motion', async () => {
      await tab.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await tab.goto('/');
      assert(await tab.ev(`document.querySelectorAll('.reveal').length === 0`), 'reveal animation should be disabled for reduced motion');
      await tab.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    });
    await test('FAQ page: 12 categories, accordions open, FAQ data present', async () => {
      await tab.goto('/faq.html');
      const r = await tab.ev(`({ groups: document.querySelectorAll('.faq-group').length, ld: !!document.querySelector('script[type="application/ld+json"]') && document.querySelector('script[type="application/ld+json"]').textContent.includes('FAQPage') })`);
      assert(r.groups === 12, 'expected 12 FAQ groups, got ' + r.groups);
      assert(r.ld, 'FAQPage structured data missing');
      await tab.ev(`document.querySelector('.faq details summary').click()`);
      assert(await tab.ev(`document.querySelector('.faq details').open`), 'accordion did not open');
      assert(await tab.ev(`/Monday to Friday/.test(document.querySelector('[data-clinic-hours-text]').textContent)`), 'opening hours sentence missing');
    });
    await test('phone: menu opens, is announced, and closes with Escape; booking bar shown', async () => {
      await tab.mobile(true); await tab.goto('/');
      await tab.ev(`document.querySelector('.nav-toggle').click()`);
      assert(await tab.ev(`document.querySelector('.nav-toggle').getAttribute('aria-expanded') === 'true' && getComputedStyle(document.querySelector('nav.main-nav')).display !== 'none'`), 'menu did not open');
      await tab.ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
      assert(await tab.ev(`document.querySelector('.nav-toggle').getAttribute('aria-expanded') === 'false'`), 'Escape did not close menu');
      assert(await tab.ev(`getComputedStyle(document.querySelector('.sticky-cta')).display === 'flex'`), 'sticky booking bar missing');
      assert(await tab.ev(`(() => { const b = document.querySelector('.header-book'); const t = document.querySelector('.nav-toggle'); return getComputedStyle(b).display !== 'none' && b.textContent.trim() === 'Book a GP' && getComputedStyle(t).display !== 'none'; })()`), 'phone header should show the logo, a Book a GP button and the menu button');
      await tab.mobile(false);
    });

    // ---------------------------------------------------------------- 4. the two clinic forms
    heading('Clinic forms (walk-in booking + new-patient registration)');
    await test('walk-in form: availability follows opening hours, validation, emergency + consent checks', async () => {
      await tab.goto('/walk-in.html');
      const open = await tab.ev(`window.clinicStatus().open`);
      assert((await tab.ev(`document.getElementById('bookInFields').disabled`)) === !open, 'form availability does not match opening hours');
      await tab.ev(`document.getElementById('bookInFields').disabled = false`); // so this test also works when closed
      await tab.ev(`document.getElementById('bookInSubmit').click()`);
      assert(/required fields/i.test(await tab.ev(`document.getElementById('bookInError').textContent`)), 'no required-fields message');
      await tab.set('#wiName', 'ZZ TEST'); await tab.set('#wiDob', '1990-01-01'); await tab.set('#wiPhone', '000'); await tab.set('#wiReason', 'x');
      await tab.ev(`document.getElementById('bookInSubmit').click()`);
      assert(/not an emergency/i.test(await tab.ev(`document.getElementById('bookInError').textContent`)), 'emergency confirmation not enforced');
    });
    await test('walk-in form: submits and shows a reference', async () => {
      await tab.goto('/walk-in.html');
      await tab.ev(`document.getElementById('bookInFields').disabled = false`);
      ctx.walkinName = `ZZ TEST Walkin ${STAMP}`;
      await tab.set('#wiName', ctx.walkinName); await tab.set('#wiDob', '1990-01-01'); await tab.set('#wiPhone', '0000000000');
      await tab.set('#wiReason', 'TEST ONLY - please ignore <img src=x onerror="window.__xss=1">');
      await tab.ev(`document.getElementById('wiNotEmergency').checked = true; document.getElementById('wiConsent').checked = true; document.getElementById('bookInSubmit').click()`);
      try { await tab.waitFor(`!document.getElementById('bookInDone').hidden`, 12000, 'walk-in success panel'); }
      catch (e) { throw new Error(e.message + ' | form said: ' + await tab.ev(`document.getElementById('bookInError').textContent`).catch(() => '?')); }
      ctx.walkinRef = await tab.ev(`document.getElementById('bookInRef').textContent`);
      assert(/^WI-/.test(ctx.walkinRef), 'bad reference ' + ctx.walkinRef);
      assert(await tab.ev(`window.__xss === undefined`), 'script in the form text was executed');
    });
    await test('homepage: short, nothing repeated, Register present in hero, right-hand column and menu', async () => {
      await tab.goto('/');
      const r = await tab.ev(`({
        heroRegister: !!document.querySelector('.hero3 a[href="/new-patients.html"]'),
        rightColumn: (() => { const cards = [...document.querySelectorAll('.need-grid .need-card')]; return cards.length === 3 && cards[2].getAttribute('href') === '/new-patients.html'; })(),
        navRegister: !!document.querySelector('nav.main-nav a[href="/new-patients.html"]'),
        sections: document.querySelectorAll('main > section').length,
        removed: ['.why-grid', '.cta-band', '.online-sec', '.faq', '#services', '.family-feature'].filter((q) => document.querySelector(q)),
      })`);
      assert(r.heroRegister && r.rightColumn && r.navRegister, 'Register should be in the hero, the right-hand column and the menu: ' + JSON.stringify(r));
      assert(r.removed.length === 0 && r.sections <= 10, 'homepage still has repeated or removed sections: ' + JSON.stringify(r));
    });
    await test('homepage first screen (1366x680 laptop): photo, heading, text, buttons and chips are all visible without scrolling', async () => {
      await tab.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 680, deviceScaleFactor: 1, mobile: false });
      try {
        await tab.goto('/');
        await sleep(600);
        const r = await tab.ev(`(() => { const b = (q) => document.querySelector(q).getBoundingClientRect(); const chips = [...document.querySelectorAll('.hero3 .trust-chips li')].map((l) => l.getBoundingClientRect().bottom); return { vh: window.innerHeight, scrollY: window.scrollY, hero: b('.hero3').bottom, photo: b('.hero3-photo img').bottom, photoTop: b('.hero3-photo img').top, buttons: b('.hero3 .hero2-actions').bottom, chips: Math.max(...chips), h1: b('.hero3 h1').top }; })()`);
        assert(r.scrollY === 0 && r.hero <= r.vh + 1 && r.photo <= r.vh + 1 && r.buttons <= r.vh && r.chips <= r.vh && r.h1 > 0, 'the hero should fit the first screen: ' + JSON.stringify(r));
        if (process.env.E2E_SHOTS) { const p = await tab.send('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(process.env.E2E_SHOTS, { recursive: true }); fs.writeFileSync(path.join(process.env.E2E_SHOTS, 'home-first-screen.png'), Buffer.from(p.data, 'base64')); }
      } finally { await tab.mobile(false); }
    });
    await test('inner pages: the photo header is blended into the page (photo on the right, text clear of it) on every page', async () => {
      await tab.mobile(false);
      for (const p of ['/walk-in.html', '/online.html', '/services.html', '/about.html', '/new-patients.html', '/fees.html', '/faq.html', '/contact.html', '/book-now.html']) {
        await tab.goto(p);
        const r = await tab.ev(`(() => { const m = document.querySelector('.phero .phero-media'); const img = m && m.querySelector('img'); const h1 = document.querySelector('.phero h1'); if (!m || !h1) return null; const mr = m.getBoundingClientRect(); return { pos: getComputedStyle(m).position, loaded: img.complete && img.naturalWidth > 0, h1Right: h1.getBoundingClientRect().right, mediaLeft: mr.left, mediaW: mr.width, vw: window.innerWidth }; })()`);
        assert(r && r.pos === 'absolute' && r.loaded, p + ': should have a blended photo header: ' + JSON.stringify(r));
        assert(r.h1Right <= r.mediaLeft + 40, p + ': the heading runs into the photo: ' + JSON.stringify(r));
        if (process.env.E2E_SHOTS && ['/walk-in.html', '/contact.html', '/services.html'].includes(p)) { const c = await tab.send('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(process.env.E2E_SHOTS, { recursive: true }); fs.writeFileSync(path.join(process.env.E2E_SHOTS, 'hero-' + p.slice(1, -5) + '.png'), Buffer.from(c.data, 'base64')); }
      }
    });
    await test('homepage: walk-in clinic hours and online GP times are labelled and separate, nothing floats over the photo', async () => {
      await tab.goto('/');
      await tab.waitFor(`document.querySelectorAll('.hs-card [data-open-status]').length > 0 && !!document.querySelector('.hs-card .hs-row')`, 6000, 'hours strip');
      const r = await tab.ev(`({
        overlay: !!document.querySelector('.hero2-media .hero2-card'),
        cards: [...document.querySelectorAll('.hs-card')].map((c) => c.querySelector('.hs-title').textContent.trim() + ' :: ' + c.innerText.replace(/\\s+/g, ' ')),
        footerHours: [...document.querySelectorAll('.site-footer h4')].map((h) => h.textContent).join('|'),
        footerOnline: (document.querySelector('.footer-online') || {}).textContent,
        top: document.querySelector('.topbar [data-open-status]').textContent,
      })`);
      assert(!r.overlay, 'the hours card should not float over the hero photo');
      assert(r.cards.length === 2 && /^Walk-in clinic hours ::/.test(r.cards[0]) && /Mon–Fri/.test(r.cards[0]) && /^Online GP ::/.test(r.cards[1]), 'two separate, labelled hours cards expected: ' + r.cards.join(' || '));
      assert(!/Mon–Fri/.test(r.cards[1]), 'online GP card must not repeat the walk-in hours');
      assert(/Walk-in clinic hours/.test(r.footerHours) && /Online GP:/.test(r.footerOnline), 'footer should separate walk-in and online times: ' + r.footerHours + ' / ' + r.footerOnline);
      assert(/^Walk-in clinic/.test(r.top), 'the top bar status should say it is the walk-in clinic: ' + r.top);
    });
    await test('registration form has no medical card / GP Visit Card question', async () => {
      await tab.goto('/new-patients.html');
      const r = await tab.ev(`({ field: !!document.getElementById('medicalCard'), text: /medical card|gp visit card/i.test(document.getElementById('registerForm').innerText + document.getElementById('registerForm').innerHTML) })`);
      assert(!r.field && !r.text, 'the card question is still on the registration form: ' + JSON.stringify(r));
    });
    await test('registration: 5 steps with progress, validation, family, review, submit → reference', async () => {
      await tab.goto('/new-patients.html');
      const step = () => tab.ev(`document.getElementById('rpStep').textContent + ' | ' + document.getElementById('rpName').textContent`);
      assert(await step() === 'Step 1 of 5 | About you', 'should start at step 1 of 5: ' + await step());
      await tab.ev(`document.getElementById('regNext').click()`);
      assert(/required fields/i.test(await tab.ev(`document.getElementById('registerError').textContent`)), 'no required-fields message on step 1');
      assert(await step() === 'Step 1 of 5 | About you', 'must not advance with missing required fields');
      ctx.regName = `ZZ TEST Register ${STAMP}`;
      await tab.set('#fullName', ctx.regName); await tab.set('#dob', '1980-05-05'); await tab.set('#phone', '0000000000');
      await tab.set('#email', 'zz-test@example.invalid'); await tab.set('#address', 'TEST ADDRESS - please ignore');
      await tab.ev(`document.getElementById('regNext').click()`);
      assert(await step() === 'Step 2 of 5 | Health information', 'step 2 expected, got ' + await step());
      await tab.set('#allergies', 'ZZ TEST peanut allergy'); await tab.ev(`document.getElementById('regNext').click()`);
      assert(await step() === 'Step 3 of 5 | Next of kin', 'step 3 expected');
      await tab.ev(`document.getElementById('regBack').click()`);
      assert(await step() === 'Step 2 of 5 | Health information', 'Back should return to step 2');
      await tab.ev(`document.getElementById('regNext').click(); document.getElementById('regNext').click()`);
      assert(await step() === 'Step 4 of 5 | Family members', 'step 4 expected, got ' + await step());
      await tab.ev(`document.getElementById('addFamilyBtn').click(); document.querySelector('#familyRows .fm-name').value = 'ZZ TEST Kid'`);
      await tab.ev(`document.getElementById('regNext').click()`);
      assert(/name and a date of birth/i.test(await tab.ev(`document.getElementById('registerError').textContent`)), 'half-filled family row should be rejected');
      await tab.ev(`const r = document.getElementById('familyRows').children[0]; r.querySelector('.fm-name').value = 'ZZ TEST Kid'; r.querySelector('.fm-dob').value = '2018-01-01'; r.querySelector('.fm-rel').value = 'Son'; document.getElementById('regNext').click()`);
      assert(await step() === 'Step 5 of 5 | Review & submit', 'step 5 expected, got ' + await step());
      const review = await tab.ev(`document.getElementById('reviewList').innerText`);
      assert(review.includes(ctx.regName) && review.includes('ZZ TEST Kid'), 'review should list the details entered');
      assert(await tab.ev(`document.getElementById('rpBar').getAttribute('aria-valuenow')`) === '5', 'progress bar not updated');
      await tab.ev(`document.getElementById('registerSubmit').click()`);
      assert(/Privacy Notice/i.test(await tab.ev(`document.getElementById('registerError').textContent`)), 'consent not enforced');
      await tab.ev(`document.getElementById('consent').checked = true; document.getElementById('registerSubmit').click()`);
      try { await tab.waitFor(`!document.getElementById('registerDone').hidden`, 12000, 'registration success panel'); }
      catch (e) { throw new Error(e.message + ' | form said: ' + await tab.ev(`document.getElementById('registerError').textContent`).catch(() => '?')); }
      ctx.regRef = await tab.ev(`document.getElementById('registerRef').textContent`);
      assert(/^REG-/.test(ctx.regRef), 'bad reference ' + ctx.regRef);
    });

    if (LIVE) { console.log('\n(live mode: booking, staff and load tests are skipped — they would create real bookings / need staff logins)'); return; }

    // ---------------------------------------------------------------- 5. online booking journey (patient)
    heading('Patient journey: online booking → payment → confirmation → account');
    ctx.patientEmail = `zz-e2e-${STAMP}@example.invalid`; ctx.patientName = `ZZ E2E Patient ${STAMP}`; ctx.patientPass = 'E2e-Pass-12345';
    await test('choose a service, fill the questionnaire, pick a time, review', async () => {
      await tab.goto('/book.html');
      await tab.waitFor(`document.querySelectorAll('#serviceChoices .service-card').length >= 6 && document.querySelectorAll('#serviceChoices .skeleton').length === 0`, 8000, 'service cards (skeleton replaced)');
      assert(await tab.ev(`document.getElementById('bookingSummary').hidden && document.getElementById('progressNow').textContent.startsWith('Step 1 of 4')`), 'step 1 should show progress and no summary yet');
      await tab.ev(`[...document.querySelectorAll('#serviceChoices > *')].find((c) => /Phone Consultation/.test(c.textContent)).click()`);
      await tab.waitFor(`getComputedStyle(document.getElementById('step2')).display !== 'none'`, 6000, 'step 2');
      const sum = await tab.ev(`({ shown: !document.getElementById('bookingSummary').hidden, name: document.getElementById('bsName').textContent, price: document.getElementById('bsPrice').textContent, now: document.getElementById('progressNow').textContent, labels: [...document.querySelectorAll('.progress-steps li')].map((l) => l.textContent.trim()) })`);
      assert(sum.shown && sum.name === 'Online GP — Phone Consultation' && sum.price === '€35', 'booking summary wrong: ' + JSON.stringify(sum));
      assert(sum.now === 'Step 2 of 4 — Your details' && sum.labels.join('|') === 'Service|Your details|Date & time|Review & pay', 'progress indicator wrong: ' + JSON.stringify(sum));
      await tab.set('[name=patientName]', ctx.patientName); await tab.set('[name=patientDob]', '1985-03-04'); await tab.set('[name=patientPhone]', '0851112222');
      await tab.set('[name=patientEmail]', ctx.patientEmail); await tab.set('[name=reason]', 'E2E test consultation - please ignore');
      await tab.ev(`document.body.style.minHeight = '4500px'; window.scrollTo(0, 1500)`); // pretend the patient is far down the page
      assert(await tab.ev(`window.scrollY > 500`), 'test set-up: the page should be scrolled down');
      await tab.ev(`document.getElementById('step2ContinueBtn').click()`);
      await tab.waitFor(`getComputedStyle(document.getElementById('step3')).display !== 'none' && document.querySelectorAll('.slot-btn').length > 0`, 8000, 'time slots');
      assert(await tab.ev(`window.scrollY < 5`), 'choosing a time should start at the top of the page, but the page is at ' + await tab.ev(`window.scrollY`));
      await tab.ev(`window.scrollTo(0, 1500)`);
      await tab.ev(`document.querySelector('.slot-btn').click()`);
      await tab.waitFor(`getComputedStyle(document.getElementById('step4')).display !== 'none'`, 6000, 'review step');
      assert(await tab.ev(`window.scrollY < 5`), 'the review step should also start at the top of the page');
      await tab.ev(`document.body.style.minHeight = ''`);
      const review = await tab.ev(`document.getElementById('reviewCard').innerText`);
      assert(review.includes(ctx.patientName) && /€35/.test(review), 'review is missing patient name or price: ' + review.slice(0, 80));
    });
    await test('pay (demo mode) → confirmation page with booking details', async () => {
      await tab.clickNav(`document.getElementById('payBtn')`);
      try { await tab.waitFor(`location.pathname === '/confirmation.html' && getComputedStyle(document.getElementById('content')).display !== 'none'`, 12000, 'confirmation page'); }
      catch (e) { const pageErr = await tab.ev(`(document.getElementById('bookingError') || {}).textContent || ''`).catch(() => ''); throw new Error(e.message + (pageErr ? ' | booking page said: ' + pageErr : '') + ' | url: ' + await tab.ev('location.href').catch(() => '?')); }
      const q = await tab.ev(`Object.fromEntries(new URLSearchParams(location.search))`);
      ctx.bookingId = q.id; ctx.token = q.token;
      assert(ctx.bookingId && ctx.token, 'no booking id/token in URL');
      const details = await tab.ev(`document.getElementById('bookingDetails').innerText`);
      assert(details.includes(ctx.bookingId) && /paid/i.test(details), 'booking details should show the reference and a paid status: ' + details.replace(/\s+/g, ' ').slice(0, 100));
    });
    await test('patient sets a password, then can message the GP', async () => {
      await tab.waitFor(`getComputedStyle(document.getElementById('passwordBox')).display !== 'none'`, 6000, 'set-password box');
      await tab.set('#newPassword', ctx.patientPass);
      await tab.ev(`document.querySelector('#passwordBox button').click()`);
      await tab.waitFor(`fetch('/api/patient/me').then((r) => r.json()).then((m) => m.loggedIn)`, 6000, 'logged in after setting password');
      await tab.set('#messageInput', 'E2E: hello doctor, this is a test message');
      await tab.ev(`sendMessage()`);
      await tab.waitFor(`document.getElementById('messageThread').innerText.includes('E2E: hello doctor')`, 6000, 'message in thread');
    });
    await test('signed-in patient: header shows "My account", booking form is pre-filled, portal lists the booking', async () => {
      await tab.goto('/');
      assert(await tab.ev(`document.getElementById('patientLoginLink').hidden && !document.getElementById('patientPortalLink').hidden`), 'header did not swap to My account');
      await tab.goto('/book.html?service=general');
      await tab.waitFor(`document.querySelector('[name=patientName]').value !== ''`, 6000, 'pre-fill');
      assert(await tab.ev(`document.querySelector('[name=patientName]').value`) === ctx.patientName, 'name not pre-filled');
      await tab.goto('/patient-portal.html');
      await tab.waitFor(`document.getElementById('bookingsBody').innerText.toLowerCase().includes('general')`, 8000, 'booking in portal');
    });
    await test('log out, then log back in through the patient login page', async () => {
      await tab.ev(`fetch('/api/patient/logout', { method: 'POST' })`); await sleep(500);
      await tab.goto('/patient-login.html');
      await tab.set('#emailInput', ctx.patientEmail); await tab.set('#passwordInput', ctx.patientPass);
      await tab.clickNav(`[...document.querySelectorAll('button')].find((b) => /log in/i.test(b.textContent))`);
      assert((await tab.ev('location.pathname')).includes('patient-portal'), 'did not land in the portal, at ' + await tab.ev('location.pathname'));
      const wrong = await tab.ev(`fetch('/api/patient/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ${JSON.stringify(ctx.patientEmail)}, password: 'wrong-password' }) }).then((r) => r.status)`);
      assert(wrong === 401, 'wrong password should be rejected (got ' + wrong + ')');
    });
    await test('repeat-prescription pages: categories render, condition page links into booking', async () => {
      await tab.goto('/repeat-prescription.html');
      await tab.waitFor(`document.querySelectorAll('#categoriesContainer .service-card, #categoriesContainer a').length >= 5`, 8000, 'condition categories');
      await tab.goto('/uti.html');
      await tab.waitFor(`document.querySelectorAll('#contraindicationList li').length > 0`, 6000, 'safety list');
      await tab.goto('/book.html?service=uti');
      await tab.waitFor(`getComputedStyle(document.getElementById('step2')).display !== 'none'`, 8000, 'wizard step 2 for UTI');
      assert(await tab.ev(`getComputedStyle(document.getElementById('pharmacyRow')).display !== 'none'`), 'pharmacy field should be asked for prescriptions');
    });
    await test('simulated network failure shows a friendly message (no raw error)', async () => {
      await tab.ev(`fetch('/api/patient/logout', { method: 'POST' })`); await sleep(400);
      await tab.goto('/book.html?service=general');
      await tab.waitFor(`getComputedStyle(document.getElementById('step2')).display !== 'none'`, 8000, 'step 2');
      await tab.set('[name=patientName]', 'ZZ Offline'); await tab.set('[name=patientDob]', '1985-03-04'); await tab.set('[name=patientPhone]', '0851112222'); await tab.set('[name=patientEmail]', 'zz-offline@example.invalid'); await tab.set('[name=reason]', 'offline test');
      await tab.ev(`document.getElementById('step2ContinueBtn').click()`);
      await tab.waitFor(`document.querySelectorAll('.slot-btn').length > 0`, 8000, 'slots');
      await tab.ev(`document.querySelector('.slot-btn').click()`);
      await tab.waitFor(`getComputedStyle(document.getElementById('step4')).display !== 'none'`, 6000, 'step 4');
      await tab.ev(`window.fetch = () => Promise.reject(new TypeError('Failed to fetch')); document.getElementById('payBtn').click()`);
      await tab.waitFor(`document.getElementById('bookingError').textContent.length > 0`, 4000, 'error text');
      const msg = await tab.ev(`document.getElementById('bookingError').textContent`);
      assert(/internet connection/i.test(msg) && !/Failed to fetch/.test(msg), 'unfriendly message: ' + msg);
    });

    // ---------------------------------------------------------------- 6. staff journey (doctor)
    heading('Doctor journey: login → Clinic tab → consultation → patient sees the result');
    if (!DOCTOR_EMAIL || !DOCTOR_PASSWORD) { await test('doctor account available', async () => { throw new Error('set E2E_DOCTOR_EMAIL and E2E_DOCTOR_PASSWORD (a LOCAL test doctor)'); }); return; }
    await tab.send('Network.clearBrowserCookies');
    await test('staff pages are locked when logged out', async () => {
      await tab.goto('/');
      const codes = await tab.ev(`Promise.all(['/api/doctor/clinic/summary', '/api/doctor/clinic/walk-ins', '/api/doctor/clinic/registrations', '/api/doctor/recent'].map((u) => fetch(u).then((r) => r.status)))`);
      assert(codes.every((c) => c === 401), 'expected 401s, got ' + codes.join(','));
    });
    await test('doctor logs in through the dashboard', async () => {
      await tab.goto('/dashboard.html');
      await tab.set('#emailInput', DOCTOR_EMAIL); await tab.set('#passwordInput', DOCTOR_PASSWORD);
      await tab.ev(`document.querySelector('#loginBox button.btn-primary').click()`);
      await tab.waitFor(`getComputedStyle(document.getElementById('dashboardBox')).display !== 'none'`, 10000, 'dashboard');
    });
    await test('doctor dashboard: staff header, left menu with separate Online / Walk-in clinics, Today overview', async () => {
      const r = await tab.ev(`({ role: document.querySelector('.staff-role').textContent.trim(), publicNav: !!document.querySelector('a[href="/walk-in.html"]'), todayVisible: getComputedStyle(document.getElementById('tab_today')).display !== 'none', onlineHidden: getComputedStyle(document.getElementById('tab_online')).display === 'none', menu: [...document.querySelectorAll('.dash-link')].map((b) => b.textContent.trim().replace(/\\s+\\d+$/, '')) })`);
      assert(r.role === 'Doctor' && !r.publicNav, 'doctor header should be the staff header without the public menu: ' + JSON.stringify(r));
      assert(r.todayVisible && r.onlineHidden, 'the Today section should be the default');
      assert(r.menu.includes('Online clinic') && r.menu.includes('Walk-in clinic') && r.menu.includes('Find a patient') && r.menu.includes('Registrations'), 'menu should list the clinics separately: ' + r.menu.join(' | '));
      await tab.waitFor(`[...document.querySelectorAll('#tab_today .stat-num')].every((e) => /^\\d+$/.test(e.textContent)) && document.getElementById('tdQueue').innerText.includes(${JSON.stringify(ctx.walkinName)})`, 8000, 'Today overview with the walk-in in the queue');
      assert(await tab.ev(`!!([...document.querySelectorAll('#tdQueue button')].find((b) => /Open chart/.test(b.textContent))) && !!([...document.querySelectorAll('#tdQueue button')].find((b) => /Mark seen/.test(b.textContent)))`), 'quick "Open chart" and "Mark seen" actions should be available');
      assert(await tab.ev(`document.querySelector('#tdQueue img') === null`), 'patient text was rendered as HTML');
      const codes = await tab.ev(`Promise.all(['/api/reception/summary', '/api/reception/walk-ins', '/api/reception/registrations'].map((u) => fetch(u).then((r) => r.status)))`);
      assert(codes.every((c) => c === 401), 'a doctor session must not be accepted by the front-desk API: ' + codes.join(','));
      await tab.shot('doctor-today');
    });
    await test('every section opens on its own, at the top of the page — no scrolling to find it', async () => {
      for (const t of ['online', 'walkin', 'search', 'registrations', 'tasks', 'teammsg', 'security', 'today']) {
        await tab.ev(`window.scrollTo(0, 600); showTab('${t}')`); await sleep(300);
        const r = await tab.ev(`(() => { const shown = [...document.querySelectorAll('[id^="tab_"]')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.id); const el = document.getElementById('tab_${t}'); return { shown, top: Math.round(el.getBoundingClientRect().top), scrollY: Math.round(window.scrollY), active: document.getElementById('tabBtn_${t}').classList.contains('active'), h: window.innerHeight }; })()`);
        assert(r.shown.length === 1 && r.shown[0] === 'tab_' + t, t + ': only its own section should be showing, got ' + r.shown.join(','));
        assert(r.active && r.scrollY === 0 && r.top < r.h / 2, t + ': should open at the top and be visible immediately: ' + JSON.stringify(r));
      }
      await tab.ev(`showTab('online')`); await sleep(300); await tab.shot('doctor-online');
      await tab.ev(`showTab('walkin')`); await sleep(400); await tab.shot('doctor-walkin');
    });
    await test('doctor dashboard fits a phone: menu becomes a scrolling strip, no sideways scrolling in any section', async () => {
      await tab.mobile(true);
      try {
        for (const t of ['today', 'online', 'walkin', 'search', 'registrations']) {
          await tab.ev(`showTab('${t}')`); await sleep(400);
          const r = await tab.ev(`({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, dir: getComputedStyle(document.getElementById('mainTabBar')).flexDirection })`);
          assert(r.over <= 1 && r.dir === 'row', t + ' overflows or the menu is not a strip on a phone: ' + JSON.stringify(r));
        }
        await tab.shot('doctor-mobile-walkin');
      } finally { await tab.mobile(false); }
      await tab.ev(`showTab('today')`);
    });
    await test('Walk-in clinic: queue, escaped text, Open chart creates the walk-in chart (no call buttons), Mark seen', async () => {
      await tab.ev(`showTab('walkin')`);
      await tab.waitFor(`document.getElementById('walkInList').innerText.includes(${JSON.stringify(ctx.walkinName)})`, 8000, 'walk-in in queue');
      assert(await tab.ev(`document.querySelector('#walkInList img') === null`), 'patient text was rendered as HTML');
      const card = `[...document.querySelectorAll('#walkInList .queue-card')].find((c) => c.innerText.includes(${JSON.stringify(ctx.walkinName)}))`;
      await tab.ev(`[...${card}.querySelectorAll('button')].find((b) => /Open chart/.test(b.textContent)).click()`);
      await tab.waitFor(`getComputedStyle(document.getElementById('detailPanel')).display !== 'none' && document.getElementById('chartHeader').textContent === ${JSON.stringify(ctx.walkinName)}`, 10000, 'walk-in chart');
      const c = await tab.ev(`({ banner: document.getElementById('chartPatientMeta').innerText, callHidden: getComputedStyle(document.getElementById('joinCallBtn')).display === 'none', msgHidden: getComputedStyle(document.getElementById('chartTabBtn_messages')).display === 'none', img: !!document.querySelector('#detailPanel img'), xss: window.__xss === undefined, menuHidden: getComputedStyle(document.getElementById('dashApp')).display === 'none', back: document.getElementById('chartBackLabel').textContent })`);
      assert(/Walk-in/.test(c.banner) && /First visit/.test(c.banner), 'banner should show a walk-in, first visit: ' + c.banner);
      assert(c.callHidden && c.msgHidden, 'video/audio call and patient messaging do not apply to a walk-in');
      assert(!c.img && c.xss, 'patient text was rendered as HTML in the chart');
      assert(c.menuHidden && c.back === 'Walk-in clinic', 'chart should be full page with a Back link to the section it came from: ' + JSON.stringify(c));
      await tab.shot('doctor-walkin-chart');
      await tab.ev(`closeChart()`);
      await tab.waitFor(`getComputedStyle(document.getElementById('tab_walkin')).display !== 'none' && getComputedStyle(document.getElementById('dashApp')).display !== 'none'`, 5000, 'back on the walk-in clinic');
      await tab.waitFor(`${card}.innerText.includes('Arrived')`, 6000, 'status Arrived after opening the chart');
      await tab.ev(`[...${card}.querySelectorAll('button')].find((b) => /Mark seen/.test(b.textContent)).click()`);
      await tab.waitFor(`${card}.innerText.includes('Seen')`, 6000, 'status Seen');
      await tab.waitFor(`document.getElementById('walkinRecentBody').innerText.includes(${JSON.stringify(ctx.walkinName)}) && /Completed/.test(document.getElementById('walkinRecentBody').innerText)`, 8000, 'walk-in in recent visits, completed');
    });
    await test('Registrations section: family members, health info, website vs at-desk filter, mark processed', async () => {
      await tab.ev(`showTab('registrations')`);
      await tab.waitFor(`document.getElementById('registrationList').innerText.includes(${JSON.stringify(ctx.regName)})`, 8000, 'registration in list');
      const det = `[...document.querySelectorAll('#registrationList details')].find((d) => d.innerText.includes(${JSON.stringify(ctx.regName)}))`;
      await tab.ev(`${det}.open = true`);
      const text = await tab.ev(`${det}.innerText`);
      assert(/Family members \(1\)/.test(text) && text.includes('ZZ TEST Kid'), 'family member missing');
      assert(text.includes('TEST ADDRESS'), 'encrypted address did not decrypt for the doctor');
      await tab.ev(`document.querySelector('[data-regsource=desk]').click()`);
      assert(await tab.ev(`!document.getElementById('registrationList').innerText.includes(${JSON.stringify(ctx.regName)})`), 'a website registration should not be under "At desk"');
      await tab.ev(`document.querySelector('[data-regsource=all]').click()`);
      await tab.ev(`[...${det}.querySelectorAll('button')].find((b) => /Mark as processed/.test(b.textContent)).click()`);
      await tab.waitFor(`document.getElementById('registrationList').innerText.includes('Processed')`, 6000, 'status Processed');
    });
    await test('Online clinic: the booking is under Online (day list and Recent), not Walk-in; its chart opens with the patient message', async () => {
      await tab.ev(`showTab('online'); goToToday(); setOnlineView('day')`);
      let found = false;
      for (let i = 0; i < 15 && !found; i++) {
        await sleep(500);
        found = await tab.ev(`document.getElementById('onlineDay').innerText.includes(${JSON.stringify(ctx.patientName)})`);
        if (!found) await tab.ev(`changeDay(1)`);
      }
      assert(found, 'the online booking should be on a day of the Online clinic list');
      assert(await tab.ev(`document.getElementById('onlineDay').innerText.includes('E2E test consultation')`), 'the reason should show on the appointment card');
      const walkIn = await tab.ev(`fetch('/api/doctor/recent?type=walkin').then((r) => r.text())`);
      const online = await tab.ev(`fetch('/api/doctor/recent?type=online').then((r) => r.text())`);
      assert(!walkIn.includes(ctx.patientName) && online.includes(ctx.patientName), 'online and walk-in lists must be separate');
      assert(!(await tab.ev(`fetch('/api/doctor/recent?type=online').then((r) => r.text())`)).includes(ctx.walkinName), 'a walk-in appeared in the online list');
      await tab.ev(`setOnlineView('recent')`);
      await tab.waitFor(`document.getElementById('recentBody').innerText.includes(${JSON.stringify(ctx.patientName)})`, 8000, 'booking in recent online cases');
      await tab.ev(`[...document.querySelectorAll('#recentBody tr')].find((r) => r.innerText.includes(${JSON.stringify(ctx.patientName)})).click()`);
      await tab.waitFor(`getComputedStyle(document.getElementById('detailPanel')).display !== 'none' && document.getElementById('detailPanel').textContent.includes('E2E: hello doctor')`, 10000, 'chart with patient message');
      assert(await tab.ev(`getComputedStyle(document.getElementById('joinCallBtn')).display !== 'none' && getComputedStyle(document.getElementById('chartTabBtn_messages')).display !== 'none'`), 'call buttons and messaging should be there for an online consultation');
      await tab.shot('doctor-chart-online');
    });
    await test('doctor replies, records a note, issues a prescription and completes the consultation', async () => {
      const post = (url, body) => tab.ev(`fetch(${JSON.stringify(url)}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${JSON.stringify(body)}) }).then((r) => r.status)`);
      const id = ctx.bookingId;
      assert(await post(`/api/doctor/bookings/${id}/messages`, { body: 'E2E: doctor reply - test only' }) === 200, 'message failed');
      assert(await post(`/api/doctor/bookings/${id}/notes`, { noteText: 'E2E clinical note' }) === 200, 'note failed');
      assert(await post(`/api/doctor/bookings/${id}/prescriptions`, { medication: 'E2E Testazole', dose: '10mg', frequency: 'once daily', duration: '5 days', instructions: 'test only', quantity: '5' }) === 200, 'prescription failed');
      assert(await post(`/api/doctor/bookings/${id}/complete`, {}) === 200, 'complete failed');
      const notifs = await tab.ev(`fetch('/api/doctor/notifications').then((r) => r.json())`);
      assert(notifs.notifications.some((n) => n.booking_id === ctx.bookingId), 'no notification was raised for the new booking');
    });
    await test('patient (via their link) sees the reply and prescription, and the closed consultation locks messaging', async () => {
      await tab.send('Network.clearBrowserCookies');
      await tab.goto(`/confirmation.html?id=${ctx.bookingId}&token=${ctx.token}`);
      await tab.waitFor(`document.getElementById('messageThread').innerText.includes('E2E: doctor reply')`, 10000, 'doctor reply');
      await tab.waitFor(`document.getElementById('prescriptionList').innerText.includes('E2E Testazole')`, 10000, 'prescription');
      const code = await tab.ev(`fetch('/api/bookings/${ctx.bookingId}/messages?token=${ctx.token}', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: 'after close' }) }).then((r) => r.status)`);
      assert(code === 403, 'messaging should be closed after completion (got ' + code + ')');
      const wrong = await tab.ev(`fetch('/api/bookings/${ctx.bookingId}?token=wrong').then((r) => r.status)`);
      assert(wrong === 401 || wrong === 403, 'a wrong token must not open a booking (got ' + wrong + ')');
    });
    await test('doctor logs out and staff data is locked again', async () => {
      await tab.goto('/dashboard.html');
      await tab.set('#emailInput', DOCTOR_EMAIL); await tab.set('#passwordInput', DOCTOR_PASSWORD);
      await tab.ev(`document.querySelector('#loginBox button.btn-primary').click()`);
      await tab.waitFor(`getComputedStyle(document.getElementById('dashboardBox')).display !== 'none'`, 10000, 'dashboard');
      await tab.ev(`fetch('/api/doctor/logout', { method: 'POST' })`); await sleep(400);
      assert(await tab.ev(`fetch('/api/doctor/clinic/registrations').then((r) => r.status)`) === 401, 'staff data still reachable after logout');
    });

    // ---------------------------------------------------------------- 6b. front desk (receptionist) + admin-managed accounts
    heading('Front desk: receptionist role (health info + reasons visible, no clinical notes), walk-ins become bookings, desk registration, admin-managed accounts');
    const RECEPTION_EMAIL = process.env.E2E_RECEPTION_EMAIL; const RECEPTION_PASSWORD = process.env.E2E_RECEPTION_PASSWORD;
    const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL; const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
    const sendJson = (method, url, body) => tab.ev(`fetch(${JSON.stringify(url)}, { method: ${JSON.stringify(method)}, headers: { 'Content-Type': 'application/json' }, body: ${body === undefined ? 'undefined' : `JSON.stringify(${JSON.stringify(body)})`} }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }))`);
    const postJson = (url, body) => tab.ev(`fetch(${JSON.stringify(url)}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${JSON.stringify(body || {})}) }).then((r) => r.status)`);
    if (!RECEPTION_EMAIL || !RECEPTION_PASSWORD) {
      await test('reception test account available', async () => { throw new Error('set E2E_RECEPTION_EMAIL and E2E_RECEPTION_PASSWORD (a LOCAL test receptionist)'); });
    } else {
      await tab.send('Network.clearBrowserCookies');
      await test('front desk data is locked when signed out', async () => {
        await tab.goto('/reception.html');
        const codes = await tab.ev(`Promise.all(['/api/reception/summary', '/api/reception/walk-ins', '/api/reception/registrations', '/api/reception/schedule?date=2026-01-01'].map((u) => fetch(u).then((r) => r.status)))`);
        assert(codes.every((c) => c === 401), 'expected 401s, got ' + codes.join(','));
        assert(await tab.ev(`!document.getElementById('loginBox').hidden && document.getElementById('deskBox').hidden`), 'the sign-in form should be showing');
      });
      await test('wrong password is refused with a clear message', async () => {
        await tab.set('#emailInput', RECEPTION_EMAIL); await tab.set('#passwordInput', 'not-the-password');
        await tab.ev(`document.querySelector('#loginForm button[type=submit]').click()`);
        await tab.waitFor(`document.getElementById('loginError').textContent.length > 0`, 4000, 'error message');
        assert(/incorrect email or password/i.test(await tab.ev(`document.getElementById('loginError').textContent`)), 'unexpected message');
      });
      await test('receptionist signs in on the front-desk page', async () => {
        await tab.set('#passwordInput', RECEPTION_PASSWORD);
        await tab.ev(`document.querySelector('#loginForm button[type=submit]').click()`);
        await tab.waitFor(`!document.getElementById('deskBox').hidden`, 8000, 'front desk');
        const r = await tab.ev(`({ role: document.querySelector('.staff-role').textContent.trim(), who: document.getElementById('whoami').textContent, publicNav: !!document.querySelector('a[href="/walk-in.html"]'), stats: [...document.querySelectorAll('.stat-num')].map((e) => e.textContent) })`);
        assert(r.role === 'Front desk' && r.who.length > 0, 'staff header wrong: ' + JSON.stringify(r));
        assert(!r.publicNav, 'the staff header must not show the public website menu');
        await tab.waitFor(`[...document.querySelectorAll('.stat-num')].every((e) => /^\\d+$/.test(e.textContent))`, 6000, 'stat numbers');
        await tab.shot('reception-queue');
      });
      await test('walk-in queue: online check-in is listed (text escaped); a walk-in added at the desk becomes a booking and can be worked through', async () => {
        await tab.waitFor(`document.getElementById('queueList').innerText.includes(${JSON.stringify(ctx.walkinName)})`, 8000, 'online check-in in queue');
        assert(await tab.ev(`document.querySelector('#queueList img') === null`), 'patient text was rendered as HTML');
        // empty submit
        await tab.ev(`document.getElementById('addWalkin').open = true; document.querySelector('#addForm button[type=submit]').click()`);
        assert(/fill in name/i.test(await tab.ev(`document.getElementById('addError').textContent`)), 'no validation message');
        ctx.deskName = `ZZ TEST Desk ${STAMP}`;
        await tab.set('#addName', ctx.deskName); await tab.set('#addDob', '1975-03-03'); await tab.set('#addPhone', '0000000000'); await tab.set('#addReason', 'Desk walk-in chest pain test');
        await tab.ev(`document.querySelector('#addForm button[type=submit]').click()`);
        const card = `[...document.querySelectorAll('#queueList .queue-card')].find((c) => c.innerText.includes(${JSON.stringify(ctx.deskName)}))`;
        await tab.waitFor(`!!(${card}) && ${card}.innerText.includes('Arrived') && ${card}.innerText.includes('With doctor')`, 6000, 'desk walk-in shown as Arrived and with the doctor');
        const rows = await tab.ev(`fetch('/api/reception/walk-ins').then((r) => r.json())`);
        const mine = rows.find((r) => r.full_name === ctx.deskName);
        assert(mine && /^WALK-/.test(mine.booking_id || ''), 'the desk walk-in should be linked to a booking: ' + JSON.stringify(mine));
        ctx.deskBookingId = mine.booking_id; ctx.deskWalkinId = mine.id;
        // marking arrived again / seen must not create a second booking
        await tab.ev(`[...${card}.querySelectorAll('button')].find((b) => /Mark seen/.test(b.textContent)).click()`);
        await tab.waitFor(`${card}.innerText.includes('Seen')`, 6000, 'status Seen');
        const again = (await tab.ev(`fetch('/api/reception/walk-ins').then((r) => r.json())`)).find((r) => r.id === ctx.deskWalkinId);
        assert(again.booking_id === ctx.deskBookingId, 'the walk-in must keep the same single booking');
        await tab.waitFor(`document.getElementById('statWaiting').textContent !== '–'`, 4000, 'stats');
      });
      await test('history sync setup: the same person (who booked online) is also added as a walk-in at the desk', async () => {
        const r = await tab.ev(`fetch('/api/reception/walk-ins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName: ${JSON.stringify(ctx.patientName)}, dob: '1985-03-04', phone: '0851112222', reason: 'E2E earlier walk-in visit' }) }).then((r) => r.json())`);
        assert(r.ok && /^WALK-/.test(r.bookingId || ''), 'desk walk-in for an existing patient failed: ' + JSON.stringify(r));
        ctx.syncWalkinBookingId = r.bookingId;
      });
      await test('"Register to clinic" tab: register a patient at the desk (validation, consent, family) — separate from website registrations', async () => {
        await tab.ev(`document.getElementById('tabBtn_desk').click()`);
        await tab.waitFor(`!document.getElementById('panel_desk').hidden`, 4000, 'desk registration panel');
        assert(await tab.ev(`!document.getElementById('drCard') && !/medical card|gp visit card/i.test(document.getElementById('deskRegForm').innerText)`), 'the card question should not be on the desk registration form');
        await tab.ev(`document.querySelector('#deskRegForm button[type=submit]').click()`);
        assert(/name, date of birth, phone and address/i.test(await tab.ev(`document.getElementById('drError').textContent`)), 'required-field message missing');
        ctx.deskRegName = `ZZ TEST DeskReg ${STAMP}`;
        await tab.set('#drName', ctx.deskRegName); await tab.set('#drDob', '1990-02-02'); await tab.set('#drPhone', '0000000000');
        await tab.set('#drAddress', 'DESK TEST ADDRESS - please ignore'); await tab.set('#drAllergies', 'ZZ TEST latex allergy'); await tab.set('#drConditions', 'ZZ TEST asthma');
        await tab.ev(`document.querySelector('#deskRegForm button[type=submit]').click()`);
        assert(/Privacy Notice/i.test(await tab.ev(`document.getElementById('drError').textContent`)), 'consent must be required');
        await tab.ev(`document.getElementById('drAddFamily').click(); const r = document.querySelector('#drFamily .fam-row'); r.querySelector('[data-f=name]').value = 'ZZ TEST DeskKid'; r.querySelector('[data-f=dob]').value = '2019-09-09'; r.querySelector('[data-f=relationship]').value = 'Daughter'; document.getElementById('drConsent').checked = true;`);
        await tab.ev(`document.querySelector('#deskRegForm button[type=submit]').click()`);
        await tab.waitFor(`/Registered\\. Reference REG-/.test(document.getElementById('drDone').textContent)`, 8000, 'registered confirmation');
        await tab.waitFor(`document.getElementById('deskRegList').innerText.includes(${JSON.stringify(ctx.deskRegName)})`, 6000, 'desk registration listed');
        const det = `[...document.querySelectorAll('#deskRegList details')].find((d) => d.innerText.includes(${JSON.stringify(ctx.deskRegName)}))`;
        await tab.ev(`${det}.open = true`);
        const text = await tab.ev(`${det}.innerText`);
        assert(text.includes('ZZ TEST DeskKid') && text.includes('ZZ TEST latex allergy') && text.includes('ZZ TEST asthma'), 'desk registration details should include family and health information: ' + text.slice(0, 300));
        await tab.shot('reception-register');
        // it must NOT be in the website list
        const web = await tab.ev(`fetch('/api/reception/registrations?source=online').then((r) => r.text())`);
        assert(!web.includes(ctx.deskRegName), 'a desk registration appeared under Website registrations');
        const desk = await tab.ev(`fetch('/api/reception/registrations?source=desk').then((r) => r.text())`);
        assert(!desk.includes(ctx.regName), 'a website registration appeared under Register to clinic');
        // the website tab does not list it either
        await tab.ev(`document.getElementById('tabBtn_regs').click()`);
        await tab.waitFor(`document.getElementById('regList').innerText.includes(${JSON.stringify(ctx.regName)})`, 8000, 'website registration listed');
        assert(await tab.ev(`!document.getElementById('regList').innerText.includes(${JSON.stringify(ctx.deskRegName)})`), 'desk registration shown in the website tab');
      });
      await test('documents setup: the registered person and a person with markup in their name are seen as walk-ins', async () => {
        const post = (name, dob, reason) => tab.ev(`fetch('/api/reception/walk-ins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName: ${JSON.stringify(name)}, dob: ${JSON.stringify(dob)}, phone: '0000000000', reason: ${JSON.stringify(reason)} }) }).then((r) => r.json())`);
        const reg = await post(ctx.deskRegName, '1990-02-02', 'E2E document test');
        assert(reg.ok && reg.bookingId, 'walk-in for the registered person failed: ' + JSON.stringify(reg));
        ctx.docWalkinBookingId = reg.bookingId;
        ctx.tagName = 'ZZ <b>Tag</b> ' + STAMP;
        const tag = await post(ctx.tagName, '1970-01-01', 'E2E markup test');
        assert(tag.ok && tag.bookingId, 'walk-in with markup in the name failed: ' + JSON.stringify(tag));
        ctx.tagWalkinBookingId = tag.bookingId;
      });
      await test('website registrations: contact AND health details are visible to the front desk', async () => {
        const det = `[...document.querySelectorAll('#regList details')].find((d) => d.innerText.includes(${JSON.stringify(ctx.regName)}))`;
        await tab.ev(`${det}.open = true`);
        const text = await tab.ev(`${det}.innerText`);
        assert(text.includes('TEST ADDRESS') && text.includes('ZZ TEST Kid'), 'contact / family details should be visible');
        assert(text.includes('ZZ TEST peanut allergy') && /Health information/i.test(text), 'health details should be visible to the front desk: ' + text.slice(0, 400));
        await tab.shot('reception-registrations');
        const before = await tab.ev(`${det}.innerText.includes('Processed')`);
        await tab.ev(`[...${det}.querySelectorAll('button')].find((b) => /Mark as/.test(b.textContent)).click()`);
        await tab.waitFor(`document.getElementById('regList').innerText.includes('${before ? 'New' : 'Processed'}')`, 6000, 'status toggled');
        assert(await tab.ev(`fetch('/api/reception/registrations').then((r) => r.text()).then((t) => !/password|patient_token/i.test(t))`), 'unexpected sensitive fields in the registrations response');
      });
      await test('appointments: reason for visit and intake answers are visible; clinical records and tokens are not', async () => {
        await tab.ev(`document.getElementById('tabBtn_appts').click()`);
        await tab.waitFor(`document.getElementById('dayLabel').textContent.length > 0 && !document.getElementById('apptList').innerText.includes('Loading')`, 5000, 'appointments panel');
        let found = null; let dayOffset = 0;
        for (let i = 0; i < 14 && !found; i++) {
          const rows = await tab.ev(`(async () => { const d = new Date(); d.setDate(d.getDate() + ${i}); return fetch('/api/reception/schedule?date=' + d.toLocaleDateString('en-CA')).then((r) => r.text()); })()`);
          if (rows.includes(ctx.patientName)) { found = rows; dayOffset = i; }
        }
        assert(found, 'the online booking should appear on the front-desk schedule');
        const row = JSON.parse(found).find((r) => r.patient_name === ctx.patientName);
        assert(row.service === 'Phone Consultation', 'service label wrong: ' + row.service);
        assert(row.reason === 'E2E test consultation - please ignore', 'the reason for visit should be visible to reception: ' + row.reason);
        assert(!/patient_token|patient_email|notes|prescription|document|message/i.test(Object.keys(row).join(',')), 'clinical/private fields leaked: ' + Object.keys(row).join(','));
        // and it shows in the page
        for (let i = 0; i < dayOffset; i++) await tab.ev(`document.getElementById('dayNext').click()`);
        await tab.waitFor(`document.getElementById('apptList').innerText.includes('E2E test consultation')`, 6000, 'reason shown on the appointments list');
        // walk-ins are not listed as "online appointments"
        const today = await tab.ev(`fetch('/api/reception/schedule?date=' + new Date().toLocaleDateString('en-CA')).then((r) => r.text())`);
        assert(!today.includes(ctx.deskName), 'walk-ins belong in the walk-in queue, not the online appointments list');
      });
      await test('privilege separation: the front desk cannot reach doctor, admin or patient-record endpoints', async () => {
        const urls = ['/api/doctor/clinic/summary', '/api/doctor/recent', `/api/doctor/bookings/${ctx.bookingId}`, `/api/doctor/bookings/${ctx.deskBookingId}`, `/api/doctor/schedule?date=${new Date().toLocaleDateString('en-CA')}`, '/api/admin/reception-log', '/api/doctor/notifications', '/api/admin/doctors', '/api/admin/receptionists', '/api/patient/bookings'];
        const codes = await tab.ev(`Promise.all(${JSON.stringify(urls)}.map((u) => fetch(u).then((r) => r.status)))`);
        assert(codes.every((c) => c === 401 || c === 403), 'front desk reached protected areas: ' + urls.map((u, i) => u + '=' + codes[i]).join(', '));
        assert(await postJson('/api/admin/receptionists', { name: 'x', email: 'x@example.invalid', password: 'password123' }) === 401, 'a receptionist must not be able to create accounts');
      });
      await test('receptionist signs out and the desk is locked again', async () => {
        await tab.ev(`document.getElementById('logoutLink').click()`);
        await tab.waitFor(`!document.getElementById('loginBox').hidden`, 5000, 'sign-in form');
        assert(await tab.ev(`fetch('/api/reception/summary').then((r) => r.status)`) === 401, 'still signed in after logout');
      });
    }
    if (DOCTOR_EMAIL && DOCTOR_PASSWORD) {
      await test('doctor side: the desk walk-in is a real booking (schedule, recent, notification, chart) with no other patient\'s history', async () => {
        await tab.send('Network.clearBrowserCookies');
        await tab.goto('/dashboard.html');
        assert(await postJson('/api/doctor/login', { email: DOCTOR_EMAIL, password: DOCTOR_PASSWORD }) === 200, 'doctor login failed');
        const today = new Date().toLocaleDateString('en-CA');
        const chart = await tab.ev(`fetch('/api/doctor/bookings/${ctx.deskBookingId}').then((r) => r.json())`);
        assert(chart.booking && chart.booking.service_type === 'walk_in' && chart.booking.patient_name === ctx.deskName, 'chart should open for the walk-in booking');
        assert(chart.booking.reason === 'Desk walk-in chest pain test', 'the reason typed at the desk should reach the doctor: ' + chart.booking.reason);
        assert(!('patient_token' in chart.booking), 'patient token must not be sent to the doctor page');
        assert(chart.previousConsultations.length === 0, 'an email-less walk-in must not be matched to any other patient\'s history: ' + JSON.stringify(chart.previousConsultations.map((p) => p.id)));
        const sched = await tab.ev(`fetch('/api/doctor/schedule?date=${today}').then((r) => r.json())`);
        assert(sched.bookings.some((b) => b.id === ctx.deskBookingId), 'walk-in should be on today\'s doctor schedule');
        const recent = await tab.ev(`fetch('/api/doctor/recent').then((r) => r.text())`);
        assert(recent.includes(ctx.deskName), 'walk-in should be in Recent Cases');
        const notes = await tab.ev(`fetch('/api/doctor/notifications').then((r) => r.text())`);
        assert(notes.includes('Walk-in patient: ' + ctx.deskName), 'the doctor should get a walk-in notification');
        // exactly one booking for this walk-in
        assert((recent.match(new RegExp(ctx.deskName, 'g')) || []).length === 1, 'the walk-in should not appear more than once');
        // the doctor can chart it: write a note
        assert(await postJson(`/api/doctor/bookings/${ctx.deskBookingId}/notes`, { noteText: 'E2E walk-in note' }) === 200, 'doctor should be able to write a note on a walk-in');
        // Clinic tab: desk registration shows the At desk badge; website one does not
        await tab.goto('/dashboard.html');
        await tab.waitFor(`getComputedStyle(document.getElementById('dashboardBox')).display !== 'none'`, 10000, 'dashboard');
        await tab.ev(`showTab('registrations')`);
        await tab.waitFor(`document.getElementById('registrationList').innerText.includes(${JSON.stringify(ctx.deskRegName)})`, 8000, 'desk registration in the doctor Registrations section');
        const badges = await tab.ev(`(() => { const d = (n) => [...document.querySelectorAll('#registrationList details')].find((x) => x.innerText.includes(n)); return { desk: d(${JSON.stringify(ctx.deskRegName)}).innerText.includes('At desk'), web: d(${JSON.stringify(ctx.regName)}).innerText.includes('At desk') }; })()`);
        assert(badges.desk && !badges.web, 'only desk registrations should carry the At desk badge: ' + JSON.stringify(badges));
        await tab.shot('doctor-desk-registration');
        await tab.ev(`fetch('/api/doctor/logout', { method: 'POST' })`);
      });
      await test('documents for walk-in patients: PDFs and printable letters carry the clinic details, registration address and allergies; no email is handled; markup is escaped', async () => {
        await tab.send('Network.clearBrowserCookies');
        await tab.goto('/dashboard.html');
        assert(await postJson('/api/doctor/login', { email: DOCTOR_EMAIL, password: DOCTOR_PASSWORD }) === 200, 'doctor login failed');
        assert(ctx.docWalkinBookingId && ctx.tagWalkinBookingId, 'the document-test walk-ins should exist (desk registration test must have run)');
        const id = ctx.docWalkinBookingId;
        // prescription with a pharmacy recorded by the doctor
        assert((await sendJson('POST', `/api/doctor/bookings/${id}/prescriptions`, { medication: 'E2E Docazole', dose: '20mg', frequency: 'daily', duration: '3 days', quantity: '3', instructions: 'test only', pharmacyName: 'ZZ Test Pharmacy' })).status === 200, 'issuing a prescription failed');
        const chart = (await sendJson('GET', `/api/doctor/bookings/${id}`)).json;
        assert(chart.booking.pharmacy_name === 'ZZ Test Pharmacy', 'the pharmacy typed with the prescription should be saved on the visit');
        const rx = chart.prescriptions[0];
        const pdf = await tab.ev(`fetch('/api/doctor/prescriptions/${rx.id}/pdf').then(async (r) => { const b = new Uint8Array(await r.arrayBuffer()); return { status: r.status, type: r.headers.get('content-type'), head: String.fromCharCode(...b.slice(0, 5)), size: b.length }; })`);
        assert(pdf.status === 200 && pdf.type === 'application/pdf' && pdf.head === '%PDF-' && pdf.size > 1500, 'the prescription PDF should download: ' + JSON.stringify(pdf));
        // sick cert + referral: PDF download, and "send to patient" with no email on file is refused kindly
        const cert = await sendJson('POST', `/api/doctor/bookings/${id}/documents`, { docType: 'sick_cert', fields: { dateFrom: '2026-09-21', dateTo: '2026-09-23', diagnosis: 'Viral illness', fitForWork: 'unfit for work' } });
        assert(cert.status === 200, 'issuing a sick certificate failed');
        const ref = await sendJson('POST', `/api/doctor/bookings/${id}/documents`, { docType: 'referral_specialist', fields: { specialty: 'Cardiology', consultantOrDept: '', urgency: 'Routine', clinicalSummary: 'E2E summary', reasonForReferral: 'E2E reason' } });
        assert(ref.status === 200, 'issuing a referral failed');
        for (const d of [cert.json.id, ref.json.id]) {
          const r = await tab.ev(`fetch('/api/doctor/documents/${d}/pdf').then(async (r) => { const b = new Uint8Array(await r.arrayBuffer()); return { status: r.status, type: r.headers.get('content-type'), head: String.fromCharCode(...b.slice(0, 5)) }; })`);
          assert(r.status === 200 && r.type === 'application/pdf' && r.head === '%PDF-', 'the document PDF should download: ' + JSON.stringify(r));
        }
        const send = await sendJson('POST', `/api/doctor/documents/${cert.json.id}/send`, {});
        assert(send.status === 400 && /no email/i.test(send.json.error || ''), 'sending a certificate to a patient with no email should explain what to do: ' + JSON.stringify(send));
        // printable prescription
        await tab.goto(`/print-rx.html?rxId=${rx.id}`);
        await tab.waitFor(`document.getElementById('letter').innerText.includes('E2E Docazole')`, 8000, 'printable prescription');
        const p = await tab.ev(`document.getElementById('letter').innerText`);
        assert(/RX-\d{5}/.test(p) && /Walk-in clinic visit/.test(p) && /ZZ Test Pharmacy/.test(p) && /DESK TEST ADDRESS/.test(p) && /ZZ TEST latex allergy/.test(p), 'the printout should show the visit, pharmacy, and the address/allergies from the desk registration: ' + p.slice(0, 400));
        assert(!/One Tap/.test(p) && /Confidential/.test(p) && /Newbridge/.test(p), 'old slogan should be gone; clinic details and confidentiality note should be there: ' + p.slice(-300));
        await tab.shot('print-prescription');
        // printable sick certificate + referral
        await tab.goto(`/print-doc.html?docId=${cert.json.id}`);
        await tab.waitFor(`document.getElementById('letter').innerText.includes('Medical Certificate')`, 8000, 'printable certificate');
        assert(/CERT-\d{5}/.test(await tab.ev(`document.getElementById('letter').innerText`)), 'certificate reference missing');
        await tab.goto(`/print-doc.html?docId=${ref.json.id}`);
        await tab.waitFor(`document.getElementById('letter').innerText.includes('Dear Colleague')`, 8000, 'printable referral');
        const rf = await tab.ev(`document.getElementById('letter').innerText`);
        assert(/REF-\d{5}/.test(rf) && /ZZ TEST latex allergy/.test(rf), 'referral should show the reference and the allergies: ' + rf.slice(0, 300));
        // markup in a patient's name must appear as text, never run
        const t = (await sendJson('POST', `/api/doctor/bookings/${ctx.tagWalkinBookingId}/prescriptions`, { medication: 'E2E Tagazole', dose: '1mg', frequency: 'daily', duration: '1 day', quantity: '1', instructions: 'x' }));
        assert(t.status === 200, 'issuing the markup test prescription failed');
        const rx2 = (await sendJson('GET', `/api/doctor/bookings/${ctx.tagWalkinBookingId}`)).json.prescriptions[0];
        await tab.goto(`/print-rx.html?rxId=${rx2.id}`);
        await tab.waitFor(`document.getElementById('letter').innerText.includes('E2E Tagazole')`, 8000, 'markup test printout');
        assert(await tab.ev(`document.getElementById('letter').innerText.includes('<b>Tag</b>') && !document.querySelector('#letter b')`), 'markup in a name must be shown as text');
        await tab.ev(`fetch('/api/doctor/logout', { method: 'POST' })`);
      });
      await test('patient chart sync: a walk-in and an online booking by the same person appear in each other\'s history', async () => {
        await tab.send('Network.clearBrowserCookies');
        await tab.goto('/dashboard.html');
        assert(await postJson('/api/doctor/login', { email: DOCTOR_EMAIL, password: DOCTOR_PASSWORD }) === 200, 'doctor login failed');
        const walkChart = await tab.ev(`fetch('/api/doctor/bookings/${ctx.syncWalkinBookingId}').then((r) => r.json())`);
        assert(walkChart.previousConsultations.some((p) => p.id === ctx.bookingId), 'the walk-in chart should list the earlier online consultation');
        assert(walkChart.patientSummary.onlineVisits === 1, 'summary should count the online visit: ' + JSON.stringify(walkChart.patientSummary));
        const onlineChart = await tab.ev(`fetch('/api/doctor/bookings/${ctx.bookingId}').then((r) => r.json())`);
        const hit = onlineChart.previousConsultations.find((p) => p.id === ctx.syncWalkinBookingId);
        assert(hit && hit.service_type === 'walk_in', 'the online chart should list the walk-in visit in its history');
        // ...and in the UI
        await tab.goto('/dashboard.html');
        await tab.waitFor(`getComputedStyle(document.getElementById('dashboardBox')).display !== 'none'`, 10000, 'dashboard');
        await tab.ev(`openBooking(${JSON.stringify(ctx.bookingId)}, 'search')`);
        await tab.waitFor(`getComputedStyle(document.getElementById('detailPanel')).display !== 'none' && /1 previous visit/.test(document.getElementById('chartPatientMeta').innerText)`, 10000, 'online chart banner mentions the walk-in');
        await tab.ev(`showChartTab('previous')`);
        assert(await tab.ev(`/Walk-in/.test(document.getElementById('previousConsultationsList').innerText) && /E2E earlier walk-in visit/.test(document.getElementById('previousConsultationsList').innerText)`), 'the History tab should show the walk-in visit and its reason');
        await tab.shot('doctor-chart-history');
        await tab.ev(`closeChart(); showTab('search'); document.getElementById('searchInput').value = ${JSON.stringify(ctx.patientName)}; runSearch();`);
        await tab.waitFor(`document.querySelectorAll('#searchResults .patient-card').length === 1`, 8000, 'one grouped patient card');
        const card = await tab.ev(`document.querySelector('#searchResults .patient-card').innerText`);
        assert(/2 visits/.test(card) && /1 walk-in/.test(card) && /1 online/.test(card), 'search should group both visits under one patient: ' + card);
        await tab.shot('doctor-search');
        await tab.ev(`fetch('/api/doctor/logout', { method: 'POST' })`);
      });
    }
    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
      await test('admin manages reception accounts: create, sign in, deactivate (blocked), reactivate, new password', async () => {
        await tab.send('Network.clearBrowserCookies');
        await tab.goto('/admin-login.html');
        assert(await postJson('/api/admin/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }) === 200, 'admin login failed');
        const mail = `zz-e2e-desk-${STAMP}@example.invalid`;
        assert(await postJson('/api/admin/receptionists', { name: 'ZZ E2E Desk', email: mail, password: 'short' }) === 400, 'weak passwords should be refused');
        assert(await postJson('/api/admin/receptionists', { name: 'ZZ E2E Desk', email: mail, password: 'Desk-Pass-12345' }) === 200, 'create failed');
        assert(await postJson('/api/admin/receptionists', { name: 'ZZ E2E Desk', email: mail, password: 'Desk-Pass-12345' }) === 409, 'duplicate email should be refused');
        const list = await tab.ev(`fetch('/api/admin/receptionists').then((r) => r.json())`);
        const acct = list.find((r) => r.email === mail);
        assert(acct && acct.active === 1 && !('password_hash' in acct), 'account missing, or the password hash was exposed');
        await tab.send('Network.clearBrowserCookies');
        assert(await postJson('/api/reception/login', { email: mail, password: 'Desk-Pass-12345' }) === 200, 'new receptionist could not sign in');
        assert(await tab.ev(`fetch('/api/reception/summary').then((r) => r.status)`) === 200, 'new receptionist should see the desk');
        await tab.send('Network.clearBrowserCookies');
        await postJson('/api/admin/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
        assert(await postJson(`/api/admin/receptionists/${acct.id}/deactivate`) === 200, 'deactivate failed');
        await tab.send('Network.clearBrowserCookies');
        assert(await postJson('/api/reception/login', { email: mail, password: 'Desk-Pass-12345' }) === 403, 'a deactivated account must not sign in');
        await postJson('/api/admin/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
        assert(await postJson(`/api/admin/receptionists/${acct.id}/reactivate`) === 200, 'reactivate failed');
        assert(await postJson(`/api/admin/receptionists/${acct.id}/password`, { password: 'New-Desk-Pass-777' }) === 200, 'password reset failed');
        await tab.send('Network.clearBrowserCookies');
        assert(await postJson('/api/reception/login', { email: mail, password: 'Desk-Pass-12345' }) === 401, 'the old password must stop working');
        assert(await postJson('/api/reception/login', { email: mail, password: 'New-Desk-Pass-777' }) === 200, 'the new password should work');
      });
      await test('admin dashboard shows the Reception tab in the shared staff design', async () => {
        await tab.send('Network.clearBrowserCookies');
        await tab.goto('/admin-login.html');
        await postJson('/api/admin/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
        await tab.goto('/admin-dashboard.html');
        await tab.waitFor(`!!document.getElementById('tabBtn_reception')`, 6000, 'reception tab');
        await tab.ev(`showAdminTab('reception')`);
        await tab.waitFor(`document.getElementById('receptionBody').innerText.includes('ZZ E2E Desk')`, 6000, 'reception accounts listed');
        assert(await tab.ev(`document.querySelector('.staff-role').textContent.trim() === 'Admin' && !document.querySelector('a[href="/walk-in.html"]')`), 'admin header should be the staff header');
        await tab.waitFor(`document.getElementById('receptionLogBody').innerText.includes('Added walk-in patient')`, 6000, 'front-desk activity log');
        assert(await tab.ev(`document.getElementById('receptionLogBody').innerText.includes('Registered a new patient at the desk')`), 'desk registration should be in the log');
        await tab.shot('admin-reception');
      });
      // ------------------------------------------------ admin: website settings (clinic details, hours, wording, photos, FAQs, banner) + people
      const REG = require('../server/siteRegistry');
      const sendJson = (method, url, body) => tab.ev(`fetch(${JSON.stringify(url)}, { method: ${JSON.stringify(method)}, headers: { 'Content-Type': 'application/json' }, body: ${body === undefined ? 'undefined' : `JSON.stringify(${JSON.stringify(body)})`} }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }))`);
      const asAdmin = async () => { await tab.send('Network.clearBrowserCookies'); await tab.goto('/admin-login.html'); assert(await postJson('/api/admin/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }) === 200, 'admin login failed'); };
      await test('website settings: locked to admins only; the public settings script carries no secrets', async () => {
        await tab.send('Network.clearBrowserCookies');
        await tab.goto('/');
        for (const [m, u] of [['GET', '/api/admin/site'], ['PUT', '/api/admin/site/clinic'], ['PUT', '/api/admin/site/text'], ['PUT', '/api/admin/site/faq'], ['PUT', '/api/admin/site/banner'], ['POST', '/api/admin/site/reset/clinic'], ['DELETE', '/api/admin/site/images/home.hero'], ['GET', '/api/admin/site/history']]) {
          const r = await sendJson(m, u, m === 'GET' || m === 'DELETE' ? undefined : {});
          assert(r.status === 401, `${m} ${u} should need an admin login (got ${r.status})`);
        }
        const js = await tab.ev(`fetch('/api/site-settings.js').then((r) => r.text())`);
        assert(/^window\.GP4U_SETTINGS = \{/.test(js) && !/password|token|hash|secret/i.test(js), 'the public settings script should hold only site values');
        // a doctor session and a front-desk session are not admins either
        assert(await postJson('/api/doctor/login', { email: DOCTOR_EMAIL, password: DOCTOR_PASSWORD }) === 200, 'doctor login failed');
        assert((await sendJson('PUT', '/api/admin/site/clinic', { phone: '111 111' })).status === 401, 'a doctor must not edit the website settings');
        await tab.send('Network.clearBrowserCookies');
        assert(await postJson('/api/reception/login', { email: process.env.E2E_RECEPTION_EMAIL, password: process.env.E2E_RECEPTION_PASSWORD }) === 200, 'reception login failed');
        assert((await sendJson('PUT', '/api/admin/site/text', { values: {} })).status === 401, 'the front desk must not edit the website settings');
      });
      await test('editable wording: every marked line on every page still equals its original text (registry in sync)', async () => {
        await tab.send('Network.clearBrowserCookies');
        const pages = [...new Set(REG.TEXT.map((t) => t.page))];
        for (const p of pages) {
          await tab.goto('/' + (p === 'index.html' ? '' : p));
          const got = await tab.ev(`[...document.querySelectorAll('[data-cms]')].map((e) => [e.dataset.cms, [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.data).join('').replace(/\\s+/g, ' ').trim()])`);
          const want = REG.TEXT.filter((t) => t.page === p);
          assert(got.length === want.length, `${p}: expected ${want.length} editable lines, found ${got.length}`);
          for (const [k, txt] of got) assert(txt === REG.TEXT_BY_KEY.get(k).text, `${p}: "${k}" shows "${txt}" but the original is "${REG.TEXT_BY_KEY.get(k).text}"`);
        }
      });
      await test('admin editor page opens with every section, and saves clinic details through the form', async () => {
        await asAdmin();
        await tab.goto('/admin-site.html');
        await tab.waitFor(`getComputedStyle(document.getElementById('siteBox')).display !== 'none' && !!document.getElementById('detailsForm')`, 8000, 'website settings editor');
        const panes = await tab.ev(`[...document.querySelectorAll('#siteNav [data-pane]')].map((b) => b.dataset.pane).join(',')`);
        assert(panes === 'details,hours,fees,text,photos,faq,banner,history', 'editor sections wrong: ' + panes);
        await tab.set('#cPhone', '045 999 111');
        await tab.ev(`document.querySelector('#detailsForm button[type=submit]').click()`);
        await tab.waitFor(`/Saved/.test(document.getElementById('paneMsg').textContent)`, 6000, 'saved message');
        await tab.set('#cPhone', 'not a phone!');
        await tab.ev(`document.querySelector('#detailsForm button[type=submit]').click()`);
        await tab.waitFor(`/Phone number/.test(document.getElementById('paneErr').textContent)`, 6000, 'phone validation message');
        // each pane renders
        for (const p of ['hours', 'fees', 'text', 'photos', 'faq', 'banner', 'history']) {
          await tab.ev(`document.querySelector('#siteNav [data-pane=${p}]').click()`); await sleep(400);
          assert(await tab.ev(`getComputedStyle(document.getElementById('pane_${p}')).display !== 'none' && document.getElementById('pane_${p}').innerText.length > 20`), p + ' pane is empty');
        }
        await tab.ev(`document.querySelector('#siteNav [data-pane=text]').click()`); await sleep(300);
        await tab.shot('admin-site-text');
        await tab.ev(`document.querySelector('#siteNav [data-pane=photos]').click()`); await sleep(500);
        await tab.shot('admin-site-photos');
      });
      await test('clinic details: address, phone, email and map appear across the public pages; bad input is refused', async () => {
        await asAdmin();
        assert((await sendJson('PUT', '/api/admin/site/clinic', { phone: 'abc' })).status === 400, 'a bad phone number should be refused');
        assert((await sendJson('PUT', '/api/admin/site/clinic', { email: 'nope' })).status === 400, 'a bad email should be refused');
        assert((await sendJson('PUT', '/api/admin/site/clinic', { hours: { 1: ['18:00', '09:00'] } })).status === 400, 'closing before opening should be refused');
        assert((await sendJson('PUT', '/api/admin/site/clinic', { closures: [{ from: '2026-13-45' }] })).status === 400, 'a fake date should be refused');
        const tagged = await sendJson('PUT', '/api/admin/site/clinic', { tagline: 'ZZ <img src=x onerror=window.__xss=9> tag', town: 'Newbridge' });
        assert(tagged.status === 200 && !/[<>]/.test(JSON.stringify((await sendJson('GET', '/api/admin/site')).json.clinic)), 'angle brackets must be stripped from clinic details');
        const r = await sendJson('PUT', '/api/admin/site/clinic', { streetAddress: 'ZZ Test Street', eircode: 'r56 ab12', phone: '045 123 456', email: 'zz-clinic@example.invalid', showMap: true, fees: { walkIn: [{ label: 'ZZ GP consultation', price: '€60' }] }, founder: { name: 'Dr ZZ Test', role: 'GP and founder', bio: 'ZZ bio', qualifications: ['MB BCh BAO'], medicalCouncilNumber: '123456' } });
        assert(r.status === 200, 'saving clinic details failed: ' + JSON.stringify(r));
        await tab.send('Network.clearBrowserCookies');
        await tab.goto('/contact.html');
        await tab.waitFor(`document.querySelector('[data-clinic-address]').innerText.includes('ZZ Test Street')`, 6000, 'address on contact page');
        const c = await tab.ev(`({ addr: document.querySelector('.loc [data-clinic-address]').innerText, phone: !!document.querySelector('.loc a[href="tel:045123456"]'), mail: !!document.querySelector('a[href="mailto:zz-clinic@example.invalid"]'), directions: !document.querySelector('.loc [data-clinic-directions]').hidden, map: !!document.querySelector('.loc [data-clinic-map] iframe'), comingSoon: /coming soon/i.test(document.querySelector('main').innerText), footerAddr: document.querySelector('footer [data-clinic-address]').innerText })`);
        assert(/ZZ Test Street/.test(c.addr) && /R56 AB12/.test(c.addr) && c.phone && c.mail && c.directions && c.map && !c.comingSoon && /ZZ Test Street/.test(c.footerAddr), 'clinic details missing from the public page: ' + JSON.stringify(c));
        await tab.goto('/fees.html');
        assert(await tab.ev(`document.body.innerText.includes('ZZ GP consultation') && document.body.innerText.includes('€60')`), 'walk-in fee should appear on the Fees page');
        await tab.goto('/about.html');
        assert(await tab.ev(`document.body.innerText.includes('Dr ZZ Test') && document.body.innerText.includes('123456')`), 'lead GP should appear on the About page');
      });
      await test('opening hours, online GP hours and closed days update the whole site', async () => {
        await asAdmin();
        const now = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Dublin' });
        const r = await sendJson('PUT', '/api/admin/site/clinic', { hours: { 0: ['12:00', '19:00'], 1: ['09:30', '20:00'], 2: ['09:30', '20:00'], 3: ['09:30', '20:00'], 4: ['09:30', '20:00'], 5: ['09:30', '20:00'], 6: null }, onlineHours: { 0: null, 1: ['08:00', '22:00'], 2: ['08:00', '22:00'], 3: ['08:00', '22:00'], 4: ['08:00', '22:00'], 5: ['08:00', '22:00'], 6: null }, closures: [{ from: now, to: now, label: 'ZZ Test closure' }] });
        assert(r.status === 200, 'saving hours failed: ' + JSON.stringify(r));
        await tab.send('Network.clearBrowserCookies');
        await tab.goto('/');
        await tab.waitFor(`!!document.querySelector('.hs-card .hs-row')`, 6000, 'hours strip');
        const h = await tab.ev(`({ strip: [...document.querySelectorAll('.hs-card')].map((c) => c.innerText.replace(/\\s+/g, ' ')), top: document.querySelector('.topbar [data-open-status]').innerText, closed: [...document.querySelectorAll('[data-clinic-closures]')].filter((e) => !e.hidden).map((e) => e.innerText).join(' | '), footer: document.querySelector('.footer-online').innerText })`);
        assert(/9:30am – 8pm/.test(h.strip[0]) && /Sat\s*Closed/.test(h.strip[0]), 'walk-in hours not updated: ' + h.strip[0]);
        assert(/8am – 10pm/.test(h.strip[1]) && !/9:30am/.test(h.strip[1]), 'online GP hours should be shown separately: ' + h.strip[1]);
        assert(/Closed today · ZZ Test closure/.test(h.top), 'the top bar should say the clinic is closed today: ' + h.top);
        assert(/ZZ Test closure/.test(h.closed), 'closed days should be listed: ' + h.closed);
        assert(/8am – 10pm/.test(h.footer), 'footer online hours not updated: ' + h.footer);
      });
      await test('page wording: edit headings, sentences and icon lines; unknown keys refused; original restorable', async () => {
        await asAdmin();
        assert((await sendJson('PUT', '/api/admin/site/text', { values: { 'not.a.real.key': 'x' } })).status === 400, 'unknown wording key should be refused');
        const r = await sendJson('PUT', '/api/admin/site/text', { values: { 'home.hero.title': 'ZZ New headline <b>bold</b>', 'home.chip.2': 'Open all week', 'walkin.title': 'ZZ Walk in headline', 'online.how.1.title': 'ZZ Step one' } });
        assert(r.status === 200, 'saving wording failed: ' + JSON.stringify(r));
        await tab.send('Network.clearBrowserCookies');
        await tab.goto('/');
        const t = await tab.ev(`({ h1: document.querySelector('h1').innerText, chip: document.querySelector('[data-cms="home.chip.2"]').innerText, svg: !!document.querySelector('[data-cms="home.chip.2"] svg'), bold: !!document.querySelector('h1 b') })`);
        assert(t.h1 === 'ZZ New headline <b>bold</b>' && !t.bold, 'wording must be shown as plain text: ' + JSON.stringify(t));
        assert(t.chip.trim() === 'Open all week' && t.svg, 'icon lines should keep their icon: ' + JSON.stringify(t));
        await tab.goto('/walk-in.html');
        assert(await tab.ev(`document.querySelector('h1').innerText === 'ZZ Walk in headline'`), 'walk-in page headline not updated');
        await tab.goto('/online.html');
        assert(await tab.ev(`document.querySelector('[data-cms="online.how.1.title"]').innerText === 'ZZ Step one'`), 'online step title not updated');
        // restore the original wording through the editor's own screen
        await asAdmin();
        await tab.goto('/admin-site.html');
        await tab.waitFor(`!!document.getElementById('detailsForm')`, 8000, 'editor');
        await tab.ev(`document.querySelector('#siteNav [data-pane=text]').click()`);
        await tab.waitFor(`!!document.querySelector('[data-key="home.hero.title"]')`, 6000, 'wording list');
        assert(await tab.ev(`document.querySelector('[data-key="home.hero.title"]').value.startsWith('ZZ New headline') && !document.querySelector('[data-tag="home.hero.title"]').hidden`), 'the editor should show the edited line as edited');
        await tab.ev(`document.querySelector('[data-orig="home.hero.title"]').click(); document.getElementById('saveText').click()`);
        await tab.waitFor(`/Saved/.test(document.getElementById('paneMsg').textContent)`, 6000, 'saved');
        await tab.send('Network.clearBrowserCookies');
        await tab.goto('/');
        assert(await tab.ev(`document.querySelector('h1').innerText === 'GP care, when you need it.'`), 'the original headline should be back');
      });
      await test('photos: upload replaces the picture, non-images and oversize files are refused, "use original" puts it back', async () => {
        await asAdmin();
        const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
        const up = (slot, name, type, b64) => tab.ev(`(async () => { const bin = atob(${JSON.stringify(b64)}); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); const fd = new FormData(); fd.append('file', new Blob([a], { type: ${JSON.stringify(type)} }), ${JSON.stringify(name)}); const r = await fetch('/api/admin/site/images/' + ${JSON.stringify(slot)}, { method: 'POST', body: fd }); return r.status; })()`);
        assert(await up('home.card.walkin', 'x.png', 'image/png', png) === 200, 'uploading a PNG should work');
        assert(await up('home.card.walkin', 'x.png', 'image/png', btoa('this is not a picture at all, just text')) === 400, 'a non-image must be refused');
        assert(await up('not.a.slot', 'x.png', 'image/png', png) === 404, 'an unknown picture slot must be refused');
        await tab.send('Network.clearBrowserCookies');
        await tab.goto('/');
        const img = await tab.ev(`document.querySelector('[data-cms-img="home.card.walkin"]').getAttribute('src')`);
        assert(/^\/api\/site-image\/home\.card\.walkin\?v=\d+$/.test(img), 'home page should now use the uploaded picture: ' + img);
        const served = await tab.ev(`fetch(${JSON.stringify(img)}).then((r) => [r.status, r.headers.get('content-type')])`);
        assert(served[0] === 200 && served[1] === 'image/png', 'the uploaded picture should be served as a PNG: ' + served.join(' '));
        await asAdmin();
        assert((await sendJson('DELETE', '/api/admin/site/images/home.card.walkin')).status === 200, 'putting the original back failed');
        await tab.send('Network.clearBrowserCookies');
        await tab.goto('/');
        assert(/walk-in-consult\.jpg/.test(await tab.ev(`document.querySelector('[data-cms-img="home.card.walkin"]').getAttribute('src')`)), 'the original picture should be back');
        assert((await tab.ev(`fetch('/api/site-image/home.card.walkin').then((r) => r.status)`)) === 404, 'the removed upload should no longer be served');
      });
      await test('FAQs: edit the FAQ page; scripts and unsafe links in answers are stripped; built-in FAQs can be restored', async () => {
        await asAdmin();
        const before = await sendJson('GET', '/api/admin/site');
        assert(before.json.registry.faqDefaults.length >= 5, 'the built-in FAQs should be available to edit');
        const nasty = 'Try <strong>this</strong> <script>window.__xss=1</script><a href="javascript:window.__xss=2">bad</a> <a href="/contact.html">good</a> <img src=x onerror="window.__xss=3"> {{hours}}';
        const r = await sendJson('PUT', '/api/admin/site/faq', { groups: [{ title: 'ZZ Test section', items: [{ q: 'ZZ Test question?', a: nasty }, { q: '', a: 'dropped' }] }] });
        assert(r.status === 200, 'saving FAQs failed: ' + JSON.stringify(r));
        const saved = (await sendJson('GET', '/api/admin/site')).json.faq;
        assert(saved.length === 1 && saved[0].items.length === 1 && !/<script|javascript:|onerror|<img/i.test(saved[0].items[0].a), 'unsafe markup should be stripped: ' + JSON.stringify(saved));
        await tab.send('Network.clearBrowserCookies');
        await tab.goto('/faq.html');
        await tab.waitFor(`!!document.querySelector('.faq-group h2') && document.querySelector('.faq-group h2').innerText === 'ZZ Test section'`, 6000, 'custom FAQ');
        const f = await tab.ev(`({ groups: document.querySelectorAll('.faq-group').length, xss: window.__xss === undefined, bold: !!document.querySelector('.faq-group strong'), link: !!document.querySelector('.faq-group a[href="/contact.html"]'), hours: /Mon|10am|9pm/.test(document.querySelector('.faq-group [data-clinic-hours-text]').innerText), cats: document.querySelector('.faq-cats').innerText })`);
        assert(f.groups === 1 && f.xss && f.bold && f.link && /ZZ Test section/.test(f.cats), 'FAQ page should show only the edited version, safely: ' + JSON.stringify(f));
        await asAdmin();
        assert((await sendJson('PUT', '/api/admin/site/faq', { groups: null })).status === 200, 'restoring the built-in FAQs failed');
        await tab.send('Network.clearBrowserCookies');
        await tab.goto('/faq.html');
        assert(await tab.ev(`document.querySelectorAll('.faq-group').length`) === before.json.registry.faqDefaults.length, 'the built-in FAQs should be back');
      });
      await test('announcement bar: shows on every page in the chosen style, unsafe links refused, can be turned off', async () => {
        await asAdmin();
        assert((await sendJson('PUT', '/api/admin/site/banner', { enabled: true, text: 'x', linkText: 'go', linkUrl: 'javascript:alert(1)' })).status === 400, 'a javascript: link should be refused');
        assert((await sendJson('PUT', '/api/admin/site/banner', { enabled: true, text: 'ZZ Closed on Monday <b>x</b>', tone: 'warning', linkText: 'See hours', linkUrl: '/contact.html' })).status === 200, 'saving the banner failed');
        await tab.send('Network.clearBrowserCookies');
        for (const p of ['/', '/walk-in.html', '/fees.html']) {
          await tab.goto(p);
          const b = await tab.ev(`(() => { const e = document.querySelector('.site-banner'); return e ? { text: e.innerText, warn: e.classList.contains('is-warning'), link: !!e.querySelector('a[href="/contact.html"]'), bold: !!e.querySelector('b') } : null; })()`);
          assert(b && /ZZ Closed on Monday <b>x<\/b>/.test(b.text) && b.warn && b.link && !b.bold, p + ': the banner is missing or unsafe: ' + JSON.stringify(b));
        }
        await asAdmin();
        assert((await sendJson('PUT', '/api/admin/site/banner', { enabled: false, text: 'ZZ Closed on Monday' })).status === 200, 'turning the banner off failed');
        await tab.send('Network.clearBrowserCookies');
        await tab.goto('/');
        assert(await tab.ev(`!document.querySelector('.site-banner')`), 'the banner should be gone');
      });
      await test('change history: every edit is logged with who made it, and an earlier version can be restored', async () => {
        await asAdmin();
        await sendJson('PUT', '/api/admin/site/text', { values: { 'home.pill': 'ZZ pill one' } });
        await sendJson('PUT', '/api/admin/site/text', { values: { 'home.pill': 'ZZ pill two' } });
        const log = (await sendJson('GET', '/api/admin/site/history')).json;
        assert(log.length >= 5 && log.every((x) => x.action && x.created_at) && log.some((x) => /Edited text/.test(x.action) && x.admin_name), 'edits should be logged with the admin\'s name');
        const latest = log.find((x) => /Edited text/.test(x.action) && x.history_id);
        assert(latest, 'a text edit should offer an undo');
        assert((await sendJson('POST', '/api/admin/site/history/' + latest.history_id + '/restore')).status === 200, 'restoring failed');
        const now = (await sendJson('GET', '/api/admin/site')).json.text;
        assert(now['home.pill'] === 'ZZ pill one', 'the earlier version should be back: ' + JSON.stringify(now));
        assert((await sendJson('POST', '/api/admin/site/history/999999999/restore')).status === 404, 'an unknown history entry should be refused');
      });
      await test('people: edit a doctor and a receptionist, reset passwords, remove a receptionist; admin changes their own password', async () => {
        await asAdmin();
        const stampMail = (s) => `zz-e2e-${s}-${STAMP}@example.invalid`;
        assert((await sendJson('POST', '/api/admin/doctors', { name: 'ZZ Edit Doc', regNumber: 'ZZ-1', email: stampMail('doc'), password: 'Doc-Pass-12345' })).status === 200, 'creating a doctor failed');
        const doc = (await sendJson('GET', '/api/admin/doctors')).json.find((d) => d.email === stampMail('doc'));
        assert((await sendJson('PUT', '/api/admin/doctors/' + doc.id, { name: 'ZZ Renamed Doc', regNumber: 'ZZ-2', email: stampMail('doc2') })).status === 200, 'editing a doctor failed');
        assert((await sendJson('PUT', '/api/admin/doctors/' + doc.id, { name: 'x', regNumber: 'y', email: DOCTOR_EMAIL })).status === 409, 'a doctor email that is already taken should be refused');
        assert((await sendJson('PUT', '/api/admin/doctors/' + doc.id, { name: 'x', regNumber: 'y', email: 'not-an-email' })).status === 400, 'an invalid doctor email should be refused');
        assert((await sendJson('POST', '/api/admin/doctors/' + doc.id + '/password', { password: 'short' })).status === 400, 'a weak password should be refused');
        assert((await sendJson('POST', '/api/admin/doctors/' + doc.id + '/password', { password: 'Doc-New-Pass-777' })).status === 200, 'resetting a doctor password failed');
        const edited = (await sendJson('GET', '/api/admin/doctors')).json.find((d) => d.id === doc.id);
        assert(edited.name === 'ZZ Renamed Doc' && edited.reg_number === 'ZZ-2' && edited.email === stampMail('doc2'), 'the doctor edits should be saved');
        await tab.send('Network.clearBrowserCookies');
        assert(await postJson('/api/doctor/login', { email: stampMail('doc2'), password: 'Doc-New-Pass-777' }) === 200, 'the doctor should sign in with the new email and password');
        assert(await postJson('/api/doctor/login', { email: stampMail('doc2'), password: 'Doc-Pass-12345' }) === 401, 'the old doctor password must stop working');
        await asAdmin();
        assert((await sendJson('DELETE', '/api/admin/doctors/' + doc.id)).status === 200, 'removing the test doctor failed');
        // receptionist
        assert((await sendJson('POST', '/api/admin/receptionists', { name: 'ZZ Edit Desk', email: stampMail('rec'), password: 'Desk-Pass-12345' })).status === 200, 'creating a receptionist failed');
        const rec = (await sendJson('GET', '/api/admin/receptionists')).json.find((r) => r.email === stampMail('rec'));
        assert((await sendJson('PUT', '/api/admin/receptionists/' + rec.id, { name: 'ZZ Renamed Desk', email: stampMail('rec2') })).status === 200, 'editing a receptionist failed');
        assert((await sendJson('PUT', '/api/admin/receptionists/' + rec.id, { name: 'x', email: process.env.E2E_RECEPTION_EMAIL })).status === 409, 'a taken reception email should be refused');
        assert((await sendJson('DELETE', '/api/admin/receptionists/' + rec.id)).status === 200, 'deleting a receptionist failed');
        assert(!(await sendJson('GET', '/api/admin/receptionists')).json.some((r) => r.id === rec.id), 'the deleted receptionist should be gone');
        await tab.send('Network.clearBrowserCookies');
        assert(await postJson('/api/reception/login', { email: stampMail('rec2'), password: 'Desk-Pass-12345' }) === 401, 'a deleted receptionist must not sign in');
        // the admin's own account
        await asAdmin();
        assert((await sendJson('POST', '/api/admin/me/password', { currentPassword: 'wrong-password', newPassword: 'Another-Pass-1234' })).status === 403, 'a wrong current password should be refused');
        assert((await sendJson('POST', '/api/admin/me/password', { currentPassword: ADMIN_PASSWORD, newPassword: 'short' })).status === 400, 'a weak new password should be refused');
        assert((await sendJson('POST', '/api/admin/me/password', { currentPassword: ADMIN_PASSWORD, newPassword: 'Another-Pass-1234' })).status === 200, 'changing the admin password failed');
        await tab.send('Network.clearBrowserCookies');
        assert(await postJson('/api/admin/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }) === 401, 'the old admin password must stop working');
        assert(await postJson('/api/admin/login', { email: ADMIN_EMAIL, password: 'Another-Pass-1234' }) === 200, 'the new admin password should work');
        assert((await sendJson('POST', '/api/admin/me/password', { currentPassword: 'Another-Pass-1234', newPassword: ADMIN_PASSWORD })).status === 200, 'putting the admin password back failed');
      });
      await test('new online booking: every scheduled doctor gets a personal claim link; the first to claim wins and the others go inactive', async () => {
        await asAdmin();
        const mail = (n) => `zz-e2e-claim-${n}-${STAMP}@example.invalid`;
        const ids = {};
        for (const n of ['a', 'b']) {
          assert((await sendJson('POST', '/api/admin/doctors', { name: 'ZZ Claim ' + n.toUpperCase(), regNumber: 'ZZ-' + n, email: mail(n), password: 'Claim-Pass-12345' })).status === 200, 'creating doctor ' + n + ' failed');
          ids[n] = (await sendJson('GET', '/api/admin/doctors')).json.find((d) => d.email === mail(n)).id;
          const ranges = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, startTime: '00:00', endTime: '23:45' }));
          assert((await sendJson('PUT', '/api/admin/doctors/' + ids[n] + '/availability', { ranges })).status === 200, 'setting hours for doctor ' + n + ' failed');
        }
        // a third doctor with NO hours must not be told about it
        assert((await sendJson('POST', '/api/admin/doctors', { name: 'ZZ Claim C', regNumber: 'ZZ-c', email: mail('c'), password: 'Claim-Pass-12345' })).status === 200, 'creating doctor c failed');
        ids.c = (await sendJson('GET', '/api/admin/doctors')).json.find((d) => d.email === mail('c')).id;
        // an online booking is made and confirmed (demo mode)
        await tab.send('Network.clearBrowserCookies');
        const svcs = await tab.ev(`fetch('/api/services').then((r) => r.json())`);
        const svcKey = Object.keys(svcs).find((k) => svcs[k].label === 'Phone Consultation');
        assert(svcKey, 'the Phone Consultation service should exist');
        const slots = (await tab.ev(`fetch('/api/slots?service=${svcKey}').then((r) => r.json())`));
        assert(slots.length > 0, 'there should be bookable times once doctors have hours');
        const slot = slots.find((x) => { const h = new Date(x.start).getHours(); return h >= 10 && h <= 17; }) || slots[0];
        const made = (await tab.ev(`fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serviceType: '${svcKey}', patientName: 'ZZ Claim Patient ${STAMP}', patientDob: '1980-01-01', patientPhone: '0851112222', patientEmail: 'zz-claim-patient-${STAMP}@example.invalid', reason: 'E2E claim test', slotStart: ${JSON.stringify(slot.start)}, slotEnd: ${JSON.stringify(slot.end)} }) }).then((r) => r.json())`));
        assert(made.bookingId, 'creating the booking failed: ' + JSON.stringify(made));
        const paid = await tab.ev(`fetch('/api/bookings/${made.bookingId}/confirm-payment', { method: 'POST' }).then((r) => r.json())`);
        assert(paid.status === 'paid', 'demo confirmation failed: ' + JSON.stringify(paid));
        const tokenFor = async (n) => {
          await tab.send('Network.clearBrowserCookies');
          assert(await postJson('/api/doctor/login', { email: mail(n), password: 'Claim-Pass-12345' }) === 200, 'doctor ' + n + ' login failed');
          const pending = (await sendJson('GET', '/api/doctor/claims/pending')).json;
          return (pending.find((p) => p.id === made.bookingId) || {}).token;
        };
        const tokA = await tokenFor('a'); const tokB = await tokenFor('b'); const tokC = await tokenFor('c');
        assert(/^[0-9a-f]{48}$/.test(tokA || '') && /^[0-9a-f]{48}$/.test(tokB || '') && tokA !== tokB, 'both scheduled doctors should have their own claim link');
        assert(!tokC, 'a doctor who is not scheduled must not be given a link');
        const status = async (t) => (await sendJson('GET', '/api/doctor/claims/' + t + '/status')).json.state;
        await tab.send('Network.clearBrowserCookies');
        assert(await status(tokA) === 'open' && await status(tokB) === 'open', 'both links should be live before anyone claims');
        assert(await status('nonsense') === 'invalid' && !JSON.stringify(await sendJson('GET', '/api/doctor/claims/' + tokA + '/status')).match(/ZZ Claim|patient/i), 'the public status must reveal nothing about the patient or doctors');
        // a link only works for the doctor it was sent to
        await tokenFor('b');
        assert((await sendJson('POST', '/api/doctor/claims/' + tokA + '/claim')).status === 403, 'doctor B must not be able to use doctor A\'s link');
        // doctor A claims from the link
        await tokenFor('a');
        const mine = await sendJson('POST', '/api/doctor/claims/' + tokA + '/claim');
        assert(mine.json.ok === true && mine.json.bookingId === made.bookingId, 'doctor A should claim the case: ' + JSON.stringify(mine));
        assert((await sendJson('POST', '/api/doctor/claims/' + tokA + '/claim')).json.ok === true, 'claiming again is harmless for the owner');
        await tab.send('Network.clearBrowserCookies');
        assert(await status(tokA) === 'mine' && await status(tokB) === 'claimed', 'doctor B\'s link must now be inactive');
        // the "waiting" list no longer shows it to B, and B is told who has it
        await tokenFor('b');
        assert(!(await sendJson('GET', '/api/doctor/claims/pending')).json.some((p) => p.id === made.bookingId), 'a claimed case must leave the waiting list');
        const late = await sendJson('POST', '/api/doctor/claims/' + tokB + '/claim');
        assert(late.json.ok === false && late.json.state === 'claimed' && /ZZ Claim A/.test(late.json.error), 'doctor B should be told it is already claimed by A: ' + JSON.stringify(late));
        const chartB = (await sendJson('GET', '/api/doctor/bookings/' + made.bookingId)).json;
        assert(chartB.claim.byName === 'ZZ Claim A' && chartB.claim.mine === false, 'the chart should show who owns the case');
        assert((await sendJson('POST', '/api/doctor/bookings/' + made.bookingId + '/start-call', { mode: 'video' })).status === 409, 'another doctor must not start the call on a claimed case');
        assert((await sendJson('POST', '/api/doctor/bookings/' + made.bookingId + '/release')).status === 403, 'only the owner can release');
        // UI: the email link, opened by B, explains it is inactive (signed out first, then signed in)
        await tab.send('Network.clearBrowserCookies');
        await tab.goto('/dashboard.html?claim=' + tokB);
        await tab.waitFor(`!document.getElementById('claimNotice').hidden && /already been claimed|already claimed/.test(document.getElementById('claimNotice').textContent) && /no longer active/.test(document.getElementById('claimNotice').textContent)`, 6000, 'notice on the login screen');
        await tab.set('#emailInput', mail('b')); await tab.set('#passwordInput', 'Claim-Pass-12345');
        await tab.ev(`document.querySelector('#loginBox button.btn-primary').click()`);
        await tab.waitFor(`!document.getElementById('claimBanner').hidden && /no longer active/.test(document.getElementById('claimBanner').textContent)`, 8000, 'banner after signing in');
        assert(!/claim=/.test(await tab.ev(`location.search`)), 'the token should be removed from the address bar');
        await tab.shot('doctor-claim-inactive');
        // A releases: the link is live again, and B can take it
        await tokenFor('a');
        assert((await sendJson('POST', '/api/doctor/bookings/' + made.bookingId + '/release')).status === 200, 'the owner should be able to release');
        await tab.send('Network.clearBrowserCookies');
        assert(await status(tokB) === 'open', 'after a release the other link should work again');
        await tokenFor('b');
        assert((await sendJson('POST', '/api/doctor/claims/' + tokB + '/claim')).json.ok === true, 'doctor B should now be able to claim it');
        // Claim UI: B opens the chart and sees it as theirs; A sees it is B's
        await tab.goto('/dashboard.html?claim=' + tokB);
        await tab.waitFor(`!document.getElementById('claimBanner').hidden`, 8000, 'claim banner');
        await tab.waitFor(`getComputedStyle(document.getElementById('detailPanel')).display !== 'none' && /Claimed by you/.test(document.getElementById('chartPatientMeta').innerText)`, 8000, 'chart opens as claimed by you');
        await tab.shot('doctor-claim-chart');
        // clean up the three test doctors
        await asAdmin();
        // doctors who have opened charts are part of the audit trail: deleting is refused with a helpful message, deactivating works
        const del = await sendJson('DELETE', '/api/admin/doctors/' + ids.b);
        assert(del.status === 409 && /Deactivate/.test(del.json.error || ''), 'deleting a doctor with records should explain to deactivate instead: ' + JSON.stringify(del));
        for (const n of ['a', 'b', 'c']) assert((await sendJson('POST', '/api/admin/doctors/' + ids[n] + '/deactivate')).status === 200, 'deactivating test doctor ' + n + ' failed');
        await tab.send('Network.clearBrowserCookies');
        assert(await postJson('/api/doctor/login', { email: mail('a'), password: 'Claim-Pass-12345' }) === 403 || await postJson('/api/doctor/login', { email: mail('a'), password: 'Claim-Pass-12345' }) === 401, 'a deactivated doctor must not sign in');
      });
      await test('admin dashboard: Website settings link, My account tab, Edit details buttons', async () => {
        await asAdmin();
        await tab.goto('/admin-dashboard.html');
        await tab.waitFor(`!!document.getElementById('tabBtn_account')`, 6000, 'admin tabs');
        assert(await tab.ev(`!!document.querySelector('a[href="/admin-site.html"]') && !!document.getElementById('tabBtn_website')`), 'a link to Website settings should be on the admin dashboard');
        await tab.waitFor(`!!document.querySelector('#setupCard .setup-card') && /of \\d+ done/.test(document.getElementById('setupCard').innerText)`, 6000, 'setup checklist');
        const setup = (await sendJson('GET', '/api/admin/setup-status')).json;
        assert(setup.total >= 10 && setup.items.every((i) => i.key && i.label && typeof i.ok === 'boolean') && !JSON.stringify(setup).match(/sk_(live|test)_|whsec_/i), 'the setup checklist should list what is missing, without revealing any secret');
        assert(setup.items.find((i) => i.key === 'payments').ok === false || !!process.env.STRIPE_SECRET_KEY, 'payments should be flagged as not set up when there is no Stripe key');
        assert(await tab.ev(`!!document.getElementById('testEmailBtn')`), 'the checklist should offer a test email');
        const te = await sendJson('POST', '/api/admin/test-email');
        assert(te.status === 400 || te.status === 200 || te.status === 502, 'the test email should answer clearly: ' + JSON.stringify(te));
        if (te.status === 400) assert(/not set up/i.test(te.json.error), 'when email is not set up the answer should say so');
        await tab.ev(`showAdminTab('doctors')`);
        await tab.waitFor(`/Edit details/.test(document.getElementById('doctorsBody').innerText)`, 6000, 'edit buttons');
        await tab.ev(`showAdminTab('account')`);
        await tab.waitFor(`document.getElementById('myEmail').value.length > 0`, 6000, 'my account');
      });
      await test('website settings: everything is put back to the original afterwards', async () => {
        await asAdmin();
        for (const n of ['clinic', 'text', 'faq', 'banner']) assert((await sendJson('POST', '/api/admin/site/reset/' + n)).status === 200, 'reset ' + n + ' failed');
        const cur = (await sendJson('GET', '/api/admin/site')).json;
        assert(Object.keys(cur.clinic).length === 0 && Object.keys(cur.text).length === 0 && cur.faq === null && cur.banner === null && Object.keys(cur.images).length === 0, 'settings should be back to the originals: ' + JSON.stringify(cur).slice(0, 200));
        await tab.send('Network.clearBrowserCookies');
        await tab.goto('/contact.html');
        await sleep(400);
        assert(await tab.ev(`document.querySelector('.loc [data-clinic-address]').innerText.trim() === 'Address coming soon'`), 'the address should be hidden again');
      });
    }

    // ---------------------------------------------------------------- 7. abuse protection (last — it blocks this network for a while)
    heading('Abuse protection');
    await test('public forms are rate-limited (429 with a friendly message after too many submissions)', async () => {
      await tab.goto('/');
      const out = await tab.ev(`(async () => { let last; for (let i = 0; i < 14; i++) { last = await fetch('/api/walk-in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } return { status: last.status, body: await last.json() }; })()`);
      assert(out.status === 429 && /try again later/i.test(out.body.error), 'expected 429, got ' + out.status);
    });
  } finally {
    close();
  }
}

main().catch((e) => { console.error('\nRunner crashed:', e.message); results.push({ section: 'runner', name: 'crash', ok: false, err: e.message }); }).finally(() => {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${'='.repeat(70)}\n${results.length - failed.length} passed, ${failed.length} failed of ${results.length} checks`);
  if (failed.length) { console.log('\nFAILURES:'); failed.forEach((f) => console.log(` ✗ [${f.section}] ${f.name}\n     ${f.err}`)); }
  if (ctx.walkinRef || ctx.regRef) console.log(`\nTest records created: walk-in ${ctx.walkinRef || '-'}, registration ${ctx.regRef || '-'}${ctx.bookingId ? ', booking ' + ctx.bookingId : ''}`);
  process.exit(failed.length ? 1 : 0);
});
