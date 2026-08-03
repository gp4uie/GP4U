let currentBookingId = null;
let currentPatientEmail = null;
let scheduleDate = new Date();
let activeTab = 'schedule';

let currentListType = null; // 'schedule' | 'search' | 'recent'
let scheduleIds = [], searchIds = [], recentIds = [];
let MEDICATIONS_LIST = [];

async function checkSession() {
  const res = await fetch('/api/doctor/me');
  const data = await res.json();
  if (data.loggedIn) {
    document.getElementById('loginBox').style.display = 'none';
    document.getElementById('dashboardBox').style.display = 'block';
    document.getElementById('whoami').textContent = `${data.doctorName} — ${data.practiceName}`;
    document.getElementById('logoutLink').style.display = 'inline';
    document.getElementById('contentEditorLink').style.display = 'inline';
    document.getElementById('notifWrap').style.display = 'block';
    loadSchedule();
    loadNotifications();
    loadMedications();
    setInterval(loadNotifications, 15000);
  }
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
  if (res.ok) {
    checkSession();
  } else {
    document.getElementById('loginError').textContent = data.error || 'Incorrect email or password.';
  }
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

// --- Top-level tabs ---
function showTab(tab) {
  activeTab = tab;
  ['schedule', 'search', 'recent'].forEach((t) => {
    document.getElementById('tab_' + t).style.display = t === tab ? 'block' : 'none';
    document.getElementById('tabBtn_' + t).classList.toggle('active', t === tab);
  });
  if (tab === 'recent') loadRecent();
  if (tab === 'schedule') loadSchedule();
}

// --- Schedule (day view, 15-minute slots) ---
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function changeDay(delta) {
  scheduleDate.setDate(scheduleDate.getDate() + delta);
  loadSchedule();
}

function goToToday() {
  scheduleDate = new Date();
  loadSchedule();
}

async function loadSchedule() {
  document.getElementById('scheduleDateLabel').textContent = scheduleDate.toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' });
  const res = await fetch('/api/doctor/schedule?date=' + isoDate(scheduleDate));
  const data = await res.json();
  scheduleIds = data.bookings.map((b) => b.id);
  renderScheduleGrid(data.bookings, data.dayStartMins, data.dayEndMins);
}

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
    html += `<div class="schedule-empty" style="grid-row: 1 / span ${totalSlots};">No bookings for this day.</div>`;
  }
  bookings.forEach((b) => {
    const start = new Date(b.slot_start), end = new Date(b.slot_end);
    const startMinFromDayStart = (start.getHours() * 60 + start.getMinutes()) - dayStartMins;
    const durMin = (end - start) / 60000;
    const rowStart = Math.max(1, Math.floor(startMinFromDayStart / stepMin) + 1);
    const rowSpan = Math.max(1, Math.round(durMin / stepMin));
    const timeLabel = start.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
    const reasonPreview = b.reason ? b.reason.slice(0, 40) + (b.reason.length > 40 ? '…' : '') : '';
    html += `<div class="schedule-booking ${b.status === 'completed' ? 'completed' : ''}" style="grid-row:${rowStart} / span ${rowSpan};" onclick="openBooking('${b.id}', 'schedule')" title="${reasonPreview.replace(/"/g, '&quot;')}">${timeLabel} <strong>${b.patient_name}</strong> — ${reasonPreview || b.service_type.replace('_', ' ')}</div>`;
  });
  document.getElementById('scheduleGrid').innerHTML = html;
}

// --- Search Patients ---
async function runSearch() {
  const q = document.getElementById('searchInput').value.trim();
  const resultsEl = document.getElementById('searchResults');
  if (!q) { resultsEl.innerHTML = ''; return; }
  const res = await fetch('/api/doctor/search?q=' + encodeURIComponent(q));
  const results = await res.json();
  searchIds = results.map((b) => b.id);
  if (!results.length) {
    resultsEl.innerHTML = '<p style="color:var(--ink-500);">No matching records found.</p>';
    return;
  }
  resultsEl.innerHTML = `
    <div class="table-scroll">
    <table class="bookings-table">
      <thead><tr><th>When</th><th>Service</th><th>Patient</th><th>DOB</th><th>Phone</th><th>Status</th></tr></thead>
      <tbody>
        ${results.map(b => `
          <tr onclick="openBooking('${b.id}', 'search')">
            <td>${new Date(b.slot_start).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
            <td>${b.service_type.replace('_', ' ')}</td>
            <td>${b.patient_name}</td>
            <td>${b.patient_dob}</td>
            <td>${b.patient_phone}</td>
            <td><span class="badge ${b.status === 'completed' ? 'badge-green' : 'badge-amber'}">${b.status}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    </div>
  `;
}

// --- Recent Cases ---
async function loadRecent() {
  const res = await fetch('/api/doctor/recent');
  const bookings = await res.json();
  recentIds = bookings.map((b) => b.id);
  const body = document.getElementById('recentBody');
  body.innerHTML = bookings.length ? bookings.map((b) => `
    <tr onclick="openBooking('${b.id}', 'recent')">
      <td>${new Date(b.slot_start).toLocaleString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
      <td>${b.service_type.replace('_', ' ')}</td>
      <td>${b.patient_name}</td>
      <td><span class="badge ${b.status === 'completed' ? 'badge-green' : 'badge-amber'}">${b.status}</span></td>
    </tr>
  `).join('') : '<tr><td colspan="4" style="color:var(--ink-500);">No cases yet.</td></tr>';
}

// --- Notifications ---
async function loadNotifications() {
  const res = await fetch('/api/doctor/notifications');
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
        <div class="notif-item ${n.read_at ? '' : 'unread'}" onclick="handleNotifClick(${n.id}, '${n.booking_id}')">
          ${n.message}<small>${new Date(n.created_at).toLocaleString('en-IE')}</small>
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
  await fetch(`/api/doctor/notifications/${id}/read`, { method: 'POST' });
  document.getElementById('notifDropdown').classList.remove('open');
  loadNotifications();
  openBooking(bookingId, null);
}

// --- Chart sub-tabs ---
const CHART_TABS = ['overview', 'previous', 'messages', 'notes', 'prescription', 'sickcert', 'referral', 'documents'];

function showChartTab(name) {
  CHART_TABS.forEach((t) => {
    document.getElementById('chartSection_' + t).style.display = t === name ? 'block' : 'none';
  });
  document.querySelectorAll('.chart-tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.chartTab === name);
  });
}

function getCurrentList() {
  return { schedule: scheduleIds, search: searchIds, recent: recentIds }[currentListType] || [];
}

function navigateCase(delta) {
  const list = getCurrentList();
  const idx = list.indexOf(currentBookingId);
  if (idx === -1) return;
  const newIdx = idx + delta;
  if (newIdx >= 0 && newIdx < list.length) openBooking(list[newIdx], currentListType);
}

// --- Booking detail panel ---
async function openBooking(id, listType) {
  currentBookingId = id;
  if (listType !== undefined && listType !== null) currentListType = listType;
  const res = await fetch(`/api/doctor/bookings/${id}`);
  const data = await res.json();
  const b = data.booking;
  currentPatientEmail = b.patient_email;
  document.getElementById('chartHeader').textContent = `${b.patient_name} — ${b.service_type.replace('_', ' ')}`;
  document.getElementById('detailInfo').innerHTML = `
    <p><strong>Reference:</strong> ${b.id}</p>
    <p><strong>Patient:</strong> ${b.patient_name} (DOB ${b.patient_dob})</p>
    <p><strong>Address:</strong> ${b.patient_address || '—'}</p>
    <p><strong>Contact:</strong> ${b.patient_phone} • ${b.patient_email}</p>
    <p><strong>Pharmacy:</strong> ${b.pharmacy_name || '—'}</p>
    <p><strong>Service:</strong> ${b.service_type.replace('_', ' ')}</p>
    <p><strong>When:</strong> ${new Date(b.slot_start).toLocaleString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
    <p><strong>Reason given:</strong> ${b.reason}</p>
    <p><strong>Symptom duration:</strong> ${b.symptoms_duration || '—'}</p>
    <p><strong>Current medications:</strong> ${b.current_medications || '—'}</p>
    <p><strong>Allergies:</strong> ${b.allergies || '—'}</p>
    <p><strong>Additional details:</strong> ${b.extra_details || '—'}</p>
    ${b.safety_answers ? `<p><strong>Repeat prescription safety check:</strong><br>${b.safety_answers.replace(/\n/g, '<br>')}</p>` : ''}
    <p><strong>Status:</strong> <span class="badge ${b.status === 'completed' ? 'badge-green' : 'badge-amber'}">${b.status}</span></p>
  `;
  const joinCallBtn = document.getElementById('joinCallBtn');
  const callUrl = `/consult.html?id=${id}&role=doctor`;
  joinCallBtn.href = callUrl;
  // Opened as its own window rather than a same-tab navigation, so the dashboard (notes,
  // prescriptions, etc.) stays open and usable in the original tab for the whole call.
  joinCallBtn.onclick = (e) => {
    e.preventDefault();
    window.open(callUrl, 'gp4u-video-call', 'width=900,height=700');
  };

  const joinAudioCallBtn = document.getElementById('joinAudioCallBtn');
  const audioCallUrl = `/consult.html?id=${id}&role=doctor&mode=audio`;
  joinAudioCallBtn.href = audioCallUrl;
  joinAudioCallBtn.onclick = (e) => {
    e.preventDefault();
    window.open(audioCallUrl, 'gp4u-audio-call', 'width=480,height=640');
  };
  renderAttachments(data.attachments);
  renderPreviousConsultations(data.previousConsultations);
  renderMessages(data.messages);
  renderNotes(data.notes);
  renderPrescriptions(data.prescriptions);
  renderDocuments(data.documents);
  renderAllDocuments(data.prescriptions, data.documents);
  showChartTab('overview');
  document.getElementById('detailPanel').style.display = 'block';
  document.getElementById('detailPanel').scrollIntoView({ behavior: 'smooth' });
}

function renderAttachments(attachments) {
  document.getElementById('attachmentsList').innerHTML = attachments.length
    ? attachments.map(a => `<a class="btn btn-secondary" style="padding:6px 14px;font-size:0.85rem;margin:0 8px 8px 0;display:inline-block;" target="_blank" href="/api/doctor/attachments/${a.id}">${a.original_name}</a>`).join('')
    : '<p style="color:var(--ink-500);">None uploaded.</p>';
}

const DOC_TYPE_LABELS = { sick_cert: 'Sick Certificate', referral_ae: 'Referral Letter — A&E', referral_specialist: 'Referral Letter — Specialist' };

function renderPreviousConsultations(previous) {
  const container = document.getElementById('previousConsultationsList');
  if (!previous.length) {
    container.innerHTML = '<p style="color:var(--ink-500);">No previous consultations for this patient.</p>';
    return;
  }
  container.innerHTML = previous.map((p) => {
    const notesHtml = p.notes.length
      ? p.notes.map(n => `<div style="margin-bottom:6px;"><p style="white-space:pre-wrap; margin:0;">${n.note_text}</p><p style="color:var(--ink-500);font-size:0.78rem;margin:2px 0 0;">${n.doctor_name} • ${new Date(n.created_at).toLocaleString('en-IE')}</p></div>`).join('')
      : '<p style="color:var(--ink-500);font-size:0.85rem;">No notes recorded.</p>';
    const rxHtml = p.prescriptions.length
      ? p.prescriptions.map(rx => `<div style="margin-bottom:6px;"><strong>${rx.medication}</strong> — ${rx.dose}, qty ${rx.quantity} <a href="/print-rx.html?rxId=${rx.id}" target="_blank" style="font-size:0.8rem;">Print</a></div>`).join('')
      : '<p style="color:var(--ink-500);font-size:0.85rem;">None issued.</p>';
    const docsHtml = p.documents.length
      ? p.documents.map(d => `<div style="margin-bottom:6px;">${DOC_TYPE_LABELS[d.doc_type] || d.doc_type} — ${new Date(d.created_at).toLocaleDateString('en-IE')} <a href="/print-doc.html?docId=${d.id}" target="_blank" style="font-size:0.8rem;">Print</a></div>`).join('')
      : '<p style="color:var(--ink-500);font-size:0.85rem;">None issued.</p>';

    return `
      <div class="card" style="margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <strong>${new Date(p.slot_start).toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong>
            — ${p.service_type.replace('_', ' ')}
            <span class="badge ${p.status === 'completed' ? 'badge-green' : 'badge-amber'}">${p.status}</span>
          </div>
          <button class="btn btn-secondary" style="padding:6px 14px;font-size:0.85rem;" onclick="openBooking('${p.id}', currentListType)">Open This Visit</button>
        </div>
        <p style="margin:10px 0 4px;"><strong>Reason:</strong> ${p.reason || '—'}</p>
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
      </div>
    `;
  }).join('');
}

function renderMessages(messages) {
  const thread = document.getElementById('messageThread');
  thread.innerHTML = messages.length
    ? messages.map(m => `<div class="msg ${m.sender}">${m.body}<small>${m.sender === 'doctor' ? 'You' : 'Patient'} • ${new Date(m.created_at).toLocaleString('en-IE')}</small></div>`).join('')
    : '<p style="color:var(--ink-500);">No messages yet.</p>';
}

function renderNotes(notes) {
  const el = document.getElementById('notesList');
  el.innerHTML = notes.length
    ? notes.map(n => `<div class="card" style="margin-bottom:8px;"><p style="white-space:pre-wrap;">${n.note_text}</p><p style="color:var(--ink-500);font-size:0.8rem;">${n.doctor_name} • ${new Date(n.created_at).toLocaleString('en-IE')}</p></div>`).join('')
    : '<p style="color:var(--ink-500);">No notes yet.</p>';
}

async function saveNote() {
  const input = document.getElementById('noteInput');
  if (!input.value.trim()) return;
  await fetch(`/api/doctor/bookings/${currentBookingId}/notes`, {
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
        <strong>${p.medication}</strong> — ${p.dose}, ${p.frequency}, ${p.duration}, qty ${p.quantity}<br>${p.instructions}
        <p style="color:var(--ink-500);font-size:0.8rem;">Issued ${new Date(p.issued_at).toLocaleString('en-IE')}${p.sent_to_email ? ` • Sent to ${p.sent_to_email}` : ''}</p>
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
  const res = await fetch(`/api/doctor/prescriptions/${rxId}/send`, {
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
    ? '<h4>Issued sick certs</h4>' + sick.map(docCard).join('') : '';
  document.getElementById('existingDocs_referral').innerHTML = referrals.length
    ? '<h4>Issued referral letters</h4>' + referrals.map(docCard).join('') : '';
}

function renderAllDocuments(prescriptions, documents) {
  const rxCards = prescriptions.map(p => `
    <div class="card" style="margin-bottom:8px;">
      <p><strong>Prescription</strong> — ${p.medication} (${p.dose})</p>
      <p style="color:var(--ink-500);font-size:0.8rem;">Issued ${new Date(p.issued_at).toLocaleString('en-IE')}${p.sent_to_email ? ` • Sent to ${p.sent_to_email}` : ''}</p>
      <a class="btn btn-secondary" style="padding:6px 14px;font-size:0.85rem;" target="_blank" href="/print-rx.html?rxId=${p.id}">Print</a>
    </div>
  `);
  const docCards = documents.map(d => `
    <div class="card" style="margin-bottom:8px;">
      <p><strong>${DOC_TYPE_LABELS[d.doc_type] || d.doc_type}</strong></p>
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
  const sendButton = isSickCert
    ? `<button class="btn btn-secondary" style="padding:6px 14px;font-size:0.85rem;" onclick="sendSickCertToPatient(${d.id})">Send to Patient</button>`
    : `<button class="btn btn-secondary" style="padding:6px 14px;font-size:0.85rem;" onclick="sendDocument(${d.id})">Send by Email</button>`;
  return `
    <div class="card" style="margin-bottom:8px;">
      <p style="font-size:0.85rem; color:var(--ink-700);">${Object.entries(fields).map(([k, v]) => `<strong>${k}:</strong> ${v}`).join('<br>')}</p>
      <p style="color:var(--ink-500);font-size:0.8rem;">Created ${new Date(d.created_at).toLocaleString('en-IE')}${d.sent_to_email ? ` • Sent to ${d.sent_to_email}` : ''}</p>
      <div style="display:flex; gap:10px;">
        <a class="btn btn-secondary" style="padding:6px 14px;font-size:0.85rem;" target="_blank" href="/print-doc.html?docId=${d.id}">Print</a>
        ${sendButton}
      </div>
    </div>
  `;
}

async function sendSickCertToPatient(docId) {
  const res = await fetch(`/api/doctor/documents/${docId}/send`, {
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
  const res = await fetch(`/api/doctor/documents/${docId}/send`, {
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
  const res = await fetch('/api/doctor/medications');
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
  if (!medication || !dose || !frequency || !duration || !quantity || !instructions) {
    alert('Please fill in all prescription fields.');
    return;
  }
  await fetch(`/api/doctor/bookings/${currentBookingId}/prescriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ medication, dose, frequency, duration, quantity, instructions }),
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
  await fetch(`/api/doctor/bookings/${currentBookingId}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docType, fields }),
  });
  openBooking(currentBookingId);
}

function collectSickCertAndIssue() {
  const fields = {
    dateFrom: document.getElementById('scFrom').value,
    dateTo: document.getElementById('scTo').value,
    diagnosis: document.getElementById('scDiagnosis').value || 'Not specified',
    fitForWork: document.getElementById('scFitness').value,
  };
  if (!fields.dateFrom || !fields.dateTo) { alert('Please set both dates.'); return; }
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
  await fetch(`/api/doctor/bookings/${currentBookingId}/complete`, { method: 'POST' });
  if (activeTab === 'schedule') loadSchedule();
  if (activeTab === 'recent') loadRecent();
  openBooking(currentBookingId);
}

async function sendDoctorMessage() {
  const input = document.getElementById('doctorMessageInput');
  if (!input.value.trim()) return;
  await fetch(`/api/doctor/bookings/${currentBookingId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: input.value }),
  });
  input.value = '';
  openBooking(currentBookingId);
}

checkSession();
