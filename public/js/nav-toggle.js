// Shared site behaviour: mobile menu, current-page highlight, and (on public pages) swapping
// "Patient login" for "My account" when a patient is already signed in.
(function () {
  document.querySelectorAll('.nav-toggle').forEach((btn) => {
    const nav = btn.closest('.nav-wrap').querySelector('nav.main-nav');
    const setOpen = (open) => {
      nav.classList.toggle('nav-open', open);
      btn.textContent = open ? '✕' : '☰';
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

  // Mark the link for the page you're on (helps everyone, and screen readers announce it).
  const here = location.pathname === '/' ? '/index.html' : location.pathname;
  document.querySelectorAll('nav.main-nav a:not(.btn)').forEach((a) => {
    if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
  });

  fetch('/api/patient/me').then((r) => r.json()).then((me) => {
    if (!me || !me.loggedIn) return;
    document.querySelectorAll('#patientLoginLink').forEach((el) => { el.hidden = true; });
    document.querySelectorAll('#patientPortalLink').forEach((el) => { el.hidden = false; });
  }).catch(() => { /* not signed in, or offline — leave "Patient login" showing */ });
})();
