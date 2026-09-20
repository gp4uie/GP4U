// Front-desk (receptionist) screen. Talks only to /api/reception/*. Receptionists see registration/health details, reasons for visit
// and intake answers, but never the doctor's clinical notes. Their activity is logged for admins.
// Everything patients typed is escaped before it is put on the page.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const STATUS = { expected: 'Expected', arrived: 'Arrived', seen: 'Seen', cancelled: 'Cancelled' };
  let timer = null;
  let day = new Date();

  const localDate = (d) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD in the browser's own timezone
  const age = (dob) => {
    const d = new Date(dob + 'T00:00:00'); if (Number.isNaN(d.getTime())) return '';
    const n = new Date(); let y = n.getFullYear() - d.getFullYear();
    if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) y -= 1;
    return y >= 2 ? `${y} yrs` : `${Math.max(0, Math.floor((n - d) / (30.44 * 86400000)))} months`;
  };
  const ago = (iso) => {
    const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`;
  };
  const stamp = (iso) => new Date(iso).toLocaleString('en-IE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  async function api(url, options) {
    const res = await fetch(url, options);
    if (res.status === 401) { showLogin('Your session has ended. Please sign in again.'); throw new Error('signed-out'); }
    return res;
  }
  const post = (url, body) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

  // ---------------------------------------------------------------- sign in / out
  function showLogin(msg) {
    clearInterval(timer);
    $('deskBox').hidden = true; $('loginBox').hidden = false;
    $('logoutLink').hidden = true; $('whoami').textContent = '';
    $('loginError').textContent = msg || '';
  }
  function showDesk(me) {
    $('loginBox').hidden = true; $('deskBox').hidden = false;
    $('whoami').textContent = me.name; $('logoutLink').hidden = false;
    refreshAll();
    clearInterval(timer);
    timer = setInterval(() => { loadSummary(); if (activeTab === 'queue') loadQueue(); }, 15000);
  }
  async function init() {
    const me = await (await fetch('/api/reception/me')).json();
    if (me.loggedIn) showDesk(me); else showLogin('');
  }

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('loginError').textContent = '';
    const email = $('emailInput').value.trim(); const password = $('passwordInput').value;
    if (!email || !password) { $('loginError').textContent = 'Please enter your email and password.'; return; }
    try {
      const res = await fetch('/api/reception/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { $('loginError').textContent = data.error || 'Sign in failed. Please try again.'; return; }
      $('passwordInput').value = '';
      init();
    } catch (err) { $('loginError').textContent = "We couldn't reach the server. Please check the connection and try again."; }
  });
  $('logoutLink').addEventListener('click', async (e) => {
    e.preventDefault();
    await fetch('/api/reception/logout', { method: 'POST' });
    showLogin('You have been signed out.');
  });

  // ---------------------------------------------------------------- tabs
  let activeTab = 'queue';
  document.querySelectorAll('.tab-bar [data-tab]').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
  function showTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.tab-bar [data-tab]').forEach((b) => {
      const on = b.dataset.tab === tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on));
    });
    ['queue', 'appts', 'desk', 'regs'].forEach((t) => { $('panel_' + t).hidden = t !== tab; });
    if (tab === 'queue') loadQueue(); if (tab === 'appts') loadAppts(); if (tab === 'desk') loadDeskRegs(); if (tab === 'regs') loadRegs();
  }
  function refreshAll() { loadSummary(); showTab(activeTab); }

  // ---------------------------------------------------------------- summary
  async function loadSummary() {
    const s = await (await api('/api/reception/summary?date=' + localDate(new Date()))).json();
    $('statWaiting').textContent = s.waiting; $('statAppts').textContent = s.appointmentsToday; $('statRegs').textContent = s.newRegistrations;
    $('badgeQueue').hidden = !s.waiting; $('badgeQueue').textContent = s.waiting;
    $('badgeRegs').hidden = !s.newRegistrations; $('badgeRegs').textContent = s.newRegistrations;
  }

  // ---------------------------------------------------------------- walk-in queue
  async function loadQueue() {
    const rows = await (await api('/api/reception/walk-ins')).json();
    const box = $('queueList');
    if (!rows.length) { box.innerHTML = '<div class="empty">No one is in the queue. New check-ins appear here automatically.</div>'; return; }
    const active = rows.filter((r) => r.status === 'expected' || r.status === 'arrived');
    const done = rows.filter((r) => r.status === 'seen' || r.status === 'cancelled');
    const btn = (id, status, label, cls) => `<button class="btn ${cls || 'btn-secondary'}" data-walkin="${esc(id)}" data-status="${status}">${label}</button>`;
    box.innerHTML = [...active, ...done].map((r) => {
      const finished = r.status === 'seen' || r.status === 'cancelled';
      const when = r.status === 'expected' && r.arrival_minutes > 0 ? `Expected in ~${r.arrival_minutes} min (checked in ${ago(r.created_at)})` : `Checked in ${ago(r.created_at)}`;
      return `
      <article class="queue-card ${finished ? 'is-done' : ''} st-${esc(r.status)}">
        <div class="qc-main">
          <div class="qc-top"><strong class="qc-name">${esc(r.full_name)}</strong><span class="qc-age">${esc(age(r.dob))} · DOB ${esc(r.dob)}</span><span class="badge ${r.status === 'seen' ? 'badge-green' : 'badge-amber'}">${STATUS[r.status] || esc(r.status)}</span>${r.booking_id ? ' <span class="badge badge-desk" title="Visible to the doctor as a walk-in booking">With doctor</span>' : ''}</div>
          <p class="qc-reason">${esc(r.reason)}</p>
          <p class="qc-meta"><a href="tel:${esc(String(r.phone).replace(/[^+\d]/g, ''))}">${esc(r.phone)}</a>${r.email ? ' · ' + esc(r.email) : ''} · ${esc(when)} · Ref ${esc(r.id)}</p>
        </div>
        <div class="qc-actions">
          ${finished ? btn(r.id, 'expected', 'Reopen') : `
            ${r.status === 'expected' ? btn(r.id, 'arrived', 'Mark arrived', 'btn-primary') : ''}
            ${btn(r.id, 'seen', 'Mark seen', r.status === 'arrived' ? 'btn-primary' : 'btn-secondary')}
            ${btn(r.id, 'cancelled', 'Cancel / no-show')}`}
        </div>
      </article>`;
    }).join('');
  }
  $('queueList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-walkin]'); if (!b) return;
    b.disabled = true;
    await post(`/api/reception/walk-ins/${encodeURIComponent(b.dataset.walkin)}/status`, { status: b.dataset.status });
    loadSummary(); loadQueue();
  });

  $('addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('addError'); err.textContent = '';
    const body = { fullName: $('addName').value.trim(), dob: $('addDob').value, phone: $('addPhone').value.trim(), email: $('addEmail').value.trim(), reason: $('addReason').value.trim() };
    if (!body.fullName || !body.dob || !body.phone || !body.reason) { err.textContent = 'Please fill in name, date of birth, phone and reason (marked *).'; return; }
    const res = await post('/api/reception/walk-ins', body);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { err.textContent = data.error || 'Could not add this person. Please try again.'; return; }
    $('addForm').reset(); $('addWalkin').open = false;
    loadSummary(); loadQueue();
  });

  // ---------------------------------------------------------------- appointments
  async function loadAppts() {
    $('dayLabel').textContent = day.toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' });
    const rows = await (await api('/api/reception/schedule?date=' + localDate(day))).json();
    const box = $('apptList');
    if (!rows.length) { box.innerHTML = '<div class="empty">No online appointments for this day.</div>'; return; }
    box.innerHTML = rows.map((r) => `
      <div class="appt-row">
        <span class="appt-time">${esc(new Date(r.slot_start).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' }))}</span>
        <span class="appt-who"><strong>${esc(r.patient_name)}</strong><span class="appt-svc">${esc(r.service)}</span></span>
        <span class="badge ${r.status === 'completed' ? 'badge-green' : 'badge-amber'}">${r.status === 'completed' ? 'Completed' : 'Booked'}</span>
        <p class="appt-extra">${[['Reason', r.reason], ['How long', r.symptoms_duration], ['Medicines', r.current_medications], ['Allergies', r.allergies], ['Other', r.extra_details]]
          .filter(([, v]) => v).map(([k, v]) => `<span>${k}:</span> ${esc(v)}`).join(' &nbsp;·&nbsp; ') || '<span>No reason given.</span>'}
          &nbsp;·&nbsp; <span>DOB:</span> ${esc(r.patient_dob)} &nbsp;·&nbsp; <a href="tel:${esc(String(r.patient_phone || '').replace(/[^+\d]/g, ''))}">${esc(r.patient_phone)}</a></p>
      </div>`).join('');
  }
  $('dayPrev').addEventListener('click', () => { day.setDate(day.getDate() - 1); loadAppts(); });
  $('dayNext').addEventListener('click', () => { day.setDate(day.getDate() + 1); loadAppts(); });
  $('dayToday').addEventListener('click', () => { day = new Date(); loadAppts(); });

  // ---------------------------------------------------------------- registrations (website tab + "Register to clinic" tab)
  function regCard(r) {
    const line = (label, value) => value ? `<div class="rv"><dt>${label}</dt><dd>${esc(value)}</dd></div>` : '';
    const kin = r.next_of_kin ? [r.next_of_kin.name, r.next_of_kin.relationship, r.next_of_kin.phone].filter(Boolean).join(' · ') : '';
    const family = r.family_members.length
      ? `<div class="rv"><dt>Family members (${r.family_members.length})</dt><dd>${r.family_members.map((m) => esc(`${m.name} — DOB ${m.dob}${m.relationship ? ' (' + m.relationship + ')' : ''}`)).join('<br>')}</dd></div>` : '';
    const health = [line('Long-term conditions', r.known_conditions), line('Current medicines', r.current_medications), line('Allergies', r.allergies), line('Notes', r.reg_notes)].join('');
    const done = r.status === 'processed';
    return `
    <details class="card reg-card ${done ? 'is-done' : ''}" data-regid="${esc(r.id)}">
      <summary><span><strong>${esc(r.full_name)}</strong>${r.family_members.length ? ` <span class="reg-fam">+ ${r.family_members.length} family</span>` : ''}</span>
        <span class="reg-when">${esc(stamp(r.created_at))} <span class="badge ${done ? 'badge-green' : 'badge-amber'}">${done ? 'Processed' : 'New'}</span></span></summary>
      <dl class="review-list">
        ${line('Date of birth', `${r.dob} (${age(r.dob)})`)}${line('Sex', r.sex)}${line('Phone', r.phone)}${line('Email', r.email)}
        ${line('Address', [r.address, r.eircode].filter(Boolean).join(', '))}
        ${line('Previous GP', r.previous_gp)}${line('Next of kin', kin)}${family}
        ${r.registered_by ? line('Registered by', r.registered_by) : ''}${line('Reference', r.id)}
      </dl>
      ${health ? `<p class="rv-health-title">Health information</p><div class="rv-health"><dl class="review-list">${health}</dl></div>` : ''}
      <button class="btn btn-secondary" data-reg="${esc(r.id)}" data-status="${done ? 'new' : 'processed'}">${done ? 'Mark as new again' : 'Mark as processed'}</button>
    </details>`;
  }
  // Keep whatever the receptionist has open while the list reloads.
  function renderRegs(box, rows, emptyText) {
    const open = new Set([...box.querySelectorAll('details[open]')].map((d) => d.dataset.regid));
    box.innerHTML = rows.length ? rows.map(regCard).join('') : `<div class="empty">${emptyText}</div>`;
    box.querySelectorAll('details').forEach((d) => { if (open.has(d.dataset.regid)) d.open = true; });
  }
  async function loadRegs() {
    renderRegs($('regList'), await (await api('/api/reception/registrations?source=online')).json(), 'No website registrations yet.');
  }
  async function loadDeskRegs() {
    renderRegs($('deskRegList'), await (await api('/api/reception/registrations?source=desk')).json(), 'No one has been registered at the desk yet.');
  }
  async function markReg(e, reload) {
    const b = e.target.closest('[data-reg]'); if (!b) return;
    b.disabled = true;
    await post(`/api/reception/registrations/${encodeURIComponent(b.dataset.reg)}/status`, { status: b.dataset.status });
    loadSummary(); reload();
  }
  $('regList').addEventListener('click', (e) => markReg(e, loadRegs));
  $('deskRegList').addEventListener('click', (e) => markReg(e, loadDeskRegs));

  // ---- register a new patient at the desk
  function addFamilyRow() {
    const row = document.createElement('div');
    row.className = 'fam-row';
    row.innerHTML = '<div class="form-row"><label>Name</label><input data-f="name" maxlength="255" autocomplete="off"></div>'
      + '<div class="form-row"><label>Date of birth</label><input data-f="dob" type="date" min="1900-01-01"></div>'
      + '<div class="form-row"><label>Relationship</label><input data-f="relationship" maxlength="64" autocomplete="off"></div>'
      + '<button class="btn btn-secondary" type="button" data-rm>Remove</button>';
    $('drFamily').appendChild(row);
  }
  $('drAddFamily').addEventListener('click', () => { if ($('drFamily').children.length < 8) addFamilyRow(); });
  $('drFamily').addEventListener('click', (e) => { const rm = e.target.closest('[data-rm]'); if (rm) rm.closest('.fam-row').remove(); });

  $('deskRegForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('drError'); const ok = $('drDone'); err.textContent = ''; ok.textContent = '';
    const v = (id) => $(id).value.trim();
    const body = {
      fullName: v('drName'), dob: $('drDob').value, sex: $('drSex').value, phone: v('drPhone'), email: v('drEmail'), address: v('drAddress'),
      eircode: v('drEircode'), previousGp: v('drPrevGp'), knownConditions: v('drConditions'),
      currentMedications: v('drMeds'), allergies: v('drAllergies'), notes: v('drNotes'),
      nextOfKinName: v('drKinName'), nextOfKinRelationship: v('drKinRel'), nextOfKinPhone: v('drKinPhone'),
      familyMembers: [...$('drFamily').querySelectorAll('.fam-row')].map((r) => ({
        name: r.querySelector('[data-f=name]').value.trim(), dob: r.querySelector('[data-f=dob]').value, relationship: r.querySelector('[data-f=relationship]').value.trim(),
      })),
      consentConfirmed: $('drConsent').checked,
    };
    if (!body.fullName || !body.dob || !body.phone || !body.address) { err.textContent = 'Please fill in name, date of birth, phone and address (marked *).'; return; }
    if (!body.consentConfirmed) { err.textContent = 'Please confirm the patient has been shown the Privacy Notice and agrees.'; return; }
    const btn = $('deskRegForm').querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const res = await post('/api/reception/registrations', body);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { err.textContent = data.error || 'Could not save this registration. Please try again.'; return; }
      $('deskRegForm').reset(); $('drFamily').innerHTML = '';
      ok.textContent = `Registered. Reference ${data.reference}. The doctor can see it in their Clinic tab.`;
      loadSummary(); loadDeskRegs();
    } finally { btn.disabled = false; }
  });

  init();
})();
