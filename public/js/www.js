// Runs first on every page. (1) The site's one address is www.gp4u.ie: a page opened as gp4u.ie (e.g. from an older
// email link) moves to www straight away, keeping the full link, so the page and its data always share one address.
// Hostinger serves these .html files itself, before the app's own address rule can run, hence doing it here.
// (2) Never run inside someone else's frame (the host's file server doesn't send the app's X-Frame-Options header).
// (3) Never run an out-of-date copy: the host's file server sends pages without caching rules, so a browser may keep
//     showing an old saved copy after an update. Each page checks the live copy once and reloads if it has changed.
(function () {
  try {
    if (location.hostname === 'gp4u.ie') {
      location.replace('https://www.gp4u.ie' + location.pathname + location.search + location.hash);
      return;
    }
    if (window.top !== window.self) {
      try { if (window.top.location.hostname === location.hostname) return; } catch (e) { /* other site */ }
      document.documentElement.style.display = 'none';
      window.top.location = window.self.location.href;
    }
  } catch (err) { /* never block the page */ }
})();

(function () {
  const STALE_KEY = 'gp4u-refreshed:' + location.pathname;
  function check() {
    try {
      const mine = [...document.scripts].map((s) => s.getAttribute('src') || '').filter((src) => /\?v=\w+/.test(src));
      if (!mine.length) return;
      // cache: 'reload' also replaces the browser's saved copy, so the reload below shows the new page.
      fetch(location.pathname + location.search, { cache: 'reload', credentials: 'same-origin' })
        .then((r) => (r.ok ? r.text() : ''))
        .then((live) => {
          if (!live || mine.every((src) => live.includes(src))) { try { sessionStorage.removeItem(STALE_KEY); } catch (e) { /* ignore */ } return; }
          let done = null; try { done = sessionStorage.getItem(STALE_KEY); } catch (e) { /* ignore */ }
          if (done) return; // reload at most once, never loop
          try { sessionStorage.setItem(STALE_KEY, '1'); } catch (e) { return; }
          location.reload();
        })
        .catch(() => {});
    } catch (err) { /* never block the page */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check); else check();
})();
