// Accounts: signing in with Google, saving a player's data to their account, and buying the paid plan. Run: node --test
// Nothing here talks to Google or to Stripe. `fakeGoogle` and `fakeStripe` stand in for them and answer the same way.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAccounts, memoryAccounts, blobAccounts, signSession, readSession } from './account.mjs';
import { createApp } from './server.mjs';
import { memoryStore } from './leaderboard.mjs';

const C = globalThis.FermiCore;
const QUESTIONS = globalThis.FERMI_QUESTIONS;
const SITE = 'https://frog.example';
const NOW = Date.UTC(2026, 10, 20, 12);
const config = { clientId: 'client-123.apps.example', clientSecret: 'google-secret', sessionSecret: 'a-long-random-secret-for-these-tests' };
const day = (n, width = 2) => ({ ranges: C.pickDaily(QUESTIONS, n, 5).map((q) => C.rangeFor(Math.log10(q.answer), width)) });

// Google's side of signing in. Each "code" stands for one Google person, as if they had just agreed on Google's page.
function fakeGoogle(overrides = {}) {
  const people = { 'code-lea': '111', 'code-sam': '222' };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const calls = [];
  return {
    calls,
    async fetch(url, init) {
      calls.push([String(url), init]);
      assert.equal(String(url), 'https://oauth2.googleapis.com/token');
      const form = new URLSearchParams(init.body);
      assert.equal(form.get('client_id'), config.clientId);
      assert.equal(form.get('client_secret'), config.clientSecret);
      assert.equal(form.get('grant_type'), 'authorization_code');
      assert.equal(form.get('redirect_uri'), SITE + '/api/auth/callback');
      const sub = people[form.get('code')];
      if (!sub) return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
      const claims = { iss: 'https://accounts.google.com', aud: config.clientId, sub, exp: Math.floor(NOW / 1000) + 3600, ...overrides };
      return new Response(JSON.stringify({ id_token: b64({ alg: 'RS256' }) + '.' + b64(claims) + '.signature' }), { status: 200 });
    },
  };
}

const make = (extra = {}) => createAccounts({ store: memoryAccounts(), config, fetch: fakeGoogle().fetch, now: () => NOW, ...extra });
const cookiesOf = (res) => res.headers.getSetCookie();
const cookie = (res, name) => { const line = cookiesOf(res).find((c) => c.startsWith(name + '=')); return line ? line.split(';')[0] : null; };
const ask = (accounts, path, init = {}) => accounts.handle(new Request(SITE + path, { redirect: 'manual', ...init }));
const json = (body, cookieLine, origin = SITE) => ({ method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: origin, ...(cookieLine ? { Cookie: cookieLine } : {}) }, body: JSON.stringify(body) });

// Go through the whole sign-in as one Google person. Returns the session cookie the browser would now hold.
async function signIn(accounts, code = 'code-lea') {
  const start = await ask(accounts, '/api/auth/google');
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const back = await ask(accounts, '/api/auth/callback?code=' + code + '&state=' + state, { headers: { Cookie: cookie(start, 'ff_state') } });
  return { back, session: cookie(back, 'ff_session') };
}

/* ---------- the session: a signed note in a cookie that says who the browser is ---------- */

test('a session is a signed note: it cannot be forged, altered, or used after it expires', () => {
  const note = signSession({ id: 'g111', exp: NOW + 1000 }, 'secret-one');
  assert.deepEqual(readSession(note, 'secret-one', NOW), { id: 'g111', exp: NOW + 1000 });
  assert.equal(readSession(note, 'secret-two', NOW), null, 'signed with another key');
  assert.equal(readSession(note, 'secret-one', NOW + 2000), null, 'expired');
  const [version, body, signature] = note.split('.');
  const other = Buffer.from(JSON.stringify({ id: 'g999', exp: NOW + 1000 })).toString('base64url');
  assert.equal(readSession([version, other, signature].join('.'), 'secret-one', NOW), null, 'someone changed who it is');
  for (const junk of ['', 'hello', 'v1.only', null, undefined, body]) assert.equal(readSession(junk, 'secret-one', NOW), null);
});

/* ---------- signing in ---------- */

test('without Google keys, the game simply says sign-in is not set up', async () => {
  const accounts = createAccounts({ store: memoryAccounts(), config: {}, fetch: fakeGoogle().fetch, now: () => NOW });
  assert.deepEqual(await (await ask(accounts, '/api/me')).json(), { configured: false, signedIn: false });
  assert.equal((await ask(accounts, '/api/auth/google')).status, 503);
});

test('signing in sends the player to Google, asking only who they are', async () => {
  const start = await ask(make(), '/api/auth/google');
  assert.equal(start.status, 302);
  const to = new URL(start.headers.get('location'));
  assert.equal(to.origin + to.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(to.searchParams.get('client_id'), config.clientId);
  assert.equal(to.searchParams.get('redirect_uri'), SITE + '/api/auth/callback');
  assert.equal(to.searchParams.get('response_type'), 'code');
  assert.equal(to.searchParams.get('scope'), 'openid', 'no email, no name, no contacts: only a number that stands for the account');
  assert.ok(to.searchParams.get('state').length >= 20);
  assert.match(cookiesOf(start).join('\n'), /ff_state=[^;]+;.*HttpOnly/);
  assert.ok(!start.headers.get('location').includes(config.clientSecret), 'the secret never leaves the server');
});

test('coming back from Google opens a session, and the account starts empty and free', async () => {
  const accounts = make();
  const { back, session } = await signIn(accounts);
  assert.equal(back.status, 302);
  assert.equal(back.headers.get('location'), '/?signed=in');
  const line = cookiesOf(back).find((c) => c.startsWith('ff_session='));
  assert.match(line, /HttpOnly/, 'the page itself cannot read it');
  assert.match(line, /Secure/, 'only sent over https');
  assert.match(line, /SameSite=Lax/);
  assert.match(cookiesOf(back).find((c) => c.startsWith('ff_state=')), /Max-Age=0/, 'the one-time state is thrown away');

  const me = await (await ask(accounts, '/api/me', { headers: { Cookie: session } })).json();
  assert.deepEqual(me, { configured: true, signedIn: true, plan: 'free', selling: false, data: { profile: globalThis.FermiProfile.clean(null), profileAt: 0, days: {} } });
  assert.deepEqual(await (await ask(accounts, '/api/me')).json(), { configured: true, signedIn: false, selling: false }, 'without the cookie, nobody');
});

test('on this computer (plain http) the session cookie still works', async () => {
  const accounts = make();
  const start = await accounts.handle(new Request('http://localhost:8123/api/auth/google', { redirect: 'manual' }));
  assert.equal(new URL(start.headers.get('location')).searchParams.get('redirect_uri'), 'http://localhost:8123/api/auth/callback');
  assert.ok(!/Secure/.test(cookiesOf(start).join('\n')), 'a Secure cookie would never come back over http');
});

test('a sign-in that did not start here is refused', async () => {
  const accounts = make();
  const start = await ask(accounts, '/api/auth/google');
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const stateCookie = cookie(start, 'ff_state');
  const tries = [
    ['/api/auth/callback?code=code-lea&state=' + state, {}],                                   // no cookie: another browser
    ['/api/auth/callback?code=code-lea&state=made-up', { headers: { Cookie: stateCookie } }],  // a made-up state
    ['/api/auth/callback?code=code-lea', { headers: { Cookie: stateCookie } }],                // no state
    ['/api/auth/callback?state=' + state, { headers: { Cookie: stateCookie } }],               // no code
    ['/api/auth/callback?error=access_denied&state=' + state, { headers: { Cookie: stateCookie } }], // the player said no on Google's page
  ];
  for (const [path, init] of tries) {
    const res = await ask(accounts, path, init);
    assert.equal(res.status, 302, path);
    assert.equal(res.headers.get('location'), '/?signed=no', 'back to the game, not signed in');
    assert.equal(cookie(res, 'ff_session'), null, path + ' opens no session');
  }
});

test('an answer that is not really from Google for this game is refused', async () => {
  const bad = [
    { aud: 'another-app' },                              // meant for another app
    { iss: 'https://evil.example' },                     // not issued by Google
    { exp: Math.floor(NOW / 1000) - 10 },                // already expired
    { sub: '' },                                         // nobody
  ];
  for (const overrides of bad) {
    const accounts = make({ fetch: fakeGoogle(overrides).fetch });
    const { back, session } = await signIn(accounts);
    assert.equal(back.headers.get('location'), '/?signed=no', JSON.stringify(overrides));
    assert.equal(session, null);
  }
  const refused = make();
  assert.equal((await signIn(refused, 'code-nobody')).session, null, 'Google itself refused the code');
});

/* ---------- saving ---------- */

test('what a player saves on one device is there on another', async () => {
  const accounts = make();
  const phone = (await signIn(accounts)).session;
  const mine = { profile: { name: 'Léa', avatar: 'proud', lang: 'fr', colour: 'dusk' }, profileAt: NOW, days: { 4: day(4), 5: { ranges: day(5).ranges.slice(0, 2) } } };
  const saved = await ask(accounts, '/api/me', json(mine, phone));
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).data, mine);

  const laptop = (await signIn(accounts)).session; // the same Google person, on another device
  assert.deepEqual((await (await ask(accounts, '/api/me', { headers: { Cookie: laptop } })).json()).data, mine);

  // the laptop finishes day 5 and plays day 6: the account now has the best of both
  const more = await (await ask(accounts, '/api/me', json({ profile: mine.profile, profileAt: NOW - 5000, days: { 5: day(5), 6: day(6) } }, laptop))).json();
  assert.deepEqual(Object.keys(more.data.days), ['4', '5', '6']);
  assert.equal(more.data.days[5].ranges.length, 5);
  assert.equal(more.data.profile.name, 'Léa');

  const sam = (await signIn(accounts, 'code-sam')).session;
  assert.deepEqual((await (await ask(accounts, '/api/me', { headers: { Cookie: sam } })).json()).data.days, {}, 'another person has their own account');
});

test('a player cannot give themself the paid plan', async () => {
  const accounts = make();
  const { session } = await signIn(accounts);
  const out = await (await ask(accounts, '/api/me', json({ plan: 'supporter', profile: {}, days: {}, extra: 'x' }, session))).json();
  assert.equal(out.plan, 'free');
  assert.deepEqual(Object.keys(out.data).sort(), ['days', 'profile', 'profileAt'], 'and nothing unexpected is kept');
});

test('saving is refused without a session, from another site, or when it is not a small JSON', async () => {
  const accounts = make();
  const { session } = await signIn(accounts);
  const body = { profile: {}, days: {} };
  assert.equal((await ask(accounts, '/api/me', json(body, null))).status, 401, 'not signed in');
  assert.equal((await ask(accounts, '/api/me', json(body, session, 'https://evil.example'))).status, 403, 'asked by another website');
  assert.equal((await ask(accounts, '/api/me', { method: 'PUT', headers: { Cookie: session, Origin: SITE }, body: '{oops' })).status, 400);
  assert.equal((await ask(accounts, '/api/me', json({ junk: 'x'.repeat(600000) }, session))).status, 413);
  assert.equal((await ask(accounts, '/api/me', { method: 'PATCH', headers: { Cookie: session, Origin: SITE } })).status, 405);
  assert.equal((await ask(accounts, '/api/nothing-here')).status, 404);
});

/* ---------- leaving ---------- */

test('signing out forgets the session; the saved data stays for next time', async () => {
  const accounts = make();
  const { session } = await signIn(accounts);
  await ask(accounts, '/api/me', json({ profile: { name: 'Léa' }, profileAt: NOW, days: { 4: day(4) } }, session));
  const out = await ask(accounts, '/api/signout', { method: 'POST', headers: { Cookie: session, Origin: SITE } });
  assert.equal(out.status, 200);
  assert.match(cookiesOf(out).find((c) => c.startsWith('ff_session=')), /Max-Age=0/);
  assert.equal((await ask(accounts, '/api/signout', { method: 'POST', headers: { Cookie: session, Origin: 'https://evil.example' } })).status, 403);
  const again = (await signIn(accounts)).session;
  assert.equal((await (await ask(accounts, '/api/me', { headers: { Cookie: again } })).json()).data.profile.name, 'Léa');
});

test('a player can delete everything the account holds', async () => {
  const store = memoryAccounts();
  const accounts = make({ store });
  const { session } = await signIn(accounts);
  await ask(accounts, '/api/me', json({ profile: { name: 'Léa' }, profileAt: NOW, days: { 4: day(4) } }, session));
  assert.ok(await store.get('g111'));
  const gone = await ask(accounts, '/api/me', { method: 'DELETE', headers: { Cookie: session, Origin: SITE } });
  assert.equal(gone.status, 200);
  assert.equal(await store.get('g111'), null, 'nothing is left on the server');
  assert.match(cookiesOf(gone).find((c) => c.startsWith('ff_session=')), /Max-Age=0/);
  const back = (await signIn(accounts)).session;
  assert.deepEqual((await (await ask(accounts, '/api/me', { headers: { Cookie: back } })).json()).data.days, {}, 'a fresh start');
});

/* ---------- where it runs ---------- */

test('online, Vercel passes the address as a "route": the answers are the same', async () => {
  const accounts = make();
  const { session } = await signIn(accounts);
  const me = await accounts.handle(new Request(SITE + '/api/account?route=me', { headers: { Cookie: session } }));
  assert.equal((await me.json()).signedIn, true);
  const start = await accounts.handle(new Request(SITE + '/api/account?route=auth-google', { redirect: 'manual' }));
  assert.equal(start.status, 302);
  assert.equal(new URL(start.headers.get('location')).searchParams.get('redirect_uri'), SITE + '/api/auth/callback');

  const rewrites = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')).rewrites;
  const sent = (source) => (rewrites.find((r) => r.source === source) || {}).destination;
  assert.equal(sent('/api/me'), '/api/account?route=me');
  assert.equal(sent('/api/signout'), '/api/account?route=signout');
  assert.equal(sent('/api/auth/:step'), '/api/account?route=auth-:step');
  assert.equal(sent('/api/buy'), '/api/account?route=buy');
  assert.equal((await accounts.handle(new Request(SITE + '/api/account?route=buy', { method: 'POST', headers: { Cookie: session, Origin: SITE } }))).status, 503, 'buying is known there too (nothing is for sale in this test)');
});

// Vercel Blob, as far as accounts use it. Each write gives the file a new version stamp ("etag"),
// and a write can say "only if the file is still the version I read".
function fakeBlob() {
  const files = new Map(); // path -> { body, etag }
  let stamp = 0;
  const sdk = {
    files,
    between: null, // a test can make something happen between a read and the write that follows
    async get(path, options) {
      assert.equal(options.access, 'private');
      assert.equal(options.useCache, false, 'a read must see the last write');
      const file = files.get(path);
      return file ? { statusCode: 200, stream: new Response(file.body).body, blob: { etag: file.etag } } : null;
    },
    async put(path, body, options) {
      assert.equal(options.access, 'private');
      if (sdk.between) { const first = sdk.between; sdk.between = null; await first(); }
      const file = files.get(path);
      if (file && !options.allowOverwrite) throw new Error('the file already exists');
      if (options.ifMatch && (!file || file.etag !== options.ifMatch)) throw new Error('the file changed since it was read');
      files.set(path, { body, etag: 'v' + (++stamp) });
    },
    async del(path) { files.delete(path); },
  };
  return sdk;
}

test('online, each account is one private file', async () => {
  const sdk = fakeBlob();
  const store = blobAccounts(sdk);
  assert.equal(await store.get('g111'), null);
  await store.update('g111', (account) => account || { plan: 'free', days: {} });
  assert.deepEqual([...sdk.files.keys()], ['accounts/g111.json']);
  assert.deepEqual(await store.get('g111'), { plan: 'free', days: {} });
  assert.equal(await store.update('g222', () => null), null, 'a change that gives nothing writes nothing');
  assert.deepEqual([...sdk.files.keys()], ['accounts/g111.json']);
  await store.remove('g111');
  assert.equal(await store.get('g111'), null);
});

test('two changes to an account that cross each other are both kept', async () => {
  // A save from the phone and "this account has paid" can reach the server in the same instant.
  // Each reads the file, changes its own part and writes it back: without care, the second write would erase the first.
  for (const store of [blobAccounts(fakeBlob()), memoryAccounts()]) {
    await store.update('g111', () => ({ plan: 'free', days: {} }));
    await Promise.all([
      store.update('g111', (account) => ({ ...account, days: { 4: day(4) } })),
      store.update('g111', (account) => ({ ...account, plan: 'supporter' })),
    ]);
    const both = await store.get('g111');
    assert.equal(both.plan, 'supporter');
    assert.deepEqual(Object.keys(both.days), ['4']);
  }
  // and when another write lands exactly between this one's read and its write, it reads again and retries
  const sdk = fakeBlob();
  const store = blobAccounts(sdk);
  await store.update('g111', () => ({ plan: 'free', days: {} }));
  sdk.between = () => store.update('g111', (account) => ({ ...account, plan: 'supporter' }));
  await store.update('g111', (account) => ({ ...account, days: { 4: day(4) } }));
  assert.deepEqual(await store.get('g111'), { plan: 'supporter', days: { 4: day(4) } });
});

test('on this computer, the same addresses answer', async () => {
  const server = createApp({ store: memoryStore(), accounts: make() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    assert.deepEqual(await (await fetch(base + '/api/me')).json(), { configured: true, signedIn: false, selling: false });
    const start = await fetch(base + '/api/auth/google', { redirect: 'manual' });
    assert.equal(start.status, 302);
    assert.match(start.headers.get('location'), /^https:\/\/accounts\.google\.com\//);
    assert.match(start.headers.getSetCookie().join('\n'), /ff_state=/);
    assert.equal((await fetch(base + '/api/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403, 'no Origin: not from the page');
    assert.equal((await fetch(base + '/api/buy', { method: 'POST' })).status, 403, 'buying has an address too, with the same rule');
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

/* ---------- the paid plan: one payment of 4 euros, taken by Stripe ---------- */

const KEY = 'sk_live_key-for-these-tests';
const LOCAL = 'http://localhost:8123';
const P = globalThis.FermiProfile;

// Stripe's side of paying. It remembers the payment pages ("sessions") it opened; a test then says what the player did on them.
function fakeStripe(key = KEY) {
  const sessions = new Map();
  const state = { sessions, forms: [], calls: 0, down: false };
  state.pay = (id, change = {}) => Object.assign(sessions.get(id), { status: 'complete', payment_status: 'paid', url: null }, change);
  state.expire = (id) => Object.assign(sessions.get(id), { status: 'expired', url: null });
  state.fetch = async (url, init = {}) => {
    state.calls++;
    if (state.down) throw new Error('no network');
    const at = new URL(url);
    assert.equal(at.origin, 'https://api.stripe.com');
    assert.equal(init.headers.Authorization, 'Bearer ' + key, 'the secret key goes to Stripe, and only there');
    if (init.method === 'POST') {
      assert.equal(at.pathname, '/v1/checkout/sessions');
      const form = new URLSearchParams(init.body);
      state.forms.push(form);
      const id = 'cs_' + (sessions.size + 1);
      sessions.set(id, {
        id, url: 'https://checkout.stripe.com/c/pay/' + id, status: 'open', payment_status: 'unpaid', livemode: !key.includes('_test_'),
        mode: form.get('mode'), client_reference_id: form.get('client_reference_id'), currency: form.get('line_items[0][price_data][currency]'),
        amount_total: Number(form.get('line_items[0][price_data][unit_amount]')) * Number(form.get('line_items[0][quantity]')),
      });
      return new Response(JSON.stringify(sessions.get(id)), { status: 200 });
    }
    const found = sessions.get(at.pathname.split('/').pop());
    return new Response(JSON.stringify(found || { error: { type: 'invalid_request_error' } }), { status: found ? 200 : 404 });
  };
  return state;
}

// A game where the plan is for sale: Google and Stripe are both stand-ins.
function shop(key = KEY, clock = { at: NOW }) {
  const google = fakeGoogle(), stripe = fakeStripe(key);
  const fetch = (url, init) => (String(url).startsWith('https://api.stripe.com/') ? stripe.fetch(url, init) : google.fetch(url, init));
  return { stripe, accounts: createAccounts({ store: memoryAccounts(), config: { ...config, stripeKey: key }, fetch, now: () => clock.at }) };
}
const buy = (accounts, session, site = SITE, origin = site) =>
  accounts.handle(new Request(site + '/api/buy', { method: 'POST', headers: { Origin: origin, ...(session ? { Cookie: session } : {}) } }));
const me = async (accounts, session, site = SITE) => (await accounts.handle(new Request(site + '/api/me', { headers: { Cookie: session } }))).json();

test('the plan costs 4 euros, once', () => {
  assert.deepEqual(P.PLAN, { id: 'supporter', cents: 400, currency: 'eur' });
});

test('without a Stripe key, nothing is for sale', async () => {
  const accounts = make();
  const { session } = await signIn(accounts);
  assert.equal((await me(accounts, session)).selling, false);
  assert.equal((await buy(accounts, session)).status, 503);
});

test('buying opens a Stripe payment page for exactly 4 euros, tied to the account', async () => {
  const { accounts, stripe } = shop();
  const { session } = await signIn(accounts);
  assert.equal((await me(accounts, session)).selling, true);
  const res = await buy(accounts, session);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.deepEqual(JSON.parse(text), { url: 'https://checkout.stripe.com/c/pay/cs_1' });
  assert.ok(!text.includes(KEY), 'the secret key never reaches the page');

  const form = stripe.forms[0];
  assert.equal(form.get('mode'), 'payment', 'one payment, not a subscription');
  assert.equal(form.get('line_items[0][price_data][unit_amount]'), '400');
  assert.equal(form.get('line_items[0][price_data][currency]'), 'eur');
  assert.equal(form.get('line_items[0][quantity]'), '1');
  assert.ok(form.get('line_items[0][price_data][product_data][name]'));
  assert.equal(form.get('client_reference_id'), 'g111', 'Stripe is told which account this payment is for');
  assert.equal(form.get('success_url'), SITE + '/?bought=yes');
  assert.equal(form.get('cancel_url'), SITE + '/?bought=no');
  assert.equal((await me(accounts, session)).plan, 'free', 'opening the page pays nothing');

  assert.equal((await buy(accounts, null)).status, 401, 'sign in first: the plan is kept in the account');
  assert.equal((await buy(accounts, session, SITE, 'https://evil.example')).status, 403, 'asked by another website');
  assert.equal((await ask(accounts, '/api/buy', { headers: { Cookie: session } })).status, 405, 'a link cannot start a payment');
});

test('the payment page is in the player\'s language', async () => {
  const { accounts, stripe } = shop();
  const { session } = await signIn(accounts);
  await buy(accounts, session);
  assert.equal(stripe.forms[0].get('locale'), 'auto', 'no profile yet: Stripe follows the browser');
  stripe.expire('cs_1');
  await ask(accounts, '/api/me', json({ profile: { name: 'Léa', lang: 'fr' }, profileAt: NOW, days: {} }, session));
  await buy(accounts, session);
  assert.equal(stripe.forms[1].get('locale'), 'fr');
});

test('once Stripe says the payment went through, the account is a supporter for good', async () => {
  const { accounts, stripe } = shop();
  const { session } = await signIn(accounts);
  await buy(accounts, session);
  stripe.pay('cs_1');
  assert.equal((await me(accounts, session)).plan, 'supporter');

  const asked = stripe.calls;
  assert.equal((await me(accounts, session)).plan, 'supporter');
  assert.equal(stripe.calls, asked, 'Stripe was asked once; after that the account remembers');

  assert.deepEqual(await (await buy(accounts, session)).json(), { plan: 'supporter' }, 'nothing left to buy');
  assert.equal(stripe.sessions.size, 1, 'and no second payment page');

  const saved = await (await ask(accounts, '/api/me', json({ plan: 'free', profile: { name: 'Léa' }, profileAt: NOW, days: { 4: day(4) } }, session))).json();
  assert.equal(saved.plan, 'supporter', 'saving the game never touches the plan');
  const laptop = (await signIn(accounts)).session;
  assert.equal((await me(accounts, laptop)).plan, 'supporter', 'on every device');
  const sam = (await signIn(accounts, 'code-sam')).session;
  assert.equal((await me(accounts, sam)).plan, 'free', 'and only for the account that paid');
});

test('a payment that is not finished, or not ours, does not count', async () => {
  const notOurs = [
    { client_reference_id: 'g222' },   // paid for another account
    { amount_total: 100 },             // not the price
    { currency: 'usd' },
    { mode: 'setup' },                 // not a payment
    { livemode: false },               // paid with Stripe's test card: play money
  ];
  for (const change of notOurs) {
    const { accounts, stripe } = shop();
    const { session } = await signIn(accounts);
    await buy(accounts, session);
    stripe.pay('cs_1', change);
    assert.equal((await me(accounts, session)).plan, 'free', JSON.stringify(change));
  }
  // the player looked at the payment page and closed it
  const { accounts, stripe } = shop();
  const { session } = await signIn(accounts);
  await buy(accounts, session);
  assert.equal((await me(accounts, session)).plan, 'free');
  // a slow way of paying (a bank transfer): finished on Stripe's page, the money still on its way
  stripe.pay('cs_1', { payment_status: 'unpaid' });
  assert.equal((await me(accounts, session)).plan, 'free');
  stripe.pay('cs_1');
  assert.equal((await me(accounts, session)).plan, 'supporter', 'and noticed once it arrives, even days later');
});

test('a payment that never arrives stops being asked about after two weeks', async () => {
  const clock = { at: NOW };
  const { accounts, stripe } = shop(KEY, clock);
  const { session } = await signIn(accounts);
  await buy(accounts, session);
  stripe.pay('cs_1', { payment_status: 'unpaid' }); // a bank transfer was promised on Stripe's page, and never sent
  clock.at += 13 * 86400000;
  let asked = stripe.calls;
  await me(accounts, session);
  assert.equal(stripe.calls, asked + 1, 'day 13: still asking');
  clock.at += 2 * 86400000;
  await me(accounts, session);
  asked = stripe.calls;
  assert.equal((await me(accounts, session)).plan, 'free');
  assert.equal(stripe.calls, asked, 'day 15: forgotten');
  assert.equal((await (await buy(accounts, session)).json()).url, 'https://checkout.stripe.com/c/pay/cs_2', 'the player can simply buy again');
});

test('a payment page left open is used again; one that has expired is replaced', async () => {
  const { accounts, stripe } = shop();
  const { session } = await signIn(accounts);
  const first = (await (await buy(accounts, session)).json()).url;
  assert.equal((await (await buy(accounts, session)).json()).url, first, 'pressing twice does not open two payments');
  assert.equal(stripe.sessions.size, 1);
  stripe.expire('cs_1'); // Stripe closes an unused page after a day
  const second = (await (await buy(accounts, session)).json()).url;
  assert.notEqual(second, first);
  stripe.pay('cs_2');
  assert.equal((await me(accounts, session)).plan, 'supporter');
});

test('a test key sells on this computer only, never online', async () => {
  const { accounts, stripe } = shop('sk_test_key-for-trying');
  const { session } = await signIn(accounts);
  assert.equal((await me(accounts, session)).selling, false, 'online, play money buys nothing');
  assert.equal((await buy(accounts, session)).status, 503);
  assert.equal(stripe.calls, 0);

  assert.equal((await me(accounts, session, LOCAL)).selling, true);
  const res = await buy(accounts, session, LOCAL);
  assert.equal(res.status, 200);
  assert.equal(stripe.forms[0].get('success_url'), LOCAL + '/?bought=yes');
  stripe.pay('cs_1');
  assert.equal((await me(accounts, session, LOCAL)).plan, 'supporter', 'so the whole purchase can be tried at home with Stripe\'s test card');
});

test('when Stripe cannot be reached, the game still answers', async () => {
  const { accounts, stripe } = shop();
  const { session } = await signIn(accounts);
  stripe.down = true;
  assert.equal((await buy(accounts, session)).status, 502);
  stripe.down = false;
  await buy(accounts, session);
  stripe.pay('cs_1');
  stripe.down = true;
  assert.equal((await me(accounts, session)).plan, 'free', 'not known yet');
  stripe.down = false;
  assert.equal((await me(accounts, session)).plan, 'supporter', 'asked again the next time');
});

test('deleting the saved data never loses a purchase', async () => {
  const { accounts, stripe } = shop();
  const { session } = await signIn(accounts);
  await ask(accounts, '/api/me', json({ profile: { name: 'Léa' }, profileAt: NOW, days: { 4: day(4) } }, session));
  await buy(accounts, session);
  stripe.pay('cs_1');
  await me(accounts, session);
  assert.equal((await ask(accounts, '/api/me', { method: 'DELETE', headers: { Cookie: session, Origin: SITE } })).status, 200);
  const back = await me(accounts, (await signIn(accounts)).session);
  assert.equal(back.plan, 'supporter');
  assert.deepEqual(back.data, { profile: P.clean(null), profileAt: 0, days: {} }, 'the frog and the rounds are gone');
});
