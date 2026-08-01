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
  audio: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="4" y="10" width="3" height="4" rx="1.5" fill="#0f6e6e"/><rect x="10.5" y="6" width="3" height="12" rx="1.5" fill="#0f6e6e"/><rect x="17" y="9" width="3" height="6" rx="1.5" fill="#0f6e6e"/></svg>',
  video: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="13" height="12" rx="3" stroke="#0f6e6e" stroke-width="2"/><path d="M16 10l5-3v10l-5-3z" fill="#0f6e6e"/></svg>',
  travel: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M21 3L3 10l7 3 3 7 8-17z" stroke="#0f6e6e" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  womens: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 20s-7-4.5-9.5-9C1 8 2.5 4 6.5 4c2 0 3.5 1.2 4.5 2.8C12 5.2 13.5 4 15.5 4c4 0 5.5 4 4 7-2.5 4.5-7.5 9-7.5 9z" stroke="#0f6e6e" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  repeat_rx: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" stroke="#0f6e6e" stroke-width="2" stroke-linecap="round"/><path d="M18 3v4h-4M6 21v-4h4" stroke="#0f6e6e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  sick_cert: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="5" y="3" width="14" height="18" rx="2" stroke="#0f6e6e" stroke-width="2"/><path d="M8.5 12.5l2.3 2.3L15.5 10" stroke="#0f6e6e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
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

function chooseService(key) {
  selectedService = key;
  const row = document.getElementById('extraDetailsRow');
  if (extraFieldLabels[key]) {
    row.style.display = 'block';
    document.getElementById('extraDetailsLabel').textContent = extraFieldLabels[key];
  } else {
    row.style.display = 'none';
  }
  goToStep(2);
}

document.getElementById('intakeForm').addEventListener('submit', (e) => e.preventDefault());

function goToStep3FromForm() {
  const form = document.getElementById('intakeForm');
  if (!form.reportValidity()) return;
  intakeData = Object.fromEntries(new FormData(form).entries());
  goToStep(3);
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

fetch('/api/services').then((r) => r.json()).then((services) => {
  SERVICES = services;
  renderServiceChoices();
  const preselect = qs('service');
  if (preselect && SERVICES[preselect]) chooseService(preselect);
});
