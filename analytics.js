/*
 * Anonymous, cookieless usage counting (GoatCounter) — page views + two events.
 *
 * What is sent:   page path, referrer, screen size, browser/OS, country (derived server-side).
 * What is NOT:    your CSV, any connection data, cookies, localStorage IDs, or personal data.
 *                 GoatCounter never stores raw IPs; "unique visitors" are a salted hash.
 *
 * Setup: create a free site at https://www.goatcounter.com, then put the site code below
 * (the "xyz" in https://xyz.goatcounter.com). While empty, nothing is loaded or sent.
 */
(function () {
  var SITE_CODE = 'linkedinconnector';

  // Safe no-op so callers never need to check whether analytics is active.
  window.ceTrack = function () {};

  if (!SITE_CODE) return;
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return; // honour DNT
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:') return;

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.setAttribute('data-goatcounter', 'https://' + SITE_CODE + '.goatcounter.com/count');
  document.head.appendChild(s);

  // Named events (e.g. 'csv-loaded'). Names only — never attach user data.
  window.ceTrack = function (name) {
    try {
      if (window.goatcounter && window.goatcounter.count) {
        window.goatcounter.count({ path: name, title: name, event: true });
      }
    } catch (e) {}
  };
})();
