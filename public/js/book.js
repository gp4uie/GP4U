let SERVICES = {};
let selectedService = null;
let selectedSlot = null;
let intakeData = {};
let selectedRxCategory = null;

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

// The 14 condition-specific prescription services (see questionnaires.js) are not shown as their
// own tiles here — they live behind the "Repeat Prescription" tile's category picker below, so
// this step doesn't turn into a wall of 22 flat tiles.
function isRxConditionKey(key) {
  return typeof PRESCRIPTION_SERVICE_KEYS !== 'undefined' && PRESCRIPTION_SERVICE_KEYS.includes(key);
}

// Cycled across tiles purely for visual variety — all four stay inside the existing brand
// palette (teal / blue / green), matching the same cycling done on the homepage (index.html).
const ICON_COLORS = [
  { stroke: '#0f6e6e', cls: 'icon-teal' },
  { stroke: '#1d4ed8', cls: 'icon-blue' },
  { stroke: '#128080', cls: 'icon-bright' },
  { stroke: '#2e9e6b', cls: 'icon-green' },
];

function renderServiceChoices() {
  selectedRxCategory = null;
  document.getElementById('step1Nav').style.display = 'none';
  document.getElementById('step1Heading').style.display = 'none';
  document.getElementById('step1SubText').style.display = 'none';
  const grid = document.getElementById('serviceChoices');
  grid.innerHTML = Object.entries(SERVICES)
    .filter(([key]) => !isRxConditionKey(key))
    .map(([key, s], i) => {
      const isRepeatRx = key === 'repeat_rx';
      const color = ICON_COLORS[i % ICON_COLORS.length];
      const iconSvg = (SERVICE_ICONS[key] || SERVICE_ICONS.general).replace(/#0f6e6e/g, color.stroke);
      return `
    <div class="card service-card" style="cursor:pointer;" onclick="${isRepeatRx ? 'showRxCategories()' : `chooseService('${key}')`}">
      <div class="service-icon ${color.cls}">${iconSvg}</div>
      <h3>${s.label}</h3>
      <div class="service-price">€${(s.priceCents / 100).toFixed(2)}</div>
      <p style="color:var(--ink-500);font-size:0.85rem;">${s.durationMins} min appointment</p>
    </div>
  `;
    }).join('');
}

// Inline "Repeat Prescription" picker: category tiles, then condition tiles within a category —
// swapped into the same #serviceChoices grid so there's no page reload, matching the rest of the
// wizard. Falls through to the generic repeat_rx flow for anything not in the 14-condition list.
function showRxCategories() {
  selectedRxCategory = null;
  document.getElementById('step1Nav').style.display = 'block';
  const heading = document.getElementById('step1Heading');
  heading.style.display = 'block';
  heading.textContent = 'Repeat Prescription — choose a category';
  const sub = document.getElementById('step1SubText');
  sub.style.display = 'block';
  sub.textContent = "Pick the category that best matches what you're renewing.";
  const grid = document.getElementById('serviceChoices');
  grid.innerHTML = Object.keys(CATEGORIES).map((category) => `
    <div class="card service-card" style="cursor:pointer;" data-category="${category}">
      <h3>${category}</h3>
      <p style="color:var(--ink-500);font-size:0.85rem;">${CATEGORIES[category].filter((k) => SERVICES[k]).length} conditions</p>
    </div>
  `).join('');
  // data-category attributes (not inline onclick strings) so category names containing an
  // apostrophe (e.g. "Women's Health") can't break out of an inline onclick="...('...')" handler.
  grid.querySelectorAll('[data-category]').forEach((el) => {
    el.addEventListener('click', () => showRxConditions(el.dataset.category));
  });
}

function showRxConditions(category) {
  selectedRxCategory = category;
  document.getElementById('step1Heading').textContent = category;
  document.getElementById('step1SubText').textContent = 'Choose the condition your prescription is for.';
  const keys = (CATEGORIES[category] || []).filter((k) => SERVICES[k]);
  const grid = document.getElementById('serviceChoices');
  grid.innerHTML = keys.map((key) => {
    const s = SERVICES[key];
    return `
      <div class="card service-card" style="cursor:pointer;" onclick="chooseService('${key}')">
        <h3>${s.label}</h3>
        <div class="service-price">€${(s.priceCents / 100).toFixed(2)}</div>
        <p style="color:var(--ink-500);font-size:0.85rem;">${SERVICE_TAGLINES[key] || ''}</p>
      </div>
    `;
  }).join('') + `
    <div class="card service-card" style="cursor:pointer; display:flex; align-items:center; justify-content:center; text-align:center;" onclick="chooseService('repeat_rx')">
      <p style="color:var(--ink-500);font-size:0.9rem; margin:0;">Don't see your medication here?<br><strong>Request a general repeat prescription →</strong></p>
    </div>
  `;
}

function step1Back() {
  if (selectedRxCategory) {
    showRxCategories();
  } else {
    renderServiceChoices();
  }
}

// Answers collected so far for the safety questionnaire currently on screen — reset whenever
// renderConditionQuestions() starts a fresh questionnaire (i.e. the patient picked a service).
let conditionAnswers = {};

// Renders the condition-specific safety questions (see questionnaires.js) one at a time: only
// the already-answered questions plus the next unanswered one are in the DOM. An acceptable
// answer reveals the next question; a red-flag answer stops there and shows the video-consultation
// offer immediately below it, instead of the patient filling in the whole questionnaire first.
function renderConditionQuestions(key) {
  conditionAnswers = {};
  renderConditionQuestionsStep(key);
}

function renderConditionQuestionsStep(key) {
  const container = document.getElementById('conditionQuestionsContainer');
  const config = typeof QUESTIONNAIRES !== 'undefined' ? QUESTIONNAIRES[key] : null;
  if (!config || !config.redFlags.length) {
    container.innerHTML = '';
    return;
  }
  const redFlags = config.redFlags;

  // Walk the questions in order: stop at the first one that's either unanswered (so it can be
  // shown next) or triggered (so nothing further is revealed).
  let triggeredIndex = -1;
  let stopIndex = redFlags.length;
  for (let i = 0; i < redFlags.length; i++) {
    const val = conditionAnswers[redFlags[i].id];
    if (!val) { stopIndex = i; break; }
    const isTriggered = (redFlags[i].triggerOn === 'no') ? val === 'no' : val === 'yes';
    if (isTriggered) { triggeredIndex = i; stopIndex = i; break; }
  }
  const allCleared = triggeredIndex === -1 && stopIndex === redFlags.length;
  const showCount = triggeredIndex !== -1 ? triggeredIndex + 1 : Math.min(stopIndex + 1, redFlags.length);
  const visible = redFlags.slice(0, showCount);

  container.innerHTML = `
    <div class="notice">
      <strong>A few quick safety questions</strong>
      These help make sure a written prescription request is safe for you. If any answer needs a
      closer look, we'll offer you a video consultation instead of turning you away.
    </div>
    ${visible.map((q) => `
      <div class="form-row">
        <label>${q.question} <span style="color:#c0392b;">*</span></label>
        <select required name="cq_${q.id}" class="cq-input" data-qid="${q.id}">
          <option value="">Please choose…</option>
          <option value="no" ${conditionAnswers[q.id] === 'no' ? 'selected' : ''}>No</option>
          <option value="yes" ${conditionAnswers[q.id] === 'yes' ? 'selected' : ''}>Yes</option>
        </select>
      </div>
    `).join('')}
    ${allCleared ? (config.info || []).map((f) => `
      <div class="form-row">
        <label>${f.label} ${f.required ? '<span style="color:#c0392b;">*</span>' : ''}</label>
        <input ${f.required ? 'required' : ''} name="info_${f.id}" class="info-input">
      </div>
    `).join('') : ''}
  `;

  container.querySelectorAll('.cq-input').forEach((el) => {
    el.addEventListener('change', () => {
      conditionAnswers[el.dataset.qid] = el.value;
      renderConditionQuestionsStep(key);
    });
  });

  if (triggeredIndex !== -1) {
    showRedFlagPanel(evaluateRedFlags(key, conditionAnswers));
  } else {
    dismissRedFlagPanel();
  }
}

// Formats this service's safety-question and info-field answers into a readable block for the
// doctor (stored server-side in bookings.safety_answers, alongside the repeat_rx safety check).
function buildConditionAnswersSummary(key, formData) {
  const config = typeof QUESTIONNAIRES !== 'undefined' ? QUESTIONNAIRES[key] : null;
  if (!config) return '';
  const lines = [];
  (config.redFlags || []).forEach((q) => {
    const val = formData.get(`cq_${q.id}`);
    if (val) lines.push(`${q.question} — ${val === 'yes' ? 'Yes' : 'No'}`);
  });
  (config.info || []).forEach((f) => {
    const val = formData.get(`info_${f.id}`);
    if (val) lines.push(`${f.label} — ${val}`);
  });
  return lines.join('\n');
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
  const isRxService = isRepeatRx || isRxConditionKey(key);
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

  document.getElementById('reasonLabelText').textContent = isRxService
    ? 'What is the current medication you have been prescribed?'
    : 'What would you like to discuss with the GP?';
  document.getElementById('reasonInput').placeholder = isRxService
    ? 'e.g. Rigevidon 30/150mcg, one tablet daily — include the name, strength, and how you take it'
    : 'Please describe your symptoms or the reason for this consultation';

  document.getElementById('symptomsDurationRow').style.display = isRxService ? 'none' : 'block';

  document.getElementById('photoInputLabel').textContent = isRxService
    ? 'Attach previous prescriptions (recommended)'
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
  intakeData.conditionAnswers = buildConditionAnswersSummary(selectedService, formData);

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
