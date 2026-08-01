document.querySelectorAll('.nav-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const nav = btn.closest('.nav-wrap').querySelector('nav.main-nav');
    nav.classList.toggle('nav-open');
  });
});
