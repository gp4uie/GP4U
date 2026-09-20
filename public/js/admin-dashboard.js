// Readable name for a booking's service key (walk-in bookings are created by the front desk / check-in).
function svcLabel(t) { return t === 'walk_in' ? 'Walk-in visit' : String(t || '').replace(/_/g, ' '); }
let activeAdminTab = 'analytics';
let scheduleEditorDoctorId = null;

async function checkAdminSession() {
  const res = await fetch('/api/admin/me');
  const data = await res.json();
  if (!data.loggedIn) {
    window.location.href = '/admin-login.html';
    return;
  }
  myStaffId = data.adminId;
  document.getElementById('whoami').textContent = `${data.adminName} — ${data.practiceName}`;
  loadAnalytics();
  // Keeps the "Online" column current without needing to leave/re-enter the Doctors tab, and
  // keeps the team chat + presence live while Messages is the visible tab — same "poll but only
  // re-render the currently-visible tab" pattern used on the doctor dashboard.
  setInterval(() => {
    if (activeAdminTab === 'doctors') loadDoctors();
    if (activeAdminTab === 'messages') { loadStaffDirectory(); loadStaffMessages(); }
  }, 15000);
}

document.getElementById('logoutLink').addEventListener('click', async (e) => {
  e.preventDefault();
  await fetch('/api/admin/logout', { method: 'POST' });
  window.location.href = '/admin-login.html';
});

function showAdminTab(tab) {
  activeAdminTab = tab;
  ['analytics', 'doctors', 'reception', 'account', 'patients', 'rx', 'accesslog', 'messages'].forEach((t) => {
    document.getElementById('tab_' + t).style.display = t === tab ? 'block' : 'none';
    document.getElementById('tabBtn_' + t).classList.toggle('active', t === tab);
  });
  if (tab === 'analytics') loadAnalytics();
  if (tab === 'doctors') loadDoctors();
  if (tab === 'reception') loadReception();
  if (tab === 'account') loadMyAccount();
  if (tab === 'patients') loadPatients();
  if (tab === 'rx') { loadAdminPrescriptions(); loadAdminSummaries(); }
  if (tab === 'accesslog') loadAccessLog();
  if (tab === 'messages') { loadStaffDirectory(); loadStaffMessages(); }
}

async function loadAccessLog() {
  const res = await fetch('/api/admin/access-log');
  const log = await res.json();
  document.getElementById('accessLogBody').innerHTML = log.length ? log.map((r) => `
    <tr>
      <td>${new Date(r.viewed_at).toLocaleString('en-IE')}</td>
      <td>${r.doctor_name}</td>
      <td>${r.patient_name}</td>
      <td>${svcLabel(r.service_type)}</td>
    </tr>
  `).join('') : '<tr><td colspan="4" style="color:var(--ink-500);">No access recorded yet.</td></tr>';
}

async function loadAdminPrescriptions() {
  const res = await fetch('/api/admin/prescriptions');
  const prescriptions = await res.json();
  document.getElementById('adminRxBody').innerHTML = prescriptions.length ? prescriptions.map((p) => `
    <tr>
      <td>${new Date(p.issued_at).toLocaleString('en-IE')}</td>
      <td>${p.patient_name}</td>
      <td>${p.medication} — ${p.dose}</td>
      <td>${p.pharmacy_name || '—'}</td>
      <td>${p.doctor_name}</td>
      <td>${p.sent_to_email ? `Sent to ${p.sent_to_email}` : 'Not sent yet'}</td>
    </tr>
  `).join('') : '<tr><td colspan="6" style="color:var(--ink-500);">No prescriptions issued yet.</td></tr>';
}

async function loadAdminSummaries() {
  const res = await fetch('/api/admin/completed-summaries');
  const summaries = await res.json();
  document.getElementById('adminSummariesList').innerHTML = summaries.length ? summaries.map((s) => `
    <div class="card" style="margin-bottom:12px;">
      <p><strong>${s.patientName}</strong> — ${svcLabel(s.serviceType)} — ${new Date(s.slotStart).toLocaleString('en-IE')}</p>
      <p><strong>Presentation:</strong> ${s.reason || 'N/A'}</p>
      ${s.notes.length ? `<p><strong>Notes:</strong> ${s.notes.map((n) => n.note_text).join('; ')}</p>` : ''}
      ${s.prescriptions.length ? `<p><strong>Medication issued:</strong> ${s.prescriptions.map((p) => `${p.medication} ${p.dose}, ${p.frequency}, ${p.duration}`).join('; ')}</p>` : '<p><strong>Medication issued:</strong> None</p>'}
      ${s.sickCerts.length ? `<p><strong>Sick cert:</strong> ${s.sickCerts.map((c) => `${c.days} day(s) (${new Date(c.dateFrom).toLocaleDateString('en-IE')}–${new Date(c.dateTo).toLocaleDateString('en-IE')}), ${c.fitForWork}, diagnosis: ${c.diagnosis}`).join('; ')}</p>` : ''}
    </div>
  `).join('') : '<p style="color:var(--ink-500);">No completed consultations yet.</p>';
}

function euro(cents) {
  return '€' + (cents / 100).toFixed(2);
}

// --- Analytics ---
// --- Go-live checklist (what still needs setting up) ---
async function loadSetup() {
  const box = document.getElementById('setupCard');
  const res = await fetch('/api/admin/setup-status');
  if (!res.ok) return;
  const s = await res.json();
  const missing = s.items.filter((i) => !i.ok);
  const groups = [...new Set(s.items.map((i) => i.group))];
  box.innerHTML = `
    <details class="card setup-card"${missing.length ? ' open' : ''}>
      <summary><strong>Setup checklist</strong> <span class="badge ${missing.length ? 'badge-amber' : 'badge-green'}">${s.done} of ${s.total} done</span>
        <span class="setup-sub">${missing.length ? 'Things to finish before the clinic runs for real' : 'Everything is set up'}</span></summary>
      ${groups.map((g) => `<h4>${pEsc(g)}</h4><ul class="setup-list">${s.items.filter((i) => i.group === g).map((i) => `
        <li class="${i.ok ? 'ok' : 'todo'}"><span class="setup-tick" aria-hidden="true">${i.ok ? '✓' : '!'}</span>
          <div><strong>${pEsc(i.label)}</strong>${i.ok ? '' : `<p>${pEsc(i.why)}</p><p class="setup-fix">${pEsc(i.todo)}</p>`}</div></li>`).join('')}</ul>`).join('')}
    </details>`;
}

async function loadAnalytics() {
  loadSetup();
  const res = await fetch('/api/admin/analytics');
  const data = await res.json();

  document.getElementById('stat_seenToday').textContent = data.patientsSeen.today;
  document.getElementById('stat_seenWeek').textContent = data.patientsSeen.week;
  document.getElementById('stat_seenMonth').textContent = data.patientsSeen.month;

  document.getElementById('stat_revToday').textContent = euro(data.revenueCents.today);
  document.getElementById('stat_revWeek').textContent = euro(data.revenueCents.week);
  document.getElementById('stat_revMonth').textContent = euro(data.revenueCents.month);

  document.getElementById('stat_totalPatients').textContent = data.totalPatients;
  document.getElementById('stat_totalCompleted').textContent = data.totalCompleted;
  document.getElementById('stat_upcoming').textContent = data.upcoming;
  document.getElementById('stat_newVsReturning').textContent =
    `${data.newVsReturning.newThisMonth} new / ${data.newVsReturning.returningThisMonth} returning`;

  document.getElementById('perDoctorBody').innerHTML = data.perDoctor.map((d) => `
    <tr><td>${d.doctorName}</td><td>${d.seenThisMonth}</td><td>${d.totalSeen}</td></tr>
  `).join('') || '<tr><td colspan="3">No consultations recorded yet.</td></tr>';

  document.getElementById('serviceBreakdownBody').innerHTML = data.serviceBreakdown.map((s) => `
    <tr><td>${svcLabel(s.service_type)}</td><td>${s.n}</td><td>${euro(s.cents)}</td></tr>
  `).join('') || '<tr><td colspan="3">No bookings yet.</td></tr>';
}

// --- Doctors ---
async function loadDoctors() {
  const res = await fetch('/api/admin/doctors');
  const doctors = await res.json();
  document.getElementById('doctorsBody').innerHTML = doctors.map((d) => `
    <tr>
      <td>${d.name}</td>
      <td>${d.reg_number}</td>
      <td>${d.email}</td>
      <td><span class="badge ${d.active ? 'badge-green' : 'badge-amber'}">${d.active ? 'Active' : 'Deactivated'}</span></td>
      <td><span class="online-dot ${d.online ? 'online' : ''}"></span>${d.online ? 'Online' : 'Offline'}</td>
      <td>${d.last_login_at ? new Date(d.last_login_at).toLocaleString('en-IE') : 'Never'}</td>
      <td>${d.totp_enabled ? '<span class="badge badge-green">On</span>' : '—'}
        ${d.totp_enabled ? `<button class="btn btn-secondary" style="padding:4px 10px;font-size:0.78rem;margin-left:6px;" onclick="disableDoctorTotp(${d.id})">Reset</button>` : ''}
      </td>
      <td><button class="btn btn-secondary" onclick="openScheduleEditor(${d.id}, '${d.name.replace(/'/g, "\\'")}')">Edit Schedule</button>
        <button class="btn btn-secondary" style="margin-top:6px;" onclick="editPerson('doctor', ${d.id})">Edit details</button></td>
      <td>
        ${d.active
          ? `<button class="btn btn-secondary" onclick="deactivateDoctor(${d.id})">Deactivate</button>`
          : `<button class="btn btn-secondary" onclick="reactivateDoctor(${d.id})">Reactivate</button>`}
        <button class="btn btn-secondary" onclick="removeDoctor(${d.id})">Delete</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="9">No doctors yet.</td></tr>';
}

async function addDoctor() {
  const name = document.getElementById('newDoctorName').value;
  const regNumber = document.getElementById('newDoctorReg').value;
  const email = document.getElementById('newDoctorEmail').value;
  const password = document.getElementById('newDoctorPassword').value;
  const res = await fetch('/api/admin/doctors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, regNumber, email, password }),
  });
  const data = await res.json();
  if (res.ok) {
    ['newDoctorName', 'newDoctorReg', 'newDoctorEmail', 'newDoctorPassword'].forEach((id) => document.getElementById(id).value = '');
    document.getElementById('doctorFormMsg').style.color = 'var(--teal-700)';
    document.getElementById('doctorFormMsg').textContent = 'Doctor added.';
    loadDoctors();
  } else {
    document.getElementById('doctorFormMsg').style.color = '#c0392b';
    document.getElementById('doctorFormMsg').textContent = data.error;
  }
}

async function removeDoctor(id) {
  if (!confirm('Permanently delete this doctor account? Prefer "Deactivate" unless this is a duplicate/mistaken account — deactivating blocks login while keeping the account on record.')) return;
  const res = await fetch('/api/admin/doctors/' + id, { method: 'DELETE' });
  const data = await res.json();
  if (res.ok) loadDoctors();
  else alert(data.error);
}

async function deactivateDoctor(id) {
  if (!confirm('Deactivate this doctor? They will be logged out and unable to log back in until reactivated.')) return;
  const res = await fetch(`/api/admin/doctors/${id}/deactivate`, { method: 'POST' });
  const data = await res.json();
  if (res.ok) loadDoctors();
  else alert(data.error);
}

async function reactivateDoctor(id) {
  const res = await fetch(`/api/admin/doctors/${id}/reactivate`, { method: 'POST' });
  const data = await res.json();
  if (res.ok) loadDoctors();
  else alert(data.error);
}

async function disableDoctorTotp(id) {
  if (!confirm("Reset this doctor's two-factor authentication? They'll be able to log in with just their password until they set it up again.")) return;
  const res = await fetch(`/api/admin/doctors/${id}/disable-totp`, { method: 'POST' });
  const data = await res.json();
  if (res.ok) loadDoctors();
  else alert(data.error);
}

async function openScheduleEditor(doctorId, doctorName) {
  scheduleEditorDoctorId = doctorId;
  document.getElementById('scheduleEditorHeader').textContent = `${doctorName}'s Schedule`;
  document.getElementById('scheduleEditor').style.display = 'block';
  document.getElementById('scheduleMsg').textContent = '';
  const res = await fetch(`/api/admin/doctors/${doctorId}/availability`);
  const rows = await res.json();
  renderAvailabilityEditor(document.getElementById('scheduleGrid'), rows);
  document.getElementById('scheduleEditor').scrollIntoView({ behavior: 'smooth' });
}

async function saveDoctorSchedule() {
  const ranges = collectAvailabilityRanges(document.getElementById('scheduleGrid'));
  const res = await fetch(`/api/admin/doctors/${scheduleEditorDoctorId}/availability`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ranges }),
  });
  const data = await res.json();
  const msg = document.getElementById('scheduleMsg');
  if (res.ok) {
    msg.style.color = 'var(--teal-700)';
    msg.textContent = 'Schedule saved.';
  } else {
    msg.style.color = '#c0392b';
    msg.textContent = data.error;
  }
}

function closeScheduleEditor() {
  scheduleEditorDoctorId = null;
  document.getElementById('scheduleEditor').style.display = 'none';
}

// --- Patients ---
let summaryPatientEmail = null;

async function loadPatients() {
  const q = document.getElementById('patientSearchInput').value.trim();
  const res = await fetch('/api/admin/patients' + (q ? '?q=' + encodeURIComponent(q) : ''));
  const patients = await res.json();
  document.getElementById('patientsBody').innerHTML = patients.map((p) => `
    <tr onclick="openPatientSummary('${p.email.replace(/'/g, "\\'")}')">
      <td>${p.name || '—'}</td>
      <td>${p.email}</td>
      <td>${p.phone || '—'}</td>
      <td>${p.dob || '—'}</td>
    </tr>
  `).join('') || '<tr><td colspan="4">No patients found.</td></tr>';
}

async function openPatientSummary(email) {
  summaryPatientEmail = email;
  const res = await fetch(`/api/admin/patients/${encodeURIComponent(email)}/summary`);
  const data = await res.json();
  if (!res.ok) { alert(data.error); return; }

  document.getElementById('patientSummaryHeader').textContent = `${data.patient.name} — ${data.patient.email}`;
  document.getElementById('patientLastSend').textContent = data.lastSend
    ? `Last sent to ${data.lastSend.sent_to_email} on ${new Date(data.lastSend.sent_at).toLocaleString('en-IE')}`
    : 'Never sent to a GP.';

  document.getElementById('patientConsultations').innerHTML = data.consultations.map((c) => `
    <div class="card" style="margin-bottom:12px;">
      <strong>${new Date(c.slot_start).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })} — ${svcLabel(c.service_type)}</strong>
      <p style="color:var(--ink-500); margin:4px 0;">Reason: ${c.reason || 'N/A'}</p>
      ${c.notes.length ? `<p><strong>Notes:</strong> ${c.notes.map((n) => n.note_text).join('; ')}</p>` : ''}
      ${c.prescriptions.length ? `<p><strong>Prescriptions:</strong> ${c.prescriptions.map((p) => `${p.medication} ${p.dose}`).join(', ')}</p>` : ''}
      ${c.documents.length ? `<p><strong>Documents:</strong> ${c.documents.map((d) => d.doc_type).join(', ')}</p>` : ''}
    </div>
  `).join('') || '<p style="color:var(--ink-500);">No consultation history yet.</p>';

  document.getElementById('sendSummaryMsg').textContent = '';
  document.getElementById('patientSummary').style.display = 'block';
  document.getElementById('patientSummary').scrollIntoView({ behavior: 'smooth' });
}

async function sendPatientSummary() {
  const toEmail = document.getElementById('sendToGpEmail').value;
  const res = await fetch(`/api/admin/patients/${encodeURIComponent(summaryPatientEmail)}/send-summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toEmail }),
  });
  const data = await res.json();
  const msg = document.getElementById('sendSummaryMsg');
  if (res.ok) {
    msg.style.color = 'var(--teal-700)';
    msg.textContent = 'Summary sent.';
  } else {
    msg.style.color = '#c0392b';
    msg.textContent = data.error;
  }
}

function closePatientSummary() {
  summaryPatientEmail = null;
  document.getElementById('patientSummary').style.display = 'none';
}

// --- Team Messages: "Everyone" broadcast board, or a 1:1 DM with one admin/doctor ---
let myStaffId = null;
let staffConversation = 'everyone'; // 'everyone' | '<type>:<id>'
let staffDirectoryCache = [];

async function loadStaffDirectory() {
  const res = await fetch('/api/admin/staff-directory');
  staffDirectoryCache = await res.json();
  renderStaffContactList();
}

function renderStaffContactList() {
  const list = document.getElementById('staffContactList');
  const others = staffDirectoryCache.filter((p) => !(p.type === 'admin' && p.id === myStaffId));
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
    ? '/api/admin/internal-messages'
    : `/api/admin/internal-messages?with=${encodeURIComponent(staffConversation)}`;
  const res = await fetch(url);
  const messages = await res.json();
  const thread = document.getElementById('staffMessageThread');
  thread.innerHTML = messages.length
    ? messages.map((m) => `
        <div class="msg ${m.sender_type === 'admin' && m.sender_id === myStaffId ? 'staff-mine' : 'staff-other'}">
          ${m.body}<small>${m.sender_name} (${m.sender_type === 'admin' ? 'Admin' : 'Doctor'}) • ${new Date(m.created_at).toLocaleString('en-IE')}</small>
        </div>
      `).join('')
    : '<p style="color:var(--ink-500);">No messages yet.</p>';
  thread.scrollTop = thread.scrollHeight;
}

async function sendStaffMessage() {
  const input = document.getElementById('staffMessageInput');
  if (!input.value.trim()) return;
  const res = await fetch('/api/admin/internal-messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: input.value, with: staffConversation === 'everyone' ? null : staffConversation }),
  });
  if (res.ok) input.value = '';
  loadStaffMessages();
}

checkAdminSession();


// ---------------------------------------------------------------- Reception (front-desk) accounts
function recEsc(v) {
  return String(v === null || v === undefined ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function loadReception() {
  const res = await fetch('/api/admin/receptionists');
  const rows = await res.json();
  document.getElementById('receptionBody').innerHTML = rows.map((r) => `
    <tr>
      <td>${recEsc(r.name)}</td>
      <td>${recEsc(r.email)}</td>
      <td><span class="badge ${r.active ? 'badge-green' : 'badge-amber'}">${r.active ? 'Active' : 'Deactivated'}</span></td>
      <td><span class="online-dot ${r.online ? 'online' : ''}"></span>${r.online ? 'Online' : 'Offline'}</td>
      <td>${r.last_login_at ? new Date(r.last_login_at).toLocaleString('en-IE') : 'Never'}</td>
      <td>
        <details><summary style="cursor:pointer;font-weight:700;">Set new password</summary>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <input type="password" id="recPw${r.id}" placeholder="New password" aria-label="New password for ${recEsc(r.name)}" autocomplete="new-password" style="min-width:150px;">
            <button class="btn btn-secondary" style="padding:8px 14px;" onclick="setReceptionPassword(${r.id})">Save</button>
          </div>
        </details>
      </td>
      <td>${r.active
        ? `<button class="btn btn-secondary" onclick="setReceptionActive(${r.id}, false)">Deactivate</button>`
        : `<button class="btn btn-secondary" onclick="setReceptionActive(${r.id}, true)">Reactivate</button>`}
        <button class="btn btn-secondary" onclick="editPerson('reception', ${r.id})">Edit details</button>
        <button class="btn btn-secondary" onclick="removeReceptionist(${r.id})">Delete</button></td>
    </tr>`).join('') || '<tr><td colspan="7">No reception accounts yet.</td></tr>';
  loadReceptionLog();
}

async function loadReceptionLog() {
  const res = await fetch('/api/admin/reception-log');
  if (!res.ok) return;
  const rows = await res.json();
  document.getElementById('receptionLogBody').innerHTML = rows.map((r) => `
    <tr><td>${new Date(r.created_at).toLocaleString('en-IE')}</td><td>${recEsc(r.receptionist_name || 'Removed account')}</td><td>${recEsc(r.action)}</td><td>${recEsc(r.detail || '')}</td></tr>`).join('') || '<tr><td colspan="4">No front-desk activity yet.</td></tr>';
}

async function addReceptionist() {
  const msg = document.getElementById('receptionMsg');
  msg.style.color = ''; msg.textContent = '';
  const body = {
    name: document.getElementById('newRecName').value,
    email: document.getElementById('newRecEmail').value,
    password: document.getElementById('newRecPassword').value,
  };
  const res = await fetch('/api/admin/receptionists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { msg.textContent = data.error || 'Could not add this account.'; return; }
  ['newRecName', 'newRecEmail', 'newRecPassword'].forEach((id) => { document.getElementById(id).value = ''; });
  msg.style.color = 'var(--teal-700)'; msg.textContent = 'Receptionist added. Give them their email and password in person — they sign in at /reception.html.';
  loadReception();
}

async function setReceptionActive(id, active) {
  await fetch('/api/admin/receptionists/' + id + (active ? '/reactivate' : '/deactivate'), { method: 'POST' });
  loadReception();
}

async function setReceptionPassword(id) {
  const input = document.getElementById('recPw' + id);
  const msg = document.getElementById('receptionMsg');
  const res = await fetch('/api/admin/receptionists/' + id + '/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: input.value }) });
  const data = await res.json().catch(() => ({}));
  msg.style.color = res.ok ? 'var(--teal-700)' : '';
  msg.textContent = res.ok ? 'Password updated.' : (data.error || 'Could not update the password.');
  if (res.ok) input.value = '';
}

// ---------------------------------------------------------------- Edit a doctor's or receptionist's details
const pEsc = (v) => String(v === null || v === undefined ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

async function editPerson(kind, id) {
  const isDoctor = kind === 'doctor';
  const list = await (await fetch(isDoctor ? '/api/admin/doctors' : '/api/admin/receptionists')).json();
  const p = list.find((x) => x.id === id);
  if (!p) return;
  const box = document.getElementById('personEditor');
  box.hidden = false;
  box.innerHTML = `
    <h3 style="margin-top:0;">Edit ${isDoctor ? 'doctor' : 'receptionist'}: ${pEsc(p.name)}</h3>
    <form id="personForm" novalidate>
      <div class="form-grid">
        <div class="form-row"><label for="pName">Name</label><input id="pName" maxlength="255" value="${pEsc(p.name)}"></div>
        ${isDoctor ? `<div class="form-row"><label for="pReg">IMC registration number</label><input id="pReg" maxlength="64" value="${pEsc(p.reg_number)}"></div>` : ''}
        <div class="form-row"><label for="pEmail">Login email</label><input id="pEmail" type="email" maxlength="255" value="${pEsc(p.email)}"></div>
        <div class="form-row"><label for="pPw">New password <span style="font-weight:400;color:var(--muted);">(optional, at least 8 characters)</span></label><input id="pPw" type="password" autocomplete="new-password"></div>
      </div>
      <button class="btn btn-primary" type="submit">Save changes</button>
      <button class="btn btn-secondary" type="button" onclick="document.getElementById('personEditor').hidden = true">Cancel</button>
      <p id="personMsg" role="alert" class="staff-error"></p>
    </form>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('personForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('personMsg'); msg.style.color = ''; msg.textContent = '';
    const call = async (url, method, body) => {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save');
    };
    try {
      const base = isDoctor ? '/api/admin/doctors/' : '/api/admin/receptionists/';
      await call(base + id, 'PUT', isDoctor
        ? { name: document.getElementById('pName').value, regNumber: document.getElementById('pReg').value, email: document.getElementById('pEmail').value }
        : { name: document.getElementById('pName').value, email: document.getElementById('pEmail').value });
      const pw = document.getElementById('pPw').value;
      if (pw) await call(base + id + '/password', 'POST', { password: pw });
      box.hidden = true;
      if (isDoctor) loadDoctors(); else loadReception();
    } catch (err) { msg.textContent = err.message; }
  });
}

async function removeReceptionist(id) {
  if (!window.confirm('Delete this reception account? They will no longer be able to sign in. (Deactivate instead if you might want them back.)')) return;
  await fetch('/api/admin/receptionists/' + id, { method: 'DELETE' });
  loadReception();
}

// ---------------------------------------------------------------- My account
async function loadMyAccount() {
  const me = await (await fetch('/api/admin/me')).json();
  document.getElementById('myName').value = me.adminName || '';
  document.getElementById('myEmail').value = me.adminEmail || '';
}
document.getElementById('myAccountForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('myAccountMsg'); msg.className = 'staff-ok'; msg.textContent = '';
  const res = await fetch('/api/admin/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: document.getElementById('myName').value, email: document.getElementById('myEmail').value }) });
  const data = await res.json().catch(() => ({}));
  msg.className = res.ok ? 'staff-ok' : 'staff-error';
  msg.textContent = res.ok ? 'Saved.' : (data.error || 'Could not save');
});
document.getElementById('myPasswordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('myPasswordMsg'); msg.className = 'staff-ok'; msg.textContent = '';
  const res = await fetch('/api/admin/me/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: document.getElementById('myCurrentPw').value, newPassword: document.getElementById('myNewPw').value }) });
  const data = await res.json().catch(() => ({}));
  msg.className = res.ok ? 'staff-ok' : 'staff-error';
  msg.textContent = res.ok ? 'Password changed.' : (data.error || 'Could not change the password');
  if (res.ok) { document.getElementById('myCurrentPw').value = ''; document.getElementById('myNewPw').value = ''; }
});
