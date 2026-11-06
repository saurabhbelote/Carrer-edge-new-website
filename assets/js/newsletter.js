/*
 * Makes every "Subscribe To Our Newsletter" form save the email through the
 * EdgeCareer API. Forms opt in with the data-newsletter attribute.
 */
(function () {
  'use strict';

  var SOURCES = {
    '': 'home',
    'index': 'home',
    'about': 'about',
    'career-paths': 'career-paths',
    'testimonials': 'testimonials',
    'faq': 'faq',
    'contact': 'contact'
  };

  function pageSource() {
    var file = window.location.pathname.split('/').pop().replace(/\.html$/, '');
    return SOURCES[file] || 'website';
  }

  function setStatus(node, message, isError) {
    node.textContent = message;
    node.classList.remove('text-red-500', 'text-[#00b852]');
    node.classList.add(isError ? 'text-red-500' : 'text-[#00b852]');
  }

  function bind(form) {
    var input = form.querySelector('input[type="email"]');
    var button = form.querySelector('button[type="submit"]');
    var honeypot = form.querySelector('input[name="website"]');
    if (!input || !button) return;

    var status = document.createElement('p');
    status.className = 'text-xs font-medium mt-2 min-h-[1rem]';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    form.insertAdjacentElement('afterend', status);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var email = input.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        setStatus(status, 'Please enter a valid email address.', true);
        input.focus();
        return;
      }
      if (!window.EDGECAREER_API) {
        setStatus(status, 'Could not subscribe right now. Please try again later.', true);
        return;
      }
      var label = button.textContent;
      button.disabled = true;
      button.textContent = 'Subscribing…';
      fetch(window.EDGECAREER_API + '/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, source: pageSource(), website: honeypot ? honeypot.value : '' })
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            if (res.ok) {
              setStatus(status, 'Thanks! You’re subscribed.', false);
              form.reset();
            } else {
              setStatus(status, data.error || 'Could not subscribe. Please try again.', true);
            }
          });
        })
        .catch(function () {
          setStatus(status, 'Could not connect. Please check your internet connection and try again.', true);
        })
        .then(function () {
          button.disabled = false;
          button.textContent = label;
        });
    });
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('form[data-newsletter]'), bind);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
