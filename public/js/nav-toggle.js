// Shared site behaviour: mobile menu, current-page highlight, signed-in link swap, and calm scroll-reveal.
(function () {
  // One consistent line-icon style for the menu button (no text glyphs)
  const MENU = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
  const CLOSE = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>';

  document.querySelectorAll('.nav-toggle').forEach((btn) => {
    const nav = btn.closest('.nav-wrap').querySelector('nav.main-nav');
    const setOpen = (open) => {
      nav.classList.toggle('nav-open', open);
      btn.innerHTML = open ? CLOSE : MENU;
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    setOpen(false);
    btn.addEventListener('click', () => setOpen(!nav.classList.contains('nav-open')));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('nav-open')) { setOpen(false); btn.focus(); }
    });
  });

  if (!document.body.classList.contains('clinic-page')) return;

  // Measurable calls to action, for when an analytics tool is added (none is installed today). Each click is pushed to
  // window.dataLayer ONLY if that already exists, and carries just the action name and the page address — never
  // anything typed into a form, no names, no health details, no booking references.
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || !Array.isArray(window.dataLayer)) return;
    const href = a.getAttribute('href') || '';
    const action = a.dataset.track
      || (href.startsWith('tel:') ? 'phone_click'
        : href.startsWith('mailto:') ? 'email_click'
          : a.hasAttribute('data-clinic-directions') ? 'directions_click'
            : /^\/book(\.html|\/)/.test(href) ? 'online_booking_click'
              : href.startsWith('/walk-in-gp-newbridge/') ? 'walk_in_click'
                : href.startsWith('/family-gp/') ? 'registration_click' : '');
    if (action) window.dataLayer.push({ event: 'gp4u_cta', action, page: location.pathname });
  });

  if (document.body.classList.contains('staff-page')) return; // staff tools: no public-site behaviour (login swap, reveal)

  // Mark the link for the page you're on (helps everyone, and screen readers announce it).
  // (online condition pages such as /online-gp/acne/ sit under Online GP)
  const here = location.pathname;
  document.querySelectorAll('nav.main-nav a:not(.btn)').forEach((a) => {
    const href = a.getAttribute('href');
    if (href === here || (href === '/online-gp/' && here.startsWith('/online-gp/'))) a.setAttribute('aria-current', 'page');
  });

  fetch('/api/patient/me').then((r) => r.json()).then((me) => {
    if (!me || !me.loggedIn) return;
    document.querySelectorAll('#patientLoginLink').forEach((el) => { el.hidden = true; });
    document.querySelectorAll('#patientPortalLink').forEach((el) => { el.hidden = false; });
  }).catch(() => { /* not signed in, or offline — leave "Patient Login" showing */ });

  // Scroll reveal: a gentle fade/slide as sections come into view. Only added by JS (so content is always
  // visible without it), skipped entirely for people who ask their device to reduce motion, and never applied
  // to anything already on screen when the page loads.
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const targets = document.querySelectorAll('.sec-head, .choose-card, .why-item, .svc, .timeline li, .loc-card, .cta-band, .faq details, .pcard, .opt, .steps-card, .info-card, .trust-item, .split-media, .price-row');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });
  const vh = window.innerHeight || 800;
  targets.forEach((el) => {
    if (el.getBoundingClientRect().top < vh) return;
    el.classList.add('reveal');
    io.observe(el);
  });
})();
