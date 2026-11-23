// Rides through brief connection drops (mobile signal, Wi-Fi hand-over, the host restarting the app) on every page
// that loads data. Only requests that READ data (GET/HEAD) are retried: up to 2 more tries, after 0.7s and then 1.8s,
// when the network fails or the host answers 502/503/504. Anything that changes data (POST, PUT, DELETE) is sent once,
// so nothing can ever happen twice by accident. Load this before the page's own scripts.
(function () {
  if (window.__gp4uNetRetry || typeof window.fetch !== 'function') return;
  window.__gp4uNetRetry = true;
  var realFetch = window.fetch.bind(window);
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  window.fetch = async function (input, init) {
    var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') return realFetch(input, init);
    var delays = [700, 1800];
    for (var attempt = 0; ; attempt++) {
      try {
        var res = await realFetch(input, init);
        if (attempt < delays.length && (res.status === 502 || res.status === 503 || res.status === 504)) { await wait(delays[attempt]); continue; }
        return res;
      } catch (err) {
        if (attempt >= delays.length || (err && err.name === 'AbortError')) throw err;
        await wait(delays[attempt]);
      }
    }
  };
})();
