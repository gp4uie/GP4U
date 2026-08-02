let activeAdminTab = 'doctors';
let scheduleEditorDoctorId = null;

async function checkAdminSession() {
  const res = await fetch('/api/admin/me');
  const data = await res.json();
  if (!data.loggedIn) {
    window.location.href = '/admin-login.html';
    return;
  }
  document.getElementById('whoami').textContent = `${data.adminName} — ${data.practiceName}`;
  loadDoctors();
}

document.getElementById('logoutLink').addEventListener('click', async (e) => {
  e.preventDefault();
  await fetch('/api/admin/logout', { method: 'POST' });
  window.location.href = '/admin-login.html';
});

function showAdminTab(tab) {
  activeAdminTab = tab;
  ['doctors', 'patients'].forEach((t) => {
    document.getElementById('tab_' + t).style.display = t === tab ? 'block' : 'none';
    document.getElementById('tabBtn_' + t).classList.toggle('active', t === tab);
  });
  if (tab === 'doctors') loadDoctors();
  if (tab === 'patients') loadPatients();
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
      <td><button class="btn btn-secondary" onclick="openScheduleEditor(${d.id}, '${d.name.replace(/'/g, "\\'")}')">Edit Schedule</button></td>
      <td><button class="btn btn-secondary" onclick="removeDoctor(${d.id})">Remove</button></td>
    </tr>
  `).join('') || '<tr><td colspan="5">No doctors yet.</td></tr>';
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
  if (!confirm('Remove this doctor? They will no longer be able to log in.')) return;
  const res = await fetch('/api/admin/doctors/' + id, { method: 'DELETE' });
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
      <strong>${new Date(c.slot_start).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })} — ${c.service_type.replace('_', ' ')}</strong>
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

checkAdminSession();
