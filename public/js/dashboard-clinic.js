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
    box.innerHTML = '<p style="color:var(--ink-500);">No one has booked in for walk-in in the last 24 hours.</p>';
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
