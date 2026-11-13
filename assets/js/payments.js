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

  // Resume plans ("Buy Now") get an optional resume upload in the details form. Career-path plans don't.
  var RESUME_PLANS = { 'basic-resume': true, 'pro-resume': true, 'ultimate-career': true, 'linkedin-optimization': true };
  var RESUME_MAX_BYTES = 5 * 1024 * 1024; // same limit as the server
  var RESUME_TYPES = { pdf: 'PDF', doc: 'DOC', docx: 'DOCX', odt: 'ODT', rtf: 'RTF', txt: 'TXT' };
  var RESUME_ACCEPT = '.pdf,.doc,.docx,.odt,.rtf,.txt,application/pdf,application/msword,' +
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,application/rtf,text/plain';

  var busy = false;
  var lastResume = null; // the resume chosen on this page visit, so a retry doesn't mean choosing it again
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

  // ---------- optional resume (resume plans only) ----------

  function resumeExtension(name) {
    var m = /\.([A-Za-z0-9]{1,10})$/.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }

  function resumeSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
    return (Math.round((bytes / 1048576) * 10) / 10) + ' MB';
  }

  function checkResume(file) {
    if (!RESUME_TYPES[resumeExtension(file.name)]) return 'Please upload your resume as a PDF, DOC, DOCX, ODT, RTF or TXT file.';
    if (!file.size) return 'This file is empty. Please choose your resume file again.';
    if (file.size > RESUME_MAX_BYTES) return 'This file is larger than 5 MB. Please upload a smaller file.';
    return '';
  }

  /** Adds the resume to the order just created. The checkout key proves this browser created the order. */
  function uploadResume(orderId, idempotencyKey, file, onProgress) {
    return new Promise(function (resolve, reject) {
      var data = new FormData();
      data.append('orderId', orderId);
      data.append('idempotencyKey', idempotencyKey);
      data.append('resume', file, file.name);
      var xhr = new XMLHttpRequest();
      xhr.open('POST', window.EDGECAREER_API + '/order-resume');
      xhr.timeout = 120000;
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      };
      xhr.onload = function () {
        var res = {};
        try { res = JSON.parse(xhr.responseText || '{}'); } catch (e) { res = {}; }
        if (xhr.status === 200 && res.attached) { resolve(res); return; }
        var err = new Error(res.error || 'Could not upload your resume. Please try again.');
        err.fields = res.fields || {};
        reject(err);
      };
      xhr.onerror = function () { reject(new Error('Could not upload your resume. Please check your connection and try again, or remove the file to continue without it.')); };
      xhr.ontimeout = function () { reject(new Error('The resume upload took too long. Please try again, or remove the file to continue without it.')); };
      xhr.send(data);
    });
  }

  /** "Upload resume (optional)": choose, replace or remove one file. Same look as the other fields. */
  function resumeField(initialFile) {
    var state = { file: null };
    var wrap = el('div', 'block text-left');
    wrap.appendChild(el('span', 'block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1', 'Upload resume (optional)'));

    var input = el('input', 'sr-only');
    input.type = 'file';
    input.name = 'resume';
    input.accept = RESUME_ACCEPT;
    input.id = 'ec-buy-resume';

    var picker = el('label', 'flex items-center gap-3 w-full bg-gray-100 text-gray-600 text-sm px-4 py-3 rounded-xl cursor-pointer hover:bg-gray-200 transition-colors focus-within:ring-2 focus-within:ring-primary');
    picker.htmlFor = input.id;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'w-5 h-5 text-[#00b852] shrink-0');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('d', 'M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12l-4 4m4-4l4 4');
    svg.appendChild(path);
    picker.appendChild(svg);
    picker.appendChild(el('span', 'flex-1 font-semibold', 'Choose a file'));
    picker.appendChild(el('span', 'text-[11px] text-gray-400 text-right', 'PDF, DOC, DOCX, ODT, RTF, TXT · max 5 MB'));
    picker.appendChild(input);

    var chosen = el('div', 'hidden items-center gap-3 w-full bg-gray-100 px-4 py-3 rounded-xl');
    var badge = el('span', 'shrink-0 bg-white text-[#00b852] text-[10px] font-extrabold px-2 py-1 rounded-md');
    var info = el('div', 'min-w-0 flex-1');
    var fileName = el('p', 'text-sm font-semibold text-gray-800 truncate');
    var fileMeta = el('p', 'text-xs text-gray-500');
    info.appendChild(fileName);
    info.appendChild(fileMeta);
    var replace = el('button', 'shrink-0 text-xs font-semibold text-[#00b852] hover:underline px-1 py-1 disabled:opacity-50', 'Replace');
    replace.type = 'button';
    var remove = el('button', 'shrink-0 text-xs font-semibold text-gray-500 hover:text-red-500 px-1 py-1 disabled:opacity-50', 'Remove');
    remove.type = 'button';
    chosen.appendChild(badge);
    chosen.appendChild(info);
    chosen.appendChild(replace);
    chosen.appendChild(remove);

    var error = el('span', 'hidden text-xs text-red-500 mt-1');
    error.setAttribute('role', 'alert');
    wrap.appendChild(picker);
    wrap.appendChild(chosen);
    wrap.appendChild(error);

    function setError(message) {
      error.textContent = message || '';
      error.classList.toggle('hidden', !message);
    }
    function show() {
      picker.classList.toggle('hidden', !!state.file);
      chosen.classList.toggle('hidden', !state.file);
      chosen.classList.toggle('flex', !!state.file);
      if (state.file) {
        badge.textContent = RESUME_TYPES[resumeExtension(state.file.name)] || 'FILE';
        fileName.textContent = state.file.name;
        fileName.title = state.file.name;
        fileMeta.textContent = resumeSize(state.file.size);
      }
    }
    function choose(file) {
      if (!file) return;
      var problem = checkResume(file);
      setError(problem);
      if (problem) return; // keep the previous valid file, if any
      state.file = file;
      show();
    }
    input.addEventListener('change', function () {
      choose(input.files && input.files[0]);
      input.value = ''; // lets the same file be chosen again after "Remove"
    });
    replace.addEventListener('click', function () { input.click(); });
    remove.addEventListener('click', function () {
      state.file = null;
      setError('');
      show();
      input.focus();
    });
    if (initialFile && !checkResume(initialFile)) state.file = initialFile;
    show();

    state.wrap = wrap;
    state.setError = setError;
    state.hasError = function () { return !error.classList.contains('hidden'); };
    state.focus = function () { (state.file ? replace : input).focus(); };
    state.setDisabled = function (disabled) {
      input.disabled = disabled;
      replace.disabled = disabled;
      remove.disabled = disabled;
      picker.classList.toggle('pointer-events-none', disabled);
    };
    return state;
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
    var created = null; // { order, values } once /create-order succeeded (kept if the resume upload then fails)
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
    var resume = RESUME_PLANS[planId] ? resumeField(lastResume) : null;
    if (resume) form.appendChild(resume.wrap);
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
      if (resume) resume.setError(resume.file ? checkResume(resume.file) : ''); // optional: no file is fine
      formError.classList.add('hidden');
      var firstBad = [name, email, phone].filter(function (f) { return !f.error.classList.contains('hidden'); })[0];
      if (firstBad) { firstBad.input.focus(); return; }
      if (resume && resume.hasError()) { resume.focus(); return; }
      if (submit.disabled) return;

      function ready() {
        if (resume) resume.setDisabled(false);
        submit.disabled = false;
        submit.textContent = 'Continue to payment';
      }
      function goToCheckout(order) {
        lastDetails = values;
        if (resume) lastResume = resume.file;
        closeModal();
        startCheckout(order);
      }

      submit.disabled = true;
      submit.textContent = 'Please wait…';
      if (resume) resume.setDisabled(true);
      // The order already exists if only the resume upload failed before: reuse it, unless the details were changed.
      var sameDetails = created && created.values.name === values.name && created.values.email === values.email && created.values.phone === values.phone;
      if (created && !sameDetails) idempotencyKey = uuid();
      var orderStep = sameDetails
        ? Promise.resolve({ ok: true, data: created.order })
        : post('/create-order', { planId: planId, customer: values, idempotencyKey: idempotencyKey });
      orderStep
        .then(function (r) {
          if (!r.ok) {
            var fields = (r.data && r.data.fields) || {};
            setError(name, fields.name);
            setError(email, fields.email);
            setError(phone, fields.phone);
            formError.textContent = (r.data && r.data.error) || 'Could not start the payment. Please try again.';
            formError.classList.remove('hidden');
            ready();
            return;
          }
          created = { order: r.data, values: values };
          var file = resume && resume.file;
          if (!file) { goToCheckout(r.data); return; } // no resume: exactly the previous flow
          submit.textContent = 'Uploading resume…';
          return uploadResume(r.data.orderId, idempotencyKey, file, function (pct) {
            submit.textContent = pct < 100 ? 'Uploading resume… ' + pct + '%' : 'Saving resume…';
          }).then(function () {
            goToCheckout(r.data);
          }, function (err) {
            if (err.fields && err.fields.resume) resume.setError(err.fields.resume);
            formError.textContent = err.fields && err.fields.resume
              ? 'Please choose another file, or remove it to continue without a resume.'
              : err.message;
            formError.classList.remove('hidden');
            ready();
          });
        })
        .catch(function () {
          formError.textContent = 'Could not connect. Please check your internet connection and try again.';
          formError.classList.remove('hidden');
          ready();
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
