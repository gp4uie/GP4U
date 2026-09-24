// Shows the live online-consultation catalogue (names, prices, durations) from /api/services, so the
// Online GP page, Fees page and homepage always match what patients are actually charged.
// Prices are edited by an admin in the content editor — nothing here is hard-coded.
(function () {
  const svg = (paths) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
  const ICONS = {
    general: svg('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>'),
    video: svg('<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>'),
    womens: svg('<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>'),
    mens: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
    repeat_rx: svg('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>'),
    sick_cert: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'),
    travel: svg('<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>'),
    weight_loss: svg('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>'),
  };
  const DEFAULT_ICON = ICONS.general;

  const euro = (cents) => `€${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
  const isRx = (key) => typeof PRESCRIPTION_SERVICE_KEYS !== 'undefined' && PRESCRIPTION_SERVICE_KEYS.includes(key);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const bookHref = (key) => (key === 'repeat_rx' ? '/online-gp/repeat-prescription/' : `/book.html?service=${encodeURIComponent(key)}`);

  function renderCards(host, entries) {
    host.replaceChildren(...entries.map(([key, s]) => {
      const card = el('div', 'svc-card');
      const chip = el('span', 'ico-chip'); chip.innerHTML = ICONS[key] || DEFAULT_ICON;
      card.append(chip, el('h3', '', s.label), el('div', 'meta', `${s.durationMins} minute consultation`), el('div', 'amount', euro(s.priceCents)));
      const a = el('a', 'btn btn-primary', key === 'repeat_rx' ? 'Request a repeat prescription' : 'Book this online');
      a.href = bookHref(key);
      a.setAttribute('aria-label', `${a.textContent}: ${s.label}, ${euro(s.priceCents)}`);
      card.append(a);
      return card;
    }));
  }

  function renderPriceRows(host, entries, rxEntries) {
    const rows = entries.map(([key, s]) => {
      const row = el('div', 'price-row');
      const left = el('div'); left.append(el('h3', '', s.label), el('div', 'meta', `Online · ${s.durationMins} minutes`));
      const a = el('a', 'btn btn-secondary', 'Book'); a.href = bookHref(key);
      a.setAttribute('aria-label', `Book ${s.label}, ${euro(s.priceCents)}`);
      row.append(left, el('div', 'amount', euro(s.priceCents)), a);
      return row;
    });
    if (rxEntries.length) {
      const min = Math.min(...rxEntries.map(([, s]) => s.priceCents));
      const row = el('div', 'price-row');
      const left = el('div'); left.append(el('h3', '', 'Condition-specific prescription treatments'), el('div', 'meta', `Online · ${rxEntries.length} conditions, e.g. contraception, asthma, migraine, UTI`));
      const a = el('a', 'btn btn-secondary', 'See conditions'); a.href = '/online-gp/repeat-prescription/';
      row.append(left, el('div', 'amount', `from ${euro(min)}`), a);
      rows.push(row);
    }
    host.replaceChildren(...rows);
  }

  fetch('/api/services').then((r) => { if (!r.ok) throw new Error('bad'); return r.json(); }).then((services) => {
    const all = Object.entries(services);
    const consults = all.filter(([k]) => !isRx(k));
    const rx = all.filter(([k]) => isRx(k));
    document.querySelectorAll('[data-services="cards"]').forEach((h) => { renderCards(h, consults); h.removeAttribute('aria-busy'); });
    document.querySelectorAll('[data-services="prices"]').forEach((h) => { renderPriceRows(h, consults, rx); h.removeAttribute('aria-busy'); });
    if (consults.length) {
      const min = Math.min(...consults.map(([, s]) => s.priceCents));
      document.querySelectorAll('[data-min-price]').forEach((e) => { e.textContent = `from ${euro(min)}`; e.hidden = false; });
    }
  }).catch(() => {
    document.querySelectorAll('[data-services]').forEach((h) => {
      h.removeAttribute('aria-busy');
      h.replaceChildren(el('p', '', 'We couldn\'t load our prices just now. Please refresh the page, or contact us — prices are also shown at every step of booking.'));
    });
  });
})();
