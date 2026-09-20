/*
 * GP4U Clinic — the ONE place to edit clinic details (address, phone, opening hours, company info).
 * Every page reads from here, so a change made below shows up across the whole site.
 *
 * Anything left as '' is simply not shown on the website. Fill these in when you have them:
 *   streetAddress, phone, eircode, companyName, companyNumber, registeredOffice
 *
 * The street address is deliberately blank for now: the site shows just "Newbridge, Co. Kildare" and
 * hides every "Get directions" button. When you're ready, type the street here (just the street name)
 * and the full address, the directions buttons and the map links all appear automatically.
 */
const CLINIC = {
  name: 'GP4U Clinic',
  tagline: 'Walk-In Clinic & Comprehensive Family Practice',
  streetAddress: '',
  town: 'Newbridge',
  county: 'Co. Kildare',
  eircode: '',
  phone: '',
  email: 'admin@gp4u.ie',

  // Irish company law requires these on a company's website. Leave blank until confirmed.
  companyName: '',        // e.g. "GP4U Ltd"
  companyNumber: '',      // CRO registration number
  registeredOffice: '',   // registered office address

  // Opening hours in 24h "HH:MM". Day 0 = Sunday ... 6 = Saturday. Times are Irish time.
  hours: {
    0: ['12:00', '19:00'],
    1: ['10:00', '21:00'],
    2: ['10:00', '21:00'],
    3: ['10:00', '21:00'],
    4: ['10:00', '21:00'],
    5: ['10:00', '21:00'],
    6: ['12:00', '19:00'],
  },
  hoursNote: 'Hours may differ on public holidays.',

  // ONLINE GP times are separate from the walk-in clinic hours above. Leave onlineHours as null and the site
  // just says online appointments are booked online (the available times are shown when someone books).
  // To publish fixed online hours, use the same shape as "hours", e.g. { 1: ['09:00', '17:00'], ... }.
  onlineHours: null,
  onlineNote: 'Booked online — pick a time that suits you when you book.',

  // Show an embedded map once the street address is set (it loads Google Maps, so it is off until you
  // choose). "Get directions" links work without it.
  showMap: true,

  // Walk-in / family-practice fees. Leave empty until the prices are confirmed — the Fees page then just
  // asks people to contact the clinic. Add one line per fee, e.g. { label: 'GP consultation', price: '€60' }
  fees: {
    walkIn: [],
  },

  // The lead GP, shown on the About page. Only fill in what is true and confirmed; anything left blank is
  // simply not shown. photo: a file in /img/, e.g. '/img/team/founder.webp'.
  founder: {
    name: '',
    role: '',              // e.g. "GP and founder"
    bio: '',
    qualifications: [],    // e.g. ['MB BCh BAO', 'MICGP']
    medicalCouncilNumber: '',
    photo: '',
  },

  // Days the walk-in clinic is closed (bank holidays, holidays): [{ from: '2026-12-25', to: '2026-12-26', label: 'Christmas' }].
  closures: [],
};

// Anything an admin has edited in the admin "Website" screen (served by /api/site-settings.js, loaded before this
// file) replaces the built-in value above. The pages keep working with the values above if that script is missing.
window.CLINIC_DEFAULTS = JSON.parse(JSON.stringify(CLINIC)); // the built-in values, before any admin edits (used by the admin editor)
const SETTINGS = window.GP4U_SETTINGS || {};
['name', 'tagline', 'streetAddress', 'town', 'county', 'eircode', 'phone', 'email', 'companyName', 'companyNumber', 'registeredOffice',
  'hoursNote', 'onlineNote', 'showMap', 'hours', 'onlineHours', 'fees', 'founder', 'closures'].forEach((k) => {
  if (SETTINGS.clinic && k in SETTINGS.clinic) CLINIC[k] = SETTINGS.clinic[k];
});

(function () {
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

  function fmt(t) {
    const [h, m] = t.split(':').map(Number);
    const suffix = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return m ? `${h12}:${String(m).padStart(2, '0')}${suffix}` : `${h12}${suffix}`;
  }
  const toMins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  // "Now" in Irish time regardless of the visitor's own timezone.
  function dublinNow() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Dublin', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date());
    const get = (type) => parts.find((p) => p.type === type).value;
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    return { day, mins: Number(get('hour')) % 24 * 60 + Number(get('minute')) };
  }

  // Today's date in Ireland as YYYY-MM-DD, and a date N days later.
  function dublinDate() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  function addDays(ymd, n) {
    const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function closureOn(ymd) {
    return (CLINIC.closures || []).find((c) => c.from <= ymd && ymd <= (c.to || c.from)) || null;
  }

  function status() {
    const { day, mins } = dublinNow();
    const todayDate = dublinDate();
    const shut = closureOn(todayDate);
    if (shut) return { open: false, text: shut.label ? `Closed today · ${shut.label}` : 'Closed today' };
    const today = CLINIC.hours[day];
    if (today && mins >= toMins(today[0]) && mins < toMins(today[1])) {
      const closing = toMins(today[1]) - mins;
      return { open: true, text: closing <= 60 ? `Open now · closes at ${fmt(today[1])}` : `Open now · until ${fmt(today[1])}` };
    }
    if (today && mins < toMins(today[0])) return { open: false, text: `Closed · opens today at ${fmt(today[0])}` };
    for (let i = 1; i <= 7; i++) {
      const next = (day + i) % 7;
      if (CLINIC.hours[next] && !closureOn(addDays(todayDate, i))) {
        return { open: false, text: `Closed · opens ${i === 1 ? 'tomorrow' : DAY_NAMES[next]} at ${fmt(CLINIC.hours[next][0])}` };
      }
    }
    return { open: false, text: 'Closed' };
  }

  window.clinicStatus = status;

  function hoursTable() {
    const { day } = dublinNow();
    const rows = DISPLAY_ORDER.map((d) => {
      const h = CLINIC.hours[d];
      return `<tr${d === day ? ' class="today"' : ''}><th scope="row">${DAY_NAMES[d]}</th><td>${h ? `${fmt(h[0])} – ${fmt(h[1])}` : 'Closed'}</td></tr>`;
    }).join('');
    return `<table class="hours-table"><tbody>${rows}</tbody></table>`;
  }

  // Compact "Mon–Fri 10am – 9pm / Sat–Sun 12pm – 7pm" summary, built from the same hours.
  function hoursSummary(hoursObj) {
    const HRS = hoursObj || CLINIC.hours;
    const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const groups = [];
    DISPLAY_ORDER.forEach((d) => {
      const h = HRS[d];
      const key = h ? h.join('-') : 'closed';
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.days.push(d); else groups.push({ key, days: [d], h });
    });
    return groups.map((g) => {
      const label = g.days.length > 1 ? `${SHORT[g.days[0]]}–${SHORT[g.days[g.days.length - 1]]}` : SHORT[g.days[0]];
      return `<div class="hs-row"><strong>${label}</strong><span>${g.h ? `${fmt(g.h[0])} – ${fmt(g.h[1])}` : 'Closed'}</span></div>`;
    }).join('');
  }

  // "Monday to Friday 10am – 9pm and Saturday and Sunday 12pm – 7pm" — for use inside sentences.
  const hoursSummaryText = (h) => hoursText(h);
  function hoursText(hoursObj) {
    const HRS = hoursObj || CLINIC.hours;
    const groups = [];
    DISPLAY_ORDER.forEach((d) => {
      const h = HRS[d];
      const key = h ? h.join('-') : 'closed';
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.days.push(d); else groups.push({ key, days: [d], h });
    });
    return groups.map((g) => {
      const first = DAY_NAMES[g.days[0]];
      const lastDay = DAY_NAMES[g.days[g.days.length - 1]];
      const label = g.days.length === 1 ? first : g.days.length === 2 ? `${first} and ${lastDay}` : `${first} to ${lastDay}`;
      return `${label} ${g.h ? `${fmt(g.h[0])} – ${fmt(g.h[1])}` : '(closed)'}`;
    }).join(', ');
  }

  function fill() {
    const addr = [CLINIC.streetAddress, CLINIC.town, CLINIC.county, CLINIC.eircode].filter(Boolean);
    const hasStreet = !!CLINIC.streetAddress;

    document.querySelectorAll('[data-open-status]').forEach((el) => {
      const s = status();
      el.className = `open-status ${s.open ? 'is-open' : 'is-closed'}`;
      el.innerHTML = `<span class="open-dot"></span>Walk-in clinic · ${s.text}`;
    });
    // Online GP times (separate from the walk-in clinic): fixed hours if configured, otherwise a plain note.
    document.querySelectorAll('[data-online-hours]').forEach((el) => {
      el.innerHTML = CLINIC.onlineHours ? hoursSummary(CLINIC.onlineHours) : `<p class="online-note">${CLINIC.onlineNote}</p>`;
    });
    document.querySelectorAll('[data-online-hours-text]').forEach((el) => { el.textContent = CLINIC.onlineHours ? hoursSummaryText(CLINIC.onlineHours) : CLINIC.onlineNote; });
    document.querySelectorAll('[data-clinic-hours-text]').forEach((el) => { el.textContent = hoursText(); });
    document.querySelectorAll('[data-clinic-hours-summary]').forEach((el) => { el.innerHTML = hoursSummary(); });
    document.querySelectorAll('[data-clinic-hours]').forEach((el) => { el.innerHTML = hoursTable(); });
    document.querySelectorAll('[data-clinic-hours-note]').forEach((el) => { el.textContent = CLINIC.hoursNote; });
    // No street address yet: show "Address coming soon" instead of any address. Type the street into
    // CLINIC.streetAddress above and the full address (and directions buttons) appear automatically.
    document.querySelectorAll('[data-clinic-address]').forEach((el) => { if (hasStreet) el.innerHTML = addr.join('<br>'); else el.textContent = 'Address coming soon'; });
    document.querySelectorAll('[data-clinic-address-inline]').forEach((el) => { el.textContent = hasStreet ? addr.join(', ') : 'Address coming soon'; });
    // Directions only make sense once there's a real street address to point at.
    document.querySelectorAll('[data-clinic-directions]').forEach((el) => {
      if (!hasStreet) { el.hidden = true; return; }
      el.hidden = false;
      el.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${CLINIC.name}, ${addr.join(', ')}`);
      el.target = '_blank';
      el.rel = 'noopener';
    });
    document.querySelectorAll('[data-if-no-street]').forEach((el) => { el.hidden = hasStreet; });
    document.querySelectorAll('[data-if-street]').forEach((el) => { el.hidden = !hasStreet; });

    // Map: only when there is a real street address (and only created once, not every minute).
    document.querySelectorAll('[data-clinic-map]').forEach((el) => {
      const show = hasStreet && CLINIC.showMap;
      el.hidden = !show;
      if (show && !el.querySelector('iframe')) {
        const f = document.createElement('iframe');
        f.title = `Map showing ${CLINIC.name}, ${addr.join(', ')}`;
        f.loading = 'lazy';
        f.referrerPolicy = 'no-referrer-when-downgrade';
        f.src = 'https://www.google.com/maps?q=' + encodeURIComponent(`${CLINIC.name}, ${addr.join(', ')}`) + '&output=embed';
        el.appendChild(f);
      }
    });

    // Walk-in / family-practice fees (only what has been confirmed in CLINIC.fees)
    const walkInFees = (CLINIC.fees && CLINIC.fees.walkIn) || [];
    document.querySelectorAll('[data-walkin-fees]').forEach((el) => {
      el.hidden = walkInFees.length === 0;
      if (walkInFees.length && !el.dataset.done) {
        el.dataset.done = '1';
        el.replaceChildren(...walkInFees.map((f) => {
          const row = document.createElement('div'); row.className = 'price-row';
          const left = document.createElement('div'); const h = document.createElement('h3'); h.textContent = f.label; left.appendChild(h);
          const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = 'At the clinic'; left.appendChild(meta);
          const amt = document.createElement('div'); amt.className = 'amount'; amt.textContent = f.price;
          row.append(left, amt);
          return row;
        }));
      }
    });
    document.querySelectorAll('[data-if-no-fees]').forEach((el) => { el.hidden = walkInFees.length > 0; });

    // Founder / lead GP (About page) — renders only what is filled in above
    const fd = CLINIC.founder || {};
    document.querySelectorAll('[data-founder]').forEach((el) => {
      el.hidden = !fd.name;
      if (fd.name && !el.dataset.done) {
        el.dataset.done = '1';
        const wrap = document.createElement('div');
        if (fd.photo) { const img = document.createElement('img'); img.src = fd.photo; img.alt = `Portrait of ${fd.name}`; img.width = 220; img.height = 220; img.loading = 'lazy'; el.appendChild(img); }
        const h = document.createElement('h3'); h.textContent = fd.name; wrap.appendChild(h);
        if (fd.role) { const r = document.createElement('p'); r.className = 'role'; r.textContent = fd.role; wrap.appendChild(r); }
        if (fd.bio) { const b = document.createElement('p'); b.textContent = fd.bio; wrap.appendChild(b); }
        const facts = [].concat(fd.qualifications || []);
        if (fd.medicalCouncilNumber) facts.push('Medical Council of Ireland registration number: ' + fd.medicalCouncilNumber);
        if (facts.length) { const ul = document.createElement('ul'); facts.forEach((t) => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); }); wrap.appendChild(ul); }
        el.appendChild(wrap);
      }
    });
    document.querySelectorAll('[data-if-no-founder]').forEach((el) => { el.hidden = !!fd.name; });
    document.querySelectorAll('[data-clinic-phone]').forEach((el) => {
      if (CLINIC.phone) {
        el.innerHTML = `<a href="tel:${CLINIC.phone.replace(/[^+\d]/g, '')}">${CLINIC.phone}</a>`;
      } else {
        (el.closest('.contact-item') || el).hidden = true;
      }
    });
    document.querySelectorAll('[data-clinic-email]').forEach((el) => {
      el.innerHTML = `<a href="mailto:${CLINIC.email}">${CLINIC.email}</a>`;
    });
    document.querySelectorAll('[data-clinic-company]').forEach((el) => {
      const bits = [];
      if (CLINIC.companyName) bits.push(CLINIC.companyName);
      if (CLINIC.companyNumber) bits.push(`Registered in Ireland, company no. ${CLINIC.companyNumber}`);
      if (CLINIC.registeredOffice) bits.push(`Registered office: ${CLINIC.registeredOffice}`);
      if (bits.length) el.textContent = bits.join(' · '); else el.hidden = true;
    });
  }

  // ---------------------------------------------------------------- upcoming closures ("Closed: Thu 25 Dec (Christmas)")
  function fillClosures() {
    const today = dublinDate();
    const upcoming = (CLINIC.closures || []).filter((c) => (c.to || c.from) >= today).sort((a, b) => (a.from < b.from ? -1 : 1)).slice(0, 6);
    const day = (ymd) => new Intl.DateTimeFormat('en-IE', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(ymd + 'T12:00:00Z'));
    const text = upcoming.length
      ? 'Closed: ' + upcoming.map((c) => `${day(c.from)}${c.to && c.to !== c.from ? ' – ' + day(c.to) : ''}${c.label ? ' (' + c.label + ')' : ''}`).join(' · ')
      : '';
    document.querySelectorAll('[data-clinic-closures]').forEach((el) => { el.hidden = !upcoming.length; el.textContent = text; });
  }

  // ---------------------------------------------------------------- admin-edited text, pictures, banner and FAQs
  function setOwnText(el, value) {
    const nodes = [...el.childNodes].filter((n) => n.nodeType === 3 && n.data.trim());
    if (!nodes.length) { el.insertBefore(document.createTextNode(value), el.firstChild); return; }
    nodes[0].data = nodes[0].data.replace(/^(\s*)[\s\S]*?(\s*)$/, (m, a, b) => a + value + b);
    nodes.slice(1).forEach((n) => { n.data = ''; });
  }
  function applyBanner() {
    const b = SETTINGS.banner;
    if (!b || !b.enabled || !b.text || document.body.classList.contains('staff-page')) return;
    const bar = document.createElement('div');
    bar.className = 'site-banner is-' + (b.tone === 'warning' ? 'warning' : 'info');
    bar.setAttribute('role', 'status');
    const span = document.createElement('span'); span.textContent = b.text; bar.appendChild(span);
    if (b.linkText && b.linkUrl) { const a = document.createElement('a'); a.href = b.linkUrl; a.textContent = b.linkText; bar.appendChild(a); }
    const top = document.querySelector('.topbar');
    if (top && top.parentNode) top.parentNode.insertBefore(bar, top.nextSibling); else document.body.insertBefore(bar, document.body.firstChild);
  }
  function applyFaq() {
    const groups = SETTINGS.faq;
    const root = document.querySelector('[data-faq-root]');
    if (!Array.isArray(groups) || !root) return;
    root.querySelectorAll('.faq-group').forEach((n) => n.remove());
    const cats = root.querySelector('.faq-cats');
    if (cats) { cats.textContent = ''; groups.forEach((g) => { const a = document.createElement('a'); a.href = '#' + g.id; a.textContent = g.title; cats.appendChild(a); }); }
    const anchor = root.querySelector('.callout');
    groups.forEach((g) => {
      const wrap = document.createElement('div'); wrap.className = 'faq-group'; wrap.id = g.id;
      const h = document.createElement('h2'); h.textContent = g.title;
      const list = document.createElement('div'); list.className = 'faq';
      g.items.forEach((it) => {
        const d = document.createElement('details');
        const s = document.createElement('summary'); s.textContent = it.q;
        const p = document.createElement('p'); p.innerHTML = it.a.split('{{hours}}').join('<span data-clinic-hours-text>seven days a week</span>'); // answers are cleaned on the server
        d.append(s, p); list.appendChild(d);
      });
      wrap.append(h, list);
      root.insertBefore(wrap, anchor);
    });
  }
  function applySettings() {
    const text = SETTINGS.text || {};
    document.querySelectorAll('[data-cms]').forEach((el) => { const v = text[el.dataset.cms]; if (v) setOwnText(el, v); });
    const imgs = SETTINGS.images || {};
    document.querySelectorAll('[data-cms-img]').forEach((el) => { const v = imgs[el.dataset.cmsImg]; if (v) el.src = `/api/site-image/${el.dataset.cmsImg}?v=${v}`; });
    applyBanner();
    applyFaq();
  }

  function boot() { applySettings(); fill(); fillClosures(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  // Keep the "Open now" pill honest if the page is left open across opening/closing time.
  setInterval(() => { fill(); fillClosures(); }, 60 * 1000);
})();
