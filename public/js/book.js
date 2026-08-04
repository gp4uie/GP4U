let SERVICES = {};
let selectedService = null;
let selectedSlot = null;
let intakeData = {};

const extraFieldLabels = {
  travel: 'Destination(s) and travel date(s)',
  repeat_rx: 'Name(s) of the medication you need repeated',
  sick_cert: "Employer name (if the cert is for work)",
};

function qs(name) {
  return new URLSearchParams(location.search).get(name);
}

function goToStep(n) {
  for (let i = 1; i <= 4; i++) {
    document.getElementById('step' + i).style.display = i === n ? 'block' : 'none';
    document.getElementById('tab' + i).classList.toggle('active', i === n);
  }
  if (n === 3) loadSlots();
  if (n === 4) renderReview();
}

const SERVICE_ICONS = {
  general: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 4v16M4 12h16" stroke="#0f6e6e" stroke-width="2.5" stroke-linecap="round"/></svg>',
  video: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="13" height="12" rx="3" stroke="#0f6e6e" stroke-width="2"/><path d="M16 10l5-3v10l-5-3z" fill="#0f6e6e"/></svg>',
  travel: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M21 3L3 10l7 3 3 7 8-17z" stroke="#0f6e6e" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  womens: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 20s-7-4.5-9.5-9C1 8 2.5 4 6.5 4c2 0 3.5 1.2 4.5 2.8C12 5.2 13.5 4 15.5 4c4 0 5.5 4 4 7-2.5 4.5-7.5 9-7.5 9z" stroke="#0f6e6e" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  mens: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="15" r="6" stroke="#0f6e6e" stroke-width="2"/><path d="M13.5 10.5L20 4M20 4h-5M20 4v5" stroke="#0f6e6e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  repeat_rx: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" stroke="#0f6e6e" stroke-width="2" stroke-linecap="round"/><path d="M18 3v4h-4M6 21v-4h4" stroke="#0f6e6e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  sick_cert: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="5" y="3" width="14" height="18" rx="2" stroke="#0f6e6e" stroke-width="2"/><path d="M8.5 12.5l2.3 2.3L15.5 10" stroke="#0f6e6e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  weight_loss: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 6l7 7 3-3 6 6M14 16h6v-6" stroke="#0f6e6e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function renderServiceChoices() {
  const grid = document.getElementById('serviceChoices');
  grid.innerHTML = Object.entries(SERVICES).map(([key, s]) => `
    <div class="card service-card" style="cursor:pointer;" onclick="chooseService('${key}')">
      <div class="service-icon">${SERVICE_ICONS[key] || SERVICE_ICONS.general}</div>
      <h3>${s.label}</h3>
      <div class="service-price">€${(s.priceCents / 100).toFixed(2)}</div>
      <p style="color:var(--ink-500);font-size:0.85rem;">${s.durationMins} min appointment</p>
    </div>
  `).join('');
}

// Renders the condition-specific safety questions (see questionnaires.js) above the generic
// intake fields, if the selected service has any. Re-run every time the service changes so
// switching services (including the routed "switch to video" path) clears any stale questions.
function renderConditionQuestions(key) {
  const container = document.getElementById('conditionQuestionsContainer');
  const config = typeof QUESTIONNAIRES !== 'undefined' ? QUESTIONNAIRES[key] : null;
  if (!config || !config.redFlags.length) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `
    <div class="notice">
      <strong>A few quick safety questions</strong>
      These help make sure a written prescription request is safe for you. If any answer needs a
      closer look, we'll offer you a video consultation instead of turning you away.
    </div>
    ${config.redFlags.map((q) => `
      <div class="form-row">
        <label>${q.question} <span style="color:#c0392b;">*</span></label>
        <select required name="cq_${q.id}" class="cq-input">
          <option value="">Please choose…</option>
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
      </div>
    `).join('')}
  `;
}

function chooseService(key) {
  selectedService = key;
  renderConditionQuestions(key);
  document.getElementById('redFlagPanel').style.display = 'none';
  document.getElementById('step2ContinueBtn').style.display = 'inline-block';
  const row = document.getElementById('extraDetailsRow');
  if (extraFieldLabels[key]) {
    row.style.display = 'block';
    document.getElementById('extraDetailsLabel').textContent = extraFieldLabels[key];
  } else {
    row.style.display = 'none';
  }

  const isRepeatRx = key === 'repeat_rx';
  const safetyRow = document.getElementById('repeatRxSafetyRow');
  const asPrescribedInput = document.getElementById('rxAsPrescribedInput');
  const healthChangesInput = document.getElementById('rxHealthChangesInput');
  safetyRow.style.display = isRepeatRx ? 'block' : 'none';
  asPrescribedInput.required = isRepeatRx;
  healthChangesInput.required = isRepeatRx;
  if (!isRepeatRx) {
    asPrescribedInput.value = '';
    healthChangesInput.value = '';
  }

  document.getElementById('photoInputLabel').textContent = isRepeatRx
    ? 'Attach a photo of your previous prescription (recommended)'
    : 'Attach a photo (optional — e.g. a rash or a letter)';

  goToStep(2);
}

document.getElementById('intakeForm').addEventListener('submit', (e) => e.preventDefault());

// Pulls this service's safety-question answers out of the submitted form data (cq_<id> ->
// answers[id]) so they can be checked against questionnaires.js's red-flag rules.
function collectConditionAnswers(formData) {
  const answers = {};
  for (const [name, value] of formData.entries()) {
    if (name.startsWith('cq_')) answers[name.slice(3)] = value;
  }
  return answers;
}

function goToStep3FromForm() {
  const form = document.getElementById('intakeForm');
  if (!form.reportValidity()) return;
  const formData = new FormData(form);
  intakeData = Object.fromEntries(formData.entries());

  const result = evaluateRedFlags(selectedService, collectConditionAnswers(formData));
  if (result.triggered) {
    showRedFlagPanel(result);
    return;
  }
  goToStep(3);
}

function showRedFlagPanel(result) {
  document.getElementById('step2ContinueBtn').style.display = 'none';
  const panel = document.getElementById('redFlagPanel');
  panel.style.display = 'block';
  if (result.urgent) {
    document.getElementById('redFlagTitle').textContent = 'This needs urgent attention';
    document.getElementById('redFlagText').innerHTML =
      'Based on your answers, this is not suitable for a routine online request. ' +
      '<strong>If you have sudden or severe symptoms, call 112/999 or go to your nearest Emergency Department now.</strong> ' +
      'If it is not an emergency but you still need to speak to a GP without delay, you can continue below with our soonest available video consultation.';
  } else {
    document.getElementById('redFlagTitle').textContent = 'This needs a video consultation instead';
    document.getElementById('redFlagText').textContent =
      "Based on your answers, a written prescription request isn't suitable here — your GP needs to " +
      "assess you over a live video call first. You won't need to re-enter your details below.";
  }
  document.getElementById('redFlagBulletList').innerHTML = result.triggeredBullets.map((b) => `<li>${b}</li>`).join('');
  panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function dismissRedFlagPanel() {
  document.getElementById('redFlagPanel').style.display = 'none';
  document.getElementById('step2ContinueBtn').style.display = 'inline-block';
}

// Carries the patient over to the Video Consultation service after a safety-question red flag,
// without making them re-enter anything — the generic fields (name/dob/reason/etc.) stay filled
// in on the same form; only the reason field gets a short note prepended so the doctor knows why
// this came in as a video call instead of a routine written request.
function switchToVideoConsultation() {
  const previousLabel = (SERVICES[selectedService] && SERVICES[selectedService].label) || selectedService;
  const form = document.getElementById('intakeForm');
  const formData = new FormData(form);
  const result = evaluateRedFlags(selectedService, collectConditionAnswers(formData));
  const reasonField = form.reason;
  const note = `[Routed to video consultation — originally requested: ${previousLabel}. Safety screening flagged: ${result.triggeredBullets.join('; ')}.]\n\n`;
  if (!reasonField.value.startsWith('[Routed to video consultation')) {
    reasonField.value = note + reasonField.value;
  }
  dismissRedFlagPanel();
  chooseService('video');
}

async function loadSlots() {
  const container = document.getElementById('slotContainer');
  container.innerHTML = '<p>Loading available times…</p>';
  const res = await fetch('/api/slots?service=' + selectedService);
  const slots = await res.json();
  if (!slots.length) {
    container.innerHTML = '<p>No slots available right now — please check back soon.</p>';
    return;
  }
  const byDay = {};
  slots.forEach((s) => {
    const d = new Date(s.start);
    const dayKey = d.toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' });
    byDay[dayKey] = byDay[dayKey] || [];
    byDay[dayKey].push(s);
  });
  container.innerHTML = Object.entries(byDay).map(([day, daySlots]) => `
    <div class="slot-day-label" style="grid-column:1/-1;">${day}</div>
    ${daySlots.map((s) => {
      const t = new Date(s.start).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
      return `<div class="slot-btn" data-start="${s.start}" data-end="${s.end}" onclick="pickSlot(this)">${t}</div>`;
    }).join('')}
  `).join('');
}

function pickSlot(el) {
  document.querySelectorAll('.slot-btn').forEach((b) => b.classList.remove('selected'));
  el.classList.add('selected');
  selectedSlot = { start: el.dataset.start, end: el.dataset.end };
  goToStep(4);
}

function renderReview() {
  const s = SERVICES[selectedService];
  const start = new Date(selectedSlot.start);
  document.getElementById('reviewCard').innerHTML = `
    <h3>${s.label}</h3>
    <p><strong>When:</strong> ${start.toLocaleString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
    <p><strong>Patient:</strong> ${intakeData.patientName}</p>
    <p><strong>Reason:</strong> ${intakeData.reason}</p>
    <p style="font-size:1.3rem;"><strong>Total: €${(s.priceCents / 100).toFixed(2)}</strong></p>
  `;
}

async function submitBooking() {
  const payBtn = document.getElementById('payBtn');
  const errorEl = document.getElementById('bookingError');
  errorEl.textContent = '';
  payBtn.disabled = true;
  payBtn.textContent = 'Please wait…';
  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceType: selectedService,
        ...intakeData,
        slotStart: selectedSlot.start,
        slotEnd: selectedSlot.end,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong');

    const photoInput = document.getElementById('photoInput');
    if (photoInput.files.length) {
      const formData = new FormData();
      Array.from(photoInput.files).forEach((f) => formData.append('photos', f));
      await fetch(`/api/bookings/${data.bookingId}/attachments?token=${data.patientToken}`, {
        method: 'POST',
        body: formData,
      });
    }

    window.location.href = data.checkoutUrl;
  } catch (err) {
    errorEl.textContent = err.message;
    payBtn.disabled = false;
    payBtn.textContent = 'Continue to Payment';
  }
}

if (qs('cancelled')) document.getElementById('cancelledNotice').style.display = 'block';

// If the patient is already logged in, the header should reflect that (not "Patient Login" as
// if they'd been logged out) and their known details should be pre-filled so they don't have to
// retype everything for a repeat booking.
fetch('/api/patient/me').then((r) => r.json()).then((me) => {
  if (!me.loggedIn) return;
  document.getElementById('patientLoginLink').style.display = 'none';
  document.getElementById('patientPortalLink').style.display = 'inline';
  const form = document.getElementById('intakeForm');
  if (me.name) form.patientName.value = me.name;
  if (me.dob) form.patientDob.value = me.dob;
  if (me.phone) form.patientPhone.value = me.phone;
  if (me.email) form.patientEmail.value = me.email;
  if (me.address) form.patientAddress.value = me.address;
});

fetch('/api/services').then((r) => r.json()).then((services) => {
  SERVICES = services;
  renderServiceChoices();
  const preselect = qs('service');
  if (preselect && SERVICES[preselect]) chooseService(preselect);
});
