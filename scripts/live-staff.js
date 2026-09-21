/*
 * Signed-in checks for the LIVE site, using three throwaway accounts (admin, doctor, receptionist) made for the purpose.
 * Run with:  E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… E2E_DOCTOR_EMAIL=… E2E_DOCTOR_PASSWORD=… E2E_RECEPTION_EMAIL=… E2E_RECEPTION_PASSWORD=…
 *            node scripts/e2e.js --live-staff https://www.gp4u.ie
 *
 * What it does and does not touch:
 *   - It only READS the real site's data (dashboards, lists, settings screens).
 *   - It never saves anything in Website settings, never changes a password, never books an online consultation (so no doctor is emailed).
 *   - The only things it creates are a walk-in and a desk registration named "ZZ LIVE TEST …", with a note, a prescription and a
 *     certificate on the walk-in. They are removed at the end with the admin's "Remove test records" tool (which only ever
 *     touches names starting "ZZ LIVE TEST").
 */
module.exports = async function run({ tab, test, heading, assert, sleep, STAMP, notes }) {
  const env = process.env;
  const need = ['E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD', 'E2E_DOCTOR_EMAIL', 'E2E_DOCTOR_PASSWORD', 'E2E_RECEPTION_EMAIL', 'E2E_RECEPTION_PASSWORD'];
  const missing = need.filter((k) => !env[k]);
  if (missing.length) { await test('test accounts provided', async () => { throw new Error('missing ' + missing.join(', ')); }); return; }
  const NAME = `ZZ LIVE TEST ${STAMP}`;
  const REG = `ZZ LIVE TEST Reg ${STAMP}`;
  const postJson = (url, body) => tab.ev(`fetch(${JSON.stringify(url)}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${JSON.stringify(body || {})}) }).then((r) => r.status)`);
  const sendJson = (method, url, body) => tab.ev(`fetch(${JSON.stringify(url)}, { method: ${JSON.stringify(method)}, headers: { 'Content-Type': 'application/json' }, body: ${body === undefined ? 'undefined' : `JSON.stringify(${JSON.stringify(body)})`} }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }))`);
  const fresh = async () => { await tab.send('Network.clearBrowserCookies'); await tab.goto('/'); };
  const asRole = async (role) => {
    await fresh();
    const r = role === 'admin' ? ['/api/admin/login', env.E2E_ADMIN_EMAIL, env.E2E_ADMIN_PASSWORD]
      : role === 'doctor' ? ['/api/doctor/login', env.E2E_DOCTOR_EMAIL, env.E2E_DOCTOR_PASSWORD]
        : ['/api/reception/login', env.E2E_RECEPTION_EMAIL, env.E2E_RECEPTION_PASSWORD];
    const status = await postJson(r[0], { email: r[1], password: r[2] });
    assert(status === 200, `${role} sign-in failed (HTTP ${status}). Check the test account's email/password, and that it is active${role === 'doctor' ? ' and does not need a 2FA code' : ''}.`);
  };
  const noErrors = () => assert(tab.errors.length === 0, 'browser errors: ' + tab.errors.join(' | '));

  // ------------------------------------------------------------------ what is deployed
  heading('Live: the deployed version and its database');
  await test('the live server answers with the new settings, claims and setup features', async () => {
    await fresh();
    const cfg = await tab.ev(`fetch('/api/config').then((r) => r.json())`);
    notes.push(`payments configured: ${cfg.stripeConfigured}; email configured: ${cfg.emailConfigured}`);
    assert(typeof cfg.stripeConfigured === 'boolean', 'config not readable');
    const st = await tab.ev(`fetch('/api/doctor/claims/000000000000000000000000000000000000000000000000/status').then((r) => r.json())`);
    assert(st.state === 'invalid', 'claim-link status endpoint missing (is the latest version deployed?)');
  });

  // ------------------------------------------------------------------ admin: read-only tour
  heading('Live admin (read-only): dashboards and settings screens');
  await test('admin: dashboard loads with real numbers, setup checklist, doctors and reception lists', async () => {
    await asRole('admin');
    await tab.goto('/admin-dashboard.html');
    await tab.waitFor(`/^\\d+$/.test(document.getElementById('stat_totalPatients').textContent)`, 10000, 'analytics numbers');
    await tab.waitFor(`!!document.querySelector('#setupCard .setup-card') && /of \\d+ done/.test(document.getElementById('setupCard').innerText)`, 8000, 'setup checklist');
    const setup = (await sendJson('GET', '/api/admin/setup-status')).json;
    notes.push('setup checklist: ' + setup.items.map((i) => `${i.ok ? 'OK ' : 'TODO'} ${i.key}`).join(', '));
    await tab.ev(`showAdminTab('doctors')`); await tab.waitFor(`document.getElementById('doctorsBody').innerText.length > 5`, 8000, 'doctors list');
    await tab.ev(`showAdminTab('reception')`); await tab.waitFor(`document.getElementById('receptionBody').innerText.length > 5`, 8000, 'reception list');
    await tab.ev(`showAdminTab('patients')`); await sleep(800);
    await tab.ev(`showAdminTab('accesslog')`); await sleep(500);
    await tab.ev(`showAdminTab('account')`); await tab.waitFor(`document.getElementById('adminsBody').innerText.length > 5`, 8000, 'admin accounts');
    noErrors();
  });
  await test('admin: every Website settings screen opens and shows the live values (nothing is saved)', async () => {
    await tab.goto('/admin-site.html');
    await tab.waitFor(`getComputedStyle(document.getElementById('siteBox')).display !== 'none' && !!document.getElementById('detailsForm')`, 10000, 'website settings');
    for (const p of ['hours', 'fees', 'text', 'photos', 'faq', 'banner', 'history']) {
      await tab.ev(`document.querySelector('#siteNav [data-pane=${p}]').click()`); await sleep(500);
      assert(await tab.ev(`document.getElementById('pane_${p}').innerText.length > 20`), p + ' pane is empty');
    }
    const site = (await sendJson('GET', '/api/admin/site')).json;
    assert(site.registry.text.length > 50 && site.registry.images.length >= 12, 'the editor should list the editable wording and photos');
    notes.push(`website settings in use: clinic overrides ${Object.keys(site.clinic).length}, wording overrides ${Object.keys(site.text).length}, custom FAQs ${Array.isArray(site.faq)}, banner ${site.banner && site.banner.enabled}`);
  });

  // ------------------------------------------------------------------ doctor: read-only tour
  heading('Live doctor (read-only): every section of the dashboard');
  await test('doctor: dashboard opens; each section opens alone at the top; lists load without errors', async () => {
    await asRole('doctor');
    await tab.goto('/dashboard.html');
    await tab.waitFor(`getComputedStyle(document.getElementById('dashboardBox')).display !== 'none'`, 10000, 'dashboard');
    await tab.waitFor(`[...document.querySelectorAll('#tab_today .stat-num')].every((e) => /^\\d+$/.test(e.textContent))`, 10000, 'today numbers');
    for (const t of ['online', 'walkin', 'search', 'registrations', 'tasks', 'teammsg', 'security', 'today']) {
      await tab.ev(`window.scrollTo(0, 400); showTab('${t}')`); await sleep(500);
      const r = await tab.ev(`({ shown: [...document.querySelectorAll('[id^="tab_"]')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.id).join(','), y: window.scrollY })`);
      assert(r.shown === 'tab_' + t && r.y === 0, `${t}: ${JSON.stringify(r)}`);
    }
    const pend = await sendJson('GET', '/api/doctor/claims/pending');
    assert(pend.status === 200 && Array.isArray(pend.json), 'the waiting-for-a-doctor list should load (this touches the new claims tables)');
    for (const u of ['/api/doctor/schedule?type=online&date=2026-09-22', '/api/doctor/recent?type=walkin', '/api/doctor/recent?type=online', '/api/doctor/search?q=zz', '/api/doctor/tasks', '/api/doctor/clinic/registrations', '/api/doctor/clinic/walk-ins']) {
      const r = await sendJson('GET', u); assert(r.status === 200, u + ' returned ' + r.status);
    }
    noErrors();
  });

  // ------------------------------------------------------------------ front desk: read tour + the two test records
  heading('Live front desk: screens, then a test walk-in and a test registration');
  await test('reception: the desk opens; a test walk-in and a test desk registration are created', async () => {
    await asRole('reception');
    await tab.goto('/reception.html');
    await tab.waitFor(`!document.getElementById('deskBox').hidden`, 10000, 'front desk');
    await tab.waitFor(`[...document.querySelectorAll('.stat-num')].every((e) => /^\\d+$/.test(e.textContent))`, 8000, 'numbers');
    for (const t of ['appts', 'regs', 'desk', 'queue']) { await tab.ev(`document.getElementById('tabBtn_${t}').click()`); await sleep(600); }
    const w = await sendJson('POST', '/api/reception/walk-ins', { fullName: NAME, dob: '1980-05-05', phone: '0000000000', reason: 'Live test chest pain - please ignore' });
    assert(w.status === 200 && /^WALK-/.test(w.json.bookingId || ''), 'adding the test walk-in failed: ' + JSON.stringify(w));
    const r = await sendJson('POST', '/api/reception/registrations', { fullName: REG, dob: '1985-05-05', phone: '0000000000', address: 'LIVE TEST ADDRESS', allergies: 'LIVE TEST allergy', consentConfirmed: true, familyMembers: [{ name: 'ZZ LIVE TEST Kid', dob: '2018-01-01', relationship: 'Son' }] });
    assert(r.status === 200, 'the desk registration failed: ' + JSON.stringify(r));
    global.__liveBooking = w.json.bookingId;
    noErrors();
  });

  // ------------------------------------------------------------------ doctor works the test walk-in
  heading('Live doctor: chart, note, prescription, certificate, PDFs and print pages for the test walk-in');
  await test('doctor: the walk-in is in the queue as a chart; a note, prescription and certificate can be issued', async () => {
    await asRole('doctor');
    await tab.goto('/dashboard.html');
    await tab.waitFor(`getComputedStyle(document.getElementById('dashboardBox')).display !== 'none'`, 10000, 'dashboard');
    const id = global.__liveBooking;
    const chart = (await sendJson('GET', '/api/doctor/bookings/' + id)).json;
    assert(chart.booking && chart.booking.service_type === 'walk_in' && chart.booking.patient_name === NAME, 'the walk-in should be a chart');
    assert((await sendJson('POST', `/api/doctor/bookings/${id}/notes`, { noteText: 'LIVE TEST note' })).status === 200, 'saving a note failed (this exercises the live encryption key)');
    assert((await sendJson('POST', `/api/doctor/bookings/${id}/prescriptions`, { medication: 'LIVE TEST Medicine', dose: '10mg', frequency: 'daily', duration: '1 day', quantity: '1', instructions: 'test only', pharmacyName: 'ZZ Test Pharmacy' })).status === 200, 'issuing a prescription failed');
    const cert = await sendJson('POST', `/api/doctor/bookings/${id}/documents`, { docType: 'sick_cert', fields: { dateFrom: '2026-09-22', dateTo: '2026-09-23', diagnosis: 'Live test', fitForWork: 'unfit for work' } });
    assert(cert.status === 200, 'issuing a certificate failed');
    const full = (await sendJson('GET', '/api/doctor/bookings/' + id)).json;
    assert(full.notes.length === 1 && full.notes[0].note_text === 'LIVE TEST note', 'the note should read back decrypted');
    const rx = full.prescriptions[0];
    const pdfs = await tab.ev(`Promise.all([${JSON.stringify('/api/doctor/prescriptions/' + rx.id + '/pdf')}, ${JSON.stringify('/api/doctor/documents/' + cert.json.id + '/pdf')}].map((u) => fetch(u).then(async (r) => { const b = new Uint8Array(await r.arrayBuffer()); return [r.status, r.headers.get('content-type'), String.fromCharCode(...b.slice(0, 5)), b.length]; })))`);
    assert(pdfs.every((p) => p[0] === 200 && p[1] === 'application/pdf' && p[2] === '%PDF-' && p[3] > 1500), 'the PDFs should download: ' + JSON.stringify(pdfs));
    await tab.goto('/print-rx.html?rxId=' + rx.id);
    await tab.waitFor(`document.getElementById('letter').innerText.includes('LIVE TEST Medicine')`, 8000, 'printable prescription');
    const p = await tab.ev(`document.getElementById('letter').innerText`);
    notes.push('live prescription letterhead shows: ' + p.split('\n').slice(0, 6).join(' | '));
    assert(/RX-\d{5}/.test(p) && /Walk-in clinic visit/.test(p) && /ZZ Test Pharmacy/.test(p) && !/One Tap/.test(p), 'the printout looks wrong: ' + p.slice(0, 300));
    // the desk registration is visible to the doctor and marked as desk
    const regs = JSON.stringify((await sendJson('GET', '/api/doctor/clinic/registrations')).json);
    assert(regs.includes(REG) && regs.includes('LIVE TEST ADDRESS'), 'the desk registration should be visible to the doctor');
    // finish the visit
    assert((await sendJson('POST', `/api/doctor/bookings/${id}/complete`)).status === 200, 'completing the visit failed');
    noErrors();
  });

  // ------------------------------------------------------------------ permissions on the real server
  heading('Live permissions: each role only reaches its own area');
  await test('reception and doctor cannot reach admin or each other; signed-out visitors reach nothing', async () => {
    await asRole('reception');
    for (const u of ['/api/doctor/schedule', '/api/admin/site', '/api/admin/doctors', `/api/doctor/bookings/${global.__liveBooking}`]) assert((await sendJson('GET', u)).status === 401, 'reception reached ' + u);
    await asRole('doctor');
    for (const u of ['/api/admin/site', '/api/admin/setup-status', '/api/reception/summary']) assert((await sendJson('GET', u)).status === 401, 'a doctor reached ' + u);
    assert((await sendJson('PUT', '/api/admin/site/clinic', { phone: '111 111' })).status === 401, 'a doctor must not edit the website');
    await fresh();
    for (const u of ['/api/doctor/schedule', '/api/reception/summary', '/api/admin/site', '/api/doctor/claims/pending']) assert((await sendJson('GET', u)).status === 401, 'a signed-out visitor reached ' + u);
  });

  // ------------------------------------------------------------------ clean up
  heading('Live clean-up: the test records are removed');
  await test('admin removes the "ZZ LIVE TEST" records, and nothing else', async () => {
    await asRole('admin');
    const r = await sendJson('POST', '/api/admin/remove-test-records', { confirm: true });
    assert(r.status === 200 && r.json.counts.bookings >= 1 && r.json.counts.walkIns >= 1 && r.json.counts.registrations >= 1, 'removal failed: ' + JSON.stringify(r));
    notes.push('removed: ' + JSON.stringify(r.json.counts));
    await asRole('doctor');
    const left = JSON.stringify([(await sendJson('GET', '/api/doctor/clinic/walk-ins')).json, (await sendJson('GET', '/api/doctor/clinic/registrations')).json, (await sendJson('GET', '/api/doctor/recent')).json]);
    assert(!left.includes('ZZ LIVE TEST'), 'no test record should remain');
  });
};
