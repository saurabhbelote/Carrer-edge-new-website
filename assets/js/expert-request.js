/*
 * "Connect with an Expert" (pricing cards).
 *
 * Opens a form for name, email, phone and a resume file and sends it to the EdgeCareer API
 * (POST /expert-requests, multipart/form-data). The server checks everything again, stores the resume
 * privately and shows the request to the EdgeCareer team in the admin dashboard. No payment is involved,
 * and this file is independent of payments.js (Buy Now).
 *
 * Usage: <button type="button" onclick="openExpertRequest('pro-resume')">Connect with an Expert</button>
 * Needs assets/js/config.js (window.EDGECAREER_API).
 */
(function () {
  'use strict';

  var MAX_BYTES = 5 * 1024 * 1024; // keep in sync with the server (src/resume-upload.js)
  var TYPES = { pdf: 'PDF', doc: 'DOC', docx: 'DOCX', odt: 'ODT', rtf: 'RTF', txt: 'TXT' };
  var ACCEPT = '.pdf,.doc,.docx,.odt,.rtf,.txt,application/pdf,application/msword,' +
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,application/rtf,text/plain';
  var PLAN_NAMES = {
    'basic-resume': 'Basic Resume Plan',
    'pro-resume': 'Pro Resume Plan',
    'ultimate-career': 'Ultimate Career Plan',
    'linkedin-optimization': 'LinkedIn Optimization',
    'launch': 'LAUNCH',
    'pro-upgrade': 'Pro Upgrade',
    'ultimate-upgrade': 'Ultimate Upgrade'
  };
  var PAGES = { '': 'home', 'index': 'home', 'about': 'about', 'career-paths': 'career-paths', 'testimonials': 'testimonials', 'faq': 'faq', 'contact': 'contact' };
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  var overlay = null;
  var opener = null;
  var submitting = false;
  var draft = {}; // remembered for this page visit, so closing by mistake doesn't lose what was typed

  // ---------- helpers ----------

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function svgIcon(className, d) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('d', d);
    svg.appendChild(path);
    return svg;
  }

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    var b = window.crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function extensionOf(name) {
    var m = /\.([A-Za-z0-9]{1,10})$/.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }

  function fileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
    return (Math.round((bytes / 1048576) * 10) / 10) + ' MB';
  }

  function checkFile(file) {
    if (!file) return 'Please upload your resume.';
    if (!TYPES[extensionOf(file.name)]) return 'Please upload your resume as a PDF, DOC, DOCX, ODT, RTF or TXT file.';
    if (!file.size) return 'This file is empty. Please choose your resume file again.';
    if (file.size > MAX_BYTES) return 'This file is larger than 5 MB. Please upload a smaller file.';
    return '';
  }

  function pageName() {
    var file = window.location.pathname.split('/').pop().replace(/\.html?$/i, '').toLowerCase();
    return PAGES[file] || 'website';
  }

  // ---------- modal ----------

  function close() {
    if (!overlay || submitting) return;
    var node = overlay;
    overlay = null;
    document.removeEventListener('keydown', onKey);
    document.documentElement.style.overflow = '';
    node.classList.add('opacity-0');
    setTimeout(function () { node.remove(); }, 200);
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
  }

  function onKey(ev) {
    if (!overlay) return;
    if (ev.key === 'Escape') { close(); return; }
    if (ev.key !== 'Tab') return;
    // Keep keyboard focus inside the dialog.
    var focusable = Array.prototype.filter.call(
      overlay.querySelectorAll('button, input, select, textarea, a[href]'),
      function (n) { return !n.disabled && n.tabIndex !== -1 && n.offsetParent !== null; }
    );
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }

  function showModal(card) {
    if (overlay) { overlay.remove(); overlay = null; }
    var node = el('div', 'fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 opacity-0 transition-opacity duration-300');
    node.addEventListener('click', function (ev) { if (ev.target === node) close(); });
    card.className = 'relative bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl transform scale-95 transition-transform duration-300 max-h-[92vh] overflow-y-auto';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'ec-expert-title');
    node.appendChild(card);
    document.body.appendChild(node);
    overlay = node;
    document.addEventListener('keydown', onKey);
    document.documentElement.style.overflow = 'hidden';
    setTimeout(function () {
      node.classList.remove('opacity-0');
      card.classList.remove('scale-95');
    }, 10);
  }

  function closeButton() {
    var b = el('button', 'absolute top-4 right-4 w-9 h-9 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition-colors');
    b.type = 'button';
    b.setAttribute('aria-label', 'Close');
    b.appendChild(svgIcon('w-5 h-5', 'M6 18L18 6M6 6l12 12'));
    b.addEventListener('click', close);
    return b;
  }

  // ---------- form ----------

  function field(labelText, name, type, autocomplete, value, inputmode) {
    var wrap = el('label', 'block text-left');
    wrap.appendChild(el('span', 'block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1', labelText));
    // text-base on phones avoids the automatic zoom iOS applies to smaller inputs
    var input = el('input', 'w-full bg-gray-100 text-gray-800 text-base sm:text-sm px-4 py-3 rounded-xl border-none focus:ring-2 focus:ring-primary outline-none disabled:opacity-60');
    input.type = type;
    input.name = name;
    input.required = true;
    input.autocomplete = autocomplete;
    if (inputmode) input.inputMode = inputmode;
    if (value) input.value = value;
    wrap.appendChild(input);
    var error = el('span', 'hidden block text-xs text-red-500 mt-1');
    error.setAttribute('role', 'alert');
    wrap.appendChild(error);
    return { wrap: wrap, input: input, error: error };
  }

  function setError(f, message) {
    f.error.textContent = message || '';
    f.error.classList.toggle('hidden', !message);
    if (f.input) f.input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function openForm(planId) {
    var submissionKey = uuid(); // one key per opened form: double clicks and retries reuse the same request
    var planName = PLAN_NAMES[planId] || '';
    var chosen = draft.file || null;

    var card = el('div');
    card.appendChild(closeButton());
    var head = el('div', 'text-center mb-6 pr-6 pl-6');
    var badge = el('div', 'w-14 h-14 bg-[#ecfdf5] text-[#00b852] rounded-2xl flex items-center justify-center mx-auto mb-4');
    badge.appendChild(svgIcon('w-7 h-7', 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z'));
    head.appendChild(badge);
    var title = el('h3', 'text-2xl font-bold text-gray-900 mb-2', 'Connect with an Expert');
    title.id = 'ec-expert-title';
    head.appendChild(title);
    head.appendChild(el('p', 'text-gray-500 text-sm', 'Share your resume and an EdgeCareer expert will get in touch with you.'));
    if (planName) {
      var chip = el('span', 'inline-block mt-3 bg-gray-100 text-gray-600 text-xs font-semibold px-3 py-1 rounded-full', 'About: ' + planName);
      head.appendChild(chip);
    }
    card.appendChild(head);

    var form = el('form', 'space-y-4');
    form.noValidate = true;
    var name = field('Full name', 'name', 'text', 'name', draft.name);
    var email = field('Email address', 'email', 'email', 'email', draft.email, 'email');
    var phone = field('Phone number', 'phone', 'tel', 'tel', draft.phone, 'tel');
    [name, email, phone].forEach(function (f) { form.appendChild(f.wrap); });

    // ----- resume upload -----
    var upload = el('div', 'text-left');
    upload.appendChild(el('span', 'block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1', 'Upload resume'));
    var fileInput = el('input', 'sr-only');
    fileInput.type = 'file';
    fileInput.name = 'resume';
    fileInput.accept = ACCEPT;
    fileInput.id = 'ec-expert-file';

    var drop = el('label', 'flex flex-col items-center justify-center gap-1 text-center border-2 border-dashed border-gray-200 rounded-2xl px-4 py-5 cursor-pointer transition-colors hover:border-[#00b852] hover:bg-[#ecfdf5]/40 focus-within:border-[#00b852] focus-within:ring-2 focus-within:ring-primary');
    drop.htmlFor = 'ec-expert-file';
    drop.appendChild(svgIcon('w-8 h-8 text-[#00b852] mb-1', 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12'));
    var dropMain = el('span', 'text-sm font-semibold text-gray-800');
    dropMain.appendChild(document.createTextNode('Choose your resume'));
    dropMain.appendChild(el('span', 'hidden sm:inline font-normal text-gray-500', ' or drag it here'));
    drop.appendChild(dropMain);
    drop.appendChild(el('span', 'text-xs text-gray-400', 'PDF, DOC, DOCX, ODT, RTF or TXT · Max 5 MB'));
    drop.appendChild(fileInput);

    var chosenBox = el('div', 'hidden flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-3 py-3');
    var extBadge = el('span', 'shrink-0 w-11 h-11 rounded-xl bg-[#ecfdf5] text-[#00b852] text-[11px] font-extrabold flex items-center justify-center');
    var fileText = el('div', 'min-w-0 flex-1 text-left');
    var fileNameEl = el('p', 'text-sm font-semibold text-gray-800 truncate');
    var fileMeta = el('p', 'text-xs text-gray-500');
    fileText.appendChild(fileNameEl);
    fileText.appendChild(fileMeta);
    var replaceBtn = el('button', 'shrink-0 text-xs font-semibold text-[#00b852] hover:underline px-1 py-2 disabled:opacity-50', 'Replace');
    replaceBtn.type = 'button';
    var removeBtn = el('button', 'shrink-0 text-xs font-semibold text-gray-500 hover:text-red-500 px-1 py-2 disabled:opacity-50', 'Remove');
    removeBtn.type = 'button';
    chosenBox.appendChild(extBadge);
    chosenBox.appendChild(fileText);
    chosenBox.appendChild(replaceBtn);
    chosenBox.appendChild(removeBtn);

    var fileError = el('span', 'hidden block text-xs text-red-500 mt-1');
    fileError.setAttribute('role', 'alert');
    var fileField = { error: fileError, input: fileInput };
    upload.appendChild(drop);
    upload.appendChild(chosenBox);
    upload.appendChild(fileError);
    form.appendChild(upload);

    function showFile() {
      drop.classList.toggle('hidden', !!chosen);
      chosenBox.classList.toggle('hidden', !chosen);
      chosenBox.classList.toggle('flex', !!chosen);
      if (chosen) {
        extBadge.textContent = TYPES[extensionOf(chosen.name)] || 'FILE';
        fileNameEl.textContent = chosen.name;
        fileNameEl.title = chosen.name;
        fileMeta.textContent = fileSize(chosen.size) + ' · ready to upload';
      }
    }

    function pick(file) {
      if (!file) return;
      var problem = checkFile(file);
      setError(fileField, problem);
      if (problem) return; // keep the previous valid file, if any
      chosen = file;
      draft.file = file;
      showFile();
    }

    fileInput.addEventListener('change', function () {
      pick(fileInput.files && fileInput.files[0]);
      fileInput.value = ''; // lets the same file be picked again after "Remove"
    });
    replaceBtn.addEventListener('click', function () { fileInput.click(); });
    removeBtn.addEventListener('click', function () {
      chosen = null;
      draft.file = null;
      setError(fileField, '');
      showFile();
      fileInput.focus();
    });
    ['dragenter', 'dragover'].forEach(function (type) {
      drop.addEventListener(type, function (ev) {
        ev.preventDefault();
        drop.classList.add('border-[#00b852]', 'bg-[#ecfdf5]/40');
      });
    });
    ['dragleave', 'drop'].forEach(function (type) {
      drop.addEventListener(type, function (ev) {
        ev.preventDefault();
        drop.classList.remove('border-[#00b852]', 'bg-[#ecfdf5]/40');
      });
    });
    drop.addEventListener('drop', function (ev) {
      if (submitting) return;
      var files = ev.dataTransfer && ev.dataTransfer.files;
      if (files && files.length > 1) { setError(fileField, 'Please upload just one file.'); return; }
      pick(files && files[0]);
    });

    // Hidden from people; bots that fill every field give themselves away.
    var honeypot = el('input', 'hidden');
    honeypot.type = 'text';
    honeypot.name = 'website';
    honeypot.tabIndex = -1;
    honeypot.autocomplete = 'off';
    honeypot.setAttribute('aria-hidden', 'true');
    form.appendChild(honeypot);

    var formError = el('p', 'hidden text-sm text-red-500 text-center');
    formError.setAttribute('role', 'alert');
    form.appendChild(formError);

    var submit = el('button', 'w-full bg-[#00b852] text-white font-bold py-3 px-4 rounded-xl hover:bg-[#009c45] transition-colors shadow-lg disabled:opacity-70 disabled:cursor-wait', 'Submit Request');
    submit.type = 'submit';
    form.appendChild(submit);
    var cancel = el('button', 'w-full text-gray-500 font-semibold py-2 hover:text-gray-800', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', close);
    form.appendChild(cancel);
    form.appendChild(el('p', 'text-center text-xs text-gray-400', 'Your details and resume are shared only with the EdgeCareer team.'));
    card.appendChild(form);

    [name, email, phone].forEach(function (f) {
      f.input.addEventListener('input', function () {
        setError(f, '');
        draft[f.input.name] = f.input.value;
      });
    });

    function setBusy(busy, label) {
      submitting = busy;
      [name.input, email.input, phone.input, replaceBtn, removeBtn, cancel, fileInput].forEach(function (n) { n.disabled = busy; });
      drop.classList.toggle('pointer-events-none', busy);
      submit.disabled = busy;
      submit.textContent = label || 'Submit Request';
      submit.setAttribute('aria-busy', busy ? 'true' : 'false');
    }

    function showFailure(message) {
      setBusy(false);
      formError.textContent = message;
      formError.classList.remove('hidden');
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (submitting) return; // a second click while uploading does nothing
      var values = { name: name.input.value.trim(), email: email.input.value.trim(), phone: phone.input.value.trim() };
      setError(name, values.name.length < 2 ? 'Please enter your full name.' : '');
      setError(email, EMAIL_RE.test(values.email) ? '' : 'Please enter a valid email address.');
      setError(phone, values.phone.replace(/\D/g, '').length >= 10 ? '' : 'Please enter a valid phone number.');
      setError(fileField, checkFile(chosen));
      formError.classList.add('hidden');
      var firstBad = [name, email, phone, fileField].filter(function (f) { return !f.error.classList.contains('hidden'); })[0];
      if (firstBad) { (firstBad === fileField && chosen ? replaceBtn : firstBad.input).focus(); return; }
      if (!window.EDGECAREER_API) { showFailure('This form is not available right now. Please try again later.'); return; }

      var data = new FormData();
      data.append('name', values.name);
      data.append('email', values.email);
      data.append('phone', values.phone);
      if (PLAN_NAMES[planId]) data.append('planId', planId);
      data.append('page', pageName());
      data.append('submissionKey', submissionKey);
      data.append('website', honeypot.value);
      data.append('resume', chosen, chosen.name);

      setBusy(true, 'Uploading…');
      var xhr = new XMLHttpRequest();
      xhr.open('POST', window.EDGECAREER_API + '/expert-requests');
      xhr.timeout = 120000;
      xhr.upload.onprogress = function (e) {
        if (!e.lengthComputable) return;
        var pct = Math.min(100, Math.round((e.loaded / e.total) * 100));
        submit.textContent = pct < 100 ? 'Uploading… ' + pct + '%' : 'Saving…';
      };
      xhr.onload = function () {
        var res = {};
        try { res = JSON.parse(xhr.responseText || '{}'); } catch (e) { res = {}; }
        if ((xhr.status === 200 || xhr.status === 201) && res.received) {
          submitting = false;
          draft = {};
          showSuccess(values.name, res.requestId);
          return;
        }
        var fields = res.fields || {};
        setError(name, fields.name);
        setError(email, fields.email);
        setError(phone, fields.phone);
        setError(fileField, fields.resume);
        showFailure(res.error || 'Something went wrong. Please try again.');
      };
      xhr.onerror = function () { showFailure('Could not connect. Please check your internet connection and try again.'); };
      xhr.ontimeout = function () { showFailure('The upload took too long. Please check your connection and try again.'); };
      xhr.send(data);
    });

    showModal(card);
    showFile();
    // Focus right away (not on a timer) so it never steals focus from a field the visitor or autofill already started.
    var firstEmpty = [name.input, email.input, phone.input].filter(function (i) { return !i.value; })[0];
    if (!card.contains(document.activeElement)) (firstEmpty || (chosen ? submit : fileInput)).focus({ preventScroll: true });
  }

  function showSuccess(fullName, requestId) {
    var card = el('div');
    card.appendChild(closeButton());
    var icon = el('div', 'w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6');
    icon.appendChild(svgIcon('w-8 h-8', 'M5 13l4 4L19 7'));
    card.appendChild(icon);
    var title = el('h3', 'text-2xl font-bold text-center text-gray-900 mb-2', 'Request received!');
    title.id = 'ec-expert-title';
    card.appendChild(title);
    var first = fullName.split(' ')[0];
    card.appendChild(el('p', 'text-center text-gray-500 mb-4', 'Thank you, ' + first + '. An EdgeCareer expert will review your resume and contact you soon.'));
    if (requestId) {
      var ref = el('p', 'text-center text-sm text-gray-500 mb-8');
      ref.appendChild(document.createTextNode('Your request ID: '));
      ref.appendChild(el('span', 'font-mono font-bold text-gray-800', requestId));
      card.appendChild(ref);
    }
    var done = el('button', 'w-full bg-[#00b852] text-white font-bold py-3 px-4 rounded-xl hover:opacity-90 transition-opacity shadow-lg', 'Done');
    done.type = 'button';
    done.addEventListener('click', close);
    card.appendChild(done);
    showModal(card);
    done.focus({ preventScroll: true });
  }

  // ---------- public entry point (the "Connect with an Expert" buttons) ----------

  window.openExpertRequest = function (planId) {
    if (submitting) return;
    opener = document.activeElement;
    openForm(planId);
  };
})();
