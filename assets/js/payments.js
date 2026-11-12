/*
 * EdgeCareer checkout.
 *
 * The page only says WHICH plan was chosen. The server (edgecareerApi) decides
 * the price, creates the Razorpay order, and verifies the payment afterwards,
 * so changing anything in the browser cannot change what the customer pays.
 *
 * Usage: <button onclick="openRazorpay('pro-upgrade')">Book Now</button>
 */
(function () {
  'use strict';

  // Display names only. Prices come from the server.
  var PLAN_NAMES = {
    'basic-resume': 'Basic Resume Plan',
    'pro-resume': 'Pro Resume Plan',
    'ultimate-career': 'Ultimate Career Plan',
    'linkedin-optimization': 'LinkedIn Optimization',
    'launch': 'LAUNCH',
    'pro-upgrade': 'Pro Upgrade',
    'ultimate-upgrade': 'Ultimate Upgrade'
  };

  var busy = false;
  var lastDetails = null; // remembered for this page visit only, so a retry doesn't mean retyping
  var openModal = null;

  // ---------- helpers ----------

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    var b = window.crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function post(path, body) {
    return fetch(window.EDGECAREER_API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function closeModal() {
    if (!openModal) return;
    var node = openModal;
    openModal = null;
    document.removeEventListener('keydown', onEscape);
    node.classList.add('opacity-0');
    setTimeout(function () { node.remove(); }, 200);
  }

  function onEscape(ev) {
    if (ev.key === 'Escape' && openModal && openModal.getAttribute('data-closable') === 'true') closeModal();
  }

  /** Same look as the site's existing payment pop-up. */
  function showModal(card, closable) {
    if (openModal) { openModal.remove(); openModal = null; }
    var overlay = el('div', 'fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm opacity-0 transition-opacity duration-300');
    overlay.setAttribute('data-closable', closable ? 'true' : 'false');
    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay && overlay.getAttribute('data-closable') === 'true') closeModal();
    });
    card.className = 'bg-white rounded-3xl p-8 max-w-sm w-full mx-4 shadow-2xl transform scale-95 transition-transform duration-300 max-h-[90vh] overflow-y-auto';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    openModal = overlay;
    document.addEventListener('keydown', onEscape);
    setTimeout(function () {
      overlay.classList.remove('opacity-0');
      card.classList.remove('scale-95');
    }, 10);
    return overlay;
  }

  var ICONS = {
    success: { bg: 'bg-green-100', color: 'text-green-500', path: 'M5 13l4 4L19 7' },
    error: { bg: 'bg-red-100', color: 'text-red-500', path: 'M6 18L18 6M6 6l12 12' },
    pending: { bg: 'bg-amber-100', color: 'text-amber-500', path: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' }
  };

  function icon(kind) {
    var spec = ICONS[kind];
    var wrap = el('div', 'w-16 h-16 ' + spec.bg + ' rounded-full flex items-center justify-center mx-auto mb-6');
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'w-8 h-8 ' + spec.color + (kind === 'loading' ? ' animate-spin' : ''));
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('viewBox', '0 0 24 24');
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-width', '3');
    path.setAttribute('d', spec.path);
    svg.appendChild(path);
    wrap.appendChild(svg);
    return wrap;
  }

  /** kind: 'success' | 'error' | 'pending' | 'loading'. All text is set with textContent. */
  function showResult(kind, title, message) {
    var card = el('div');
    if (kind === 'loading') {
      var spinner = el('div', 'w-16 h-16 mx-auto mb-6 rounded-full border-4 border-green-100 border-t-[#00b852] animate-spin');
      card.appendChild(spinner);
    } else {
      card.appendChild(icon(kind));
    }
    card.appendChild(el('h3', 'text-2xl font-bold text-center text-gray-900 mb-2', title));
    card.appendChild(el('p', 'text-center text-gray-500' + (kind === 'loading' ? '' : ' mb-8'), message));
    if (kind !== 'loading') {
      var button = el('button',
        'w-full ' + (kind === 'success' ? 'bg-[#00b852]' : kind === 'error' ? 'bg-red-500' : 'bg-gray-800') +
        ' text-white font-bold py-3 px-4 rounded-xl hover:opacity-90 transition-opacity shadow-lg',
        kind === 'success' ? 'Awesome!' : 'Close');
      button.type = 'button';
      button.addEventListener('click', closeModal);
      card.appendChild(button);
    }
    showModal(card, kind !== 'loading');
  }

  // ---------- step 1: customer details ----------

  function field(labelText, name, type, autocomplete, value, inputmode) {
    var wrap = el('label', 'block text-left');
    wrap.appendChild(el('span', 'block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1', labelText));
    var input = el('input', 'w-full bg-gray-100 text-gray-800 text-sm px-4 py-3 rounded-xl border-none focus:ring-2 focus:ring-primary outline-none');
    input.type = type;
    input.name = name;
    input.required = true;
    input.autocomplete = autocomplete;
    if (inputmode) input.inputMode = inputmode;
    if (value) input.value = value;
    wrap.appendChild(input);
    var error = el('span', 'hidden text-xs text-red-500 mt-1');
    wrap.appendChild(error);
    return { wrap: wrap, input: input, error: error };
  }

  function openDetailsForm(planId) {
    var idempotencyKey = uuid(); // one key per form: double clicks and retries reuse the same order
    var d = lastDetails || {};
    var card = el('div');
    card.appendChild(el('h3', 'text-2xl font-bold text-center text-gray-900 mb-2', 'Book ' + PLAN_NAMES[planId]));
    card.appendChild(el('p', 'text-center text-gray-500 text-sm mb-6', 'Enter your details so we can confirm your booking and reach you.'));

    var form = el('form', 'space-y-4');
    form.noValidate = true;
    var name = field('Full name', 'name', 'text', 'name', d.name);
    var email = field('Email', 'email', 'email', 'email', d.email, 'email');
    var phone = field('Mobile number', 'phone', 'tel', 'tel', d.phone, 'tel');
    [name, email, phone].forEach(function (f) { form.appendChild(f.wrap); });
    var formError = el('p', 'hidden text-sm text-red-500 text-center');
    form.appendChild(formError);

    var submit = el('button', 'w-full bg-[#00b852] text-white font-bold py-3 px-4 rounded-xl hover:opacity-90 transition-opacity shadow-lg disabled:opacity-60', 'Continue to payment');
    submit.type = 'submit';
    form.appendChild(submit);
    var cancel = el('button', 'w-full text-gray-500 font-semibold py-2 hover:text-gray-800', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', closeModal);
    form.appendChild(cancel);
    form.appendChild(el('p', 'text-center text-xs text-gray-400', 'Payments are processed securely by Razorpay.'));
    card.appendChild(form);

    function setError(f, message) {
      f.error.textContent = message || '';
      f.error.classList.toggle('hidden', !message);
    }
    [name, email, phone].forEach(function (f) {
      f.input.addEventListener('input', function () { setError(f, ''); });
    });

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var values = { name: name.input.value.trim(), email: email.input.value.trim(), phone: phone.input.value.trim() };
      setError(name, values.name.length < 2 ? 'Please enter your full name.' : '');
      setError(email, /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email) ? '' : 'Please enter a valid email address.');
      setError(phone, values.phone.replace(/\D/g, '').length >= 10 ? '' : 'Please enter a valid mobile number.');
      formError.classList.add('hidden');
      var firstBad = [name, email, phone].filter(function (f) { return !f.error.classList.contains('hidden'); })[0];
      if (firstBad) { firstBad.input.focus(); return; }

      submit.disabled = true;
      submit.textContent = 'Please wait…';
      post('/create-order', { planId: planId, customer: values, idempotencyKey: idempotencyKey })
        .then(function (r) {
          if (!r.ok) {
            var fields = (r.data && r.data.fields) || {};
            setError(name, fields.name);
            setError(email, fields.email);
            setError(phone, fields.phone);
            formError.textContent = (r.data && r.data.error) || 'Could not start the payment. Please try again.';
            formError.classList.remove('hidden');
            submit.disabled = false;
            submit.textContent = 'Continue to payment';
            return;
          }
          lastDetails = values;
          closeModal();
          startCheckout(r.data);
        })
        .catch(function () {
          formError.textContent = 'Could not connect. Please check your internet connection and try again.';
          formError.classList.remove('hidden');
          submit.disabled = false;
          submit.textContent = 'Continue to payment';
        });
    });

    showModal(card, true);
    // Focus right away (not on a timer) so it can never steal focus from a field the
    // visitor or a password manager has already started filling.
    if (!card.contains(document.activeElement)) (d.name ? submit : name.input).focus({ preventScroll: true });
  }

  // ---------- step 2: Razorpay checkout ----------

  function startCheckout(order) {
    busy = true;
    var lastFailure = null;
    var rzp = new window.Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: 'EdgeCareer',
      description: order.planName,
      order_id: order.orderId,
      prefill: order.prefill,
      theme: { color: '#00b852' },
      handler: function (response) {
        verifyPayment(order, response);
      },
      modal: {
        ondismiss: function () {
          busy = false;
          if (lastFailure) {
            showResult('error', 'Payment Failed', lastFailure + ' You can try again with another payment method.');
          }
        }
      }
    });

    rzp.on('payment.failed', function (response) {
      var err = (response && response.error) || {};
      lastFailure = err.description || 'The payment did not go through.';
      var meta = err.metadata || {};
      // Lets the server record the failed attempt (it re-checks the payment with Razorpay).
      if (meta.payment_id) {
        post('/payment-failed', {
          razorpay_order_id: meta.order_id || order.orderId,
          razorpay_payment_id: meta.payment_id
        }).catch(function () {});
      }
    });

    rzp.open();
  }

  // ---------- step 3: server-side verification ----------

  function verifyPayment(order, response) {
    showResult('loading', 'Confirming your payment…', 'Please don’t close or refresh this page.');
    post('/verify-payment', {
      razorpay_order_id: response.razorpay_order_id,
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_signature: response.razorpay_signature
    })
      .then(function (r) {
        var data = r.data || {};
        if (r.ok && data.verified) {
          showResult('success', 'Payment Successful!', 'Your ' + order.planName + ' is confirmed. We will reach out to you shortly.');
        } else if (data.status === 'pending' || data.status === 'review') {
          showResult('pending', 'Payment received', data.message || data.error || 'We are confirming your payment. Our team will reach out to you shortly.');
        } else {
          showResult('error', 'Verification Failed', data.error || 'We could not verify this payment. If money was deducted, please contact us.');
        }
      })
      .catch(function () {
        showResult('pending', 'Payment received', 'We could not confirm your payment right now. If money was deducted, it is safe and our team will reach out to you shortly.');
      })
      .then(function () { busy = false; });
  }

  // ---------- public entry point (used by the Book Now buttons) ----------

  window.openRazorpay = function (planId) {
    if (busy) return;
    if (!Object.prototype.hasOwnProperty.call(PLAN_NAMES, planId)) {
      showResult('error', 'Something went wrong', 'Please refresh the page and try again.');
      return;
    }
    // Anonymous Book Now counter for the admin dashboard (assets/js/analytics.js). Never blocks booking.
    try { if (typeof window.edgecareerTrack === 'function') window.edgecareerTrack('book_now', { planId: planId }); } catch (e) { /* ignore */ }
    if (typeof window.Razorpay !== 'function' || !window.EDGECAREER_API) {
      showResult('error', 'Payment unavailable', 'The payment window could not load. Please check your connection and refresh the page.');
      return;
    }
    openDetailsForm(planId);
  };
})();
