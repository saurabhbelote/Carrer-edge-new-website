/*
 * Where the EdgeCareer API lives.
 * - On edgecareer.in → the edgecareerApi Cloud Function.
 * - On localhost (Live Server / any local server) → the local function from `npm run dev` / `npm run demo`.
 *   For a test-mode rehearsal against the deployed function, run in the browser console on localhost:
 *     localStorage.setItem('EDGECAREER_API', 'https://asia-south1-jobform-automator-website.cloudfunctions.net/edgecareerApi')
 *   (The override is ignored on the public site, so nobody can redirect real visitors.)
 */
(function () {
  'use strict';
  var PRODUCTION = 'https://asia-south1-jobform-automator-website.cloudfunctions.net/edgecareerApi';
  var host = window.location.hostname;
  var isLocal = host === 'localhost' || host === '127.0.0.1';
  var api = PRODUCTION;
  if (isLocal) {
    api = 'http://localhost:8080';
    try {
      var override = window.localStorage.getItem('EDGECAREER_API');
      if (override && /^https:\/\/[a-z0-9.-]+\.(cloudfunctions\.net|run\.app)\/?[\w/-]*$/i.test(override)) api = override.replace(/\/$/, '');
    } catch (e) { /* storage unavailable: use the local default */ }
  }
  window.EDGECAREER_API = api;
})();
