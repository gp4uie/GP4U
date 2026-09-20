// Doctor dashboard "Clinic" tab: today's walk-in list and new-patient registrations.
// Loaded after dashboard.js (uses its doctorFetch helper). Everything patients type is escaped
// before it goes into the page, since these two lists show text from the public forms.
function clinicEsc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const WALKIN_STATUS_LABEL = { expected: 'Expected', arrived: 'Arrived', seen: 'Seen', cancelled: 'Cancelled' };
const MEDICAL_CARD_LABEL = { none: 'No card', medical_card: 'Medical card', gp_visit_card: 'GP Visit Card', unsure: 'Not sure' };

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

// Badge on the "Clinic" tab: people still waiting + registrations not yet processed.
async function loadClinicSummary() {
  try {
    const res = await doctorFetch('/api/doctor/clinic/summary');
    const s = await res.json();
    const total = (s.activeWalkIns || 0) + (s.newRegistrations || 0);
    const badge = document.getElementById('clinicCount');
    badge.style.display = total > 0 ? 'inline-block' : 'none';
    badge.textContent = total;
  } catch (err) { /* session-expired handled by doctorFetch */ }
}

async function loadClinic() {
  loadClinicSummary();
  loadWalkIns();
  loadRegistrations();
}

async function loadWalkIns() {
  const res = await doctorFetch('/api/doctor/clinic/walk-ins');
  const rows = await res.json();
  const box = document.getElementById('walkInList');
  if (!rows.length) {
    box.innerHTML = '<p style="color:var(--ink-500);">No one has checked in online for walk-in in the last 24 hours.</p>';
    return;
  }
  // Active (expected/arrived) people first, in the order they booked in; finished ones below.
  const active = rows.filter((r) => r.status === 'expected' || r.status === 'arrived');
  const done = rows.filter((r) => r.status === 'seen' || r.status === 'cancelled');
  box.innerHTML = [...active, ...done].map((r) => {
    const finished = r.status === 'seen' || r.status === 'cancelled';
    const arrival = r.arrival_minutes === 0 ? 'here now / very shortly' : `arriving in ~${r.arrival_minutes} min (as of ${clinicFmtTime(r.created_at)})`;
    const btn = (status, label) => `<button class="btn btn-secondary" style="padding:6px 14px;font-size:0.85rem;" onclick="setWalkInStatus('${clinicEsc(r.id)}','${status}')">${label}</button>`;
    return `
      <div class="card" style="margin-bottom:10px; ${finished ? 'opacity:0.6;' : ''}">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <strong>${clinicEsc(r.full_name)} <span style="font-weight:400;color:var(--ink-500);">· ${clinicEsc(clinicAge(r.dob))} · DOB ${clinicEsc(r.dob)}</span></strong>
          <span class="badge ${r.status === 'seen' ? 'badge-green' : 'badge-amber'}">${WALKIN_STATUS_LABEL[r.status] || clinicEsc(r.status)}</span>
        </div>
        <p style="margin:8px 0 4px;">${clinicEsc(r.reason)}</p>
        <p style="color:var(--ink-500);font-size:0.85rem;margin:0 0 10px;">
          Phone ${clinicEsc(r.phone)}${r.email ? ' · ' + clinicEsc(r.email) : ''} · ${clinicEsc(arrival)} · Ref ${clinicEsc(r.id)}
        </p>
        ${finished ? btn('expected', 'Reopen') : `
          ${r.status === 'expected' ? btn('arrived', 'Mark arrived') : ''}
          ${btn('seen', 'Mark seen')}
          ${btn('cancelled', 'Cancel / no-show')}`}
      </div>`;
  }).join('');
}

async function setWalkInStatus(id, status) {
  await doctorFetch(`/api/doctor/clinic/walk-ins/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  loadClinic();
  if (typeof activeTab !== 'undefined' && activeTab === 'today') loadToday();
}

async function loadRegistrations() {
  const res = await doctorFetch('/api/doctor/clinic/registrations');
  const rows = await res.json();
  const box = document.getElementById('registrationList');
  if (!rows.length) {
    box.innerHTML = '<p style="color:var(--ink-500);">No registrations yet.</p>';
    return;
  }
  box.innerHTML = rows.map((r) => {
    const field = (label, value) => value ? `<p style="margin:4px 0;"><strong>${label}:</strong> ${clinicEsc(value)}</p>` : '';
    const kin = r.next_of_kin ? [r.next_of_kin.name, r.next_of_kin.relationship, r.next_of_kin.phone].filter(Boolean).join(' · ') : '';
    const family = r.family_members.length
      ? `<p style="margin:10px 0 4px;"><strong>Family members to register (${r.family_members.length}):</strong></p>
         <ul style="margin:0 0 4px 18px;">${r.family_members.map((m) => `<li>${clinicEsc(m.name)} — DOB ${clinicEsc(m.dob)} (${clinicEsc(clinicAge(m.dob))})${m.relationship ? ' · ' + clinicEsc(m.relationship) : ''}</li>`).join('')}</ul>`
      : '';
    return `
      <details class="card prev-visit" style="margin-bottom:10px; ${r.status === 'processed' ? 'opacity:0.65;' : ''}">
        <summary>
          <span><strong>${clinicEsc(r.full_name)}</strong>${r.family_members.length ? ` <span class="prev-visit-counts">+ ${r.family_members.length} family</span>` : ''}</span>
          <span class="prev-visit-counts">${clinicFmtTime(r.created_at)} · <span class="badge ${r.status === 'processed' ? 'badge-green' : 'badge-amber'}">${r.status === 'processed' ? 'Processed' : 'New'}</span></span>
        </summary>
        <div style="margin-top:10px;">
          ${field('DOB', `${r.dob} (${clinicAge(r.dob)})`)}
          ${field('Sex', r.sex)}
          ${field('Phone', r.phone)}
          ${field('Email', r.email)}
          ${field('Address', [r.address, r.eircode].filter(Boolean).join(', '))}
          ${field('Medical / GP Visit Card', MEDICAL_CARD_LABEL[r.medical_card] || r.medical_card)}
          ${field('Previous GP', r.previous_gp)}
          ${field('Long-term conditions', r.known_conditions)}
          ${field('Current medicines', r.current_medications)}
          ${field('Allergies', r.allergies)}
          ${field('Next of kin', kin)}
          ${field('Notes', r.reg_notes)}
          ${family}
          <p style="color:var(--ink-500);font-size:0.8rem;margin:10px 0;">Ref ${clinicEsc(r.id)} · consent recorded ${clinicFmtTime(r.consent_at)}</p>
          <button class="btn btn-secondary" style="padding:6px 14px;font-size:0.85rem;" onclick="setRegistrationStatus('${clinicEsc(r.id)}','${r.status === 'processed' ? 'new' : 'processed'}')">${r.status === 'processed' ? 'Mark as new again' : 'Mark as processed'}</button>
        </div>
      </details>`;
  }).join('');
}

async function setRegistrationStatus(id, status) {
  await doctorFetch(`/api/doctor/clinic/registrations/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  loadClinic();
}

// ---------------------------------------------------------------- "Today" overview (the doctor's default tab)
async function loadToday() {
  const date = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in the browser's timezone
  try {
    const [sum, walkins, sched, tasks] = await Promise.all([
      doctorFetch('/api/doctor/clinic/summary').then((r) => r.json()),
      doctorFetch('/api/doctor/clinic/walk-ins').then((r) => r.json()),
      doctorFetch('/api/doctor/schedule?date=' + date).then((r) => r.json()),
      doctorFetch('/api/doctor/tasks').then((r) => r.json()),
    ]);
    if (!window.todayServiceLabels) window.todayServiceLabels = await fetch('/api/services').then((r) => r.json()).catch(() => ({}));
    const queue = walkins.filter((r) => r.status === 'expected' || r.status === 'arrived');
    const appts = sched.bookings || [];
    const pendingTasks = tasks.filter((t) => t.status === 'pending').length;
    document.getElementById('tdWaiting').textContent = sum.activeWalkIns;
    document.getElementById('tdAppts').textContent = appts.length;
    document.getElementById('tdRegs').textContent = sum.newRegistrations;
    document.getElementById('tdTasks').textContent = pendingTasks;

    const qBox = document.getElementById('tdQueue');
    qBox.innerHTML = queue.length ? queue.slice(0, 6).map((r) => `
      <article class="queue-card st-${clinicEsc(r.status)}">
        <div class="qc-main">
          <div class="qc-top"><strong class="qc-name">${clinicEsc(r.full_name)}</strong><span class="qc-age">${clinicEsc(clinicAge(r.dob))}</span><span class="badge badge-amber">${WALKIN_STATUS_LABEL[r.status] || clinicEsc(r.status)}</span></div>
          <p class="qc-reason">${clinicEsc(r.reason)}</p>
          <p class="qc-meta">${r.status === 'expected' && r.arrival_minutes > 0 ? 'Expected in ~' + r.arrival_minutes + ' min · ' : ''}Checked in ${clinicEsc(clinicFmtTime(r.created_at))}</p>
        </div>
        <div class="qc-actions"><button class="btn btn-primary" onclick="setWalkInStatus('${clinicEsc(r.id)}','seen')">Mark seen</button></div>
      </article>`).join('') + (queue.length > 6 ? `<p class="staff-hint">+ ${queue.length - 6} more in the Clinic tab</p>` : '')
      : '<div class="empty">No one is waiting.</div>';

    const aBox = document.getElementById('tdAppts2');
    aBox.innerHTML = appts.length ? appts.map((b) => `
      <div class="appt-row">
        <span class="appt-time">${clinicEsc(new Date(b.slot_start).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' }))}</span>
        <span class="appt-who"><strong>${clinicEsc(b.patient_name)}</strong><span class="appt-svc">${clinicEsc((window.todayServiceLabels[b.service_type] || {}).label || String(b.service_type).replace('_', ' '))}</span></span>
        <span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><span class="badge ${b.status === 'completed' ? 'badge-green' : 'badge-amber'}">${b.status === 'completed' ? 'Completed' : 'Booked'}</span>
        <button class="btn btn-secondary" style="padding:8px 16px;" onclick="openBooking('${clinicEsc(b.id)}', null)">Open</button></span>
      </div>`).join('') : '<div class="empty">No online appointments today.</div>';
  } catch (err) { /* session-expired handled by doctorFetch */ }
}
