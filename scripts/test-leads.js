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
      page_url: 'https://austintxhvacrepair.com/contact/?utm_source=google',
      referrer: 'https://www.google.com/',
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
  assert.strictEqual(payload.service, 'AC repair');
  assert.strictEqual(payload.job_type, 'AC repair');
  assert.strictEqual(payload.town, 'Round Rock');
  assert.strictEqual(payload.zip, undefined);
  assert.strictEqual(payload.landing_url, 'https://austintxhvacrepair.com/contact/?utm_source=google');
  assert.strictEqual(payload.page_url, 'https://austintxhvacrepair.com/contact/?utm_source=google');
  assert.strictEqual(payload.referrer, 'https://www.google.com/');
  assert.strictEqual(payload.utm_source, 'google');
  assert.strictEqual(payload.utm_medium, 'cpc');
  assert.strictEqual(payload.utm_campaign, 'austin-ac');
  assert.ok(payload.message.indexOf('Service: AC repair') !== -1);
  assert.ok(payload.message.indexOf('Area: Round Rock') !== -1);
  assert.ok(payload.message.indexOf('Unit is not cooling') !== -1);
  assert.strictEqual(payload.company_website, undefined);

  const zipped = leads.buildPayload(
    {
      name: 'Ada Lovelace',
      phone: '7373726333',
      email: 'ada@example.com',
      service: 'Maintenance',
      town_zip: '78704',
      message: 'Tune-up before summer',
    },
    { landing_url: 'https://austintxhvacrepair.com/', referrer: '' }
  );
  assert.strictEqual(zipped.zip, '78704');
  assert.strictEqual(zipped.town, undefined);
  assert.strictEqual(zipped.service, 'Maintenance');
  assert.ok(zipped.message.indexOf('Town or ZIP: 78704') !== -1);
  assert.strictEqual(zipped.referrer, '');
  assert.strictEqual(zipped.page_url, 'https://austintxhvacrepair.com/');

  const both = leads.buildPayload(
    {
      name: 'Ada Lovelace',
      phone: '7373726333',
      email: 'ada@example.com',
      service: 'AC repair',
      area: 'Kyle',
      town_zip: '78640',
      message: 'No cool air',
    },
    { landing_url: 'https://austintxhvacrepair.com/contact/', referrer: 'https://austintxhvacrepair.com/' }
  );
  assert.strictEqual(both.town, 'Kyle');
  assert.strictEqual(both.zip, '78640');
  assert.ok(both.message.indexOf('Area: Kyle') !== -1);
  assert.ok(both.message.indexOf('Town or ZIP: 78640') !== -1);

  const sparse = leads.buildPayload({ name: 'Grace', message: 'Need heat' }, { landing_url: 'https://austintxhvacrepair.com/' });
  assert.strictEqual(sparse.phone, undefined);
  assert.strictEqual(sparse.email, undefined);
  assert.strictEqual(sparse.message, 'Need heat');
  assert.ok(!/Service:|Area:/.test(sparse.message));

  assert.strictEqual(leads.shouldDrop('http://spam.test', 9000), true);
  assert.strictEqual(leads.shouldDrop('', 0), false);
  assert.strictEqual(leads.shouldDrop('', 2999), false);
  assert.strictEqual(leads.shouldDrop('   ', 4000), false);
  assert.strictEqual(leads.shouldDrop('', 3000), false);

  const savedBody = { success: true, inbox_id: 'inbox-1', contact_id: 'contact-1' };
  assert.strictEqual(leads.isSavedLead({ status: 201, data: savedBody }), true);
  assert.strictEqual(leads.messageForResult({ status: 201, data: savedBody }).ok, true);
  assert.strictEqual(leads.messageForResult({ status: 201, data: savedBody }).text, leads.SUCCESS_TEXT);
  assert.strictEqual(leads.isSavedLead({ status: 200, data: { success: true, duplicate: true, inbox_id: 'inbox-1' } }), true);
  assert.strictEqual(leads.messageForResult({ status: 201 }).ok, false);
  assert.strictEqual(leads.messageForResult({ status: 201, data: { success: true } }).ok, false);
  assert.strictEqual(leads.messageForResult({ status: 201, data: { success: true, inbox_id: null, contact_id: 'c' } }).ok, false);
  assert.strictEqual(leads.messageForResult({ status: 202 }).ok, false);
  assert.strictEqual(leads.messageForResult({ status: 202, data: { success: true, filtered: true } }).ok, false);
  assert.ok(!/filter/i.test(leads.messageForResult({ status: 202, data: { success: true, filtered: true } }).text));
  assert.ok(/try again/i.test(leads.messageForResult({ status: 202, data: { filtered: true } }).text));
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
    return jsonResponse(201, { success: true, inbox_id: 'mock', contact_id: 'c-mock' });
  };
  const sent = await leads.submitLead(payload);
  assert.strictEqual(sent.status, 201);
  assert.strictEqual(posted.url, leads.API_URL);
  assert.strictEqual(posted.body.profile_id, leads.PROFILE_ID);
  assert.strictEqual(posted.init.method, 'POST');
  assert.ok(!posted.init.headers['X-TDP-Lead-Secret']);
  assert.ok(!posted.init.headers['x-tdp-lead-secret']);

  global.fetch = async () => jsonResponse(202, { success: true, filtered: true });
  const filteredResult = await leads.submitLead(payload);
  assert.strictEqual(filteredResult.status, 202);
  assert.strictEqual(leads.isSavedLead(filteredResult), false);

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
    service: 'AC repair',
    town_zip: '78701',
    message: 'AC is out',
    company_website: '',
  });
  leads.wireForm(home.form);
  global.fetch = async (url, init) => {
    posted = { url: url, body: JSON.parse(init.body), headers: init.headers };
    return jsonResponse(201, { success: true, inbox_id: 'mock', contact_id: 'c-mock' });
  };
  await home.listeners.submit({ preventDefault() {} });
  assert.strictEqual(posted.body.name, 'Ada Lovelace');
  assert.strictEqual(posted.body.message, 'Service: AC repair\nTown or ZIP: 78701\nAC is out');
  assert.strictEqual(posted.body.service, 'AC repair');
  assert.strictEqual(posted.body.job_type, 'AC repair');
  assert.strictEqual(posted.body.zip, '78701');
  assert.strictEqual(posted.body.source, 'austintxhvacrepair.com');
  assert.ok(Object.prototype.hasOwnProperty.call(posted.body, 'referrer'));
  assert.ok(Object.prototype.hasOwnProperty.call(posted.body, 'landing_url'));
  assert.ok(Object.prototype.hasOwnProperty.call(posted.body, 'page_url'));
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
    service: 'Other',
    town_zip: 'Round Rock',
    message: 'hello',
    company_website: '',
  });
  leads.wireForm(fast.form);
  global.fetch = async (url, init) => {
    fetchCalls += 1;
    posted = JSON.parse(init.body);
    return jsonResponse(201, { success: true, inbox_id: 'fast-1', contact_id: 'c-fast' });
  };
  await fast.listeners.submit({ preventDefault() {} });
  assert.strictEqual(fetchCalls, 1);
  assert.strictEqual(posted.name, 'Speedy');
  assert.strictEqual(posted.town, 'Round Rock');
  assert.strictEqual(posted.service, 'Other');
  assert.strictEqual(fast.form._status.textContent, leads.SUCCESS_TEXT);

  const denied = makeForm({
    name: 'Ada Lovelace',
    phone: '7373726333',
    email: 'ada@example.com',
    area: 'Kyle',
    message: 'No cool air',
    company_website: '',
  });
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
  leads.wireForm(filtered.form);
  global.fetch = async (url, init) => {
    posted = JSON.parse(init.body);
    return jsonResponse(202, { success: true, filtered: true });
  };
  await filtered.listeners.submit({ preventDefault() {} });
  assert.notStrictEqual(filtered.form._status.textContent, leads.SUCCESS_TEXT);
  assert.ok(filtered.form._status.className.indexOf('is-error') !== -1);
  assert.ok(/try again/i.test(filtered.form._status.textContent));
  assert.ok(filtered.form._status.textContent.includes(leads.PHONE_FALLBACK));
  assert.strictEqual(filtered.form.resetCount, 0);
  assert.strictEqual(filtered.inputs.name.value, 'Ada Lovelace');
  assert.strictEqual(filtered.inputs.message.value, 'Tune up');
  assert.strictEqual(filtered.button.disabled, false);
  assert.ok(posted.message.indexOf('Service: Maintenance') === 0);
  assert.ok(posted.message.indexOf('Tune up') !== -1);

  const unconfirmed = makeForm({
    name: 'Ada Lovelace',
    phone: '7373726333',
    email: 'ada@example.com',
    service: 'AC repair',
    message: 'Still hot',
    company_website: '',
  });
  leads.wireForm(unconfirmed.form);
  global.fetch = async () => jsonResponse(200, { success: true });
  await unconfirmed.listeners.submit({ preventDefault() {} });
  assert.notStrictEqual(unconfirmed.form._status.textContent, leads.SUCCESS_TEXT);
  assert.ok(unconfirmed.form._status.className.indexOf('is-error') !== -1);
  assert.strictEqual(unconfirmed.form.resetCount, 0);
  assert.strictEqual(unconfirmed.button.disabled, false);
  assert.strictEqual(unconfirmed.button.textContent, 'Request Free Estimate');

  console.log('Lead form tests passed (mocked fetch, no live post).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
