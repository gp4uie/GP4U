// Shared by every prescription-service landing page (contraception.html, uti.html, etc). Each
// page sets `PAGE_SERVICE_KEY` before loading this script, and includes questionnaires.js first.
//
// The page content itself — safety list, "about" text, FAQs (with their FAQPage structured data) and
// related services — is written into the HTML by `npm run pages` (scripts/lib/seo-build.js), from the same
// questionnaires.js / condition-content.js data, so patients and search engines get it without waiting for
// this script. All this script still does is show the live price from the service catalogue.
fetch('/api/services').then((r) => r.json()).then((services) => {
  const s = services[PAGE_SERVICE_KEY];
  const priceEl = document.getElementById('pagePrice');
  if (s && priceEl) priceEl.textContent = '€' + (s.priceCents / 100).toFixed(2);
}).catch(() => { /* offline: the price written into the page stays */ });
