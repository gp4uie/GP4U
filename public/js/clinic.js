/*
 * GP4U Clinic — the ONE place to edit clinic details (address, phone, opening hours, company info).
 * Every page reads from here, so a change made below shows up across the whole site.
 *
 * Anything left as '' is simply not shown on the website. Fill these in when you have them:
 *   phone, eircode, companyName, companyNumber, registeredOffice
 */
const CLINIC = {
  name: 'GP4U Clinic',
  tagline: 'Walk-In Clinic & Comprehensive Family Practice',
  addressLines: ['George Street', 'Newbridge', 'Co. Kildare'],
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
};

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

  function status() {
    const { day, mins } = dublinNow();
    const today = CLINIC.hours[day];
    if (today && mins >= toMins(today[0]) && mins < toMins(today[1])) {
      const closing = toMins(today[1]) - mins;
      return { open: true, text: closing <= 60 ? `Open now · closes at ${fmt(today[1])}` : `Open now · until ${fmt(today[1])}` };
    }
    if (today && mins < toMins(today[0])) return { open: false, text: `Closed · opens today at ${fmt(today[0])}` };
    for (let i = 1; i <= 7; i++) {
      const next = (day + i) % 7;
      if (CLINIC.hours[next]) {
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

  function fill() {
    const addr = CLINIC.addressLines.concat(CLINIC.eircode ? [CLINIC.eircode] : []);

    document.querySelectorAll('[data-open-status]').forEach((el) => {
      const s = status();
      el.className = `open-status ${s.open ? 'is-open' : 'is-closed'}`;
      el.innerHTML = `<span class="open-dot"></span>${s.text}`;
    });
    document.querySelectorAll('[data-clinic-hours]').forEach((el) => { el.innerHTML = hoursTable(); });
    document.querySelectorAll('[data-clinic-hours-note]').forEach((el) => { el.textContent = CLINIC.hoursNote; });
    document.querySelectorAll('[data-clinic-address]').forEach((el) => { el.innerHTML = addr.join('<br>'); });
    document.querySelectorAll('[data-clinic-address-inline]').forEach((el) => { el.textContent = addr.join(', '); });
    document.querySelectorAll('[data-clinic-directions]').forEach((el) => {
      el.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${CLINIC.name}, ${addr.join(', ')}`);
      el.target = '_blank';
      el.rel = 'noopener';
    });
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fill); else fill();
  // Keep the "Open now" pill honest if the page is left open across opening/closing time.
  setInterval(fill, 60 * 1000);
})();
