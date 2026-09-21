// Doctor dashboard: Today overview, Walk-in clinic, and Registrations.
// Loaded after dashboard.js (uses its doctorFetch / openBooking / caseLists helpers). Everything patients type is
// escaped before it goes into the page, since these lists show text from the public forms and the front desk.
function clinicEsc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const WALKIN_STATUS_LABEL = { expected: 'Expected', arrived: 'Arrived', seen: 'Seen', cancelled: 'Cancelled' };

function clinicFmtTime(iso) {
  return new Date(iso).toLocaleString('en-IE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function clinicAge(dob) {
  const d = new Date(dob + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) years -= 1;
  return years >= 2 ? `${years} yrs` : `${Math.max(0, Math.floor((now - d) / (30.44 * 86400000)))} months`;
}

const isTodayLocal = (iso) => new Date(iso).toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA');

function setBadge(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = n > 0 ? 'inline-block' : 'none';
  el.textContent = n;
}

// Menu badges: people waiting in the walk-in clinic, and registrations not yet processed.
async function loadClinicSummary() {
  try {
    const s = await (await doctorFetch('/api/doctor/clinic/summary')).json();
    setBadge('walkinCount', s.activeWalkIns || 0);
    setBadge('regCount', s.newRegistrations || 0);
  } catch (err) { /* session-expired handled by doctorFetch */ }
}

// ---------------------------------------------------------------- Walk-in clinic
const walkinBtn = (id, status, label, cls) =>
  `<button class="btn ${cls || 'btn-secondary'}" onclick="setWalkInStatus('${clinicEsc(id)}','${status}')">${label}</button>`;

async function loadWalkinClinic() {
  try {
    const [rows, recent] = await Promise.all([
      doctorFetch('/api/doctor/clinic/walk-ins').then((r) => r.json()),
      doctorFetch('/api/doctor/recent?type=walkin').then((r) => r.json()),
    ]);
    renderWalkInQueue(rows);
    caseLists.walkin = recent.map((b) => b.id);
    const seenToday = recent.filter((b) => b.status === 'completed' && isTodayLocal(b.slot_start)).length;
    document.getElementById('wcWaiting').textContent = rows.filter((r) => r.status === 'expected' || r.status === 'arrived').length;
    document.getElementById('wcSeen').textContent = seenToday;
    document.getElementById('wcTotal').textContent = rows.filter((r) => r.status !== 'cancelled' && isTodayLocal(r.created_at)).length;
    document.getElementById('walkinRecentBody').innerHTML = recent.length ? recent.map((b) => `
      <tr onclick="openBooking('${clinicEsc(b.id)}', 'walkin')" tabindex="0" onkeydown="if(event.key==='Enter')openBooking('${clinicEsc(b.id)}', 'walkin')">
        <td>${clinicEsc(new Date(b.slot_start).toLocaleString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</td>
        <td><strong>${clinicEsc(b.patient_name)}</strong> <span style="color:var(--ink-500);">· ${clinicEsc(clinicAge(b.patient_dob))}</span></td>
        <td>${clinicEsc((b.reason || '').slice(0, 70))}</td>
        <td>${statusBadge(b)}</td>
      </tr>`).join('') : '<tr><td colspan="4" style="color:var(--ink-500);">No walk-in visits yet.</td></tr>';
  } catch (err) { /* session-expired handled by doctorFetch */ }
}

function renderWalkInQueue(rows) {
  const box = document.getElementById('walkInList');
  if (!rows.length) {
    box.innerHTML = '<div class="empty">No one has checked in for the walk-in clinic in the last 24 hours. New check-ins appear here automatically.</div>';
    return;
  }
  // Active (expected/arrived) people first, in the order they checked in; finished ones below.
  const active = rows.filter((r) => r.status === 'expected' || r.status === 'arrived');
  const done = rows.filter((r) => r.status === 'seen' || r.status === 'cancelled');
  box.innerHTML = [...active, ...done].map((r) => {
    const finished = r.status === 'seen' || r.status === 'cancelled';
    const when = r.status === 'expected' && r.arrival_minutes > 0
      ? `Expected in ~${r.arrival_minutes} min (checked in ${clinicFmtTime(r.created_at)})` : `Checked in ${clinicFmtTime(r.created_at)}`;
    return `
      <article class="queue-card ${finished ? 'is-done' : ''} st-${clinicEsc(r.status)}">
        <div class="qc-main">
          <div class="qc-top"><strong class="qc-name">${clinicEsc(r.full_name)}</strong><span class="qc-age">${clinicEsc(clinicAge(r.dob))} · DOB ${clinicEsc(r.dob)}</span><span class="badge ${r.status === 'seen' ? 'badge-green' : 'badge-amber'}">${WALKIN_STATUS_LABEL[r.status] || clinicEsc(r.status)}</span></div>
          <p class="qc-reason">${clinicEsc(r.reason)}</p>
          <p class="qc-meta">${clinicEsc(r.phone)}${r.email ? ' · ' + clinicEsc(r.email) : ''} · ${clinicEsc(when)} · Ref ${clinicEsc(r.id)}</p>
        </div>
        <div class="qc-actions">
          ${finished
            ? `${r.booking_id ? `<button class="btn btn-secondary" onclick="openBooking('${clinicEsc(r.booking_id)}', 'walkin')">Open chart</button>` : ''}${walkinBtn(r.id, 'expected', 'Reopen')}`
            : `<button class="btn btn-primary" onclick="openWalkInChart('${clinicEsc(r.id)}')">Open chart</button>
               ${walkinBtn(r.id, 'seen', 'Mark seen')}${walkinBtn(r.id, 'cancelled', 'Cancel / no-show')}`}
        </div>
      </article>`;
  }).join('');
}

// Opens the chart for a queued person: they're marked arrived and a walk-in booking is created if needed.
async function openWalkInChart(id) {
  const res = await doctorFetch(`/api/doctor/clinic/walk-ins/${encodeURIComponent(id)}/open`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok || !data.bookingId) return;
  loadClinicSummary();
  openBooking(data.bookingId, 'walkin');
}

async function setWalkInStatus(id, status) {
  await doctorFetch(`/api/doctor/clinic/walk-ins/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  loadClinicSummary();
  if (activeTab === 'walkin') loadWalkinClinic();
  if (activeTab === 'today') loadToday();
}

// ---------------------------------------------------------------- Registrations
let regRows = [];
let regSource = 'all';

function setRegSource(source) {
  regSource = source;
  document.querySelectorAll('[data-regsource]').forEach((b) => b.classList.toggle('active', b.dataset.regsource === source));
  renderRegistrations();
}

async function loadRegistrations() {
  regRows = await (await doctorFetch('/api/doctor/clinic/registrations')).json();
  renderRegistrations();
}

function renderRegistrations() {
  const box = document.getElementById('registrationList');
  const open = new Set([...box.querySelectorAll('details[open]')].map((d) => d.dataset.regid));
  const rows = regRows.filter((r) => regSource === 'all' || (regSource === 'desk' ? r.source === 'desk' : r.source !== 'desk'));
  if (!rows.length) {
    box.innerHTML = '<div class="empty">No registrations here yet.</div>';
    return;
  }
  box.innerHTML = rows.map((r) => {
    const field = (label, value) => value ? `<div class="rv"><dt>${label}</dt><dd>${clinicEsc(value)}</dd></div>` : '';
    const kin = r.next_of_kin ? [r.next_of_kin.name, r.next_of_kin.relationship, r.next_of_kin.phone].filter(Boolean).join(' · ') : '';
    const family = r.family_members.length
      ? `<div class="rv"><dt>Family members (${r.family_members.length})</dt><dd>${r.family_members.map((m) => clinicEsc(`${m.name} — DOB ${m.dob} (${clinicAge(m.dob)})${m.relationship ? ' · ' + m.relationship : ''}`)).join('<br>')}</dd></div>`
      : '';
    const health = [field('Long-term conditions', r.known_conditions), field('Current medicines', r.current_medications), field('Allergies', r.allergies), field('Notes', r.reg_notes)].join('');
    const done = r.status === 'processed';
    return `
      <details class="card reg-card ${done ? 'is-done' : ''}" data-regid="${clinicEsc(r.id)}">
        <summary>
          <span><strong>${clinicEsc(r.full_name)}</strong>${r.family_members.length ? ` <span class="reg-fam">+ ${r.family_members.length} family</span>` : ''}</span>
          <span class="reg-when">${r.source === 'desk' ? '<span class="badge badge-desk">At desk</span> ' : '<span class="badge">Website</span> '}${clinicEsc(clinicFmtTime(r.created_at))} <span class="badge ${done ? 'badge-green' : 'badge-amber'}">${done ? 'Processed' : 'New'}</span></span>
        </summary>
        <dl class="review-list">
          ${field('Date of birth', `${r.dob} (${clinicAge(r.dob)})`)}${field('Sex', r.sex)}${field('Phone', r.phone)}${field('Email', r.email)}
          ${field('Address', [r.address, r.eircode].filter(Boolean).join(', '))}
          ${field('Previous GP', r.previous_gp)}${field('Next of kin', kin)}${family}
          ${r.registered_by ? field('Registered by', r.registered_by) : ''}${field('Reference', r.id)}
        </dl>
        ${health ? `<p class="rv-health-title">Health information</p><div class="rv-health"><dl class="review-list">${health}</dl></div>` : ''}
        <button class="btn btn-secondary" onclick="setRegistrationStatus('${clinicEsc(r.id)}','${done ? 'new' : 'processed'}')">${done ? 'Mark as new again' : 'Mark as processed'}</button>
      </details>`;
  }).join('');
  box.querySelectorAll('details').forEach((d) => { if (open.has(d.dataset.regid)) d.open = true; });
}

async function setRegistrationStatus(id, status) {
  await doctorFetch(`/api/doctor/clinic/registrations/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  loadClinicSummary();
  loadRegistrations();
}

// ---------------------------------------------------------------- "Today" overview (the doctor's default section)
async function loadToday() {
  const date = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in the browser's timezone
  document.getElementById('todayDate').textContent = new Date().toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  try {
    const [sum, walkins, sched, tasks] = await Promise.all([
      doctorFetch('/api/doctor/clinic/summary').then((r) => r.json()),
      doctorFetch('/api/doctor/clinic/walk-ins').then((r) => r.json()),
      doctorFetch('/api/doctor/schedule?type=online&date=' + date).then((r) => r.json()),
      doctorFetch('/api/doctor/tasks').then((r) => r.json()),
    ]);
    const queue = walkins.filter((r) => r.status === 'expected' || r.status === 'arrived');
    const appts = sched.bookings || [];
    caseLists.online = appts.map((b) => b.id);
    const pendingTasks = tasks.filter((t) => t.status === 'pending').length;
    document.getElementById('tdWaiting').textContent = sum.activeWalkIns;
    document.getElementById('tdAppts').textContent = appts.length;
    document.getElementById('tdRegs').textContent = sum.newRegistrations;
    document.getElementById('tdTasks').textContent = pendingTasks;
    setBadge('walkinCount', sum.activeWalkIns || 0);
    setBadge('regCount', sum.newRegistrations || 0);
    setBadge('onlineCount', appts.filter((b) => b.status !== 'completed').length);

    const pending = await doctorFetch('/api/doctor/claims/pending').then((r) => r.json()).catch(() => []);
    document.getElementById('tdClaims').innerHTML = pending.length ? `
      <section class="card claim-list" aria-labelledby="claimListTitle">
        <h2 id="claimListTitle">New online bookings waiting for a doctor <span class="badge badge-unclaimed">${pending.length}</span></h2>
        ${pending.map((c) => `
          <div class="claim-row">
            <div><strong>${clinicEsc(c.patient_name)}</strong> <span class="appt-svc">${clinicEsc(svcLabel(c.service_type))} · ${clinicEsc(new Date(c.slot_start).toLocaleString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span></div>
            <div class="claim-actions"><button class="btn btn-primary" onclick="claimCase('${clinicEsc(c.id)}')">Claim</button><button class="btn btn-secondary" onclick="openBooking('${clinicEsc(c.id)}', 'online')">Open</button></div>
          </div>`).join('')}
      </section>` : '';
    document.getElementById('tdQueue').innerHTML = queue.length ? queue.slice(0, 6).map((r) => `
      <article class="queue-card st-${clinicEsc(r.status)}">
        <div class="qc-main">
          <div class="qc-top"><strong class="qc-name">${clinicEsc(r.full_name)}</strong><span class="qc-age">${clinicEsc(clinicAge(r.dob))}</span><span class="badge badge-amber">${WALKIN_STATUS_LABEL[r.status] || clinicEsc(r.status)}</span></div>
          <p class="qc-reason">${clinicEsc(r.reason)}</p>
          <p class="qc-meta">${r.status === 'expected' && r.arrival_minutes > 0 ? 'Expected in ~' + r.arrival_minutes + ' min · ' : ''}Checked in ${clinicEsc(clinicFmtTime(r.created_at))}</p>
        </div>
        <div class="qc-actions"><button class="btn btn-primary" onclick="openWalkInChart('${clinicEsc(r.id)}')">Open chart</button><button class="btn btn-secondary" onclick="setWalkInStatus('${clinicEsc(r.id)}','seen')">Mark seen</button></div>
      </article>`).join('') + (queue.length > 6 ? `<p class="staff-hint">+ ${queue.length - 6} more in the Walk-in clinic</p>` : '')
      : '<div class="empty">No one is waiting.</div>';

    document.getElementById('tdAppts2').innerHTML = appts.length ? appts.map((b) => `
      <div class="appt-row">
        <span class="appt-time">${clinicEsc(new Date(b.slot_start).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' }))}</span>
        <span class="appt-who"><strong>${clinicEsc(b.patient_name)}</strong><span class="appt-svc">${clinicEsc(svcLabel(b.service_type))}</span></span>
        <span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">${statusBadge(b)}${claimBadge(b)}
        <button class="btn btn-secondary" style="padding:8px 16px;" onclick="openBooking('${clinicEsc(b.id)}', 'online')">Open</button></span>
      </div>`).join('') : '<div class="empty">No online appointments today.</div>';
  } catch (err) { /* session-expired handled by doctorFetch */ }
}
