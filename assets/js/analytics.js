/*
 * EdgeCareer built-in website analytics: privacy-friendly counters, shown only in the private admin dashboard.
 *
 * Sends ONLY: the event type (page view / Book Now click), the page name, the plan ID for Book Now, and
 * whether this is the browser's first page view today. No cookies, no IDs, no personal data; the server
 * stores counters, not visits. To know "first page view today", the browser remembers just the date of
 * its last visit (localStorage key "ec_last_visit_day"). "Do Not Track" and Global Privacy Control are respected.
 * Needs assets/js/config.js (window.EDGECAREER_API) to be loaded first.
 */
(function () {
  'use strict';

  var PAGES = { '': 'index', index: 'index', about: 'about', 'career-paths': 'career-paths', testimonials: 'testimonials', faq: 'faq', contact: 'contact' };
  var file = window.location.pathname.split('/').pop().replace(/\.html?$/i, '').toLowerCase();
  var page = Object.prototype.hasOwnProperty.call(PAGES, file) ? PAGES[file] : null;
  var optedOut = navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  var KEY = 'ec_last_visit_day';

  function istDay() { return new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10); }

  function send(event) {
    if (optedOut || !page || !window.EDGECAREER_API) return;
    event.page = page;
    var url = window.EDGECAREER_API + '/track';
    var body = JSON.stringify(event);
    // text/plain keeps this a "simple" request: no extra CORS preflight per page view.
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return;
    } catch (e) { /* fall back to fetch */ }
    try {
      fetch(url, { method: 'POST', body: body, headers: { 'Content-Type': 'text/plain' }, keepalive: true, credentials: 'omit' })
        .catch(function () { /* analytics must never affect the page */ });
    } catch (e) { /* ignore */ }
  }

  /** Called by payments.js when a Book Now button is clicked for a valid plan. */
  window.edgecareerTrack = function (type, data) {
    if (type === 'book_now' && data && typeof data.planId === 'string') send({ type: 'book_now', planId: data.planId });
  };

  if (optedOut || !page) return;
  var firstToday = false;
  try {
    var today = istDay();
    firstToday = window.localStorage.getItem(KEY) !== today;
    window.localStorage.setItem(KEY, today);
  } catch (e) {
    firstToday = false; // storage blocked: count the page view, but not as a new visitor (never over-count)
  }
  send({ type: 'pageview', newVisitor: firstToday });
})();
