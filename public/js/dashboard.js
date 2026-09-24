// Names for the service keys stored on bookings ('phone', 'video', ...). Loaded once after sign-in; walk-in bookings
// (created when someone walks in or is added at the front desk) are always "Walk-in visit".
let SERVICE_LABELS = {};
function svcLabel(t) {
  if (t === 'walk_in') return 'Walk-in visit';
  return (SERVICE_LABELS[t] && SERVICE_LABELS[t].label) || String(t || '').replace(/_/g, ' ');
}
async function loadServiceLabels() {
  try { SERVICE_LABELS = await fetch('/api/services').then((r) => r.json()); } catch (err) { /* labels fall back to the key */ }
  window.todayServiceLabels = SERVICE_LABELS;
}
// Anything a patient (or the front desk) typed is escaped before it goes into the page.
function esc(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const isWalkIn = (b) => !!b && b.service_type === 'walk_in';
function visitBadge(serviceType) {
  return serviceType === 'walk_in' ? '<span class="badge badge-walkin">Walk-in</span>' : '<span class="badge badge-online">Online</span>';
}
function statusBadge(b) {
  if (b.status === 'completed') return '<span class="badge badge-green">Completed</span>';
  return `<span class="badge badge-amber">${isWalkIn(b) ? 'In clinic' : 'Booked'}</span>`;
}
// Who has taken an online case: "Unclaimed" until a doctor claims it from the email link or the chart.
function claimBadge(b) {
  if (isWalkIn(b) || b.status !== 'paid') return '';
  return b.claimed_by ? `<span class="badge badge-claimed" title="Claimed">${esc(b.claimed_by_name || 'Claimed')}</span>` : '<span class="badge badge-unclaimed">Unclaimed</span>';
}
function fmtDob(dob) {
  if (!dob) return 'DOB not given';
  const d = new Date(dob + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? esc(dob) : d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
}
let currentBookingId = null;
let currentPatientEmail = null;
let scheduleDate = new Date();
let activeTab = 'today';
let activeChartTab = 'overview';

// The list the doctor opened a chart from — drives the Previous / Next case buttons.
let currentListKey = null; // 'online' | 'walkin' | 'search'
const caseLists = { online: [], walkin: [], search: [] };
let MEDICATIONS_LIST = [];

// Sessions now idle-timeout server-side (see requireDoctor in server/routes/doctor.js), so any
// authenticated call can come back 401 mid-use — not just at page load. Every fetch to an
// authenticated /api/doctor/* route (other than login/logout/me/forgot-password, which manage
// the session state themselves) should go through this instead of a bare fetch(), so an expired
// session lands back on a clean login screen with a clear message instead of the page silently
// treating an {error: ...} response as real data and throwing.
async function doctorFetch(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    showSessionExpired();
    throw new Error('session-expired');
  }
  return res;
}

function showSessionExpired() {
  document.getElementById('detailPanel').style.display = 'none';
  document.getElementById('dashboardBox').classList.remove('chart-open');
  document.getElementById('dashApp').style.display = '';
  document.getElementById('dashboardBox').style.display = 'none';
  document.getElementById('notifWrap').style.display = 'none';
  document.getElementById('logoutLink').style.display = 'none';
  document.getElementById('loginBox').style.display = 'block';
  document.getElementById('loginError').textContent = 'Your session expired due to inactivity. Please log in again.';
  document.getElementById('passwordInput').value = '';
}

let doctorTotpEnabled = false;

async function checkSession() {
  const res = await fetch('/api/doctor/me');
  const data = await res.json();
  if (data.loggedIn) {
    document.getElementById('totpBox').style.display = 'none';
    document.getElementById('loginBox').style.display = 'none';
    document.getElementById('dashboardBox').style.display = 'block';
    myStaffId = data.doctorId;
    document.getElementById('whoami').textContent = `${data.doctorName} — ${data.practiceName}`;
    document.getElementById('logoutLink').style.display = 'inline';
    document.getElementById('notifWrap').style.display = 'block';
    doctorTotpEnabled = !!data.totpEnabled;
    handleClaimParam();
    loadServiceLabels();
    loadNotifications();
    loadMedications();
    loadTasks();
    loadClinicSummary();
    openInitialTab();
    setInterval(loadNotifications, 15000);
    // Walk-in queue stays live while the Walk-in clinic section is open; the registrations list is left alone
    // on the timer so an expanded registration doesn't collapse while it's being read.
    setInterval(() => { loadClinicSummary(); if (activeTab === 'walkin') loadWalkinClinic(); if (activeTab === 'today') loadToday(); }, 15000);
    // Keep an open chart current — e.g. a new patient message — without disturbing whatever
    // sub-tab, scroll position, or in-progress typing the doctor currently has (openBooking only
    // re-renders read-only display lists, never the live form fields; see keepTab/isSameBooking
    // above for why this doesn't bounce the view around).
    setInterval(() => {
      const panelOpen = document.getElementById('detailPanel').style.display !== 'none';
      if (currentBookingId && panelOpen) openBooking(currentBookingId, null, true);
    }, 20000);
    setInterval(() => { if (activeTab === 'teammsg') { loadStaffDirectory(); loadStaffMessages(); } }, 15000);
  } else {
    explainClaimLinkBeforeLogin();
  }
}

// ---- claim links from the "new online booking" email: /dashboard.html?claim=<token>
const claimToken = new URLSearchParams(location.search).get('claim');
function clearClaimParam() { try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* not important */ } }
function showClaimBanner(kind, message) {
  const el = document.getElementById('claimBanner');
  el.className = 'claim-banner is-' + kind;
  el.textContent = message;
  el.hidden = false;
}
async function handleClaimParam() {
  if (!claimToken) return;
  clearClaimParam();
  try {
    const res = await fetch('/api/doctor/claims/' + encodeURIComponent(claimToken) + '/claim', { method: 'POST' });
    if (res.status === 401) return showSessionExpired();
    const data = await res.json();
    if (data.ok) {
      showClaimBanner('ok', 'You have claimed this case.');
      openBooking(data.bookingId, 'online');
    } else {
      showClaimBanner(data.state === 'claimed' ? 'warn' : 'error', data.error || 'This link could not be used.');
      if (data.state === 'claimed' && data.bookingId) { /* not theirs any more — just tell them */ }
    }
  } catch (err) { showClaimBanner('error', 'Something went wrong with that link. Please try again.'); }
}
// Before signing in, a link that has already been taken says so straight away.
async function explainClaimLinkBeforeLogin() {
  if (!claimToken) return;
  const el = document.getElementById('claimNotice');
  try {
    const st = (await (await fetch('/api/doctor/claims/' + encodeURIComponent(claimToken) + '/status')).json()).state;
    el.textContent = st === 'claimed' ? 'This case has already been claimed by another doctor, so this link is no longer active.'
      : st === 'invalid' ? 'This link is not valid.'
      : st === 'cancelled' ? 'This booking has been cancelled.'
      : 'Sign in to claim this case.';
    el.className = 'claim-notice ' + (st === 'open' || st === 'mine' ? 'is-ok' : 'is-warn');
    el.hidden = false;
  } catch (err) { /* the normal login still works */ }
}

async function login() {
  const email = document.getElementById('emailInput').value;
  const password = document.getElementById('passwordInput').value;
  const res = await fetch('/api/doctor/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (res.ok && data.requiresTotp) {
    document.getElementById('loginBox').style.display = 'none';
    document.getElementById('totpBox').style.display = 'block';
    document.getElementById('totpError').textContent = '';
    document.getElementById('totpCodeInput').value = '';
    document.getElementById('totpCodeInput').focus();
  } else if (res.ok) {
    checkSession();
  } else {
    document.getElementById('loginError').textContent = data.error || 'Incorrect email or password.';
  }
}

async function verifyTotpLogin() {
  const code = document.getElementById('totpCodeInput').value;
  const res = await fetch('/api/doctor/login/verify-totp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (res.ok) {
    checkSession();
  } else {
    document.getElementById('totpError').textContent = data.error || 'Incorrect code.';
  }
}

async function cancelTotpLogin() {
  await fetch('/api/doctor/logout', { method: 'POST' });
  document.getElementById('totpBox').style.display = 'none';
  document.getElementById('loginBox').style.display = 'block';
  document.getElementById('passwordInput').value = '';
}

document.getElementById('logoutLink').addEventListener('click', async (e) => {
  e.preventDefault();
  await fetch('/api/doctor/logout', { method: 'POST' });
  location.reload();
});

document.getElementById('forgotLink').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('forgotBox').style.display = 'block';
  e.target.style.display = 'none';
});

async function submitForgot() {
  const email = document.getElementById('forgotEmailInput').value;
  const res = await fetch('/api/doctor/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  document.getElementById('forgotMsg').style.color = 'var(--teal-700)';
  document.getElementById('forgotMsg').textContent = data.message || data.error;
}

// --- Top-level sections (left menu) ---
// Exactly one section is on screen at a time and it opens at the top of the page.
const TAB_TITLES = {
  today: 'Today', online: 'Online clinic', walkin: 'Walk-in clinic', search: 'Find a patient',
  registrations: 'Registrations', tasks: 'Tasks', teammsg: 'Team messages', security: 'Security',
};
const TAB_ALIASES = { clinic: 'walkin', schedule: 'online', recent: 'online' };

function showTab(tab, opts) {
  if (TAB_ALIASES[tab]) { if (tab === 'recent') onlineView = 'recent'; tab = TAB_ALIASES[tab]; }
  if (!TAB_TITLES[tab]) tab = 'today';
  activeTab = tab;
  Object.keys(TAB_TITLES).forEach((t) => {
    document.getElementById('tab_' + t).style.display = t === tab ? 'block' : 'none';
    const btn = document.getElementById('tabBtn_' + t);
    btn.classList.toggle('active', t === tab);
    if (t === tab) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
  });
  if (!(opts && opts.keepScroll)) window.scrollTo(0, 0);
  try { history.replaceState(null, '', '#' + tab); } catch (err) { /* not important */ }
  if (tab === 'today') loadToday();
  if (tab === 'online') { setOnlineView(onlineView); }
  if (tab === 'walkin') loadWalkinClinic();
  if (tab === 'registrations') loadRegistrations();
  if (tab === 'tasks') loadTasks();
  if (tab === 'security') renderSecurityTab();
  if (tab === 'teammsg') { loadStaffDirectory(); loadStaffMessages(); }
  if (tab === 'search') { const i = document.getElementById('searchInput'); if (i && !i.value) i.focus({ preventScroll: true }); }
}

function openInitialTab() {
  const wanted = (location.hash || '').replace('#', '');
  showTab(TAB_TITLES[wanted] ? wanted : 'today', { keepScroll: true });
}

// --- Team Messages: "Everyone" broadcast board, or a 1:1 DM with one admin/doctor ---
let myStaffId = null;
let staffConversation = 'everyone'; // 'everyone' | '<type>:<id>'
let staffDirectoryCache = [];

async function loadStaffDirectory() {
  const res = await doctorFetch('/api/doctor/staff-directory');
  staffDirectoryCache = await res.json();
  renderStaffContactList();
}

function renderStaffContactList() {
  const list = document.getElementById('staffContactList');
  const others = staffDirectoryCache.filter((p) => !(p.type === 'doctor' && p.id === myStaffId));
  list.innerHTML = `
    <button class="${staffConversation === 'everyone' ? 'active' : ''}" onclick="selectStaffConversation('everyone')">Everyone (Team Board)</button>
    ${others.map((p) => `
      <button class="${staffConversation === `${p.type}:${p.id}` ? 'active' : ''}" onclick="selectStaffConversation('${p.type}:${p.id}')">
        <span><span class="online-dot ${p.online ? 'online' : ''}"></span>${p.name}${p.type === 'admin' ? ' (Admin)' : ''}</span>
      </button>
    `).join('')}
  `;
}

function selectStaffConversation(key) {
  staffConversation = key;
  renderStaffContactList();
  if (key === 'everyone') {
    document.getElementById('staffConversationHeader').textContent = 'Everyone (Team Board)';
  } else {
    const person = staffDirectoryCache.find((p) => `${p.type}:${p.id}` === key);
    document.getElementById('staffConversationHeader').textContent = person
      ? `${person.name}${person.type === 'admin' ? ' (Admin)' : ''}` : 'Conversation';
  }
  loadStaffMessages();
}

async function loadStaffMessages() {
  const url = staffConversation === 'everyone'
    ? '/api/doctor/internal-messages'
    : `/api/doctor/internal-messages?with=${encodeURIComponent(staffConversation)}`;
  const res = await doctorFetch(url);
  const messages = await res.json();
  const thread = document.getElementById('staffMessageThread');
  thread.innerHTML = messages.length
    ? messages.map((m) => `
        <div class="msg ${m.sender_type === 'doctor' && m.sender_id === myStaffId ? 'staff-mine' : 'staff-other'}">
          ${m.body}<small>${m.sender_name} (${m.sender_type === 'doctor' ? 'Doctor' : 'Admin'}) • ${new Date(m.created_at).toLocaleString('en-IE')}</small>
        </div>
      `).join('')
    : '<p style="color:var(--ink-500);">No messages yet.</p>';
  thread.scrollTop = thread.scrollHeight;
}

async function sendStaffMessage() {
  const input = document.getElementById('staffMessageInput');
  if (!input.value.trim()) return;
  await doctorFetch('/api/doctor/internal-messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: input.value, with: staffConversation === 'everyone' ? null : staffConversation }),
  });
  input.value = '';
  loadStaffMessages();
}

// --- Two-factor authentication ---
function renderSecurityTab() {
  document.getElementById('totpEnableFlow').style.display = 'none';
  document.getElementById('totpSetupMsg').textContent = '';
  if (doctorTotpEnabled) {
    document.getElementById('totpStatusText').innerHTML = '<span class="badge badge-green">Enabled</span> — a code from your authenticator app is required at login.';
    document.getElementById('totpEnableBtn').style.display = 'none';
    document.getElementById('totpDisableFlow').style.display = 'block';
  } else {
    document.getElementById('totpStatusText').innerHTML = '<span class="badge badge-amber">Not enabled</span> — your account only requires a password to log in.';
    document.getElementById('totpEnableBtn').style.display = 'inline-block';
    document.getElementById('totpDisableFlow').style.display = 'none';
  }
}

async function startTotpSetup() {
  const res = await doctorFetch('/api/doctor/totp/setup', { method: 'POST' });
  const data = await res.json();
  document.getElementById('totpSecretText').textContent = data.secret;
  document.getElementById('totpOtpauthLink').href = data.otpauthUrl;
  document.getElementById('totpConfirmInput').value = '';
  document.getElementById('totpSetupMsg').textContent = '';
  document.getElementById('totpEnableFlow').style.display = 'block';
  document.getElementById('totpEnableBtn').style.display = 'none';
}

async function confirmTotpSetup() {
  const code = document.getElementById('totpConfirmInput').value;
  const res = await doctorFetch('/api/doctor/totp/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (!res.ok) {
    document.getElementById('totpSetupMsg').textContent = data.error;
    return;
  }
  doctorTotpEnabled = true;
  renderSecurityTab();
}

function cancelTotpSetup() {
  document.getElementById('totpEnableFlow').style.display = 'none';
  document.getElementById('totpEnableBtn').style.display = 'inline-block';
}

async function disableTotp() {
  const password = document.getElementById('totpDisablePassword').value;
  const res = await doctorFetch('/api/doctor/totp/disable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (!res.ok) {
    document.getElementById('totpDisableMsg').textContent = data.error;
    return;
  }
  document.getElementById('totpDisablePassword').value = '';
  document.getElementById('totpDisableMsg').textContent = '';
  doctorTotpEnabled = false;
  renderSecurityTab();
}

// --- Tasks ---
async function loadTasks() {
  const res = await doctorFetch('/api/doctor/tasks');
  const tasks = await res.json();
  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const badge = document.getElementById('taskCount');
  if (pendingCount > 0) { badge.style.display = 'inline-block'; badge.textContent = pendingCount; }
  else { badge.style.display = 'none'; }

  document.getElementById('tasksList').innerHTML = tasks.length ? tasks.map((t) => `
    <div class="card task-card" style="margin-bottom:10px; ${t.status === 'completed' ? 'opacity:0.6;' : ''}" onclick="openBooking('${esc(t.booking_id)}', null)">
      <p>${esc(t.description)}</p>
      <p style="color:var(--ink-500); font-size:0.8rem;">
        Patient: ${esc(t.patient_name)} • Created ${new Date(t.created_at).toLocaleString('en-IE')}
        ${t.status === 'completed' ? ` • Completed ${new Date(t.completed_at).toLocaleString('en-IE')}` : ''}
      </p>
      ${t.status === 'pending' ? `<button class="btn btn-secondary" style="padding:6px 14px;font-size:0.85rem;" onclick="event.stopPropagation(); completeTask(${t.id})">Mark Complete</button>` : '<span class="badge badge-green">Done</span>'}
    </div>
  `).join('') : '<p style="color:var(--ink-500);">No tasks yet.</p>';
}

async function completeTask(id) {
  await doctorFetch(`/api/doctor/tasks/${id}/complete`, { method: 'POST' });
  loadTasks();
}

// --- Online clinic: day list, calendar, recent ---
let onlineView = 'day';

function isoDate(d) {
  return d.toLocaleDateString('en-CA'); // YYYY-MM-DD in the doctor's own timezone
}

function changeDay(delta) {
  scheduleDate.setDate(scheduleDate.getDate() + delta);
  loadOnline();
}

function goToToday() {
  scheduleDate = new Date();
  loadOnline();
}

function setOnlineView(view) {
  onlineView = view;
  document.querySelectorAll('[data-onlineview]').forEach((b) => b.classList.toggle('active', b.dataset.onlineview === view));
  document.getElementById('onlineDay').style.display = view === 'day' ? 'block' : 'none';
  document.getElementById('onlineCalendar').style.display = view === 'calendar' ? 'block' : 'none';
  document.getElementById('onlineRecent').style.display = view === 'recent' ? 'block' : 'none';
  document.getElementById('onlineDayNav').style.display = view === 'recent' ? 'none' : 'flex';
  loadOnline();
}

async function loadOnline() {
  if (onlineView === 'recent') return loadRecent();
  document.getElementById('scheduleDateLabel').textContent = scheduleDate.toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' });
  const res = await doctorFetch('/api/doctor/schedule?type=online&date=' + isoDate(scheduleDate));
  const data = await res.json();
  caseLists.online = data.bookings.map((b) => b.id);
  if (onlineView === 'calendar') renderScheduleGrid(data.bookings, data.dayStartMins, data.dayEndMins);
  else renderOnlineDay(data.bookings);
}

function renderOnlineDay(bookings) {
  const box = document.getElementById('onlineDay');
  if (!bookings.length) { box.innerHTML = '<div class="empty">No online appointments on this day.</div>'; return; }
  box.innerHTML = bookings.map((b) => `
    <article class="visit-card ${b.status === 'completed' ? 'is-done' : ''}">
      <span class="vc-time">${esc(new Date(b.slot_start).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' }))}</span>
      <div class="vc-main">
        <strong class="vc-name">${esc(b.patient_name)}</strong>
        <span class="vc-sub">${esc(clinicAge(b.patient_dob))} · ${esc(svcLabel(b.service_type))}</span>
        <p class="vc-reason">${esc(b.reason || '')}</p>
      </div>
      <div class="vc-side">${statusBadge(b)}${claimBadge(b)}<button class="btn btn-primary" onclick="openBooking('${esc(b.id)}', 'online')">Open chart</button></div>
    </article>`).join('');
}

// Calendar view: 15-minute rows across the day's working hours.
const SCHEDULE_ROW_PX = 34;

function renderScheduleGrid(bookings, dayStartMins, dayEndMins) {
  const stepMin = 15;
  const totalSlots = Math.max(1, Math.ceil((dayEndMins - dayStartMins) / stepMin));
  const pad = (n) => String(n).padStart(2, '0');
  let html = '';
  for (let i = 0; i < totalSlots; i++) {
    const minutes = dayStartMins + i * stepMin;
    const hh = Math.floor(minutes / 60);
    const mm = minutes % 60;
    const isHour = mm === 0;
    html += `<div class="slot-time-label${isHour ? ' hour' : ''}" style="grid-row:${i + 1};">${isHour ? `${pad(hh)}:${pad(mm)}` : ''}</div>`;
    html += `<div class="schedule-row-line${isHour ? ' hour' : ''}" style="grid-row:${i + 1};"></div>`;
  }
  if (bookings.length === 0) {
    html += `<div class="schedule-empty" style="grid-row: 1 / span ${totalSlots};">No online appointments on this day.</div>`;
  }
  bookings.forEach((b) => {
    const start = new Date(b.slot_start), end = new Date(b.slot_end);
    const startMinFromDayStart = (start.getHours() * 60 + start.getMinutes()) - dayStartMins;
    const durMin = (end - start) / 60000;
    const rowStart = Math.max(1, Math.floor(startMinFromDayStart / stepMin) + 1);
    const rowSpan = Math.max(1, Math.round(durMin / stepMin));
    const timeLabel = start.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
    const reasonPreview = b.reason ? b.reason.slice(0, 40) + (b.reason.length > 40 ? '…' : '') : '';
    html += `<div class="schedule-booking ${b.status === 'completed' ? 'completed' : ''}" style="grid-row:${rowStart} / span ${rowSpan};" onclick="openBooking('${esc(b.id)}', 'online')" title="${esc(reasonPreview)}">${timeLabel} <strong>${esc(b.patient_name)}</strong> — ${esc(reasonPreview || svcLabel(b.service_type))}</div>`;
  });

  // Current-time line, only when this is actually today.
  const now = new Date();
  const isToday = isoDate(scheduleDate) === isoDate(now);
  let nowRowFraction = null;
  if (isToday) {
    const nowMinsFromDayStart = (now.getHours() * 60 + now.getMinutes()) - dayStartMins;
    if (nowMinsFromDayStart >= 0 && nowMinsFromDayStart <= (dayEndMins - dayStartMins)) {
      nowRowFraction = nowMinsFromDayStart / stepMin;
      html += `<div class="schedule-now-line" style="top:${nowRowFraction * SCHEDULE_ROW_PX}px;"></div>`;
    }
  }

  const grid = document.getElementById('scheduleGrid');
  grid.innerHTML = html;

  // Land the view somewhere useful instead of always at 00:00 — on "now" if it's today, on the
  // first booking of the day otherwise, so a doctor isn't blind-scrolling a mostly-empty grid to
  // find the one or two real appointments.
  let scrollToPx = null;
  if (nowRowFraction !== null) {
    scrollToPx = Math.max(0, (nowRowFraction - 3) * SCHEDULE_ROW_PX);
  } else if (bookings.length) {
    const first = new Date(bookings[0].slot_start);
    const firstRowFraction = ((first.getHours() * 60 + first.getMinutes()) - dayStartMins) / stepMin;
    scrollToPx = Math.max(0, (firstRowFraction - 2) * SCHEDULE_ROW_PX);
  }
  if (scrollToPx !== null) grid.scrollTop = scrollToPx;
}

// --- Find a patient: results are grouped per person, walk-in and online visits together ---
async function runSearch() {
  const q = document.getElementById('searchInput').value.trim();
  const resultsEl = document.getElementById('searchResults');
  if (!q) { resultsEl.innerHTML = ''; return; }
  const res = await doctorFetch('/api/doctor/search?q=' + encodeURIComponent(q));
  const results = await res.json();
  if (!results.length) {
    caseLists.search = [];
    resultsEl.innerHTML = '<div class="empty">No matching records found.</div>';
    return;
  }
  // Same name + date of birth = same person, whether they came in online or walked in.
  const people = new Map();
  results.forEach((b) => {
    const key = (b.patient_name || '').trim().toLowerCase() + '|' + b.patient_dob;
    if (!people.has(key)) people.set(key, { name: b.patient_name, dob: b.patient_dob, phone: b.patient_phone, visits: [] });
    people.get(key).visits.push(b);
  });
  const list = [...people.values()];
  caseLists.search = list.flatMap((p) => p.visits.map((v) => v.id));
  resultsEl.innerHTML = list.map((p) => {
    const walk = p.visits.filter(isWalkIn).length;
    const online = p.visits.length - walk;
    const visitRow = (v) => `
      <div class="pv-row">
        <span class="pv-date">${esc(new Date(v.slot_start).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }))}</span>
        ${visitBadge(v.service_type)}${isWalkIn(v) ? '' : `<span class="pv-svc">${esc(svcLabel(v.service_type))}</span>`}${statusBadge(v)}
        <button class="btn btn-secondary" onclick="openBooking('${esc(v.id)}', 'search')">Open chart</button>
      </div>`;
    return `
      <article class="card patient-card">
        <div class="pc-head">
          <div><strong class="pc-name">${esc(p.name)}</strong><span class="pc-sub">${esc(clinicAge(p.dob))} · DOB ${esc(fmtDob(p.dob))} · ${esc(p.phone)}</span></div>
          <div class="pc-counts"><span class="badge">${p.visits.length} visit${p.visits.length === 1 ? '' : 's'}</span>${walk ? `<span class="badge badge-walkin">${walk} walk-in</span>` : ''}${online ? `<span class="badge badge-online">${online} online</span>` : ''}</div>
        </div>
        ${p.visits.slice(0, 4).map(visitRow).join('')}
        ${p.visits.length > 4 ? `<details class="pv-more"><summary>Show ${p.visits.length - 4} earlier visit${p.visits.length - 4 === 1 ? '' : 's'}</summary>${p.visits.slice(4).map(visitRow).join('')}</details>` : ''}
      </article>`;
  }).join('');
}

// --- Recent online cases ---
async function loadRecent() {
  const res = await doctorFetch('/api/doctor/recent?type=online');
  const bookings = await res.json();
  caseLists.online = bookings.map((b) => b.id);
  const body = document.getElementById('recentBody');
  body.innerHTML = bookings.length ? bookings.map((b) => `
    <tr onclick="openBooking('${esc(b.id)}', 'online')" tabindex="0" onkeydown="if(event.key==='Enter')openBooking('${esc(b.id)}', 'online')">
      <td>${esc(new Date(b.slot_start).toLocaleString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</td>
      <td>${esc(svcLabel(b.service_type))}</td>
      <td>${esc(b.patient_name)}</td>
      <td>${statusBadge(b)} ${claimBadge(b)}</td>
    </tr>
  `).join('') : '<tr><td colspan="4" style="color:var(--ink-500);">No online cases yet.</td></tr>';
}

// --- Notifications ---
async function loadNotifications() {
  const res = await doctorFetch('/api/doctor/notifications');
  const data = await res.json();
  const countEl = document.getElementById('notifCount');
  if (data.unreadCount > 0) {
    countEl.style.display = 'inline-block';
    countEl.textContent = data.unreadCount;
  } else {
    countEl.style.display = 'none';
  }
  const el = document.getElementById('notifDropdown');
  el.innerHTML = data.notifications.length
    ? data.notifications.map(n => `
        <div class="notif-item ${n.read_at ? '' : 'unread'}" onclick="handleNotifClick(${n.id}, '${esc(n.booking_id)}')">
          ${esc(n.message)}<small>${esc(new Date(n.created_at).toLocaleString('en-IE'))}</small>
        </div>
      `).join('')
    : '<div class="notif-item">No notifications yet.</div>';
}

function toggleNotifDropdown() {
  document.getElementById('notifDropdown').classList.toggle('open');
}

document.addEventListener('click', (e) => {
  const wrap = document.getElementById('notifWrap');
  if (wrap && !wrap.contains(e.target)) document.getElementById('notifDropdown').classList.remove('open');
});

async function handleNotifClick(id, bookingId) {
  await doctorFetch(`/api/doctor/notifications/${id}/read`, { method: 'POST' });
  document.getElementById('notifDropdown').classList.remove('open');
  loadNotifications();
  openBooking(bookingId, null);
}

// --- Chart sub-tabs ---
const CHART_TABS = ['overview', 'previous', 'messages', 'notes', 'prescription', 'sickcert', 'referral', 'documents'];

function showChartTab(name) {
  activeChartTab = name;
  CHART_TABS.forEach((t) => {
    document.getElementById('chartSection_' + t).style.display = t === name ? 'block' : 'none';
  });
  document.querySelectorAll('.chart-tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.chartTab === name);
  });
}

function getCurrentList() {
  return caseLists[currentListKey] || [];
}

function navigateCase(delta) {
  const list = getCurrentList();
  const idx = list.indexOf(currentBookingId);
  if (idx === -1) return;
  const newIdx = idx + delta;
  if (newIdx >= 0 && newIdx < list.length) openBooking(list[newIdx], currentListKey, true);
}

// The chart is its own full page: the left menu and the section behind it are hidden, and "Back" returns to the
// section the doctor came from (see closeChart).
function openChartView() {
  document.getElementById('dashApp').style.display = 'none';
  document.getElementById('dashboardBox').classList.add('chart-open');
  document.getElementById('chartBackLabel').textContent = TAB_TITLES[activeTab] || 'list';
}

function closeChart() {
  document.getElementById('detailPanel').style.display = 'none';
  document.getElementById('dashboardBox').classList.remove('chart-open');
  document.getElementById('dashApp').style.display = '';
  currentBookingId = null;
  showTab(activeTab);
}

// Chart: who has this online case, with Claim / Release for the doctors involved.
function claimControls(claim, b) {
  if (!claim || b.status === 'completed' || b.status === 'cancelled') return claim && claim.byName ? `<span class="badge badge-claimed">${esc(claim.byName)}</span>` : '';
  if (!claim.by) return `<span class="badge badge-unclaimed">Unclaimed</span> <button class="btn btn-primary claim-btn" type="button" onclick="claimCase('${esc(b.id)}')">Claim this case</button>`;
  if (claim.mine) return `<span class="badge badge-claimed">Claimed by you</span> <button class="btn btn-secondary claim-btn" type="button" onclick="releaseCase('${esc(b.id)}')">Release</button>`;
  return `<span class="badge badge-claimed">Claimed by ${esc(claim.byName || 'another doctor')}</span>`;
}
async function claimCase(id) {
  const res = await doctorFetch(`/api/doctor/bookings/${encodeURIComponent(id)}/claim`, { method: 'POST' });
  const data = await res.json();
  if (!data.ok) showClaimBanner('warn', `${data.by || 'Another doctor'} has already claimed this case.`);
  openBooking(id, null, true);
  loadClinicSummary();
}
async function releaseCase(id) {
  await doctorFetch(`/api/doctor/bookings/${encodeURIComponent(id)}/release`, { method: 'POST' });
  openBooking(id, null, true);
}

// --- Booking detail panel ---
// keepTab: preserve whichever chart sub-tab (Notes, Prescription, ...) was already open instead
// of jumping back to Overview. Used for same-booking refreshes (a save/issue action, the
// background poll, Mark Complete) and for Previous/Next Case paging.
async function openBooking(id, listKey, keepTab) {
  const isSameBooking = id === currentBookingId && document.getElementById('detailPanel').style.display !== 'none';
  currentBookingId = id;
  if (listKey !== undefined && listKey !== null) currentListKey = listKey;
  const res = await doctorFetch(`/api/doctor/bookings/${encodeURIComponent(id)}`);
  const data = await res.json();
  const b = data.booking;
  const walk = isWalkIn(b);
  currentPatientEmail = b.patient_email;
  const pp = data.patientProfile || {};
  const summary = data.patientSummary || {};
  const previous = data.previousConsultations || [];

  document.getElementById('chartHeader').textContent = b.patient_name;
  const allergyText = (b.allergies || '').trim() || (pp.allergies || '').trim();
  const prevCount = summary.onlineVisits + summary.walkInVisits;
  document.getElementById('chartPatientMeta').innerHTML = `
    <div class="pb-row">${visitBadge(b.service_type)} ${statusBadge(b)}${walk ? '' : claimControls(data.claim, b)}<span class="pb-ref">Ref ${esc(b.id)}</span></div>
    <div class="pb-facts">
      <span><b>DOB</b> ${esc(fmtDob(b.patient_dob))} (${esc(clinicAge(b.patient_dob))})</span>
      ${b.patient_phone ? `<span><b>Phone</b> ${esc(b.patient_phone)}</span>` : ''}
      ${b.patient_email ? `<span><b>Email</b> ${esc(b.patient_email)}</span>` : ''}
      <span><b>Address</b> ${esc(b.patient_address || pp.address || 'not given')}</span>
    </div>
    <div class="pb-alerts">
      ${allergyText ? `<span class="pb-pill danger">⚠ Allergies: ${esc(allergyText)}</span>` : '<span class="pb-pill">No allergies recorded</span>'}
      <span class="pb-pill">${prevCount ? `${prevCount} previous visit${prevCount === 1 ? '' : 's'}: ${summary.walkInVisits} walk-in · ${summary.onlineVisits} online` : 'First visit'}</span>
    </div>`;

  const profileNote = summary.profileSource === 'patient portal' ? 'Kept up to date by the patient in their own portal.'
    : summary.profileSource === 'clinic registration' ? 'From this patient\'s registration with the clinic.' : 'No medical profile on file for this patient yet.';
  const pRow = (label, value) => `<p><strong>${label}:</strong> ${esc(value) || '—'}</p>`;
  document.getElementById('patientProfileInfo').innerHTML = `
    <h3 style="margin-top:0;">Medical profile</h3>
    <p style="color:var(--ink-500); font-size:0.85rem;">${profileNote} It may not match what they gave for this specific visit below.</p>
    ${pRow('Known conditions / diagnoses', pp.known_conditions)}${pRow('Allergies', pp.allergies)}${pRow('Current medications', pp.current_medications)}${pRow('Address', pp.address)}`;

  const dRow = (label, value, force) => (value || force) ? `<p><strong>${label}:</strong> ${esc(value) || '—'}</p>` : '';
  document.getElementById('detailInfo').innerHTML = `
    <p class="encounter-eyebrow">Today's visit — this appointment only</p>
    <h3 style="margin-top:0;">This visit</h3>
    ${dRow('Service', svcLabel(b.service_type), true)}
    <p><strong>${walk ? 'Arrived' : 'When'}:</strong> ${esc(new Date(b.slot_start).toLocaleString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}</p>
    ${dRow(walk ? 'Reason for visit' : 'Reason given', b.reason, true)}
    ${dRow('Symptom duration', b.symptoms_duration)}
    ${dRow('Medications (this visit)', b.current_medications)}
    ${dRow('Allergies (this visit)', b.allergies)}
    ${dRow('Additional details', b.extra_details)}
    ${walk ? '' : dRow('Pharmacy', b.pharmacy_name)}
    ${b.safety_answers ? `<p><strong>Safety questionnaire:</strong><br>${esc(b.safety_answers).replace(/\n/g, '<br>')}</p>` : ''}`;

  // Video / audio calls and patient messaging only make sense for online consultations.
  document.getElementById('joinCallBtn').style.display = walk ? 'none' : '';
  document.getElementById('joinAudioCallBtn').style.display = walk ? 'none' : '';
  document.getElementById('chartTabBtn_messages').style.display = walk ? 'none' : '';
  const completeBtn = document.getElementById('markCompleteBtn');
  completeBtn.textContent = b.status === 'completed' ? 'Completed ✓' : (walk ? 'Mark visit seen' : 'Mark Complete');
  completeBtn.disabled = b.status === 'completed';
  if (walk && activeChartTab === 'messages') activeChartTab = 'overview';

  // Previous / Next only when this chart was opened from a list that contains it.
  document.querySelectorAll('.chart-view-header-row button[onclick^="navigateCase"]').forEach((btn) => {
    btn.style.display = getCurrentList().includes(id) ? '' : 'none';
  });

  // The doctor starting a call is what makes it startable at all — this marks it started
  // server-side (and emails the patient a join link) before the doctor's own call window opens.
  async function startCall(mode) {
    await fetch(`/api/doctor/bookings/${encodeURIComponent(id)}/start-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
  }

  const joinCallBtn = document.getElementById('joinCallBtn');
  const callUrl = `/consult.html?id=${encodeURIComponent(id)}&role=doctor`;
  joinCallBtn.href = callUrl;
  // Opened as its own window rather than a same-tab navigation, so the dashboard (notes,
  // prescriptions, etc.) stays open and usable in the original tab for the whole call.
  joinCallBtn.onclick = (e) => {
    e.preventDefault();
    startCall('video');
    window.open(callUrl, 'gp4u-video-call', 'width=900,height=700');
  };

  const joinAudioCallBtn = document.getElementById('joinAudioCallBtn');
  const audioCallUrl = `/consult.html?id=${encodeURIComponent(id)}&role=doctor&mode=audio`;
  joinAudioCallBtn.href = audioCallUrl;
  joinAudioCallBtn.onclick = (e) => {
    e.preventDefault();
    startCall('audio');
    window.open(audioCallUrl, 'gp4u-audio-call', 'width=480,height=640');
  };
  if (!isSameBooking) document.getElementById('rxPharmacy').value = b.pharmacy_name || '';
  renderAttachments(data.attachments);
  renderAllergyBanner(b, pp);
  renderPreviousConsultations(previous, summary);
  renderMessages(data.messages);
  // So the doctor isn't left assuming the patient saw something they never got: a walk-in typically
  // has no email on file, in which case a message only shows up if the patient later checks the
  // booking online — it is never emailed to them.
  document.getElementById('messageEmailNote').textContent = currentPatientEmail
    ? `Also emailed to ${currentPatientEmail} when you send a message.`
    : 'No email on file for this patient — they will only see a message if they check their booking online.';
  renderNotes(data.notes);
  renderPrescriptions(data.prescriptions);
  renderDocuments(data.documents);
  renderAllDocuments(data.prescriptions, data.documents);
  renderPreviousSidePanels(previous);
  showChartTab((isSameBooking || keepTab) ? activeChartTab : 'overview');
  openChartView();
  document.getElementById('detailPanel').style.display = 'block';
  if (!isSameBooking) window.scrollTo(0, 0);
}

function renderAttachments(attachments) {
  document.getElementById('attachmentsList').innerHTML = attachments.length
    ? attachments.map(a => `<a class="btn btn-secondary" style="padding:6px 14px;font-size:0.85rem;margin:0 8px 8px 0;display:inline-block;" target="_blank" href="/api/doctor/attachments/${a.id}">${esc(a.original_name)}</a>`).join('')
    : '<p style="color:var(--ink-500);">None uploaded.</p>';
}

// Shown at the top of the Prescription tab specifically — that's the moment an allergy actually
// matters, and a doctor can now reach it without passing through Overview first (see the tab
// history fix above), so this can no longer rely on Overview as an incidental checkpoint.
function renderAllergyBanner(booking, patientProfile) {
  const visitAllergies = (booking.allergies || '').trim();
  const profileAllergies = ((patientProfile && patientProfile.allergies) || '').trim();
  const el = document.getElementById('rxAllergyBanner');
  if (!visitAllergies && !profileAllergies) {
    el.innerHTML = `<div class="allergy-banner none"><strong>Allergies</strong>None reported — this visit or patient profile.</div>`;
    return;
  }
  const lines = [];
  if (visitAllergies) lines.push(`<span class="source-label">This visit:</span> ${esc(visitAllergies)}`);
  if (profileAllergies && profileAllergies !== visitAllergies) lines.push(`<span class="source-label">Patient profile:</span> ${esc(profileAllergies)}`);
  el.innerHTML = `<div class="allergy-banner"><strong>⚠ Allergies</strong>${lines.join('<br>')}</div>`;
}

const DOC_TYPE_LABELS = { sick_cert: 'Sick Certificate', referral_ae: 'Referral Letter — A&E', referral_specialist: 'Referral Letter — Specialist' };

// A "sick cert" document covers both "unfit for work" and "fit to return to work" — label and file
// each one by what it actually certifies, so a fit-to-work cert never shows up looking like a sick note.
function certLabelFor(d) {
  if (d.doc_type !== 'sick_cert') return DOC_TYPE_LABELS[d.doc_type] || d.doc_type;
  try {
    const f = typeof d.fields === 'string' ? JSON.parse(d.fields) : d.fields;
    return f && f.fitForWork === 'fit to return to work' ? 'Fit to Work Certificate' : 'Sick Certificate';
  } catch (err) { return 'Sick Certificate'; }
}

// How many of the most recent previous visits to show fully expanded by default. Older visits
// (this list is newest-first) collapse into a <details> summary line instead, so a long-standing
// patient's history doesn't turn into one very long fully-expanded scroll. See chart-review notes.
const PREVIOUS_VISITS_EXPANDED = 2;

function renderPreviousConsultations(previous, summary) {
  const container = document.getElementById('previousConsultationsList');
  const badge = document.getElementById('historyCount');
  badge.style.display = previous.length ? 'inline-block' : 'none';
  badge.textContent = previous.length;
  const s = summary || {};
  document.getElementById('historySummary').textContent = previous.length
    ? `${previous.length} previous visit${previous.length === 1 ? '' : 's'} for this patient — ${s.walkInVisits || 0} walk-in and ${s.onlineVisits || 0} online — with notes, prescriptions and documents from each.`
    : '';
  if (!previous.length) {
    container.innerHTML = '<div class="empty">No previous visits for this patient. This is their first consultation.</div>';
    return;
  }
  // Same long date+time style everywhere in this list (visit headings, note/document timestamps) so nothing
  // reads as if it's a different kind of record just because it used a different date format.
  const dateTimeLong = (iso) => new Date(iso).toLocaleString('en-IE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  container.innerHTML = previous.map((p, idx) => {
    const notesHtml = p.notes.length
      ? p.notes.map(n => `<div style="margin-bottom:6px;"><p style="white-space:pre-wrap; margin:0;">${esc(n.note_text)}</p><p style="color:var(--ink-500);font-size:0.78rem;margin:2px 0 0;">${esc(n.doctor_name)} • ${esc(dateTimeLong(n.created_at))}</p></div>`).join('')
      : '<p style="color:var(--ink-500);font-size:0.85rem;">No notes recorded.</p>';
    const rxHtml = p.prescriptions.length
      ? p.prescriptions.map(rx => `<div style="margin-bottom:6px;"><strong>${esc(rx.medication)}</strong> — ${esc(rx.dose)}, qty ${esc(rx.quantity)} <a href="/print-rx.html?rxId=${rx.id}" target="_blank" style="font-size:0.8rem;">Print</a></div>`).join('')
      : '<p style="color:var(--ink-500);font-size:0.85rem;">None issued.</p>';
    const docsHtml = p.documents.length
      ? p.documents.map(d => `<div style="margin-bottom:6px;">${esc(certLabelFor(d))} — ${esc(dateTimeLong(d.created_at))} <a href="/print-doc.html?docId=${d.id}" target="_blank" style="font-size:0.8rem;">Print</a></div>`).join('')
      : '<p style="color:var(--ink-500);font-size:0.85rem;">None issued.</p>';

    const dateLabel = new Date(p.slot_start).toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const summaryLine = `
      <p class="encounter-eyebrow">Previous visit</p>
      <strong>${esc(dateLabel)}</strong>
      ${visitBadge(p.service_type)} ${p.service_type === 'walk_in' ? '' : `<span class="badge badge-neutral">${esc(svcLabel(p.service_type))}</span>`}
      ${statusBadge(p)}
    `;
    const body = `
      <p style="margin:10px 0 4px;"><strong>Reason:</strong> ${esc(p.reason) || '—'}</p>
      <div style="margin-top:10px;">
        <p style="font-weight:600; margin-bottom:4px;">Clinical Notes</p>
        ${notesHtml}
      </div>
      <div style="margin-top:10px;">
        <p style="font-weight:600; margin-bottom:4px;">Prescriptions</p>
        ${rxHtml}
      </div>
      <div style="margin-top:10px;">
        <p style="font-weight:600; margin-bottom:4px;">Documents</p>
        ${docsHtml}
      </div>
      <div style="margin-top:14px;">
        <button class="btn btn-secondary" style="padding:6px 14px;font-size:0.85rem;" onclick="event.stopPropagation(); openBooking('${esc(p.id)}', currentListKey)">Open This Visit</button>
      </div>
    `;
    const borderClass = p.service_type === 'walk_in' ? 'encounter-card walkin' : 'encounter-card online';

    if (idx < PREVIOUS_VISITS_EXPANDED) {
      return `
        <div class="card ${borderClass}" style="margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>${summaryLine}</div>
          </div>
          ${body}
        </div>
      `;
    }
    const visitCounts = `${p.notes.length} note${p.notes.length === 1 ? '' : 's'} · ${p.prescriptions.length} rx · ${p.documents.length} doc${p.documents.length === 1 ? '' : 's'}`;
    return `
      <details class="card prev-visit ${borderClass}" style="margin-bottom:14px;">
        <summary>
          <span>${summaryLine}</span>
          <span class="prev-visit-counts">${visitCounts}</span>
        </summary>
        ${body}
      </details>
    `;
  }).join('');
}

// Compact "previous visits" side panels shown alongside the Clinical Notes/Prescription/
// Referral tabs, so history is visible without leaving the tab or losing what's being typed.
function renderPreviousSidePanels(previousConsultations) {
  const dateLabel = (iso) => new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });

  const allNotes = previousConsultations
    .flatMap((p) => p.notes.map((n) => ({ ...n, visitDate: p.slot_start, walk: p.service_type === 'walk_in' })))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  document.getElementById('previousNotesPanel').innerHTML = allNotes.length
    ? allNotes.map((n) => `
        <div style="margin-bottom:12px;">
          <p style="white-space:pre-wrap; margin:0; font-size:0.9rem;">${esc(n.note_text)}</p>
          <p style="color:var(--ink-500);font-size:0.78rem;margin:2px 0 0;">${esc(n.doctor_name)} • ${esc(dateLabel(n.visitDate))} • ${n.walk ? 'Walk-in' : 'Online'}</p>
        </div>
      `).join('')
    : '<p style="color:var(--ink-500); font-size:0.85rem;">No previous notes.</p>';

  const allRx = previousConsultations
    .flatMap((p) => p.prescriptions.map((rx) => ({ ...rx, visitDate: p.slot_start })))
    .sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at));
  document.getElementById('previousRxPanel').innerHTML = allRx.length
    ? allRx.map((rx) => `
        <div style="margin-bottom:12px;">
          <p style="margin:0; font-size:0.9rem;"><strong>${esc(rx.medication)}</strong> — ${esc(rx.dose)}</p>
          <p style="margin:0; font-size:0.85rem;">${esc(rx.frequency)}, ${esc(rx.duration)}, qty ${esc(rx.quantity)}</p>
          <p style="color:var(--ink-500);font-size:0.78rem;margin:2px 0 0;">${esc(dateLabel(rx.visitDate))} • <a href="/print-rx.html?rxId=${rx.id}" target="_blank">Print</a></p>
        </div>
      `).join('')
    : '<p style="color:var(--ink-500); font-size:0.85rem;">No previous prescriptions.</p>';

  const allReferrals = previousConsultations
    .flatMap((p) => p.documents.filter((d) => d.doc_type !== 'sick_cert').map((d) => ({ ...d, visitDate: p.slot_start })))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  document.getElementById('previousReferralsPanel').innerHTML = allReferrals.length
    ? allReferrals.map((d) => `
        <div style="margin-bottom:12px;">
          <p style="margin:0; font-size:0.9rem;"><strong>${esc(DOC_TYPE_LABELS[d.doc_type] || d.doc_type)}</strong></p>
          <p style="color:var(--ink-500);font-size:0.78rem;margin:2px 0 0;">${esc(dateLabel(d.visitDate))} • <a href="/print-doc.html?docId=${d.id}" target="_blank">Print</a></p>
        </div>
      `).join('')
    : '<p style="color:var(--ink-500); font-size:0.85rem;">No previous referral letters.</p>';
}

function renderMessages(messages) {
  const thread = document.getElementById('messageThread');
  thread.innerHTML = messages.length
    ? messages.map(m => `<div class="msg ${m.sender === 'doctor' ? 'doctor' : 'patient'}">${esc(m.body)}<small>${m.sender === 'doctor' ? 'You' : 'Patient'} • ${esc(new Date(m.created_at).toLocaleString('en-IE'))}</small></div>`).join('')
    : '<p style="color:var(--ink-500);">No messages yet.</p>';
}

function renderNotes(notes) {
  const el = document.getElementById('notesList');
  el.innerHTML = notes.length
    ? notes.map(n => `<div class="card" style="margin-bottom:8px;"><p style="white-space:pre-wrap;">${esc(n.note_text)}</p><p style="color:var(--ink-500);font-size:0.8rem;">${esc(n.doctor_name)} • ${esc(new Date(n.created_at).toLocaleString('en-IE'))}</p></div>`).join('')
    : '<p style="color:var(--ink-500);">No notes yet.</p>';
}

async function saveNote() {
  const input = document.getElementById('noteInput');
  if (!input.value.trim()) return;
  await doctorFetch(`/api/doctor/bookings/${currentBookingId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ noteText: input.value }),
  });
  input.value = '';
  openBooking(currentBookingId);
}

function renderPrescriptions(prescriptions) {
  document.getElementById('existingRx').innerHTML = prescriptions.length
    ? '<h4>Issued prescriptions</h4>' + prescriptions.map(p => `
      <div class="card" style="margin-bottom:8px;">
        <strong>${esc(p.medication)}</strong> — ${esc(p.dose)}, ${esc(p.frequency)}, ${esc(p.duration)}, qty ${esc(p.quantity)}<br>${esc(p.instructions)}
        <p style="color:var(--ink-500);font-size:0.8rem;">Issued ${new Date(p.issued_at).toLocaleString('en-IE')}${p.sent_to_email ? ` • Sent to ${esc(p.sent_to_email)}` : ''}</p>
        <div style="display:flex; gap:10px;">
          <a class="btn btn-secondary" style="padding:6px 14px;font-size:0.85rem;" target="_blank" href="/print-rx.html?rxId=${p.id}">Print</a>
          <a class="btn btn-secondary" style="padding:6px 14px;font-size:0.85rem;" href="/api/doctor/prescriptions/${p.id}/pdf">Download PDF</a>
          <button class="btn btn-secondary" style="padding:6px 14px;font-size:0.85rem;" onclick="sendPrescription(${p.id})">Send to Pharmacy</button>
        </div>
      </div>
    `).join('')
    : '';
}

async function sendPrescription(rxId) {
  const toEmail = prompt("Pharmacy's email address (their @healthmail.ie address once you have Healthmail set up):");
  if (!toEmail) return;
  const res = await doctorFetch(`/api/doctor/prescriptions/${rxId}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toEmail }),
  });
  const data = await res.json();
  if (!res.ok) { alert(data.error); return; }
  alert('Sent.');
  openBooking(currentBookingId);
}

function renderDocuments(documents) {
  const sick = documents.filter(d => d.doc_type === 'sick_cert');
  const referrals = documents.filter(d => d.doc_type !== 'sick_cert');
  document.getElementById('existingDocs_sick_cert').innerHTML = sick.length
    ? '<h4>Issued certificates</h4>' + sick.map(docCard).join('') : '';
  document.getElementById('existingDocs_referral').innerHTML = referrals.length
    ? '<h4>Issued referral letters</h4>' + referrals.map(docCard).join('') : '';
}

function renderAllDocuments(prescriptions, documents) {
  const rxCards = prescriptions.map(p => `
    <div class="card" style="margin-bottom:8px;">
      <p><strong>Prescription</strong> — ${esc(p.medication)} (${esc(p.dose)})</p>
      <p style="color:var(--ink-500);font-size:0.8rem;">Issued ${new Date(p.issued_at).toLocaleString('en-IE')}${p.sent_to_email ? ` • Sent to ${p.sent_to_email}` : ''}</p>
      <a class="btn btn-secondary" style="padding:6px 14px;font-size:0.85rem;" target="_blank" href="/print-rx.html?rxId=${p.id}">Print</a>
    </div>
  `);
  const docCards = documents.map(d => `
    <div class="card" style="margin-bottom:8px;">
      <p><strong>${esc(certLabelFor(d))}</strong></p>
      <p style="color:var(--ink-500);font-size:0.8rem;">Issued ${new Date(d.created_at).toLocaleString('en-IE')}${d.sent_to_email ? ` • Sent to ${d.sent_to_email}` : ''}</p>
      <a class="btn btn-secondary" style="padding:6px 14px;font-size:0.85rem;" target="_blank" href="/print-doc.html?docId=${d.id}">Print</a>
    </div>
  `);
  const all = [...rxCards, ...docCards];
  document.getElementById('allDocumentsList').innerHTML = all.length ? all.join('') : '<p style="color:var(--ink-500);">Nothing issued yet.</p>';
}

function docCard(d) {
  const fields = JSON.parse(d.fields);
  const isSickCert = d.doc_type === 'sick_cert';
  const isFitToWork = isSickCert && fields.fitForWork === 'fit to return to work';
  const noEmail = !currentPatientEmail;
  const sendButton = isSickCert
    ? (noEmail ? '<span style="color:var(--ink-500);font-size:0.8rem;align-self:center;">No email on file — download and hand it over</span>' : `<button class="btn btn-secondary" style="padding:6px 14px;font-size:0.85rem;" onclick="sendSickCertToPatient(${d.id})">Send to Patient</button>`)
    : `<button class="btn btn-secondary" style="padding:6px 14px;font-size:0.85rem;" onclick="sendDocument(${d.id})">Send by Email</button>`;
  const certDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
  const fieldsHtml = isSickCert
    ? `<p style="margin:0 0 4px;"><strong>${esc(certLabelFor(d))}</strong></p>
       <p style="font-size:0.85rem; color:var(--ink-700); margin:0;">
         ${isFitToWork ? `Fit to return to work from <strong>${esc(certDate(fields.dateFrom))}</strong>` : `${esc(fields.fitForWork)} from <strong>${esc(certDate(fields.dateFrom))}</strong> to <strong>${esc(certDate(fields.dateTo))}</strong>`}<br>
         Diagnosis: ${esc(fields.diagnosis)}
       </p>`
    : `<p style="font-size:0.85rem; color:var(--ink-700);">${Object.entries(fields).map(([k, v]) => `<strong>${esc(k)}:</strong> ${esc(v)}`).join('<br>')}</p>`;
  return `
    <div class="card" style="margin-bottom:8px;">
      ${fieldsHtml}
      <p style="color:var(--ink-500);font-size:0.8rem;">Created ${new Date(d.created_at).toLocaleString('en-IE')}${d.sent_to_email ? ` • Sent to ${d.sent_to_email}` : ''}</p>
      <div style="display:flex; gap:10px;">
        <a class="btn btn-secondary" style="padding:6px 14px;font-size:0.85rem;" target="_blank" href="/print-doc.html?docId=${d.id}">Print</a>
        <a class="btn btn-secondary" style="padding:6px 14px;font-size:0.85rem;" href="/api/doctor/documents/${d.id}/pdf">Download PDF</a>
        ${sendButton}
      </div>
    </div>
  `;
}

async function sendSickCertToPatient(docId) {
  const res = await doctorFetch(`/api/doctor/documents/${docId}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toEmail: currentPatientEmail }),
  });
  const data = await res.json();
  if (!res.ok) { alert(data.error); return; }
  alert(`Sent to patient (${currentPatientEmail}).`);
  openBooking(currentBookingId);
}

async function sendDocument(docId) {
  const toEmail = prompt('Recipient email address (hospital/specialist/Healthmail address):');
  if (!toEmail) return;
  const res = await doctorFetch(`/api/doctor/documents/${docId}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toEmail }),
  });
  const data = await res.json();
  if (!res.ok) { alert(data.error); return; }
  alert('Sent.');
  openBooking(currentBookingId);
}

async function loadMedications() {
  const res = await doctorFetch('/api/doctor/medications');
  MEDICATIONS_LIST = await res.json();
  document.getElementById('medicationList').innerHTML = MEDICATIONS_LIST
    .map(m => `<option value="${m.name}">`).join('');
}

function onMedicationChange() {
  const name = document.getElementById('rxMed').value;
  const match = MEDICATIONS_LIST.find(m => m.name === name);
  document.getElementById('doseList').innerHTML = match
    ? match.strengths.map(s => `<option value="${s}">`).join('')
    : '';
}

async function issuePrescription() {
  const medication = document.getElementById('rxMed').value;
  const dose = document.getElementById('rxDose').value;
  const frequency = document.getElementById('rxFrequency').value;
  const duration = document.getElementById('rxDuration').value;
  const quantity = document.getElementById('rxQty').value;
  const instructions = document.getElementById('rxInstructions').value;
  const pharmacyName = document.getElementById('rxPharmacy').value;
  if (!medication || !dose || !frequency || !duration || !quantity || !instructions) {
    alert('Please fill in all prescription fields.');
    return;
  }
  await doctorFetch(`/api/doctor/bookings/${currentBookingId}/prescriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ medication, dose, frequency, duration, quantity, instructions, pharmacyName }),
  });
  ['rxMed', 'rxDose', 'rxFrequency', 'rxDuration', 'rxQty', 'rxInstructions'].forEach(id => document.getElementById(id).value = '');
  openBooking(currentBookingId);
}

function toggleReferralFields() {
  const isAE = document.getElementById('refType').value === 'referral_ae';
  document.getElementById('hospitalRow').style.display = isAE ? 'block' : 'none';
  document.getElementById('specialistRow').style.display = isAE ? 'none' : 'grid';
}

async function issueDocument(docType, fields) {
  await doctorFetch(`/api/doctor/bookings/${currentBookingId}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docType, fields }),
  });
  openBooking(currentBookingId);
}

// "Fit to return to work" certifies one date (the date the patient is fit from) — there is no
// "to" date to set, unlike "unfit for work", which certifies a date range. Swap the form between
// the two shapes so a fit-to-work cert can't be issued with a meaningless second date.
function updateCertForm() {
  const isFitToWork = document.getElementById('scFitness').value === 'fit to return to work';
  document.getElementById('scToRow').style.display = isFitToWork ? 'none' : 'block';
  document.getElementById('scFromLabel').textContent = isFitToWork ? 'Fit to return to work from' : 'From';
  document.getElementById('certSectionTitle').textContent = isFitToWork ? 'Fit to Work Certificate' : 'Sick Certificate';
  document.getElementById('scSubmitBtn').textContent = isFitToWork ? 'Generate Fit to Work Cert' : 'Generate Sick Cert';
}

function collectSickCertAndIssue() {
  const isFitToWork = document.getElementById('scFitness').value === 'fit to return to work';
  const dateFrom = document.getElementById('scFrom').value;
  const fields = {
    dateFrom,
    // A fit-to-work cert has no end date — store the same date as dateFrom so anything reading
    // the old two-date shape (summaries, etc.) still works, rather than adding a second field type.
    dateTo: isFitToWork ? dateFrom : document.getElementById('scTo').value,
    diagnosis: document.getElementById('scDiagnosis').value || 'Not specified',
    fitForWork: document.getElementById('scFitness').value,
  };
  if (!fields.dateFrom || (!isFitToWork && !fields.dateTo)) {
    alert(isFitToWork ? 'Please set the date the patient is fit to return to work.' : 'Please set both dates.');
    return;
  }
  issueDocument('sick_cert', fields);
}

function collectReferralAndIssue() {
  const refType = document.getElementById('refType').value;
  const fields = refType === 'referral_ae'
    ? {
        hospitalName: document.getElementById('refHospital').value,
        urgency: document.getElementById('refUrgency').value,
        clinicalSummary: document.getElementById('refSummary').value,
        reasonForReferral: document.getElementById('refReason').value,
      }
    : {
        specialty: document.getElementById('refSpecialty').value,
        consultantOrDept: document.getElementById('refConsultant').value,
        urgency: document.getElementById('refUrgency').value,
        clinicalSummary: document.getElementById('refSummary').value,
        reasonForReferral: document.getElementById('refReason').value,
      };
  if (!fields.clinicalSummary || !fields.reasonForReferral) { alert('Please fill in the clinical summary and reason for referral.'); return; }
  issueDocument(refType, fields);
}

async function markComplete() {
  await doctorFetch(`/api/doctor/bookings/${encodeURIComponent(currentBookingId)}/complete`, { method: 'POST' });
  loadClinicSummary();
  openBooking(currentBookingId);
}

async function sendDoctorMessage() {
  const input = document.getElementById('doctorMessageInput');
  if (!input.value.trim()) return;
  await doctorFetch(`/api/doctor/bookings/${currentBookingId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: input.value }),
  });
  input.value = '';
  openBooking(currentBookingId);
}

checkSession();
