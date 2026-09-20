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
              stickyOk: document.body.dataset.sticky === 'off' || !document.querySelector('.sticky-cta') || getComputedStyle(document.querySelector('.sticky-cta')).display !== 'none',
              hrefs: [...(window.__h || [])] }; })()`);
          info.hrefs.forEach((h) => hrefs.add(h));
          assert(info.status === 200, 'HTTP ' + info.status);
          assert(info.title && info.title.length > 5, 'missing <title>');
          assert(info.h1 === 1, `expected exactly one <h1>, found ${info.h1}`);
          assert(info.main, 'missing <main id="main">');
          assert(info.overflow <= 1, `horizontal overflow of ${info.overflow}px`);
          assert(!/George Street/i.test(info.text), 'street name is visible');
          if (info.footerAddr !== undefined) assert(info.footerAddr === 'Address coming soon', `footer address shows "${info.footerAddr}"`);
          assert(info.brokenImgs.length === 0, 'broken images: ' + info.brokenImgs.join(', '));
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
    await test('Book Now → choose online → online booking page', async () => {
      await tab.goto('/');
      await tab.clickNav(`document.querySelector('header a.btn-primary')`);
      assert(await tab.ev('location.pathname') === '/book-now.html', 'Book Now did not open /book-now.html');
      const both = await tab.ev(`!!([...document.querySelectorAll('a')].find((a) => /Book an Online GP Consultation/.test(a.textContent))) && !!([...document.querySelectorAll('a')].find((a) => /Book In for Walk-In/i.test(a.textContent)))`);
      assert(both, 'both options (online + walk-in) should be offered');
      await tab.clickNav(`[...document.querySelectorAll('main a')].find((a) => /Book an Online GP Consultation/.test(a.textContent))`);
      assert(await tab.ev('location.pathname') === '/book.html', 'did not reach /book.html');
      assert(await tab.ev(`/not an appointment at the clinic/i.test(document.body.innerText)`), 'booking page should say it is an online booking');
    });
    await test('Book Now → walk-in option → walk-in booking form', async () => {
      await tab.goto('/book-now.html');
      await tab.clickNav(`[...document.querySelectorAll('main a')].find((a) => /Book In for Walk-In/i.test(a.textContent))`);
      assert((await tab.ev('location.pathname + location.hash')) === '/walk-in.html#book-in', 'wrong destination');
      assert(await tab.ev(`!!document.getElementById('bookInForm')`), 'walk-in form missing');
    });
    await test('homepage hero: two equal main actions + four pathway tiles', async () => {
      await tab.goto('/');
      const r = await tab.ev(`({ ctas: [...document.querySelectorAll('.hero2-actions a')].map((a) => a.textContent.trim()), tiles: document.querySelectorAll('.tile').length })`);
      assert(r.ctas.length === 2 && /Online GP/.test(r.ctas[0]) && /Walk-In/.test(r.ctas[1]), 'hero actions wrong: ' + r.ctas.join(' | '));
      assert(r.tiles >= 4, 'expected 4 pathway tiles');
    });
    await test('current page is marked in the navigation', async () => {
      await tab.goto('/fees.html');
      assert(await tab.ev(`document.querySelector('nav.main-nav a[aria-current="page"]')?.textContent.trim()`) === 'Fees', 'Fees link not marked current');
    });
    await test('Fees page shows live prices in euro', async () => {
      await tab.goto('/fees.html');
      await tab.waitFor(`document.querySelectorAll('.price-row').length >= 5`, 8000, 'price rows');
      assert(await tab.ev(`/€\\d/.test(document.querySelector('.price-list').innerText)`), 'no € prices shown');
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
      await tab.waitFor(`!document.getElementById('bookInDone').hidden`, 8000, 'walk-in success panel');
      ctx.walkinRef = await tab.ev(`document.getElementById('bookInRef').textContent`);
      assert(/^WI-/.test(ctx.walkinRef), 'bad reference ' + ctx.walkinRef);
      assert(await tab.ev(`window.__xss === undefined`), 'script in the form text was executed');
    });
    await test('registration form: validation, family members, submits and shows a reference', async () => {
      await tab.goto('/new-patients.html');
      await tab.ev(`document.getElementById('registerSubmit').click()`);
      assert(/required fields/i.test(await tab.ev(`document.getElementById('registerError').textContent`)), 'no required-fields message');
      await tab.ev(`document.getElementById('addFamilyBtn').click(); document.getElementById('addFamilyBtn').click()`);
      ctx.regName = `ZZ TEST Register ${STAMP}`;
      await tab.set('#fullName', ctx.regName); await tab.set('#dob', '1980-05-05'); await tab.set('#phone', '0000000000');
      await tab.set('#email', 'zz-test@example.invalid'); await tab.set('#address', 'TEST ADDRESS - please ignore');
      await tab.ev(`document.getElementById('registerSubmit').click()`);
      assert(/Privacy Notice/i.test(await tab.ev(`document.getElementById('registerError').textContent`)), 'consent not enforced');
      await tab.ev(`document.getElementById('consent').checked = true; const r = document.getElementById('familyRows').children[0]; r.querySelector('.fm-name').value = 'ZZ TEST Kid'; r.querySelector('.fm-dob').value = '2018-01-01'; r.querySelector('.fm-rel').value = 'Son'; document.getElementById('registerSubmit').click()`);
      await tab.waitFor(`!document.getElementById('registerDone').hidden`, 8000, 'registration success panel');
      ctx.regRef = await tab.ev(`document.getElementById('registerRef').textContent`);
      assert(/^REG-/.test(ctx.regRef), 'bad reference ' + ctx.regRef);
    });

    if (LIVE) { console.log('\n(live mode: booking, staff and load tests are skipped — they would create real bookings / need staff logins)'); return; }

    // ---------------------------------------------------------------- 5. online booking journey (patient)
    heading('Patient journey: online booking → payment → confirmation → account');
    ctx.patientEmail = `zz-e2e-${STAMP}@example.invalid`; ctx.patientName = `ZZ E2E Patient ${STAMP}`; ctx.patientPass = 'E2e-Pass-12345';
    await test('choose a service, fill the questionnaire, pick a time, review', async () => {
      await tab.goto('/book.html');
      await tab.waitFor(`document.querySelectorAll('#serviceChoices > *').length >= 6`, 8000, 'service cards');
      await tab.ev(`[...document.querySelectorAll('#serviceChoices > *')].find((c) => /Phone Consultation/.test(c.textContent)).click()`);
      await tab.waitFor(`getComputedStyle(document.getElementById('step2')).display !== 'none'`, 6000, 'step 2');
      await tab.set('[name=patientName]', ctx.patientName); await tab.set('[name=patientDob]', '1985-03-04'); await tab.set('[name=patientPhone]', '0851112222');
      await tab.set('[name=patientEmail]', ctx.patientEmail); await tab.set('[name=reason]', 'E2E test consultation - please ignore');
      await tab.ev(`document.getElementById('step2ContinueBtn').click()`);
      await tab.waitFor(`getComputedStyle(document.getElementById('step3')).display !== 'none' && document.querySelectorAll('.slot-btn').length > 0`, 8000, 'time slots');
      await tab.ev(`document.querySelector('.slot-btn').click()`);
      await tab.waitFor(`getComputedStyle(document.getElementById('step4')).display !== 'none'`, 6000, 'review step');
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
    await test('Clinic tab: walk-in appears, text is escaped, status buttons work', async () => {
      await tab.ev(`showTab('clinic')`);
      await tab.waitFor(`document.getElementById('walkInList').innerText.includes(${JSON.stringify(ctx.walkinName)})`, 8000, 'walk-in in list');
      assert(await tab.ev(`document.querySelector('#walkInList img') === null`), 'patient text was rendered as HTML');
      const card = `[...document.querySelectorAll('#walkInList .card')].find((c) => c.innerText.includes(${JSON.stringify(ctx.walkinName)}))`;
      await tab.ev(`[...${card}.querySelectorAll('button')].find((b) => /Mark arrived/.test(b.textContent)).click()`);
      await tab.waitFor(`${card}.innerText.includes('Arrived')`, 6000, 'status Arrived');
      await tab.ev(`[...${card}.querySelectorAll('button')].find((b) => /Mark seen/.test(b.textContent)).click()`);
      await tab.waitFor(`${card}.innerText.includes('Seen')`, 6000, 'status Seen');
    });
    await test('Clinic tab: registration shows family members and can be marked processed', async () => {
      await tab.waitFor(`document.getElementById('registrationList').innerText.includes(${JSON.stringify(ctx.regName)})`, 8000, 'registration in list');
      const det = `[...document.querySelectorAll('#registrationList details')].find((d) => d.innerText.includes(${JSON.stringify(ctx.regName)}))`;
      await tab.ev(`${det}.open = true`);
      const text = await tab.ev(`${det}.innerText`);
      assert(/Family members to register \(1\)/.test(text) && text.includes('ZZ TEST Kid'), 'family member missing');
      assert(text.includes('TEST ADDRESS'), 'encrypted address did not decrypt for the doctor');
      await tab.ev(`[...${det}.querySelectorAll('button')].find((b) => /Mark as processed/.test(b.textContent)).click()`);
      await tab.waitFor(`document.getElementById('registrationList').innerText.includes('Processed')`, 6000, 'status Processed');
    });
    await test('the online booking appears in Recent Cases and its chart opens with the patient message', async () => {
      await tab.ev(`showTab('recent')`);
      await tab.waitFor(`document.getElementById('recentBody').innerText.includes(${JSON.stringify(ctx.patientName)})`, 8000, 'booking in recent cases');
      await tab.ev(`[...document.querySelectorAll('#recentBody tr')].find((r) => r.innerText.includes(${JSON.stringify(ctx.patientName)})).click()`);
      await tab.waitFor(`getComputedStyle(document.getElementById('detailPanel')).display !== 'none' && document.getElementById('detailPanel').textContent.includes('E2E: hello doctor')`, 10000, 'chart with patient message');
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
