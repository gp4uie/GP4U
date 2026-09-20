// New-patient registration (new-patients.html): a five-step form that posts to /api/register-patient.
// Steps: 1 About you · 2 Health information · 3 Next of kin · 4 Family members · 5 Review & submit.
// The data sent to the server is exactly what the original single-page form sent.
(function () {
  const form = document.getElementById('registerForm');
  if (!form) return;

  const TOTAL = 5;
  const NAMES = ['About you', 'Health information', 'Next of kin', 'Family members', 'Review & submit'];
  const MAX_FAMILY = 8;
  const steps = [...form.querySelectorAll('.reg-step')];
  const rowsEl = document.getElementById('familyRows');
  const addBtn = document.getElementById('addFamilyBtn');
  const errorEl = document.getElementById('registerError');
  const nextBtn = document.getElementById('regNext');
  const backBtn = document.getElementById('regBack');
  const submitBtn = document.getElementById('registerSubmit');
  const val = (id) => document.getElementById(id).value.trim();
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let current = 1;

  // ---------------------------------------------------------------- family rows
  function addFamilyRow() {
    if (rowsEl.children.length >= MAX_FAMILY) return;
    const n = rowsEl.children.length + 1;
    const row = document.createElement('div');
    row.className = 'card';
    row.style.cssText = 'padding:16px;margin-bottom:12px;';
    row.innerHTML = `
      <p style="margin:0 0 10px;font-weight:700;color:var(--navy);">Family member ${n}</p>
      <div class="form-grid">
        <div class="form-row"><label>Full name</label><input class="fm-name" maxlength="255" autocomplete="off"></div>
        <div class="form-row"><label>Date of birth</label><input class="fm-dob" type="date" min="1900-01-01"></div>
        <div class="form-row"><label>Relationship to you</label><input class="fm-rel" maxlength="64" placeholder="e.g. son, partner" autocomplete="off"></div>
        <div class="form-row" style="align-self:end;"><button type="button" class="btn btn-secondary fm-remove">Remove</button></div>
      </div>`;
    // give every label a real link to its input (screen readers), unique per row
    row.querySelectorAll('.form-row').forEach((fr, i) => {
      const lab = fr.querySelector('label'); const inp = fr.querySelector('input');
      if (lab && inp) { inp.id = `fm-${n}-${i}-${Date.now() % 100000}`; lab.setAttribute('for', inp.id); }
    });
    row.querySelector('.fm-remove').addEventListener('click', () => {
      row.remove();
      addBtn.hidden = false;
      [...rowsEl.children].forEach((r, i) => { const p = r.querySelector('p'); if (p) p.textContent = `Family member ${i + 1}`; });
    });
    rowsEl.appendChild(row);
    if (rowsEl.children.length >= MAX_FAMILY) addBtn.hidden = true;
    row.querySelector('.fm-name').focus();
  }
  addBtn.addEventListener('click', addFamilyRow);

  const familyMembers = () => [...rowsEl.children].map((row) => ({
    name: row.querySelector('.fm-name').value.trim(),
    dob: row.querySelector('.fm-dob').value,
    relationship: row.querySelector('.fm-rel').value.trim(),
  }));

  // ---------------------------------------------------------------- validation (same rules the server applies)
  function validateStep(n) {
    if (n === 1) {
      if (!val('fullName') || !document.getElementById('dob').value || !val('phone') || !val('email') || !val('address')) {
        return 'Please fill in all required fields (marked with *).';
      }
      if (!EMAIL_RE.test(val('email'))) return 'Please enter a valid email address.';
    }
    if (n === 4) {
      for (const m of familyMembers()) {
        const any = m.name || m.dob || m.relationship;
        if (any && (!m.name || !m.dob)) return 'Each family member needs a name and a date of birth — or remove that row.';
      }
    }
    if (n === 5 && !document.getElementById('consent').checked) {
      return 'Please tick the box to confirm your details and agree to the Privacy Notice.';
    }
    return '';
  }

  function showError(msg) {
    errorEl.textContent = msg;
    if (msg) errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---------------------------------------------------------------- step display + progress
  function buildReview() {
    const dl = document.getElementById('reviewList');
    dl.replaceChildren();
    const fam = familyMembers().filter((m) => m.name);
    const rows = [
      ['Name', val('fullName'), 1],
      ['Date of birth', document.getElementById('dob').value, 1],
      ['Phone', val('phone'), 1],
      ['Email', val('email'), 1],
      ['Address', [val('address'), val('eircode')].filter(Boolean).join(', '), 1],
      ['Long-term conditions', val('knownConditions') || 'None given', 2],
      ['Current medicines', val('currentMedications') || 'None given', 2],
      ['Allergies', val('allergies') || 'None given', 2],
      ['Next of kin', [val('nokName'), val('nokRelationship'), val('nokPhone')].filter(Boolean).join(' · ') || 'None given', 3],
      ['Family members', fam.length ? fam.map((m) => m.name).join(', ') : 'None added', 4],
    ];
    rows.forEach(([label, value, step]) => {
      const wrap = document.createElement('div'); wrap.className = 'rv';
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = value;
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn btn-tertiary review-edit'; btn.textContent = 'Change';
      btn.setAttribute('aria-label', `Change ${label.toLowerCase()}`);
      btn.addEventListener('click', () => { showError(''); show(step, true); });
      const right = document.createElement('div'); right.style.cssText = 'display:flex;gap:12px;align-items:center;justify-content:flex-end;flex-wrap:wrap;';
      right.append(dd, btn);
      wrap.append(dt, right);
      dl.appendChild(wrap);
    });
  }

  function show(n, focus) {
    current = n;
    steps.forEach((s) => { s.hidden = Number(s.dataset.step) !== n; });
    document.getElementById('rpStep').textContent = `Step ${n} of ${TOTAL}`;
    document.getElementById('rpName').textContent = NAMES[n - 1];
    const bar = document.getElementById('rpBar');
    bar.setAttribute('aria-valuenow', String(n));
    bar.firstElementChild.style.width = `${(n / TOTAL) * 100}%`;
    document.querySelectorAll('#rpDots li').forEach((li) => {
      const i = Number(li.dataset.n);
      li.classList.toggle('active', i === n); li.classList.toggle('done', i < n);
    });
    backBtn.hidden = n === 1;
    nextBtn.hidden = n === TOTAL;
    submitBtn.hidden = n !== TOTAL;
    if (n === TOTAL) buildReview();
    if (focus) {
      const t = steps[n - 1].querySelector('.reg-step-title');
      t.focus({ preventScroll: true });
      form.closest('.card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  nextBtn.addEventListener('click', () => {
    const msg = validateStep(current);
    showError(msg);
    if (!msg) show(current + 1, true);
  });
  backBtn.addEventListener('click', () => { showError(''); show(current - 1, true); });
  show(1, false);

  // ---------------------------------------------------------------- submit (step 5)
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (current < TOTAL) { nextBtn.click(); return; } // pressing Enter moves on instead of submitting early
    showError('');
    for (const n of [1, 4, 5]) {
      const msg = validateStep(n);
      if (msg) { showError(msg); if (n !== 5) show(n, true); return; }
    }

    const body = {
      fullName: val('fullName'), dob: document.getElementById('dob').value, sex: val('sex'),
      email: val('email'), phone: val('phone'), address: val('address'), eircode: val('eircode'),
      previousGp: val('previousGp'),
      knownConditions: val('knownConditions'), currentMedications: val('currentMedications'), allergies: val('allergies'),
      nextOfKinName: val('nokName'), nextOfKinRelationship: val('nokRelationship'), nextOfKinPhone: val('nokPhone'),
      familyMembers: familyMembers(), notes: val('notes'),
      consent: document.getElementById('consent').checked,
    };

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
      // Server messages are already patient-friendly; anything else (offline, timeout) gets a plain one.
      showError(err instanceof TypeError ? "We couldn't reach our system. Please check your internet connection and try again." : err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit registration';
    }
  });
})();
