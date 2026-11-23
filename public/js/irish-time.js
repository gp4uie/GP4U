// GP4U is an Irish practice: every appointment and timestamp is shown in Irish time (Europe/Dublin), whatever time zone
// the viewer's own computer or phone is set to. Without this, a doctor or patient whose device is set to another zone (or
// who is abroad) sees every appointment hours off. Any date/time display that doesn't name a time zone gets Irish time.
// Load before the page's own scripts.
(function () {
  if (window.__gp4uIrishTime) return;
  window.__gp4uIrishTime = true;
  var ZONE = 'Europe/Dublin';
  var withZone = function (opts) {
    if (opts && opts.timeZone) return opts;
    var o = {}; for (var k in opts) o[k] = opts[k]; o.timeZone = ZONE; return o;
  };
  ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'].forEach(function (name) {
    var orig = Date.prototype[name];
    Date.prototype[name] = function (locales, opts) { return orig.call(this, locales, withZone(opts)); };
  });
  // The hour (0-23) of a moment in Irish time, for laying out calendars.
  var hourFmt = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: ZONE });
  window.irishHour = function (d) { return Number(hourFmt.format(d instanceof Date ? d : new Date(d))) % 24; };
})();
