/**
 * Lead intake for Austin Tx HVAC Repair → TradeDeskPro /api/leads.
 * Modeled on houstontxhvacrepair/js/leads.js. No client secrets.
 */
(function () {
  var API_URL = 'https://www.tradedeskpro.com/api/leads';
  var PROFILE_ID = '63e7470e-fe1e-4367-aae0-56d0d6392d78';
  var SOURCE = 'austintxhvacrepair.com';
  var PHONE_FALLBACK = '(737) 372-6333';
  var MIN_FILL_MS = 3000;
  var SUCCESS_TEXT = "Request received. We'll be in touch soon.";
  var loadedAt = Date.now();

  function loadAttribution() {
    if (typeof document === 'undefined') return;
    if (window.__tdpLeadAttribution) return;
    if (document.querySelector('script[src*="tdp-lead-attribution.js"]')) return;
    var s = document.createElement('script');
    s.src = 'https://www.tradedeskpro.com/js/tdp-lead-attribution.js';
    s.defer = true;
    (document.head || document.documentElement).appendChild(s);
  }

  function val(form, name) {
    var el = form.querySelector('[name="' + name + '"]');
    if (!el || el.value == null) return '';
    return String(el.value).trim();
  }

  function buildMessage(fields) {
    var lines = [];
    if (fields.service) lines.push('Service: ' + fields.service);
    if (fields.area) lines.push('Area: ' + fields.area);
    if (fields.details) lines.push(fields.details);
    if (fields.message) lines.push(fields.message);
    return lines.join('\n');
  }

  function readFields(form) {
    return {
      name: val(form, 'name'),
      phone: val(form, 'phone'),
      email: val(form, 'email'),
      service: val(form, 'service'),
      area: val(form, 'area'),
      details: val(form, 'details'),
      message: val(form, 'message'),
      company_website: val(form, 'company_website'),
    };
  }

  function collectContext() {
    var ctx = {};
    var keys = ['landing_url', 'first_touch_url', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    try {
      if (typeof window.tdpLeadAttribution === 'function') {
        var extra = window.tdpLeadAttribution() || {};
        for (var i = 0; i < keys.length; i++) {
          if (extra[keys[i]]) ctx[keys[i]] = extra[keys[i]];
        }
      }
    } catch (e) {}
    try {
      if (!ctx.landing_url && window.location && window.location.href) {
        ctx.landing_url = window.location.href;
      }
      var params = new URLSearchParams(window.location.search || '');
      for (var j = 0; j < keys.length; j++) {
        if (keys[j] === 'landing_url' || keys[j] === 'first_touch_url' || ctx[keys[j]]) continue;
        var v = params.get(keys[j]);
        if (v) ctx[keys[j]] = v;
      }
    } catch (e2) {}
    return ctx;
  }

  function buildPayload(fields, ctx) {
    ctx = ctx || {};
    var body = {
      name: fields.name || '',
      profile_id: PROFILE_ID,
      source: SOURCE,
    };
    if (fields.phone) body.phone = fields.phone;
    if (fields.email) body.email = fields.email;
    var message = buildMessage(fields);
    if (message) body.message = message;
    if (ctx.landing_url) body.landing_url = ctx.landing_url;
    if (ctx.first_touch_url) body.first_touch_url = ctx.first_touch_url;
    var utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    for (var i = 0; i < utmKeys.length; i++) {
      if (ctx[utmKeys[i]]) body[utmKeys[i]] = ctx[utmKeys[i]];
    }
    return body;
  }

  function friendlyError(status) {
    if (status === 429) {
      return "We're getting a lot of requests right now. Please call " + PHONE_FALLBACK + " and we'll help right away.";
    }
    if (status === 403) {
      return "We couldn't send that from this page. Please call " + PHONE_FALLBACK + " and we'll help right away.";
    }
    return "We couldn't send your request. Please call " + PHONE_FALLBACK + " and we'll help right away.";
  }

  function messageForResult(result) {
    var status = result && result.status;
    if (status === 201 || status === 202 || (status >= 200 && status < 300)) {
      return { ok: true, text: SUCCESS_TEXT };
    }
    return { ok: false, text: friendlyError(status) };
  }

  function shouldDrop(companyWebsite, elapsedMs) {
    if (companyWebsite && String(companyWebsite).trim()) return true;
    if (elapsedMs < MIN_FILL_MS) return true;
    return false;
  }

  async function submitLead(payload) {
    var res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    var data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    return { status: res.status, ok: res.status >= 200 && res.status < 300, data: data };
  }

  function showStatus(form, text, ok) {
    var el = form.querySelector('.form-status');
    if (!el) {
      el = document.createElement('p');
      el.className = 'form-status';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      form.appendChild(el);
    }
    el.className = 'form-status ' + (ok ? 'is-success' : 'is-error');
    el.textContent = text;
    el.hidden = false;
  }

  function ensureHoneypot(form) {
    if (form.querySelector('[name="company_website"]')) return;
    var wrap = document.createElement('div');
    wrap.className = 'hp-field';
    wrap.setAttribute('aria-hidden', 'true');
    var label = document.createElement('label');
    label.textContent = 'Company website';
    var input = document.createElement('input');
    input.type = 'text';
    input.name = 'company_website';
    input.tabIndex = -1;
    input.autocomplete = 'off';
    label.appendChild(input);
    wrap.appendChild(label);
    form.insertBefore(wrap, form.firstChild);
  }

  function wireForm(form) {
    if (!form || form.dataset.tdpWired === '1') return;
    form.dataset.tdpWired = '1';
    form.removeAttribute('action');
    form.setAttribute('method', 'post');
    ensureHoneypot(form);

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var fields = readFields(form);
      if (shouldDrop(fields.company_website, Date.now() - loadedAt)) {
        showStatus(form, SUCCESS_TEXT, true);
        form.reset();
        return;
      }

      var btn = form.querySelector('button[type="submit"], button:not([type])');
      var original = btn ? btn.textContent : '';
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sending...';
      }

      try {
        var result = await submitLead(buildPayload(fields, collectContext()));
        var msg = messageForResult(result);
        showStatus(form, msg.text, msg.ok);
        if (msg.ok) form.reset();
      } catch (err) {
        showStatus(form, friendlyError(0), false);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = original;
        }
      }
    });
  }

  function init() {
    loadAttribution();
    var forms = document.querySelectorAll('form.lead-form');
    for (var i = 0; i < forms.length; i++) wireForm(forms[i]);
  }

  function setLoadedAt(ts) {
    loadedAt = ts;
  }

  var api = {
    API_URL: API_URL,
    PROFILE_ID: PROFILE_ID,
    SOURCE: SOURCE,
    PHONE_FALLBACK: PHONE_FALLBACK,
    SUCCESS_TEXT: SUCCESS_TEXT,
    buildMessage: buildMessage,
    buildPayload: buildPayload,
    messageForResult: messageForResult,
    shouldDrop: shouldDrop,
    submitLead: submitLead,
    wireForm: wireForm,
    setLoadedAt: setLoadedAt,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (typeof document === 'undefined') return;

  if (document.readyState === 'complete') {
    loadedAt = Date.now();
  } else if (typeof window !== 'undefined') {
    window.addEventListener('load', function () {
      loadedAt = Date.now();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
