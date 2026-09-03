document.querySelectorAll('.nav-toggle').forEach((btn) => {
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', () => {
    const nav = btn.closest('.nav-wrap').querySelector('nav.main-nav');
    const isOpen = nav.classList.toggle('nav-open');
    btn.textContent = isOpen ? '✕' : '☰';
    btn.setAttribute('aria-expanded', String(isOpen));
  });
});
