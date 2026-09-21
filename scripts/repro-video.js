// Checks the video-call "my picture" window with a fake camera: small, draggable, minimise, close, restore, switch camera.
//   node scripts/repro-video.js [http://localhost:4000]
const { launchChrome } = require('./e2e');
const BASE = (process.argv[2] || 'http://localhost:4000').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) bad++; };

(async () => {
  const { tab, close } = await launchChrome();
  try {
    for (const [label, dev] of [['phone 390x844', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }], ['laptop 1366x700', { width: 1366, height: 700, deviceScaleFactor: 1, mobile: false }]]) {
      console.log('\n' + label);
      await tab.send('Emulation.setDeviceMetricsOverride', dev);
      // pretend the doctor has started the call so the page goes on to open the camera
      await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: "(() => { const f = window.fetch; window.fetch = (u, o) => String(u).indexOf('/api/') === 0 && String(u).indexOf('/bookings/') > 0 ? Promise.resolve(new Response(JSON.stringify({ started: true }), { status: 200 })) : f(u, o); })();" });
      await tab.goto(BASE + '/consult.html?id=ZZ-VIDEO&role=doctor');
      await tab.waitFor(`document.getElementById('localVideo').srcObject`, 10000, 'camera').catch(async (e) => { console.log('status:', await tab.ev(`document.getElementById('status').innerText`), (tab.errors || []).slice(-3)); throw e; });
      await sleep(600);
      const box = () => tab.ev(`(() => { const r = document.getElementById('selfView').getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), hidden: document.getElementById('selfView').hidden }; })()`);
      let b = await box();
      check(b.w <= 170 && b.h <= 230, `own picture is small (${b.w}x${b.h}px)`);
      const flipShown = await tab.ev(`!document.getElementById('flipBtn').hidden`);
      check(flipShown, 'switch-camera button shown (fake camera setup has two cameras)');
      // drag with a real mouse
      await tab.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.l + b.w / 2, y: b.t + b.h / 2 + 10, button: 'left', clickCount: 1 });
      await tab.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 60, y: 120, button: 'left' });
      await tab.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 60, y: 120, button: 'left', clickCount: 1 });
      await sleep(200);
      const b2 = await box();
      check(b2.l < b.l - 30 && b2.t < b.t - 30, `dragged to the top-left (${b.l},${b.t}) -> (${b2.l},${b2.t})`);
      check(b2.l >= 0 && b2.t >= 0, 'stays on the screen');
      // switch camera: the stream should get a different camera and stay live
      const before = await tab.ev(`localStream.getVideoTracks()[0].getSettings().deviceId`);
      await tab.ev(`document.getElementById('flipBtn').click()`);
      await sleep(1200);
      const after = await tab.ev(`({ id: localStream.getVideoTracks()[0].getSettings().deviceId, live: localStream.getVideoTracks()[0].readyState, n: localStream.getVideoTracks().length })`);
      check(after.id !== before && after.live === 'live' && after.n === 1, 'switch camera changed to another camera and is live');
      // minimise -> small chip, tap chip -> back
      await tab.ev(`document.getElementById('minBtn').click()`);
      check(await tab.ev(`document.getElementById('selfView').hidden && !document.getElementById('selfChip').hidden`), 'minimise shows only a small round button');
      const chip = await tab.ev(`(() => { const r = document.getElementById('selfChip').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await tab.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: chip.x, y: chip.y, button: 'left', clickCount: 1 });
      await tab.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: chip.x, y: chip.y, button: 'left', clickCount: 1 });
      await sleep(200);
      check(await tab.ev(`!document.getElementById('selfView').hidden && document.getElementById('selfChip').hidden`), 'tapping the small button brings the picture back');
      // close -> gone, restore from the control bar
      await tab.ev(`document.getElementById('closeSelfBtn').click()`);
      check(await tab.ev(`document.getElementById('selfView').hidden && document.getElementById('selfChip').hidden && !document.getElementById('selfBtn').hidden`), 'close hides it and offers a button in the control bar');
      await tab.ev(`document.getElementById('selfBtn').click()`);
      check(await tab.ev(`!document.getElementById('selfView').hidden`), 'control-bar button restores it');
    }
  } finally { close(); }
  console.log(bad ? `\n${bad} problem(s)` : '\nall good');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
