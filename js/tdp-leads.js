/**
 * Lead intake for Austin Tx HVAC Repair → TradeDeskPro /api/leads.
 * Modeled on houstontxhvacrepair/js/leads.js. No client secrets.
 *
 * Success is shown only after a 2xx response that confirms the lead was saved.
 * A honeypot fill is not posted. There is no client timing gate: a fast
 * visitor is a real visitor, and the request is sent.
 */
(function () {
  var API_URL = 'https://www.tradedeskpro.com/api/leads';
  var PROFILE_ID = '63e7470e-fe1e-4367-aae0-56d0d6392d78';
  var SOURCE = 'austintxhvacrepair.com';
  var PHONE_FALLBACK = '(737) 372-6333';
  var SUCCESS_TEXT = "Request received. We'll be in touch soon.";
  var ZIP_RE = /^\d{5}(?:-\d{4})?$/;

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

  function locationParts(fields) {
    var zip = '';
    var town = '';
    if (fields.zip && ZIP_RE.test(fields.zip)) zip = fields.zip;
    if (!zip && fields.town_zip && ZIP_RE.test(fields.town_zip)) zip = fields.town_zip;
    if (fields.town && !ZIP_RE.test(fields.town)) town = fields.town;
    else if (fields.town_zip && !ZIP_RE.test(fields.town_zip)) town = fields.town_zip;
    else if (fields.area && !ZIP_RE.test(fields.area)) town = fields.area;
    return {
      town: town,
      zip: zip,
      label: fields.town_zip || fields.area || fields.town || fields.zip || '',
    };
  }

  function buildMessage(fields) {
    var lines = [];
    if (fields.service) lines.push('Service: ' + fields.service);
    if (fields.area) lines.push('Area: ' + fields.area);
    if (fields.town_zip && fields.town_zip !== fields.area) lines.push('Town or ZIP: ' + fields.town_zip);
    if (!fields.area && !fields.town_zip && (fields.town || fields.zip)) {
      lines.push('Town or ZIP: ' + (fields.town || fields.zip));
    }
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
      town: val(form, 'town'),
      zip: val(form, 'zip'),
      town_zip: val(form, 'town_zip'),
      details: val(form, 'details'),
      message: val(form, 'message'),
      company_website: val(form, 'company_website'),
    };
  }

  function collectContext() {
    var ctx = {};
    var keys = ['landing_url', 'first_touch_url', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    try {
      if (typeof window.tdpLeadAttribution === 'function') {
        var extra = window.tdpLeadAttribution() || {};
        for (var i = 0; i < keys.length; i++) {
          if (extra[keys[i]]) ctx[keys[i]] = extra[keys[i]];
        }
      }
    } catch (e) {}
    try {
      if (window.location && window.location.href) {
        ctx.page_url = window.location.href;
        if (!ctx.landing_url) ctx.landing_url = window.location.href;
      }
      if (document.referrer) ctx.referrer = document.referrer;
      var params = new URLSearchParams(window.location.search || '');
      for (var j = 0; j < keys.length; j++) {
        if (keys[j] === 'landing_url' || keys[j] === 'first_touch_url' || keys[j] === 'referrer' || ctx[keys[j]]) continue;
        var v = params.get(keys[j]);
        if (v) ctx[keys[j]] = v;
      }
    } catch (e2) {}
    return ctx;
  }

  function buildPayload(fields, ctx) {
    ctx = ctx || {};
    var landingUrl = ctx.landing_url || ctx.page_url || '';
    var pageUrl = ctx.page_url || ctx.landing_url || '';
    var body = {
      name: fields.name || '',
      profile_id: PROFILE_ID,
      source: SOURCE,
      landing_url: landingUrl,
      page_url: pageUrl,
      referrer: ctx.referrer || '',
    };
    if (fields.phone) body.phone = fields.phone;
    if (fields.email) body.email = fields.email;
    if (fields.service) {
      body.service = fields.service;
      body.job_type = fields.service;
    }
    var loc = locationParts(fields);
    if (loc.town) body.town = loc.town;
    if (loc.zip) body.zip = loc.zip;
    var message = buildMessage(fields);
    if (message) body.message = message;
    if (ctx.first_touch_url) body.first_touch_url = ctx.first_touch_url;
    var utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    for (var i = 0; i < utmKeys.length; i++) {
      if (ctx[utmKeys[i]]) body[utmKeys[i]] = ctx[utmKeys[i]];
    }
    return body;
  }

  function friendlyError(status) {
    if (status === 429) {
      return "We're getting a lot of requests right now. Please wait a moment and try again, or call " + PHONE_FALLBACK + ".";
    }
    if (status === 403) {
      return "We couldn't send that from this page. Please try again, or call " + PHONE_FALLBACK + ".";
    }
    return "We couldn't send your request. Please try again, or call " + PHONE_FALLBACK + ".";
  }

  function savedId(data) {
    if (!data || typeof data !== 'object') return '';
    var id = data.inbox_id || data.lead_id || data.id || '';
    if (id == null) return '';
    return String(id).trim();
  }

  function isSavedLead(result) {
    var status = result && result.status;
    var data = result && result.data;
    if (!(typeof status === 'number' && status >= 200 && status < 300)) return false;
    if (!data || typeof data !== 'object') return false;
    if (data.filtered === true || data.dropped === true || data.accepted === false) return false;
    if (data.success === false || data.ok === false || data.saved === false) return false;
    var id = savedId(data);
    if (!id) return false;
    if (data.saved === true || data.success === true || data.ok === true) return true;
    return false;
  }

  function messageForResult(result) {
    if (isSavedLead(result)) {
      return { ok: true, text: SUCCESS_TEXT };
    }
    var status = result && result.status;
    if (typeof status === 'number' && status >= 200 && status < 300) {
      return {
        ok: false,
        text: "We couldn't save your request. Please try again, or call " + PHONE_FALLBACK + ".",
      };
    }
    return { ok: false, text: friendlyError(status) };
  }

  function shouldDrop(companyWebsite) {
    return !!(companyWebsite && String(companyWebsite).trim());
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
      form.appendChild(el);
    }
    el.className = 'form-status ' + (ok ? 'is-success' : 'is-error');
    el.setAttribute('role', ok ? 'status' : 'alert');
    el.setAttribute('aria-live', ok ? 'polite' : 'assertive');
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
      if (shouldDrop(fields.company_website)) {
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

  var api = {
    API_URL: API_URL,
    PROFILE_ID: PROFILE_ID,
    SOURCE: SOURCE,
    PHONE_FALLBACK: PHONE_FALLBACK,
    SUCCESS_TEXT: SUCCESS_TEXT,
    buildMessage: buildMessage,
    buildPayload: buildPayload,
    isSavedLead: isSavedLead,
    messageForResult: messageForResult,
    shouldDrop: shouldDrop,
    submitLead: submitLead,
    wireForm: wireForm,
    readFields: readFields,
    locationParts: locationParts,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (typeof document === 'undefined') return;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
