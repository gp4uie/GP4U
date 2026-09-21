// Reproduces "the time-slots page opens at the bottom" the way a phone user meets it: phone-sized screen, real touch/mouse click,
// real form. Prints where the page is scrolled to over time after pressing Continue.
//   node scripts/repro-scroll.js [http://localhost:4000]
const { launchChrome } = require('./e2e');
const BASE = (process.argv[2] || 'http://localhost:4000').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { tab, close } = await launchChrome();
  try {
    for (const [label, dev] of [['phone 390x844', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }], ['laptop 1366x680', { width: 1366, height: 680, deviceScaleFactor: 1, mobile: false }]]) {
      await tab.send('Emulation.setDeviceMetricsOverride', dev);
      await tab.send('Network.clearBrowserCookies');
      await tab.goto(BASE + '/book.html');
      await tab.waitFor(`document.querySelectorAll('#serviceChoices .service-card').length >= 6`, 10000, 'services');
      // choose the first service the way a patient would (real click on the card)
      const svc = await tab.ev(`(() => { const c = document.querySelector('#serviceChoices .service-card'); c.scrollIntoView({ block: 'center' }); const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, name: c.innerText.slice(0, 40) }; })()`);
      await tab.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: svc.x, y: svc.y, button: 'left', clickCount: 1 });
      await tab.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: svc.x, y: svc.y, button: 'left', clickCount: 1 });
      await sleep(800);
      const s2 = await tab.ev(`getComputedStyle(document.getElementById('step2')).display`);
      // fill the details form
      await tab.set('[name=patientName]', 'ZZ Scroll Test'); await tab.set('[name=patientDob]', '1985-03-04'); await tab.set('[name=patientPhone]', '0851112222');
      await tab.set('[name=patientEmail]', 'zz-scroll@example.invalid'); await tab.set('[name=reason]', 'scroll test');
      // scroll to the very bottom (where the Continue button is) and press it with a real click
      await tab.ev(`window.scrollTo(0, document.documentElement.scrollHeight)`);
      await sleep(400);
      const btn = await tab.ev(`(() => { const b = document.getElementById('step2ContinueBtn'); b.scrollIntoView({ block: 'end' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, docH: document.documentElement.scrollHeight, y0: window.scrollY }; })()`);
      console.log(`\n[${label}] step 2 visible: ${s2 !== 'none'}; page height ${btn.docH}px; scrolled to ${Math.round(btn.y0)}px before pressing Continue`);
      await tab.ev(`window.__log = []; (function tick() { window.__log.push(Math.round(window.scrollY)); if (window.__log.length < 60) requestAnimationFrame(tick); })()`);
      await tab.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: btn.x, y: btn.y, button: 'left', clickCount: 1 });
      await tab.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: btn.x, y: btn.y, button: 'left', clickCount: 1 });
      await sleep(400);
      const at400 = await tab.ev(`window.scrollY`);
      await tab.waitFor(`document.querySelectorAll('.slot-btn').length > 0`, 10000, 'slots');
      await sleep(1500);
      const after = await tab.ev(`({ y: Math.round(window.scrollY), docH: document.documentElement.scrollHeight, step3: getComputedStyle(document.getElementById('step3')).display, first: (document.querySelector('.slot-btn') || {}).innerText, log: window.__log.slice(0, 40).join(',') })`);
      console.log(`[${label}] after Continue: scrollY now ${after.y}px (0.4s after the click: ${Math.round(at400)}px), page height ${after.docH}px, step 3 shown: ${after.step3 !== 'none'}`);
      console.log(`[${label}] scroll position frame by frame: ${after.log}`);
    }
  } finally { close(); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
