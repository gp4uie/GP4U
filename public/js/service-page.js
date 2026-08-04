// Shared by every prescription-service landing page (contraception.html, uti.html, etc). Each
// page sets `PAGE_SERVICE_KEY` before loading this script, and includes questionnaires.js first
// so the contraindication bullets shown here always match the safety questions asked in the
// actual booking form — one source of truth, no risk of the two drifting apart.
fetch('/api/services').then((r) => r.json()).then((services) => {
  const s = services[PAGE_SERVICE_KEY];
  const priceEl = document.getElementById('pagePrice');
  if (s && priceEl) priceEl.textContent = '€' + (s.priceCents / 100).toFixed(2);
});

document.addEventListener('DOMContentLoaded', () => {
  const config = typeof QUESTIONNAIRES !== 'undefined' ? QUESTIONNAIRES[PAGE_SERVICE_KEY] : null;
  const list = document.getElementById('contraindicationList');
  if (config && list) {
    list.innerHTML = config.redFlags.map((rf) => `<li>${rf.bullet}</li>`).join('');
  }
});
