// Email sign-up forms (<form data-signup="clinic_opening|news" data-source="...">). Posts to /api/updates-signup.
// Only the email address and the tick-box consent are sent — nothing else about the visitor.
(function () {
  document.querySelectorAll('form[data-signup]').forEach((form) => {
    const email = form.querySelector('input[type="email"]');
    const consent = form.querySelector('input[type="checkbox"]');
    const msg = form.querySelector('[data-signup-msg]');
    const btn = form.querySelector('button[type="submit"]');
    const say = (text, ok) => { msg.textContent = text; msg.classList.toggle('is-ok', !!ok); };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      say('');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { say('Please enter a valid email address.'); email.focus(); return; }
      if (!consent.checked) { say('Please tick the box so we have your permission to email you.'); consent.focus(); return; }
      btn.disabled = true;
      try {
        const r = await fetch('/api/updates-signup', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.value.trim(), topic: form.dataset.signup, source: form.dataset.source || location.pathname, consent: true }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Something went wrong — please try again.');
        form.querySelectorAll('input, button').forEach((el) => { el.disabled = true; });
        say(form.dataset.signup === 'clinic_opening' ? "Thanks — we'll email you when the Newbridge clinic opens." : "Thanks — you're signed up.", true);
        if (typeof window.gp4uTrack === 'function') window.gp4uTrack('email_signup');
      } catch (err) {
        say(err.message);
        btn.disabled = false;
      }
    });
  });
})();
