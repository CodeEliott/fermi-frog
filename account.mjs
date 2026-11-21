/* Fermi Frog: accounts. Runs on the server only.

   A player can sign in with Google so that their frog, their settings and their rounds follow them
   from one device to another. Signing in is free and never required: the game works without it.

   How signing in goes (the standard "OAuth" way, with no Google code in the page):

     the page ──▶ /api/auth/google ──▶ Google's own page: "Continue as Léa?"
                                              │ yes
     the page ◀── a session cookie ◀── /api/auth/callback ◀── Google sends a one-time code
                                              │
                                              └─ the server swaps the code for "this is account no. 1234",
                                                 using a secret only the server knows

   What we ask Google for: only that number (scope "openid"). No email, no name, no contacts.
   What an account holds: the saved data (see profile.js: profile, profileAt, days) and its plan.

   The plan is "free" or "supporter". A supporter paid once (the price is in profile.js). The card is typed on
   Stripe's own page, never here:

     the page ──▶ /api/buy ──▶ Stripe opens a payment page for this account ──▶ the player pays there
     the page ◀── back to the game.   From then on, whenever the account is read, we ask Stripe:
                  "what became of that payment page?"   paid ──▶ the account is a supporter, for good

   The addresses:
     GET    /api/auth/google    start signing in
     GET    /api/auth/callback  come back from Google
     GET    /api/me             who am I, my plan, and my saved data
     PUT    /api/me             save: merged with what the account already has, so no round is lost
     DELETE /api/me             delete the saved data (a purchase is kept)
     POST   /api/signout        forget this browser
     POST   /api/buy            open the payment page

   `store` is where accounts are kept. It needs get(id), update(id, change), remove(id).
   `change` receives the account as it is now (or null) and gives back what it should become.
   On this computer that is a file (server.mjs); online it is Vercel Blob (blobAccounts below).
   Three keys must be set for sign-in to work (see README): the Google client id and secret, and a session secret.
   A fourth, the Stripe secret key, puts the plan on sale. */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import './core.js';
import './profile.js';

const P = globalThis.FermiProfile;

const GOOGLE_PAGE = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const STRIPE_PAGES = 'https://api.stripe.com/v1/checkout/sessions';
const SESSION_DAYS = 180;
const MAX_BODY = 400000; // bytes: three years of rounds is about half of this
const WAIT_DAYS = 14;    // how long we keep asking Stripe about a payment that has not arrived
const TRIES = 5;

/* ---------- the session: a signed note in a cookie ---------- */

const b64 = (text) => Buffer.from(text).toString('base64url');
const stamp = (body, secret) => createHmac('sha256', secret).update(body).digest('base64url');

// "v1.<who and until when>.<signature>". Without the secret, nobody can write one or change one.
export function signSession(payload, secret) {
  const body = b64(JSON.stringify(payload));
  return 'v1.' + body + '.' + stamp(body, secret);
}

// The note's content, or null if it is forged, altered, expired or unreadable.
export function readSession(note, secret, now) {
  const [version, body, signature] = String(note || '').split('.');
  if (version !== 'v1' || !body || !signature) return null;
  const real = Buffer.from(stamp(body, secret)), given = Buffer.from(signature);
  if (real.length !== given.length || !timingSafeEqual(real, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload && typeof payload.id === 'string' && payload.exp > now ? payload : null;
  } catch (error) {
    return null;
  }
}

/* ---------- where accounts are kept ---------- */

// Forgets everything when the program stops. For tests.
export function memoryAccounts() {
  const all = new Map();
  return {
    async get(id) { return all.has(id) ? structuredClone(all.get(id)) : null; },
    async update(id, change) {
      const next = change(all.has(id) ? structuredClone(all.get(id)) : null);
      if (!next) return null;
      all.set(id, structuredClone(next));
      return next;
    },
    async remove(id) { all.delete(id); },
  };
}

// Online: one private file per account in Vercel Blob. `sdk` is { get, put, del } from @vercel/blob.
export function blobAccounts(sdk) {
  const fileOf = (id) => 'accounts/' + id + '.json';
  return {
    async get(id) {
      const found = await sdk.get(fileOf(id), { access: 'private', useCache: false });
      return found && found.statusCode === 200 ? JSON.parse(await new Response(found.stream).text()) : null;
    },
    // Two requests can change one account in the same instant (a save from the phone, and "this account has paid").
    // Each reads the file, changes its part and writes it back: without care, the second write would erase the first.
    // So a write says "only if the file is still the version I read". If it is not, read again and retry.
    async update(id, change) {
      let problem;
      for (let attempt = 0; attempt < TRIES; attempt++) {
        const found = await sdk.get(fileOf(id), { access: 'private', useCache: false });
        const exists = !!found && found.statusCode === 200;
        const next = change(exists ? JSON.parse(await new Response(found.stream).text()) : null);
        if (!next) return null;
        try {
          await sdk.put(fileOf(id), JSON.stringify(next), {
            access: 'private',
            contentType: 'application/json',
            ...(exists ? { allowOverwrite: true, ifMatch: found.blob.etag } : { allowOverwrite: false }), // no file yet: create it, never replace one
          });
          return next;
        } catch (error) {
          problem = error; // most likely another request wrote first
        }
      }
      throw problem;
    },
    async remove(id) { await sdk.del(fileOf(id)); },
  };
}

/* ---------- the addresses ---------- */

const cookieOf = (request, name) => {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
};

// `config`: { clientId, clientSecret, sessionSecret, stripeKey }. `fetch` and `now` can be swapped in tests.
export function createAccounts({ store, config = {}, fetch = globalThis.fetch, now = Date.now }) {
  const configured = !!(config.clientId && config.clientSecret && config.sessionSecret);
  // The plan is on sale once a Stripe key is set. A test key moves play money: it counts on this computer, never online.
  const playMoney = /_test_/.test(config.stripeKey || '');
  const sells = (site) => configured && !!config.stripeKey && (!playMoney || site.protocol === 'http:');

  function answer(status, body, cookies = [], extra = {}) {
    const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
    if (body !== null) headers.set('Content-Type', 'application/json; charset=utf-8');
    for (const line of cookies) headers.append('Set-Cookie', line);
    return new Response(body === null ? null : JSON.stringify(body), { status, headers });
  }
  const goTo = (where, cookies) => answer(302, null, cookies, { Location: where });

  // A cookie the page's own code cannot read, sent only to this site. Over https it is marked Secure;
  // on this computer (plain http) it cannot be, or the browser would never send it back.
  const bake = (site, name, value, seconds) =>
    name + '=' + value + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + seconds + (site.protocol === 'https:' ? '; Secure' : '');
  const drop = (site, name) => bake(site, name, '', 0);

  const whoIs = (request) => (configured ? readSession(cookieOf(request, 'ff_session'), config.sessionSecret, now()) : null);
  const fresh = () => ({ plan: 'free', createdAt: now(), ...P.mergeData(null, null) });
  const shown = (account, site) => ({ configured: true, signedIn: true, plan: account.plan === P.PLAN.id ? P.PLAN.id : 'free', selling: sells(site),
    data: P.mergeData(account, null) });

  // Swap Google's one-time code for the account's number. Null if anything about the answer is not right.
  async function accountNumber(code, redirectUri) {
    const res = await fetch(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }).toString(),
    });
    if (!res.ok) return null;
    try {
      // The answer came straight from Google over https, so its signature needs no second check. What it says does:
      const claims = JSON.parse(Buffer.from(String((await res.json()).id_token).split('.')[1], 'base64url').toString('utf8'));
      const fromGoogle = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
      const forUs = claims.aud === config.clientId;
      const stillGood = claims.exp * 1000 > now();
      return fromGoogle && forUs && stillGood && typeof claims.sub === 'string' && /^[0-9A-Za-z_-]{1,64}$/.test(claims.sub) ? claims.sub : null;
    } catch (error) {
      return null;
    }
  }

  /* ----- the paid plan ----- */

  // One question to Stripe about a payment page: open a new one (give `form`), or look one up (give its `id`).
  // Null when Stripe says no or cannot be reached.
  async function stripe(id, form) {
    try {
      const res = await fetch(STRIPE_PAGES + (id ? '/' + encodeURIComponent(id) : ''), {
        method: form ? 'POST' : 'GET',
        headers: { Authorization: 'Bearer ' + config.stripeKey, ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
        ...(form ? { body: new URLSearchParams(form).toString() } : {}),
      });
      return res.ok ? await res.json() : null;
    } catch (error) {
      return null;
    }
  }

  // Is this the payment we asked for, and has the money arrived? Real money only, except on this computer.
  const paid = (page, id, site) => page.client_reference_id === id && page.mode === 'payment' && page.payment_status === 'paid'
    && page.amount_total === P.PLAN.cents && page.currency === P.PLAN.currency && (page.livemode === true || site.protocol === 'http:');
  const forget = ({ checkout, checkoutAt, ...rest }) => rest;

  // An account that opened a payment page keeps the page's number in `checkout`. Whenever the account is read, Stripe is
  // asked what became of it. Paid: the account is a supporter. Closed, or not ours: forgotten. Still open, or the money
  // still on its way: wait. Gives { account, open }, where `open` is the page's address while it can still be used.
  async function settle(id, account, site) {
    if (account.plan === P.PLAN.id || !account.checkout || !sells(site)) return { account };
    const page = await stripe(account.checkout);
    if (!page) return { account }; // no answer: ask again next time
    if (paid(page, id, site)) {
      return { account: await store.update(id, (a) => a && { ...forget(a), plan: P.PLAN.id, paidAt: now(), payment: page.id }) || account };
    }
    if (page.status === 'open') return { account, open: page.url };
    const onItsWay = page.status === 'complete' && page.payment_status === 'unpaid' && now() - (account.checkoutAt || 0) < WAIT_DAYS * 86400000;
    return { account: onItsWay ? account : await store.update(id, (a) => a && forget(a)) || account };
  }

  async function handle(request) {
    const url = new URL(request.url);
    // Online, Vercel sends every account address to one function and says which in "route" (see vercel.json).
    const route = url.searchParams.get('route')
      || { '/api/auth/google': 'auth-google', '/api/auth/callback': 'auth-callback', '/api/me': 'me', '/api/signout': 'signout', '/api/buy': 'buy' }[url.pathname];
    const redirectUri = url.origin + '/api/auth/callback';
    const method = request.method;
    if (!route) return answer(404, { error: 'Not found.' });

    if (route === 'me' && method === 'GET') {
      if (!configured) return answer(200, { configured: false, signedIn: false });
      const who = whoIs(request);
      const found = who && await store.get(who.id);
      if (!found) return answer(200, { configured: true, signedIn: false, selling: sells(url) });
      return answer(200, shown((await settle(who.id, found, url)).account, url));
    }
    if (!configured) return answer(503, { error: 'Sign-in is not set up.' });

    if (route === 'auth-google' && method === 'GET') {
      // `state` is a one-time word: Google hands it back, and it must match the cookie, or the sign-in did not start here.
      const state = randomBytes(18).toString('base64url');
      const to = new URL(GOOGLE_PAGE);
      to.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid', state, prompt: 'select_account' }).toString();
      return goTo(to.toString(), [bake(url, 'ff_state', state, 600)]);
    }

    if (route === 'auth-callback' && method === 'GET') {
      const state = url.searchParams.get('state'), code = url.searchParams.get('code');
      const started = cookieOf(request, 'ff_state');
      const sub = state && code && started && state === started ? await accountNumber(code, redirectUri) : null;
      if (!sub) return goTo('/?signed=no', [drop(url, 'ff_state')]);
      const id = 'g' + sub;
      await store.update(id, (account) => account || fresh());
      const session = signSession({ id, exp: now() + SESSION_DAYS * 86400000 }, config.sessionSecret);
      return goTo('/?signed=in', [bake(url, 'ff_session', session, SESSION_DAYS * 86400), drop(url, 'ff_state')]);
    }

    // Everything below changes something: it must be asked by this site's own page, not by another website.
    if (!({ me: ['PUT', 'DELETE'], signout: ['POST'], buy: ['POST'] }[route] || []).includes(method)) {
      return answer(405, { error: 'That is not possible here.' });
    }
    if (request.headers.get('origin') !== url.origin) return answer(403, { error: 'This must come from the game itself.' });

    if (route === 'signout') return answer(200, { configured: true, signedIn: false }, [drop(url, 'ff_session')]);

    const who = whoIs(request);
    if (!who) return answer(401, { error: 'Sign in first.' });

    if (route === 'buy') {
      if (!sells(url)) return answer(503, { error: 'The plan is not on sale yet.' });
      const found = await store.get(who.id);
      if (!found) return answer(401, { error: 'Sign in first.' });
      const { account, open } = await settle(who.id, found, url);
      if (account.plan === P.PLAN.id) return answer(200, { plan: P.PLAN.id }); // nothing left to buy
      if (open) return answer(200, { url: open });                             // pressed twice: the same page, not a second payment
      const page = await stripe(null, {
        mode: 'payment', // once, not a subscription
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': P.PLAN.currency,
        'line_items[0][price_data][unit_amount]': String(P.PLAN.cents),
        'line_items[0][price_data][product_data][name]': 'Fermi Frog Supporter',
        client_reference_id: who.id, // so Stripe can tell us later which account paid
        success_url: url.origin + '/?bought=yes',
        cancel_url: url.origin + '/?bought=no',
        locale: account.profileAt > 0 && P.LANGS.includes(account.profile && account.profile.lang) ? account.profile.lang : 'auto',
      });
      if (!page || typeof page.id !== 'string' || !/^https:\/\//.test(String(page.url))) return answer(502, { error: 'The payment page did not open.' });
      await store.update(who.id, (a) => a && { ...a, checkout: page.id, checkoutAt: now() });
      return answer(200, { url: page.url });
    }

    if (method === 'DELETE') {
      // The saved data goes. A purchase stays: the account's number and the fact that it paid, nothing else.
      const found = await store.get(who.id);
      const account = found && (await settle(who.id, found, url)).account;
      if (account && account.plan === P.PLAN.id) {
        await store.update(who.id, (a) => a && { plan: a.plan, createdAt: a.createdAt, paidAt: a.paidAt, payment: a.payment, ...P.mergeData(null, null) });
      } else {
        await store.remove(who.id);
      }
      return answer(200, { configured: true, signedIn: false }, [drop(url, 'ff_session')]);
    }

    const text = await request.text();
    if (Buffer.byteLength(text) > MAX_BODY) return answer(413, { error: 'That is too much to save.' });
    let sent;
    try { sent = JSON.parse(text); } catch (error) { return answer(400, { error: 'That is not readable.' }); }
    // Only the saved data comes from the player. The plan is the server's to decide, never the page's.
    const next = await store.update(who.id, (account) => ({ ...(account || fresh()), ...P.mergeData(account, sent), updatedAt: now() }));
    return answer(200, shown(next, url));
  }

  // Is the player behind this request a supporter? The leaderboard asks, to put the golden fly by the name.
  // Any doubt (not signed in, a forged session, a problem reading the account) is a plain no.
  async function supporter(request) {
    try {
      const who = whoIs(request);
      const account = who && await store.get(who.id);
      return !!account && account.plan === P.PLAN.id;
    } catch (error) {
      return false;
    }
  }

  return {
    configured,
    supporter,
    async handle(request) {
      try {
        return await handle(request);
      } catch (error) {
        console.error(error);
        return answer(500, { error: 'The server hit a problem.' });
      }
    },
  };
}
