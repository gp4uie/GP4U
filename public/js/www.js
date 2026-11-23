// Runs first on every page. (1) The site's one address is www.gp4u.ie: a page opened as gp4u.ie (e.g. from an older
// email link) moves to www straight away, keeping the full link, so the page and its data always share one address.
// Hostinger serves these .html files itself, before the app's own address rule can run, hence doing it here.
// (2) Never run inside someone else's frame (the host's file server doesn't send the app's X-Frame-Options header).
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
