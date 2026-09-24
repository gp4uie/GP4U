/*
 * Cookie consent + analytics/ad-pixel loader (GDPR / ePrivacy). Nothing here does anything until measurement IDs are
 * configured on the server (GA4_MEASUREMENT_ID, META_PIXEL_ID, TIKTOK_PIXEL_ID → window.GP4U_SETTINGS.analytics), and
 * even then nothing loads until the visitor says yes in the banner. "No" is as easy as "Yes".
 *
 * Privacy rules built in (see marketing/analytics/tracking-plan.md):
 *   - Google Analytics (category "analytics") only on public information pages and the booking steps, with the page
 *     address stripped of ?query and #hash, Google signals and ad personalisation off.
 *   - Meta / TikTok pixels (category "marketing") only on GENERAL pages — never on condition pages
 *     (/online-gp/<condition>/), booking, confirmation, account, staff or document pages.
 *   - Events carry an action name only — never a service/condition, price, name, email or anything typed into a form.
 *
 * window.gp4uTrack('action_name') is the one function the site calls to record an event.
 */
(function () {
  const cfg = (window.GP4U_SETTINGS && window.GP4U_SETTINGS.analytics) || {};
  const KEY = 'gp4u_consent_v1';
  const path = location.pathname;
  const GA_PAGES = /^\/($|online-gp\/|walk-in-gp-newbridge\/|family-gp\/|services\/|fees\/|about\/|faq\/|contact\/|privacy\/|book\/|book\.html$|confirmation\.html$)/;
  const AD_PAGES = /^\/($|online-gp\/$|walk-in-gp-newbridge\/$|family-gp\/$|services\/$|fees\/$|about\/$|faq\/$|contact\/$|book\/$)/;
  const hasAny = !!(cfg.ga4 || cfg.meta || cfg.tiktok);
  const hasMarketing = !!(cfg.meta || cfg.tiktok);

  // Privacy notice: show the paragraph that matches what this site actually uses.
  document.querySelectorAll('[data-if-analytics]').forEach((el) => { el.hidden = !hasAny; });
  document.querySelectorAll('[data-if-no-analytics]').forEach((el) => { el.hidden = hasAny; });

  let consent = null;
  try { consent = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { consent = null; }
  const queue = [];
  let loaded = { ga: false, meta: false, tiktok: false };

  window.gp4uTrack = function (action) {
    if (!/^[a-z0-9_]{2,40}$/.test(action)) return;
    if (loaded.ga && window.gtag) window.gtag('event', action, { page_location: location.origin + path });
    if (loaded.meta && window.fbq) window.fbq('trackCustom', action);
    if (loaded.tiktok && window.ttq) window.ttq.track(action);
    if (!loaded.ga && !loaded.meta && !loaded.tiktok) queue.push(action);
  };

  function addScript(src) { const s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s); }

  function start() {
    if (!consent) return;
    if (consent.analytics && cfg.ga4 && GA_PAGES.test(path) && !loaded.ga) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
      window.gtag('js', new Date());
      // the confirmation page address carries a private link: report it as a plain path
      window.gtag('config', cfg.ga4, { page_location: location.origin + path, page_referrer: '', allow_google_signals: false, allow_ad_personalization_signals: false });
      addScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(cfg.ga4));
      loaded.ga = true;
    }
    if (consent.marketing && AD_PAGES.test(path)) {
      if (cfg.meta && !loaded.meta) {
        /* Meta Pixel base code (standard snippet, loaded only after consent) */
        !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
        window.fbq('init', cfg.meta);
        window.fbq('track', 'PageView');
        loaded.meta = true;
      }
      if (cfg.tiktok && !loaded.tiktok) {
        /* TikTok Pixel base code (standard snippet, loaded only after consent) */
        !function (w, d, t) { w.TiktokAnalyticsObject = t; const ttq = w[t] = w[t] || []; ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie']; ttq.setAndDefer = function (o, m) { o[m] = function () { o.push([m].concat(Array.prototype.slice.call(arguments, 0))); }; }; for (let i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]); ttq.load = function (e) { const u = 'https://analytics.tiktok.com/i18n/pixel/events.js'; ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = u; const s = d.createElement('script'); s.async = true; s.src = u + '?sdkid=' + e + '&lib=' + t; const f = d.getElementsByTagName('script')[0]; f.parentNode.insertBefore(s, f); }; ttq.load(cfg.tiktok); ttq.page(); }(window, document, 'ttq');
        loaded.tiktok = true;
      }
    }
    while (queue.length) window.gp4uTrack(queue.shift());
  }

  function save(analytics, marketing) {
    consent = { analytics: !!analytics, marketing: !!marketing, at: new Date().toISOString() };
    try { localStorage.setItem(KEY, JSON.stringify(consent)); } catch (e) { /* private mode: ask again next time */ }
    closeBanner();
    start();
  }

  let banner = null;
  function closeBanner() { if (banner) { banner.remove(); banner = null; } }
  function openBanner() {
    if (!hasAny || banner || document.body.classList.contains('staff-page')) return;
    banner = document.createElement('div');
    banner.className = 'consent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie choices');
    banner.innerHTML = `<div class="consent-inner">
      <p><strong>Cookies on GP4U.</strong> We'd like to measure how people use our website, and${hasMarketing ? ' how well our adverts work on general pages,' : ''} so we can improve it. We never use cookies on pages about specific conditions, your booking or your account, and never share health information. <a href="/privacy/#cookies">Details</a></p>
      <div class="consent-choices">
        <label class="check-line"><input type="checkbox" data-c="analytics"${consent && consent.analytics ? ' checked' : ''}> Analytics</label>
        ${hasMarketing ? `<label class="check-line"><input type="checkbox" data-c="marketing"${consent && consent.marketing ? ' checked' : ''}> Advertising measurement</label>` : ''}
      </div>
      <div class="consent-actions">
        <button type="button" class="btn btn-secondary" data-act="reject">Reject all</button>
        <button type="button" class="btn btn-secondary" data-act="save">Save choices</button>
        <button type="button" class="btn btn-primary" data-act="accept">Accept all</button>
      </div></div>`;
    banner.addEventListener('click', (e) => {
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'reject') save(false, false);
      if (act === 'accept') save(true, true);
      if (act === 'save') save(banner.querySelector('[data-c="analytics"]').checked, !!(banner.querySelector('[data-c="marketing"]') || {}).checked);
    });
    document.body.appendChild(banner);
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('[data-cookie-settings]');
    if (!a) return;
    e.preventDefault();
    if (!hasAny) { location.href = '/privacy/#cookies'; return; }
    openBanner();
  });

  if (!hasAny) return;
  if (consent) start(); else openBanner();

  // Funnel events that don't come from link clicks (no service, price or personal details)
  if (path === '/book.html') window.gp4uTrack('online_booking_start');
  if (path === '/confirmation.html' && /[?&](session_id|demo)=/.test(location.search)) window.gp4uTrack('online_booking_confirmed');
})();
