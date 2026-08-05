// Shared by every prescription-service landing page (contraception.html, uti.html, etc). Each
// page sets `PAGE_SERVICE_KEY` before loading this script, and includes questionnaires.js first
// so the contraindication bullets shown here always match the safety questions asked in the
// actual booking form — one source of truth, no risk of the two drifting apart.
fetch('/api/services').then((r) => r.json()).then((services) => {
  const s = services[PAGE_SERVICE_KEY];
  const priceEl = document.getElementById('pagePrice');
  if (s && priceEl) priceEl.textContent = '€' + (s.priceCents / 100).toFixed(2);

  // Related services: other conditions in the same category (see CATEGORIES in
  // questionnaires.js) — gives patients somewhere else relevant to go, and gives search
  // engines a denser internal-link graph than a page with only a "Book Now" link out.
  const relatedContainer = document.getElementById('relatedServicesContainer');
  if (relatedContainer && typeof CATEGORIES !== 'undefined' && typeof PAGE_SLUGS !== 'undefined') {
    const entry = Object.values(CATEGORIES).find((keys) => keys.includes(PAGE_SERVICE_KEY));
    const relatedKeys = entry ? entry.filter((k) => k !== PAGE_SERVICE_KEY && services[k]) : [];
    if (relatedKeys.length) {
      relatedContainer.innerHTML = `
        <h2 class="section-title" style="font-size:1.3rem;">Related services</h2>
        <div class="grid">
          ${relatedKeys.map((k) => `
            <a class="card service-card" style="text-decoration:none; color:inherit; display:block;" href="/${PAGE_SLUGS[k]}.html">
              <h3>${services[k].label}</h3>
              <p style="color:var(--ink-500);font-size:0.85rem;">${SERVICE_TAGLINES[k] || ''}</p>
            </a>
          `).join('')}
        </div>
      `;
    }
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const config = typeof QUESTIONNAIRES !== 'undefined' ? QUESTIONNAIRES[PAGE_SERVICE_KEY] : null;
  const list = document.getElementById('contraindicationList');
  if (config && list) {
    list.innerHTML = config.redFlags.map((rf) => `<li>${rf.bullet}</li>`).join('');
  }

  // Draft patient-education content (see condition-content.js — non-clinician draft, needs GP
  // review) — an "about" section plus FAQs, with FAQPage structured data injected so the Q&A
  // is eligible for a rich search result.
  const content = typeof CONDITION_CONTENT !== 'undefined' ? CONDITION_CONTENT[PAGE_SERVICE_KEY] : null;
  const aboutContainer = document.getElementById('conditionAboutContainer');
  const faqContainer = document.getElementById('conditionFaqContainer');
  if (!content) return;

  if (aboutContainer && content.about) {
    aboutContainer.innerHTML = content.about.map((p) => `<p>${p}</p>`).join('');
  }

  if (faqContainer && content.faqs && content.faqs.length) {
    faqContainer.innerHTML = `
      <h2 class="section-title" style="font-size:1.3rem;">Frequently asked questions</h2>
      ${content.faqs.map((f) => `
        <div style="border-bottom:1px solid var(--line); padding:14px 0;">
          <details>
            <summary style="cursor:pointer; font-weight:700;">${f.q}</summary>
            <p style="color:var(--ink-500); margin:8px 0 0;">${f.a}</p>
          </details>
        </div>
      `).join('')}
    `;

    const schema = document.createElement('script');
    schema.type = 'application/ld+json';
    schema.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: content.faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
    document.head.appendChild(schema);
  }
});
