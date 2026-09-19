// "Book in for walk-in" form (walk-in.html). Posts to /api/walk-in.
// The form is only usable while the clinic is open (hours come from clinic.js) — when we're
// closed it shows when we next open instead.
(function () {
  const form = document.getElementById('bookInForm');
  if (!form) return;
  const fields = document.getElementById('bookInFields');
  const closedBox = document.getElementById('bookInClosed');
  const closedText = document.getElementById('bookInClosedText');
  const errorEl = document.getElementById('bookInError');
  const submitBtn = document.getElementById('bookInSubmit');
  const val = (id) => document.getElementById(id).value.trim();
  let submitted = false;

  function applyOpenState() {
    if (submitted || typeof window.clinicStatus !== 'function') return;
    const s = window.clinicStatus();
    fields.disabled = !s.open;
    closedBox.hidden = s.open;
    // s.text looks like "Closed · opens tomorrow at 10am"
    const opens = s.text.replace('Closed · ', '');
    closedText.textContent = s.open ? '' : `${opens.charAt(0).toUpperCase()}${opens.slice(1)}. You can book in once we're open — or just come in during opening hours.`;
  }
  applyOpenState();
  setInterval(applyOpenState, 30 * 1000);

  function showError(msg) {
    errorEl.textContent = msg;
    if (msg) errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const body = {
      fullName: val('wiName'),
      dob: document.getElementById('wiDob').value,
      phone: val('wiPhone'),
      email: val('wiEmail'),
      reason: val('wiReason'),
      arrivalMinutes: Number(document.getElementById('wiArrival').value),
      notEmergency: document.getElementById('wiNotEmergency').checked,
      consent: document.getElementById('wiConsent').checked,
    };
    if (!body.fullName || !body.dob || !body.phone || !body.reason) {
      return showError('Please fill in all required fields (marked with *).');
    }
    if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return showError('Please enter a valid email address, or leave it blank.');
    }
    if (!body.notEmergency) return showError('Please confirm this is not an emergency. In an emergency call 112 or 999.');
    if (!body.consent) return showError('Please tick the box to agree to the Privacy Notice.');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Booking in…';
    try {
      const res = await fetch('/api/walk-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again, or just come in.');
      submitted = true;
      document.getElementById('bookInDoneName').textContent = body.fullName;
      document.getElementById('bookInRef').textContent = data.reference;
      document.getElementById('bookInCard').hidden = true;
      const done = document.getElementById('bookInDone');
      done.hidden = false;
      done.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      showError(err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Book in';
    }
  });
})();
