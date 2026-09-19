// New-patient registration form (new-patients.html). Posts to /api/register-patient.
(function () {
  const form = document.getElementById('registerForm');
  if (!form) return;
  const MAX_FAMILY = 8;
  const rowsEl = document.getElementById('familyRows');
  const addBtn = document.getElementById('addFamilyBtn');
  const errorEl = document.getElementById('registerError');
  const submitBtn = document.getElementById('registerSubmit');
  const val = (id) => document.getElementById(id).value.trim();

  function addFamilyRow() {
    if (rowsEl.children.length >= MAX_FAMILY) return;
    const row = document.createElement('div');
    row.className = 'card';
    row.style.cssText = 'padding:16px;margin-bottom:12px;';
    row.innerHTML = `
      <div class="form-grid">
        <div class="form-row"><label>Full name</label><input class="fm-name" maxlength="255"></div>
        <div class="form-row"><label>Date of birth</label><input class="fm-dob" type="date" min="1900-01-01"></div>
        <div class="form-row"><label>Relationship to you</label><input class="fm-rel" maxlength="64" placeholder="e.g. son, partner"></div>
        <div class="form-row" style="align-self:end;"><button type="button" class="btn btn-secondary fm-remove">Remove</button></div>
      </div>`;
    row.querySelector('.fm-remove').addEventListener('click', () => {
      row.remove();
      addBtn.hidden = false;
    });
    rowsEl.appendChild(row);
    if (rowsEl.children.length >= MAX_FAMILY) addBtn.hidden = true;
  }
  addBtn.addEventListener('click', addFamilyRow);

  function showError(msg) {
    errorEl.textContent = msg;
    if (msg) errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');

    const familyMembers = [...rowsEl.children].map((row) => ({
      name: row.querySelector('.fm-name').value.trim(),
      dob: row.querySelector('.fm-dob').value,
      relationship: row.querySelector('.fm-rel').value.trim(),
    }));

    const body = {
      fullName: val('fullName'), dob: document.getElementById('dob').value, sex: val('sex'),
      email: val('email'), phone: val('phone'), address: val('address'), eircode: val('eircode'),
      medicalCard: val('medicalCard'), previousGp: val('previousGp'),
      knownConditions: val('knownConditions'), currentMedications: val('currentMedications'), allergies: val('allergies'),
      nextOfKinName: val('nokName'), nextOfKinRelationship: val('nokRelationship'), nextOfKinPhone: val('nokPhone'),
      familyMembers, notes: val('notes'),
      consent: document.getElementById('consent').checked,
    };

    // Same required-field checks as the server, so people get an instant message.
    if (!body.fullName || !body.dob || !body.email || !body.phone || !body.address) {
      return showError('Please fill in all required fields (marked with *).');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return showError('Please enter a valid email address.');
    if (!body.consent) return showError('Please tick the box to confirm your details and agree to the Privacy Notice.');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
    try {
      const res = await fetch('/api/register-patient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
      document.getElementById('registerRef').textContent = data.reference;
      document.getElementById('registerCard').hidden = true;
      const done = document.getElementById('registerDone');
      done.hidden = false;
      done.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      showError(err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit registration';
    }
  });
})();
