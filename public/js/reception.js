// Front-desk (receptionist) screen. Talks only to /api/reception/*, which sends administrative details only.
// Everything patients typed is escaped before it is put on the page.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const STATUS = { expected: 'Expected', arrived: 'Arrived', seen: 'Seen', cancelled: 'Cancelled' };
  const CARD = { none: 'No card', medical_card: 'Medical card', gp_visit_card: 'GP Visit Card', unsure: 'Not sure' };
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
    ['queue', 'appts', 'regs'].forEach((t) => { $('panel_' + t).hidden = t !== tab; });
    if (tab === 'queue') loadQueue(); if (tab === 'appts') loadAppts(); if (tab === 'regs') loadRegs();
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
          <div class="qc-top"><strong class="qc-name">${esc(r.full_name)}</strong><span class="qc-age">${esc(age(r.dob))} · DOB ${esc(r.dob)}</span><span class="badge ${r.status === 'seen' ? 'badge-green' : 'badge-amber'}">${STATUS[r.status] || esc(r.status)}</span></div>
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
    const body = { fullName: $('addName').value.trim(), dob: $('addDob').value, phone: $('addPhone').value.trim(), reason: $('addReason').value.trim() };
    if (!body.fullName || !body.dob || !body.phone || !body.reason) { err.textContent = 'Please fill in every field (marked *).'; return; }
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
      </div>`).join('');
  }
  $('dayPrev').addEventListener('click', () => { day.setDate(day.getDate() - 1); loadAppts(); });
  $('dayNext').addEventListener('click', () => { day.setDate(day.getDate() + 1); loadAppts(); });
  $('dayToday').addEventListener('click', () => { day = new Date(); loadAppts(); });

  // ---------------------------------------------------------------- registrations (administrative details only)
  async function loadRegs() {
    const rows = await (await api('/api/reception/registrations')).json();
    const box = $('regList');
    if (!rows.length) { box.innerHTML = '<div class="empty">No registrations yet.</div>'; return; }
    box.innerHTML = rows.map((r) => {
      const line = (label, value) => value ? `<div class="rv"><dt>${label}</dt><dd>${esc(value)}</dd></div>` : '';
      const kin = r.next_of_kin ? [r.next_of_kin.name, r.next_of_kin.relationship, r.next_of_kin.phone].filter(Boolean).join(' · ') : '';
      const family = r.family_members.length
        ? `<div class="rv"><dt>Family members (${r.family_members.length})</dt><dd>${r.family_members.map((m) => esc(`${m.name} — DOB ${m.dob}${m.relationship ? ' (' + m.relationship + ')' : ''}`)).join('<br>')}</dd></div>` : '';
      const done = r.status === 'processed';
      return `
      <details class="card reg-card ${done ? 'is-done' : ''}">
        <summary><span><strong>${esc(r.full_name)}</strong>${r.family_members.length ? ` <span class="reg-fam">+ ${r.family_members.length} family</span>` : ''}</span>
          <span class="reg-when">${esc(stamp(r.created_at))} <span class="badge ${done ? 'badge-green' : 'badge-amber'}">${done ? 'Processed' : 'New'}</span></span></summary>
        <dl class="review-list">
          ${line('Date of birth', `${r.dob} (${age(r.dob)})`)}${line('Sex', r.sex)}${line('Phone', r.phone)}${line('Email', r.email)}
          ${line('Address', [r.address, r.eircode].filter(Boolean).join(', '))}${line('Medical / GP Visit Card', CARD[r.medical_card] || r.medical_card)}
          ${line('Previous GP', r.previous_gp)}${line('Next of kin', kin)}${family}
          ${line('Reference', r.id)}
        </dl>
        <button class="btn btn-secondary" data-reg="${esc(r.id)}" data-status="${done ? 'new' : 'processed'}">${done ? 'Mark as new again' : 'Mark as processed'}</button>
      </details>`;
    }).join('');
  }
  $('regList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-reg]'); if (!b) return;
    b.disabled = true;
    await post(`/api/reception/registrations/${encodeURIComponent(b.dataset.reg)}/status`, { status: b.dataset.status });
    loadSummary(); loadRegs();
  });

  init();
})();
