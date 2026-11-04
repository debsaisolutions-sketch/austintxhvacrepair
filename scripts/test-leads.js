#!/usr/bin/env node
/**
 * Local tests for lead payload shaping and submit handling.
 * Fetch is mocked. This file does not post a live lead.
 */
const assert = require('assert');
const leads = require('../js/tdp-leads.js');

function makeForm(values) {
  const inputs = {};
  Object.keys(values).forEach((name) => {
    inputs[name] = { name: name, value: values[name] };
  });
  const button = { disabled: false, textContent: 'Request Free Estimate', type: 'submit' };
  const listeners = {};
  const form = {
    dataset: {},
    classList: { contains: (c) => c === 'lead-form' },
    resetCount: 0,
    _status: null,
    querySelector(sel) {
      const match = /\[name="([^"]+)"\]/.exec(sel);
      if (match) return inputs[match[1]] || null;
      if (sel.indexOf('button') !== -1) return button;
      if (sel === '.form-status') return form._status;
      return null;
    },
    removeAttribute() {},
    setAttribute() {},
    insertBefore() {},
    appendChild(el) {
      if (el.className && String(el.className).indexOf('form-status') !== -1) form._status = el;
    },
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
    reset() {
      form.resetCount += 1;
      Object.keys(inputs).forEach((name) => {
        inputs[name].value = '';
      });
    },
  };
  return { form, listeners, button, inputs };
}

function jsonResponse(status, data) {
  return {
    status: status,
    ok: status >= 200 && status < 300,
    json: async () => data,
  };
}

async function main() {
  assert.strictEqual(leads.PROFILE_ID, '63e7470e-fe1e-4367-aae0-56d0d6392d78');
  assert.strictEqual(leads.API_URL, 'https://www.tradedeskpro.com/api/leads');
  assert.strictEqual(leads.SOURCE, 'austintxhvacrepair.com');

  const payload = leads.buildPayload(
    {
      name: 'Ada Lovelace',
      phone: '7373726333',
      email: 'ada@example.com',
      service: 'AC repair',
      area: 'Round Rock',
      message: 'Unit is not cooling',
    },
    {
      landing_url: 'https://austintxhvacrepair.com/contact/?utm_source=google',
      first_touch_url: 'https://austintxhvacrepair.com/?utm_source=google',
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'austin-ac',
    }
  );
  assert.strictEqual(payload.name, 'Ada Lovelace');
  assert.strictEqual(payload.profile_id, leads.PROFILE_ID);
  assert.strictEqual(payload.phone, '7373726333');
  assert.strictEqual(payload.email, 'ada@example.com');
  assert.strictEqual(payload.source, 'austintxhvacrepair.com');
  assert.strictEqual(payload.utm_source, 'google');
  assert.strictEqual(payload.utm_medium, 'cpc');
  assert.strictEqual(payload.utm_campaign, 'austin-ac');
  assert.ok(payload.message.indexOf('Service: AC repair') !== -1);
  assert.ok(payload.message.indexOf('Area: Round Rock') !== -1);
  assert.ok(payload.message.indexOf('Unit is not cooling') !== -1);
  assert.strictEqual(payload.company_website, undefined);

  const sparse = leads.buildPayload({ name: 'Grace', message: 'Need heat' }, { landing_url: 'https://austintxhvacrepair.com/' });
  assert.strictEqual(sparse.phone, undefined);
  assert.strictEqual(sparse.email, undefined);
  assert.strictEqual(sparse.message, 'Need heat');
  assert.ok(!/Service:|Area:/.test(sparse.message));

  assert.strictEqual(leads.shouldDrop('http://spam.test', 9000), true);
  assert.strictEqual(leads.shouldDrop('', 2999), true);
  assert.strictEqual(leads.shouldDrop('   ', 4000), false);
  assert.strictEqual(leads.shouldDrop('', 3000), false);

  assert.strictEqual(leads.messageForResult({ status: 201 }).ok, true);
  assert.strictEqual(leads.messageForResult({ status: 202 }).ok, true);
  assert.ok(!/filter/i.test(leads.messageForResult({ status: 202 }).text));
  for (const status of [403, 429, 500, 0]) {
    const msg = leads.messageForResult({ status: status });
    assert.strictEqual(msg.ok, false);
    assert.ok(msg.text.includes(leads.PHONE_FALLBACK), 'status ' + status + ' should include the phone fallback');
  }
  assert.ok(/lot of requests/i.test(leads.messageForResult({ status: 429 }).text));
  assert.ok(/this page/i.test(leads.messageForResult({ status: 403 }).text));

  let posted = null;
  global.fetch = async (url, init) => {
    posted = { url: url, init: init, body: JSON.parse(init.body) };
    return jsonResponse(201, { inbox_id: 'mock' });
  };
  const sent = await leads.submitLead(payload);
  assert.strictEqual(sent.status, 201);
  assert.strictEqual(posted.url, leads.API_URL);
  assert.strictEqual(posted.body.profile_id, leads.PROFILE_ID);
  assert.strictEqual(posted.init.method, 'POST');
  assert.ok(!posted.init.headers['X-TDP-Lead-Secret']);
  assert.ok(!posted.init.headers['x-tdp-lead-secret']);

  global.fetch = async () => jsonResponse(202, { filtered: true });
  assert.strictEqual((await leads.submitLead(payload)).status, 202);

  global.document = {
    createElement() {
      return {
        className: '',
        textContent: '',
        hidden: true,
        style: {},
        children: [],
        setAttribute() {},
        appendChild(child) {
          this.children.push(child);
        },
      };
    },
  };

  const home = makeForm({
    name: 'Ada Lovelace',
    phone: '7373726333',
    email: 'ada@example.com',
    message: 'AC is out',
    company_website: '',
  });
  leads.setLoadedAt(Date.now() - 5000);
  leads.wireForm(home.form);
  global.fetch = async (url, init) => {
    posted = { url: url, body: JSON.parse(init.body), headers: init.headers };
    return jsonResponse(201, { inbox_id: 'mock' });
  };
  await home.listeners.submit({ preventDefault() {} });
  assert.strictEqual(posted.body.name, 'Ada Lovelace');
  assert.strictEqual(posted.body.source, 'austintxhvacrepair.com');
  assert.strictEqual(posted.body.message, 'AC is out');
  assert.strictEqual(home.form._status.textContent, leads.SUCCESS_TEXT);
  assert.ok(home.form._status.className.indexOf('is-success') !== -1);
  assert.strictEqual(home.form.resetCount, 1);
  assert.strictEqual(home.button.disabled, false);
  assert.strictEqual(home.button.textContent, 'Request Free Estimate');

  const spam = makeForm({
    name: 'Bot',
    phone: '7373726333',
    email: 'bot@example.com',
    message: 'buy now',
    company_website: 'https://spam.example',
  });
  leads.setLoadedAt(Date.now() - 8000);
  leads.wireForm(spam.form);
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return jsonResponse(201, {});
  };
  await spam.listeners.submit({ preventDefault() {} });
  assert.strictEqual(fetchCalls, 0);
  assert.strictEqual(spam.form._status.textContent, leads.SUCCESS_TEXT);

  const fast = makeForm({
    name: 'Speedy',
    phone: '7373726333',
    email: 's@example.com',
    message: 'hello',
    company_website: '',
  });
  leads.setLoadedAt(Date.now());
  leads.wireForm(fast.form);
  await fast.listeners.submit({ preventDefault() {} });
  assert.strictEqual(fetchCalls, 0);

  const denied = makeForm({
    name: 'Ada Lovelace',
    phone: '7373726333',
    email: 'ada@example.com',
    area: 'Kyle',
    message: 'No cool air',
    company_website: '',
  });
  leads.setLoadedAt(Date.now() - 4000);
  leads.wireForm(denied.form);
  global.fetch = async () => jsonResponse(403, { error: 'origin' });
  await denied.listeners.submit({ preventDefault() {} });
  assert.ok(denied.form._status.textContent.includes(leads.PHONE_FALLBACK));
  assert.ok(denied.form._status.className.indexOf('is-error') !== -1);
  assert.strictEqual(denied.form.resetCount, 0);

  const limited = makeForm({
    name: 'Ada Lovelace',
    phone: '7373726333',
    email: 'ada@example.com',
    message: 'Need service',
    company_website: '',
  });
  leads.setLoadedAt(Date.now() - 4000);
  leads.wireForm(limited.form);
  global.fetch = async () => jsonResponse(429, {});
  await limited.listeners.submit({ preventDefault() {} });
  assert.ok(/lot of requests/i.test(limited.form._status.textContent));
  assert.ok(limited.form._status.textContent.includes(leads.PHONE_FALLBACK));

  const offline = makeForm({
    name: 'Ada Lovelace',
    phone: '7373726333',
    email: 'ada@example.com',
    message: 'Need service',
    company_website: '',
  });
  leads.setLoadedAt(Date.now() - 4000);
  leads.wireForm(offline.form);
  global.fetch = async () => {
    throw new Error('network down');
  };
  await offline.listeners.submit({ preventDefault() {} });
  assert.ok(offline.form._status.textContent.includes(leads.PHONE_FALLBACK));
  assert.strictEqual(offline.button.disabled, false);

  const filtered = makeForm({
    name: 'Ada Lovelace',
    phone: '7373726333',
    email: 'ada@example.com',
    service: 'Maintenance',
    message: 'Tune up',
    company_website: '',
  });
  leads.setLoadedAt(Date.now() - 4000);
  leads.wireForm(filtered.form);
  global.fetch = async (url, init) => {
    posted = JSON.parse(init.body);
    return jsonResponse(202, { filtered: true });
  };
  await filtered.listeners.submit({ preventDefault() {} });
  assert.strictEqual(filtered.form._status.textContent, leads.SUCCESS_TEXT);
  assert.ok(posted.message.indexOf('Service: Maintenance') === 0);
  assert.ok(posted.message.indexOf('Tune up') !== -1);

  console.log('Lead form tests passed (mocked fetch, no live post).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
