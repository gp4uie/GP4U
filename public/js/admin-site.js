// Admin "Website settings": edit clinic details, hours, closures, fees, page wording, photos, FAQs and the announcement bar.
// Talks to /api/admin/site*. Everything typed here is validated again on the server, and every change is logged and undoable.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const DEF = window.CLINIC_DEFAULTS || {};
  const DAYS = [[1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday'], [6, 'Saturday'], [0, 'Sunday']];
  const PANES = {
    details: ['Clinic details', 'The name, contact details and address shown across the website.'],
    hours: ['Opening hours & closures', 'Walk-in clinic hours, separate online GP times, and days the clinic is closed.'],
    fees: ['Fees & lead GP', 'Walk-in fees for the Fees page, and the lead GP shown on the About page.'],
    text: ['Page wording', 'Change the headings, sentences and button labels on the home page and page headers.'],
    photos: ['Photos', 'Replace the pictures shown on the home page and page headers.'],
    faq: ['FAQs', 'Edit the questions and answers on the FAQ page.'],
    banner: ['Announcement bar', 'A message across the top of every page, e.g. "Closed on Monday 3 August".'],
    history: ['Change history', 'Who changed what, and when. You can go back to an earlier version.'],
  };
  let DATA = null;
  let current = 'details';
  let faqState = null;

  // ---------------------------------------------------------------- helpers
  async function api(url, options) {
    const res = await fetch(url, options);
    if (res.status === 401) { showLogin(); throw new Error('signed-out'); }
    let data = {};
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }
  const send = (url, method, body) => api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  function ok(msg) { $('paneErr').textContent = ''; $('paneMsg').textContent = msg; window.scrollTo(0, 0); }
  function fail(e) { if (e && e.message === 'signed-out') return; $('paneMsg').textContent = ''; $('paneErr').textContent = e.message || String(e); window.scrollTo(0, 0); }
  function clearMsg() { $('paneMsg').textContent = ''; $('paneErr').textContent = ''; }
  function showLogin() { $('siteBox').style.display = 'none'; $('loginNotice').style.display = 'block'; }
  const eff = () => Object.assign({}, DEF, DATA.clinic || {});
  const stamp = (iso) => new Date(iso).toLocaleString('en-IE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  async function reload() { DATA = await api('/api/admin/site'); }

  const field = (id, label, value, o = {}) => `
    <div class="form-row"${o.wide ? ' style="grid-column:1/-1;"' : ''}>
      <label for="${id}">${label}</label>
      ${o.area ? `<textarea id="${id}" rows="${o.rows || 3}" maxlength="${o.max || 1500}">${esc(value)}</textarea>`
    : `<input id="${id}" type="${o.type || 'text'}" value="${esc(value)}" maxlength="${o.max || 200}"${o.placeholder ? ` placeholder="${esc(o.placeholder)}"` : ''}>`}
      ${o.hint ? `<small class="ed-hint">${o.hint}</small>` : ''}
    </div>`;
  const val = (id) => $(id).value.trim();
  // A pane container with no leftover event listeners from an earlier render
  function fresh(id) { const old = $(id); const el = old.cloneNode(false); old.replaceWith(el); return el; }

  // ---------------------------------------------------------------- navigation
  function showPane(name) {
    current = name;
    clearMsg();
    document.querySelectorAll('#siteNav [data-pane]').forEach((b) => b.classList.toggle('active', b.dataset.pane === name));
    Object.keys(PANES).forEach((p) => { $('pane_' + p).hidden = p !== name; });
    $('paneTitle').textContent = PANES[name][0];
    $('paneSub').textContent = PANES[name][1];
    window.scrollTo(0, 0);
    render(name);
  }
  function render(name) {
    ({ details: renderDetails, hours: renderHours, fees: renderFees, text: renderText, photos: renderPhotos, faq: renderFaq, banner: renderBanner, history: renderHistory })[name]();
  }
  document.querySelectorAll('#siteNav [data-pane]').forEach((b) => b.addEventListener('click', () => showPane(b.dataset.pane)));

  async function resetGroup(name, what) {
    if (!window.confirm(`Put ${what} back to the original? Your edits will be removed (you can still restore them from Change history).`)) return;
    try { await send('/api/admin/site/reset/' + name, 'POST'); await reload(); render(current); ok('Put back to the original.'); } catch (e) { fail(e); }
  }

  // ---------------------------------------------------------------- Clinic details
  function renderDetails() {
    const c = eff();
    $('pane_details').innerHTML = `
      <form class="card site-form" id="detailsForm" novalidate>
        <h2>Contact &amp; address</h2>
        <div class="form-grid">
          ${field('cName', 'Clinic name', c.name)}
          ${field('cTagline', 'Tagline', c.tagline)}
          ${field('cPhone', 'Phone', c.phone, { type: 'tel', max: 24, hint: 'Leave empty to hide the phone number everywhere.' })}
          ${field('cEmail', 'Contact email', c.email, { type: 'email' })}
          ${field('cStreet', 'Street address', c.streetAddress, { wide: true, hint: 'Leave empty to keep the address hidden ("Address coming soon"). Once you add it, the address, "Get directions" buttons and map appear on every page.' })}
          ${field('cTown', 'Town', c.town)}
          ${field('cCounty', 'County', c.county)}
          ${field('cEircode', 'Eircode', c.eircode, { max: 10 })}
        </div>
        <label class="check-line"><input type="checkbox" id="cMap"${c.showMap ? ' checked' : ''}> Show a map once the street address is filled in</label>
        <h2 style="margin-top:26px;">Company details</h2>
        <p class="ed-hint">Shown in the footer if you fill them in (Irish company law asks for these on a company's website).</p>
        <div class="form-grid">
          ${field('cCompany', 'Company name', c.companyName)}
          ${field('cCompanyNo', 'Company number (CRO)', c.companyNumber, { max: 30 })}
          ${field('cOffice', 'Registered office', c.registeredOffice, { wide: true })}
        </div>
        <div class="ed-actions"><button class="btn btn-primary btn-lg" type="submit">Save clinic details</button><button class="btn btn-secondary" type="button" id="detailsReset">Put back to the original</button></div>
      </form>`;
    $('detailsForm').addEventListener('submit', async (e) => {
      e.preventDefault(); clearMsg();
      try {
        await send('/api/admin/site/clinic', 'PUT', {
          name: val('cName'), tagline: val('cTagline'), phone: val('cPhone'), email: val('cEmail'), streetAddress: val('cStreet'), town: val('cTown'),
          county: val('cCounty'), eircode: val('cEircode'), showMap: $('cMap').checked, companyName: val('cCompany'), companyNumber: val('cCompanyNo'), registeredOffice: val('cOffice'),
        });
        await reload(); ok('Saved. The website now shows these details.');
      } catch (er) { fail(er); }
    });
    $('detailsReset').addEventListener('click', () => resetGroup('clinic', 'ALL clinic details, hours, fees and lead GP'));
  }

  // ---------------------------------------------------------------- Opening hours & closures
  function hoursTable(prefix, hours) {
    return `<table class="hours-edit"><tbody>${DAYS.map(([d, name]) => {
      const h = hours && hours[d];
      return `<tr><th scope="row">${name}</th>
        <td><label class="check-line"><input type="checkbox" data-${prefix}-open="${d}"${h ? ' checked' : ''}> Open</label></td>
        <td><input type="time" aria-label="${name} opens" data-${prefix}-from="${d}" value="${h ? h[0] : '10:00'}"></td>
        <td>to</td>
        <td><input type="time" aria-label="${name} closes" data-${prefix}-to="${d}" value="${h ? h[1] : '18:00'}"></td></tr>`;
    }).join('')}</tbody></table>`;
  }
  function readHours(prefix, label) {
    const out = {};
    for (const [d, name] of DAYS) {
      const open = document.querySelector(`[data-${prefix}-open="${d}"]`).checked;
      if (!open) { out[d] = null; continue; }
      const a = document.querySelector(`[data-${prefix}-from="${d}"]`).value; const b = document.querySelector(`[data-${prefix}-to="${d}"]`).value;
      if (!a || !b) throw new Error(`${label}: please set opening and closing times for ${name}`);
      if (a >= b) throw new Error(`${label}: ${name} must close after it opens`);
      out[d] = [a, b];
    }
    return out;
  }
  let closuresState = [];
  function renderClosures() {
    $('closuresBox').innerHTML = closuresState.length ? closuresState.map((c, i) => `
      <div class="closure-row">
        <input type="date" aria-label="Closed from" data-c="${i}" data-f="from" value="${esc(c.from)}">
        <span>to</span>
        <input type="date" aria-label="Closed until" data-c="${i}" data-f="to" value="${esc(c.to || c.from)}">
        <input type="text" aria-label="Reason" placeholder="e.g. Christmas" maxlength="80" data-c="${i}" data-f="label" value="${esc(c.label || '')}">
        <button class="btn btn-secondary" type="button" data-del-closure="${i}">Remove</button>
      </div>`).join('') : '<p class="ed-hint">No closure dates. Add bank holidays or days you will be away, and the website shows "Closed today" and lists them.</p>';
  }
  function renderHours() {
    const c = eff();
    closuresState = (c.closures || []).map((x) => ({ ...x }));
    $('pane_hours').innerHTML = `
      <form class="card site-form" id="hoursForm" novalidate>
        <h2>Walk-in clinic hours</h2>
        ${hoursTable('w', c.hours)}
        ${field('hNote', 'Note under the hours', c.hoursNote, { max: 160 })}
        <h2 style="margin-top:26px;">Online GP times</h2>
        <p class="ed-hint">Online GP is shown separately from the walk-in clinic. Leave "fixed hours" off to say that appointments are booked online and times are shown when booking.</p>
        <label class="check-line"><input type="checkbox" id="onlineFixed"${c.onlineHours ? ' checked' : ''}> Show fixed online GP hours</label>
        <div id="onlineFixedBox"${c.onlineHours ? '' : ' hidden'}>${hoursTable('o', c.onlineHours || {})}</div>
        <div id="onlineNoteBox"${c.onlineHours ? ' hidden' : ''}>${field('hOnlineNote', 'What to say instead', c.onlineNote, { max: 200 })}</div>
        <h2 style="margin-top:26px;">Closed days</h2>
        <div id="closuresBox"></div>
        <button class="btn btn-secondary" type="button" id="addClosure">+ Add a closed day</button>
        <div class="ed-actions"><button class="btn btn-primary btn-lg" type="submit">Save hours</button></div>
      </form>`;
    renderClosures();
    $('onlineFixed').addEventListener('change', () => { const on = $('onlineFixed').checked; $('onlineFixedBox').hidden = !on; $('onlineNoteBox').hidden = on; });
    $('addClosure').addEventListener('click', () => { closuresState.push({ from: '', to: '', label: '' }); renderClosures(); });
    $('closuresBox').addEventListener('input', (e) => { const t = e.target; if (t.dataset.c !== undefined) closuresState[t.dataset.c][t.dataset.f] = t.value; });
    $('closuresBox').addEventListener('click', (e) => { const b = e.target.closest('[data-del-closure]'); if (b) { closuresState.splice(Number(b.dataset.delClosure), 1); renderClosures(); } });
    $('hoursForm').addEventListener('submit', async (e) => {
      e.preventDefault(); clearMsg();
      try {
        const body = {
          hours: readHours('w', 'Walk-in clinic hours'), hoursNote: val('hNote'),
          onlineHours: $('onlineFixed').checked ? readHours('o', 'Online GP hours') : null,
          closures: closuresState.filter((x) => x.from).map((x) => ({ from: x.from, to: x.to || x.from, label: x.label })),
        };
        if (!$('onlineFixed').checked) body.onlineNote = val('hOnlineNote');
        if (closuresState.some((x) => !x.from && (x.to || x.label))) throw new Error('Each closed day needs a "from" date');
        await send('/api/admin/site/clinic', 'PUT', body);
        await reload(); ok('Saved. Opening hours and closed days are updated across the website.');
      } catch (er) { fail(er); }
    });
  }

  // ---------------------------------------------------------------- Fees & lead GP
  let feesState = [];
  function renderFeeRows() {
    $('feeRows').innerHTML = feesState.length ? feesState.map((f, i) => `
      <div class="closure-row">
        <input type="text" aria-label="Fee name" placeholder="e.g. GP consultation" maxlength="80" data-fee="${i}" data-f="label" value="${esc(f.label)}">
        <input type="text" aria-label="Price" placeholder="e.g. 60" maxlength="20" data-fee="${i}" data-f="price" value="${esc(f.price)}" style="max-width:140px;">
        <button class="btn btn-secondary" type="button" data-del-fee="${i}">Remove</button>
      </div>`).join('') : '<p class="ed-hint">No walk-in fees yet — the Fees page then asks people to contact the clinic.</p>';
  }
  function renderFees() {
    const c = eff(); const f = c.founder || {};
    feesState = ((c.fees && c.fees.walkIn) || []).map((x) => ({ ...x }));
    $('pane_fees').innerHTML = `
      <form class="card site-form" id="feesForm" novalidate>
        <h2>Walk-in &amp; family practice fees</h2>
        <p class="ed-hint">Type the price as you want it shown, for example €60. Only fees you add here appear on the Fees page.</p>
        <div id="feeRows"></div>
        <button class="btn btn-secondary" type="button" id="addFee">+ Add a fee</button>
        <h2 style="margin-top:26px;">Lead GP (About page)</h2>
        <p class="ed-hint">Only what you fill in is shown. Leave the name empty to hide this section.</p>
        <div class="form-grid">
          ${field('fName', 'Name', f.name, { max: 100 })}
          ${field('fRole', 'Role', f.role, { max: 100, placeholder: 'e.g. GP and founder' })}
          ${field('fBio', 'About the GP', f.bio, { area: true, rows: 5, wide: true, max: 1500 })}
          ${field('fQuals', 'Qualifications (one per line)', (f.qualifications || []).join('\n'), { area: true, rows: 3 })}
          ${field('fCouncil', 'Medical Council registration number', f.medicalCouncilNumber, { max: 30 })}
        </div>
        <div class="ed-actions"><button class="btn btn-primary btn-lg" type="submit">Save</button></div>
      </form>`;
    renderFeeRows();
    $('addFee').addEventListener('click', () => { feesState.push({ label: '', price: '' }); renderFeeRows(); });
    $('feeRows').addEventListener('input', (e) => { const t = e.target; if (t.dataset.fee !== undefined) feesState[t.dataset.fee][t.dataset.f] = t.value; });
    $('feeRows').addEventListener('click', (e) => { const b = e.target.closest('[data-del-fee]'); if (b) { feesState.splice(Number(b.dataset.delFee), 1); renderFeeRows(); } });
    $('feesForm').addEventListener('submit', async (e) => {
      e.preventDefault(); clearMsg();
      try {
        await send('/api/admin/site/clinic', 'PUT', {
          fees: { walkIn: feesState.filter((x) => x.label.trim() && x.price.trim()) },
          founder: { name: val('fName'), role: val('fRole'), bio: val('fBio'), qualifications: val('fQuals').split('\n').map((s) => s.trim()).filter(Boolean), medicalCouncilNumber: val('fCouncil') },
        });
        await reload(); ok('Saved.');
      } catch (er) { fail(er); }
    });
  }

  // ---------------------------------------------------------------- Page wording
  function renderText() {
    const overrides = DATA.text || {};
    const groups = [];
    DATA.registry.text.forEach((t) => { let g = groups.find((x) => x.name === t.group); if (!g) { g = { name: t.group, items: [] }; groups.push(g); } g.items.push(t); });
    const box = fresh('pane_text');
    box.innerHTML = `
      <div class="ed-bar">
        <input type="search" id="textSearch" placeholder="Search wording…" aria-label="Search wording">
        <button class="btn btn-primary" type="button" id="saveText">Save wording</button>
        <button class="btn btn-secondary" type="button" id="resetText">Put all wording back to the original</button>
      </div>
      <p class="ed-hint">Change any line below and press Save. A line marked <strong>edited</strong> differs from the original; "Original" puts it back. The emergency notice and the "no appointment is required" explanation are fixed on purpose.</p>
      ${groups.map((g, gi) => `<details class="card ed-group"${gi === 0 ? ' open' : ''}><summary>${esc(g.name)} <span class="ed-count">${g.items.length} lines</span></summary>
        ${g.items.map((t) => {
    const v = overrides[t.key] || t.text;
    const input = t.long ? `<textarea rows="2" maxlength="600" data-key="${esc(t.key)}">${esc(v)}</textarea>` : `<input type="text" maxlength="200" data-key="${esc(t.key)}" value="${esc(v)}">`;
    return `<div class="ed-line" data-label="${esc((t.label + ' ' + t.text).toLowerCase())}"><label>${esc(t.label)} <span class="ed-tag" data-tag="${esc(t.key)}"${overrides[t.key] ? '' : ' hidden'}>edited</span></label>${input}
          <button class="link-btn" type="button" data-orig="${esc(t.key)}">Original</button></div>`;
  }).join('')}</details>`).join('')}`;
    const byKey = new Map(DATA.registry.text.map((t) => [t.key, t]));
    const initial = {};
    DATA.registry.text.forEach((t) => { initial[t.key] = overrides[t.key] || t.text; });
    const tag = (key) => { const i = box.querySelector(`[data-key="${key}"]`); box.querySelector(`[data-tag="${key}"]`).hidden = i.value.trim() === byKey.get(key).text; };
    box.addEventListener('input', (e) => { if (e.target.dataset.key) tag(e.target.dataset.key); });
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-orig]'); if (b) { const i = box.querySelector(`[data-key="${b.dataset.orig}"]`); i.value = byKey.get(b.dataset.orig).text; tag(b.dataset.orig); } });
    $('textSearch').addEventListener('input', () => {
      const q = $('textSearch').value.trim().toLowerCase();
      box.querySelectorAll('.ed-line').forEach((l) => { l.hidden = !!q && !l.dataset.label.includes(q); });
      if (q) box.querySelectorAll('details.ed-group').forEach((d) => { d.open = true; });
    });
    $('saveText').addEventListener('click', async () => {
      clearMsg();
      const values = {};
      box.querySelectorAll('[data-key]').forEach((i) => {
        const key = i.dataset.key; const now = i.value.trim();
        if (now === initial[key]) return;
        values[key] = now === byKey.get(key).text || !now ? '' : now;
      });
      if (!Object.keys(values).length) return ok('Nothing has changed.');
      try { await send('/api/admin/site/text', 'PUT', { values }); await reload(); render('text'); ok('Saved. The website now shows your wording.'); } catch (er) { fail(er); }
    });
    $('resetText').addEventListener('click', () => resetGroup('text', 'ALL page wording'));
  }

  // ---------------------------------------------------------------- Photos
  function renderPhotos() {
    const groups = [];
    DATA.registry.images.forEach((im) => { let g = groups.find((x) => x.name === im.group); if (!g) { g = { name: im.group, items: [] }; groups.push(g); } g.items.push(im); });
    const box = fresh('pane_photos');
    box.innerHTML = groups.map((g) => `<h2 class="ed-h2">${esc(g.name)}</h2><div class="photo-grid">${g.items.map((im) => {
      const v = DATA.images && DATA.images[im.slot];
      const src = v ? `/api/site-image/${im.slot}?v=${v}` : im.defaultUrl;
      return `<div class="card photo-card"><img src="${esc(src)}" alt="Current picture: ${esc(im.label)}" loading="lazy">
        <h3>${esc(im.label)} <span class="ed-tag">${v ? 'your photo' : 'original'}</span></h3><p class="ed-hint">${esc(im.hint)}</p>
        <div class="ed-actions"><label class="btn btn-secondary file-btn">Choose a new photo<input type="file" accept="image/jpeg,image/png,image/webp" data-slot="${esc(im.slot)}" hidden></label>
        ${v ? `<button class="btn btn-tertiary" type="button" data-unset="${esc(im.slot)}">Use the original</button>` : ''}</div></div>`;
    }).join('')}</div>`).join('');
    box.addEventListener('change', async (e) => {
      const input = e.target.closest('input[type=file]'); if (!input || !input.files[0]) return;
      const file = input.files[0]; clearMsg();
      if (file.size > 4 * 1024 * 1024) return fail(new Error('That picture is over 4 MB. Please use a smaller file.'));
      const fd = new FormData(); fd.append('file', file);
      try { await api('/api/admin/site/images/' + input.dataset.slot, { method: 'POST', body: fd }); await reload(); render('photos'); ok('Photo updated on the website.'); } catch (er) { fail(er); }
    });
    box.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-unset]'); if (!b) return;
      try { await api('/api/admin/site/images/' + b.dataset.unset, { method: 'DELETE' }); await reload(); render('photos'); ok('Put back to the original photo.'); } catch (er) { fail(er); }
    });
  }

  // ---------------------------------------------------------------- FAQs
  function renderFaq() {
    const custom = Array.isArray(DATA.faq);
    if (!faqState) faqState = JSON.parse(JSON.stringify(custom ? DATA.faq : DATA.registry.faqDefaults));
    const btns = (a, i, j) => `<button class="icon-btn" type="button" title="Move up" data-act="up" data-g="${i}"${j !== undefined ? ` data-i="${j}"` : ''}>↑</button><button class="icon-btn" type="button" title="Move down" data-act="down" data-g="${i}"${j !== undefined ? ` data-i="${j}"` : ''}>↓</button><button class="icon-btn danger" type="button" title="Delete" data-act="del" data-g="${i}"${j !== undefined ? ` data-i="${j}"` : ''}>✕</button>`;
    $('pane_faq').innerHTML = `
      <p class="ed-hint">${custom ? 'You are using your own FAQs.' : 'These are the built-in FAQs. Edit anything, then Save to use your version.'} Answers can contain links and bold text (use the buttons under an answer). Type <code>{{hours}}</code> in an answer to show the current walk-in opening hours.</p>
      <div id="faqEditor">${faqState.map((g, i) => `
        <div class="card faq-ed" data-g="${i}">
          <div class="faq-ed-head"><input type="text" class="faq-title" aria-label="Section title" maxlength="80" data-g="${i}" data-f="title" value="${esc(g.title)}">${btns('g', i)}</div>
          ${g.items.map((it, j) => `<div class="faq-item">
            <div class="faq-item-head"><input type="text" aria-label="Question" placeholder="Question" maxlength="200" data-g="${i}" data-i="${j}" data-f="q" value="${esc(it.q)}">${btns('i', i, j)}</div>
            <textarea rows="3" aria-label="Answer" placeholder="Answer" maxlength="3000" data-g="${i}" data-i="${j}" data-f="a">${esc(it.a)}</textarea>
            <div class="faq-tools"><button class="link-btn" type="button" data-act="link" data-g="${i}" data-i="${j}">Insert link</button><button class="link-btn" type="button" data-act="bold" data-g="${i}" data-i="${j}">Bold</button></div>
          </div>`).join('')}
          <button class="btn btn-secondary" type="button" data-act="additem" data-g="${i}">+ Add a question</button>
        </div>`).join('')}
        <button class="btn btn-secondary" type="button" data-act="addgroup">+ Add a section</button>
      </div>
      <div class="ed-actions sticky-actions"><button class="btn btn-primary btn-lg" type="button" id="saveFaq">Save FAQs</button>
        ${custom ? '<button class="btn btn-secondary" type="button" id="resetFaq">Go back to the built-in FAQs</button>' : ''}</div>`;
    const box = $('faqEditor');
    box.addEventListener('input', (e) => {
      const t = e.target; if (t.dataset.f === undefined) return;
      const g = faqState[t.dataset.g]; if (t.dataset.i !== undefined) g.items[t.dataset.i][t.dataset.f] = t.value; else g[t.dataset.f] = t.value;
    });
    const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act; const gi = Number(b.dataset.g); const ii = b.dataset.i !== undefined ? Number(b.dataset.i) : null;
      const g = faqState[gi];
      if (act === 'addgroup') faqState.push({ id: '', title: 'New section', items: [{ q: '', a: '' }] });
      else if (act === 'additem') g.items.push({ q: '', a: '' });
      else if (act === 'up' || act === 'down') move(ii === null ? faqState : g.items, ii === null ? gi : ii, act === 'up' ? -1 : 1);
      else if (act === 'del') { if (ii === null) { if (window.confirm('Delete this whole section?')) faqState.splice(gi, 1); } else g.items.splice(ii, 1); }
      else if (act === 'bold' || act === 'link') {
        const ta = box.querySelector(`textarea[data-g="${gi}"][data-i="${ii}"]`);
        const s = ta.selectionStart; const en = ta.selectionEnd; const sel = ta.value.slice(s, en) || 'text';
        let ins = `<strong>${sel}</strong>`;
        if (act === 'link') { const url = window.prompt('Where should the link go? (e.g. /book.html or https://example.com)'); if (!url) return; ins = `<a href="${url}">${sel}</a>`; }
        ta.value = ta.value.slice(0, s) + ins + ta.value.slice(en); g.items[ii].a = ta.value; return;
      } else return;
      renderFaq();
    });
    $('saveFaq').addEventListener('click', async () => {
      clearMsg();
      try {
        const groups = faqState.map((g) => ({ id: g.id, title: g.title, items: g.items.filter((it) => it.q.trim() && it.a.trim()) }));
        await send('/api/admin/site/faq', 'PUT', { groups });
        await reload(); faqState = null; render('faq'); ok('Saved. The FAQ page now shows your version.');
      } catch (er) { fail(er); }
    });
    if ($('resetFaq')) $('resetFaq').addEventListener('click', async () => {
      if (!window.confirm('Go back to the built-in FAQs? Your version is kept in Change history.')) return;
      try { await send('/api/admin/site/faq', 'PUT', { groups: null }); await reload(); faqState = null; render('faq'); ok('Back to the built-in FAQs.'); } catch (er) { fail(er); }
    });
  }

  // ---------------------------------------------------------------- Announcement bar
  function renderBanner() {
    const b = DATA.banner || { enabled: false, text: '', tone: 'info', linkText: '', linkUrl: '' };
    $('pane_banner').innerHTML = `
      <form class="card site-form" id="bannerForm" novalidate>
        <label class="check-line"><input type="checkbox" id="bOn"${b.enabled ? ' checked' : ''}> Show the announcement bar on every page</label>
        <div class="form-grid" style="margin-top:14px;">
          ${field('bText', 'Message', b.text, { wide: true, max: 240, placeholder: 'e.g. The clinic is closed on Monday 3 August (bank holiday).' })}
          <div class="form-row"><label for="bTone">Style</label><select id="bTone"><option value="info"${b.tone === 'info' ? ' selected' : ''}>Information (green)</option><option value="warning"${b.tone === 'warning' ? ' selected' : ''}>Important (amber)</option></select></div>
          ${field('bLinkText', 'Link text (optional)', b.linkText, { max: 40, placeholder: 'e.g. See our hours' })}
          ${field('bLinkUrl', 'Link address (optional)', b.linkUrl, { max: 300, placeholder: '/contact/', hint: 'A page on this site starting with /, or a full https:// address.' })}
        </div>
        <div class="site-banner is-info" id="bPreview" style="margin-top:8px;border-radius:12px;"><span></span></div>
        <div class="ed-actions"><button class="btn btn-primary btn-lg" type="submit">Save</button></div>
      </form>`;
    const prev = () => { const p = $('bPreview'); p.className = 'site-banner is-' + $('bTone').value; p.firstChild.textContent = val('bText') || 'Your message appears here'; };
    ['bText', 'bTone'].forEach((id) => $(id).addEventListener('input', prev)); prev();
    $('bannerForm').addEventListener('submit', async (e) => {
      e.preventDefault(); clearMsg();
      try {
        if ($('bOn').checked && !val('bText')) throw new Error('Type the message to show, or turn the bar off.');
        await send('/api/admin/site/banner', 'PUT', { enabled: $('bOn').checked, text: val('bText'), tone: $('bTone').value, linkText: val('bLinkText'), linkUrl: val('bLinkUrl') });
        await reload(); ok($('bOn').checked ? 'Saved. The bar is now showing on every page.' : 'Saved. The bar is turned off.');
      } catch (er) { fail(er); }
    });
  }

  // ---------------------------------------------------------------- Change history
  async function renderHistory() {
    $('pane_history').innerHTML = '<p class="ed-hint">Loading…</p>';
    try {
      const log = await api('/api/admin/site/history');
      $('pane_history').innerHTML = log.length ? `<div class="table-scroll"><table class="bookings-table"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th><th></th></tr></thead><tbody>${log.map((r) => `
        <tr><td>${esc(stamp(r.created_at))}</td><td>${esc(r.admin_name || '')}</td><td>${esc(r.action)}</td><td>${esc(r.detail || '')}</td>
        <td>${r.history_id ? `<button class="btn btn-secondary" type="button" data-restore="${r.history_id}">Go back to before this</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty">No changes yet. Everything on the website is the original.</div>';
    } catch (er) { fail(er); }
  }
  $('pane_history').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-restore]'); if (!b) return;
    if (!window.confirm('Go back to the version from before this change? The current version is kept in the history too.')) return;
    try { await send('/api/admin/site/history/' + b.dataset.restore + '/restore', 'POST'); await reload(); faqState = null; render('history'); ok('Restored.'); } catch (er) { fail(er); }
  });

  // ---------------------------------------------------------------- start
  (async function init() {
    try {
      await reload();
      $('siteBox').style.display = 'block';
      showPane('details');
    } catch (e) { if (e.message !== 'signed-out') { $('loginNotice').style.display = 'block'; } }
  })();
})();
