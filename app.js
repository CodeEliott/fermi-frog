/* Fermi Frog: the page.
   Five screens: start, play, the climb (result), the leaderboard, the profile.
   The rules live in core.js, the profile in profile.js, the words in i18n.js, the world in world.js, the scale in tape.js.
   The leaderboard lives on the server (server.mjs): the page talks to it only to read the board,
   and to post a score when the player asks. */
(function () {
  'use strict';

  const C = window.FermiCore;
  const P = window.FermiProfile;
  const I = window.FermiI18n;
  const QUESTIONS = window.FERMI_QUESTIONS;
  const QUESTION_WORDS = window.FERMI_QUESTIONS_TEXT || {}; // the questions in the other languages, by question id
  const World = window.FermiWorld;
  const Tape = window.FermiTape;
  const Pond = window.FermiPond;
  const Sprites = window.FermiSprites;
  const SHEETS = window.FERMI_SHEETS;
  const ROUND = C.ROUND;
  const STORE_KEY = 'fermi-frog:v1'; // boot.js reads the same key
  const FEET = 0.74; // where the frog's feet are in the scene, as a share of the scene's height (same as style.css)
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // a computer's window: the same test as style.css. Some screens are built differently there (the result: see showEnd).
  const wideScreen = () => matchMedia('(min-width: 56rem) and (min-height: 34rem)').matches;

  // The frog has two looks. In a scene it is part of the world: drawn with its outline only.
  // As a player's picture (profile, leaderboard) it is a sticker with a white border.
  const sprite = (pose) => 'img/frog-plain/' + pose + '.webp';
  const bug = (name) => 'img/bugs/' + name + '.webp';
  // Load the pictures of a round before they are needed, so no pose appears late.
  ['think', 'ponder', 'catch', 'jump', 'cheer', 'panic'].forEach((pose) => { new Image().src = sprite(pose); });
  ['fly-up', 'fly-down', 'gold-up', 'gold-down'].forEach((name) => { new Image().src = bug(name); });
  // The animations too. An animation is shown only once its picture has arrived: until then the still stands in,
  // and whoever was waiting for that picture is told when it lands.
  const ready = new Set();
  const waiting = new Map(); // a picture's address -> what to do once it has arrived
  if (!still) {
    for (const sheet of Object.values(SHEETS)) {
      const picture = new Image();
      picture.onload = () => {
        ready.add(sheet.src);
        (waiting.get(sheet.src) || []).forEach((start) => start());
        waiting.delete(sheet.src);
      };
      picture.src = sheet.src;
    }
  }
  // Do `start` once a sheet's picture has arrived: at once if it already has.
  function whenReady(sheet, start) {
    if (ready.has(sheet.src)) return start();
    waiting.set(sheet.src, [...(waiting.get(sheet.src) || []), start]);
  }

  // Flip through a sheet's pictures in a `film` layer (see sprites.js). A loop turns until it is stopped
  // or its screen is left; a one-time animation stops on its last picture, then calls `onEnd`. Returns the way to stop it.
  function roll(film, sheet, onEnd) {
    Object.assign(film.style, Sprites.place(sheet));
    film.style.backgroundImage = 'url("' + sheet.src + '")';
    film.style.backgroundSize = sheet.cols * 100 + '% ' + sheet.rows * 100 + '%';
    film.hidden = false;
    const start = performance.now();
    let turning = 0, shown = false, unseen = 0;
    (function turn(now) {
      if (!film.isConnected && (shown || ++unseen > 120)) return; // its screen is gone, or it never appeared
      shown = shown || film.isConnected;
      film.style.backgroundPosition = Sprites.positionOf(sheet, Sprites.frameAt(sheet, now - start));
      if (!Sprites.ended(sheet, now - start)) turning = requestAnimationFrame(turn);
      else if (onEnd) onEnd();
    })(start);
    return () => cancelAnimationFrame(turning);
  }

  const badge = (zone) => 'img/badge/' + zone.id + '.webp';
  const face = (avatar) => 'img/frog/' + C.cleanAvatar(avatar) + '.webp'; // a player's frog; anything unknown becomes the first frog

  // The pose that sums up a final score, one per zone, from a splash in the pond to an astronaut on the moon.
  const FINAL_POSES = ['splash', 'shrug', 'climb', 'proud', 'wink', 'astronaut'];
  const finalPose = (points) => FINAL_POSES[C.ZONES.indexOf(C.zoneFor(points))];

  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');

  /* ---------- small helpers ---------- */

  function fill(el, props, kids) {
    for (const [key, value] of Object.entries(props || {})) {
      if (value == null || value === false) continue;
      if (key === 'text') el.textContent = value;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value === true ? '' : value);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  }
  const h = (tag, props, ...kids) => fill(document.createElement(tag), props, kids);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, still ? 0 : ms));
  const ghost = (text, onclick) => h('button', { class: 'ghost', type: 'button', text, onclick });

  // Show a screen. `layout` paints what depends on the screen's size; it runs again when the window changes size.
  let relayout = null;
  function show(screen, layout) {
    app.replaceChildren(screen);
    relayout = layout || null;
    if (relayout) relayout();
    const head = screen.querySelector('h2');
    if (head) { head.setAttribute('tabindex', '-1'); head.focus({ preventScroll: true }); }
  }
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (relayout) relayout(); }, 120);
  });

  let toastTimer = null;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  /* ---------- what the browser remembers ---------- */

  // { profile, profileAt, days, player }. The first three are the "saved data" of profile.js: an account can hold them too.
  function load() {
    // a new player starts in the browser's language, if the game speaks it
    const fresh = { profile: P.clean(null, P.guessLang(navigator.languages || [navigator.language])), profileAt: 0, player: '', days: {} };
    try {
      const data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!data || typeof data !== 'object') return fresh;
      // before profiles existed, the name was saved on its own
      fresh.profile = P.clean(data.profile || { name: data.name }, fresh.profile.lang);
      fresh.profileAt = P.changedAt(data); // when the profile was last changed
      fresh.days = P.cleanDays(data.days);
      if (typeof data.player === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(data.player)) fresh.player = data.player;
    } catch (e) { /* private window or blocked storage: play without memory */ }
    return fresh;
  }

  // Write to this browser only.
  function keep() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* same */ }
  }

  // Write to this browser, and a moment later to the account if the player is signed in.
  function save() {
    keep();
    if (account.signedIn) { clearTimeout(syncTimer); syncTimer = setTimeout(sync, 800); }
  }

  // The profile changed: note when, so that across devices the newest profile wins.
  function saveProfile() {
    store.profileAt = Date.now();
    save();
  }

  let account = { configured: false, signedIn: false }; // what the server last said about signing in and the plan (see account.mjs)
  const supports = () => !!account.signedIn && account.plan === P.PLAN.id; // has this player bought the plan?
  const signedOut = () => ({ configured: account.configured, selling: account.selling, signedIn: false });
  let syncTimer = 0;
  const store = load();
  const profile = store.profile;
  const today = C.dayNumber(new Date());
  const isDone = (day) => !!store.days[day] && store.days[day].ranges.length >= ROUND;

  // A random id made in this browser. It lets the server keep one score per player per day.
  // It is not an account: it holds no name and no personal data.
  function playerId() {
    if (!store.player) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      store.player = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      save();
    }
    return store.player;
  }

  /* ---------- the player's language and colour ---------- */

  const T = (key, vars) => I.t(profile.lang, key, vars);
  const amount = (n, sig) => C.formatAmount(n, sig, profile.lang);
  const zoneWord = (zone) => T('zone.' + zone.id);

  // A question's words in the player's language. A missing translation falls back to English.
  function said(q) {
    const words = (QUESTION_WORDS[profile.lang] || {})[q.id] || q;
    const read = (field) => I.tidy(profile.lang, words[field] || q[field]);
    return { q: read('q'), short: read('short'), text: read('text'), how: read('how'), source: read('source') };
  }

  // A sentence whose blanks are filled with elements instead of text: phrase('play.range', { low: <b>, high: <b> })
  function phrase(key, parts) {
    return T(key).split(/(\{[a-z]+\})/).map((piece) => {
      const blank = /^\{([a-z]+)\}$/.exec(piece);
      return blank ? parts[blank[1]] : piece;
    });
  }

  // Put the profile's language and colour on the page. boot.js does the same before the first paint.
  function applyLook() {
    const root = document.documentElement;
    root.lang = profile.lang;
    root.dataset.colour = profile.colour;
    const bar = document.querySelector('meta[name="theme-color"]'); // the phone's status bar follows the app's colour
    const navy = getComputedStyle(root).getPropertyValue('--navy').trim();
    if (bar && navy) bar.content = navy;
  }

  /* ---------- the account: optional, it carries the player's data from one device to another ---------- */

  const myData = () => ({ profile: store.profile, profileAt: store.profileAt, days: store.days });

  // Bring another copy of the player's data into this browser. Merged, so no round is lost (profile.js).
  // `arriving` is the moment of signing in: then the account's profile wins.
  function takeIn(data, arriving) {
    const both = arriving ? P.signIn(myData(), data) : P.mergeData(myData(), data);
    Object.assign(profile, both.profile);
    store.profileAt = both.profileAt;
    store.days = both.days;
    keep();
    applyLook();
  }

  // Send this browser's data to the account. The answer is the account's data after merging: take it back in.
  async function sync() {
    if (!account.signedIn) return;
    try {
      const res = await fetch('/api/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(myData()) });
      if (res.status === 401) { account = signedOut(); return; } // the session ended
      if (res.ok) takeIn((await res.json()).data);
    } catch (e) { /* offline: this browser keeps its copy, and the next save tries again */ }
  }

  // Ask the server whether this browser is signed in. If it is, the two copies of the data are made one.
  async function meetAccount() {
    const back = new URLSearchParams(location.search);
    const came = back.get('signed');   // "in" or "no", when just back from Google
    const bought = back.get('bought'); // "yes" or "no", when just back from the payment page
    if (came || bought) history.replaceState(null, '', location.pathname);
    try { account = await (await fetch('/api/me')).json(); } catch (e) { account = { configured: false, signedIn: false }; }
    if (account.signedIn) {
      takeIn(account.data, came === 'in');
      await sync();
      if (!game) showHome(); // today's round may already be played on another device
    }
    if (came) toast(T(account.signedIn ? 'account.welcome' : 'account.failed'));
    if (bought) {
      showPlan();
      toast(T(bought !== 'yes' ? 'plan.cancelled' : supports() ? 'plan.paid' : 'plan.pending'));
    }
  }

  // The small Google sign, drawn by code. Google asks for it on a "Sign in with Google" button.
  function googleSign() {
    const NS = 'http://www.w3.org/2000/svg';
    const sign = document.createElementNS(NS, 'svg');
    sign.setAttribute('viewBox', '0 0 48 48');
    sign.setAttribute('aria-hidden', 'true');
    for (const [fill, d] of [
      ['#EA4335', 'M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z'],
      ['#4285F4', 'M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z'],
      ['#FBBC05', 'M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z'],
      ['#34A853', 'M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z'],
    ]) {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('fill', fill);
      path.setAttribute('d', d);
      sign.append(path);
    }
    return sign;
  }

  /* ---------- talking to the leaderboard ---------- */

  // The server answers in English. The page says it in the player's language, by the kind of answer.
  async function api(method, path, body) {
    let res;
    try {
      res = await fetch(path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.ok) return await res.json();
    } catch (e) {
      throw new Error(T('board.unreachable'));
    }
    throw new Error(T(res.status === 409 ? 'board.full' : res.status < 500 ? 'board.refused' : 'board.unreachable'));
  }

  /* ---------- the round in play ---------- */

  let game = null;

  function startDaily() {
    const saved = store.days[today];
    game = {
      mode: 'daily',
      qs: C.pickDaily(QUESTIONS, today, ROUND),
      ranges: saved ? saved.ranges.map((r) => r.slice()) : [],
    };
    if (game.ranges.length < ROUND) showPlay(); else showEnd();
  }

  function startPractice() {
    const seed = C.hashString('practice' + Math.random());
    game = { mode: 'practice', qs: C.shuffle(QUESTIONS, seed).slice(0, ROUND), ranges: [] };
    showPlay();
  }

  // Everything known about question i once the player has locked a range.
  function outcome(i) {
    const q = game.qs[i];
    const [low, high] = game.ranges[i];
    return { q, low, high, score: C.scoreRange(low, high, q.answer) };
  }

  function total() {
    let sum = 0;
    for (let i = 0; i < game.ranges.length; i++) sum += outcome(i).score.points;
    return sum;
  }

  /* ---------- the scene: a window on the world, with the frog on its perch ---------- */

  function makeStage(extra) {
    const scenery = h('div', { class: 'world', 'aria-hidden': 'true' });
    // where the frog's feet are: style.css puts them lower on a computer
    const feet = () => (el.clientHeight && frog.offsetTop ? frog.offsetTop / el.clientHeight : FEET);
    const backdrop = World.createBackdrop(scenery, feet);
    const stem = h('div', { class: 'stem' }); // the tall reed that holds the leaf up
    const perch = h('img', { class: 'perch', alt: '', draggable: 'false', hidden: true });
    const img = h('img', { class: 'frog-img', alt: '', draggable: 'false' });
    const film = h('div', { class: 'frog-film', hidden: true }); // the animated frog, laid exactly over the still one
    const frog = h('div', { class: 'frog' }, img, film);
    const el = h('div', { class: 'stage' + (extra ? ' ' + extra : '') }, scenery, stem, perch, frog);
    let height = 0, pose = '', stop = () => {};

    // What the frog stands on in this zone: a lily pad, a leaf on a reed, a branch, a cloud. On the moon, the ground.
    function stand() {
      const kind = World.perchFor(height);
      perch.hidden = !kind;
      if (kind && perch.dataset.kind !== kind) { perch.dataset.kind = kind; perch.src = 'img/perch/' + kind + '.webp'; }
      stem.className = 'stem' + (kind === 'leaf' ? ' reed' : '');
    }

    const layout = () => { if (el.clientWidth) { backdrop.layout(height); stand(); } };
    // The window changes size when a font loads or a panel opens below it: the scene must follow.
    if (window.ResizeObserver) new ResizeObserver(layout).observe(el);

    function setPose(name) {
      if (name === pose) return;
      pose = name;
      stop();
      film.hidden = true;
      img.classList.remove('under');
      const listed = SHEETS[name];
      const sheet = listed && ready.has(listed.src) ? listed : null;
      const standsOn = (sheet && sheet.still) || name; // an animation may be drawn over another pose's still (the jump starts seated)
      img.src = sprite(standsOn);
      frog.dataset.pose = standsOn;
      if (sheet) {
        stop = roll(film, sheet);
        img.classList.add('under'); // the still keeps the frog's place and size, unseen
      } else if (listed && !still) {
        // its picture is still on the way: stand still for now, and start moving when it lands (if the pose has not changed)
        whenReady(listed, () => { if (pose === name) { pose = ''; setPose(name); } });
      }
    }

    return {
      el, frog, layout,
      setHeight(points, animate) { height = points; backdrop.show(points, !!animate && !still); stand(); },
      pose: setPose,
    };
  }

  // The fly: two stickers, wings up and wings down, that swap. `gold(true)` makes it the golden fly.
  function makeFly() {
    const up = h('img', { class: 'up', alt: '' }), down = h('img', { class: 'down', alt: '' });
    const el = h('div', { class: 'fly', 'aria-hidden': 'true', hidden: true }, up, down);
    el.gold = (on) => { up.src = bug(on ? 'gold-up' : 'fly-up'); down.src = bug(on ? 'gold-down' : 'fly-down'); };
    el.gold(false);
    return el;
  }

  /* ---------- screen: start ---------- */

  function showHome() {
    game = null;
    const waitingForMidnight = isDone(today);
    // Before today's round: the frog writes under the title. After it: nothing left to do, so the scene is the pond.
    const stage = waitingForMidnight ? null : makeStage('tall');
    const scene = stage ? stage.el : makePond();
    if (stage) {
      stage.pose('write');
      scene.append(h('img', { class: 'logo', src: 'img/ui/logo.webp', alt: '', draggable: 'false' }));
    }
    scene.append(
      // the player's frog, in the corner: the way to the profile
      h('button', { class: 'me-chip', type: 'button', 'aria-label': T('home.profile'), title: T('home.profile'), onclick: () => showProfile() },
        h('img', { src: face(profile.avatar), alt: '' })),
      // a lily pad in the other corner: the pond, on the whole screen
      h('button', { class: 'me-chip pond-chip', type: 'button', 'aria-label': T('home.pond'), title: T('home.pond'), onclick: showPond },
        h('img', { src: 'img/pond/leaf-1.webp', alt: '' })));

    const started = !!store.days[today] && !isDone(today);
    const label = T(isDone(today) ? 'home.result' : started ? 'home.continue' : 'home.play');
    const run = C.streak(store.days, today);
    const date = C.dateOfDay(today);
    let fine = T('home.round', { n: today, date: date.getUTCDate() + ' ' + I.month(profile.lang, date.getUTCMonth()) });
    if (!fine.endsWith('.')) fine += '.'; // a short month already ends with a dot: "19 nov."
    if (run >= 2) fine += ' ' + T('home.streak', { n: run });
    if (waitingForMidnight) fine += ' ' + T('end.midnight');

    show(h('div', { class: 'screen home' },
      scene,
      h('div', { class: 'deck' },
        h('h2', { class: 'tagline', text: T('home.tagline') }),
        h('ol', { class: 'steps' },
          h('li', { text: T('home.step1') }), h('li', { text: T('home.step2') }), h('li', { text: T('home.step3') })),
        h('button', { class: 'go', type: 'button', text: label, onclick: startDaily }),
        h('div', { class: 'pair' }, ghost(T('home.leaderboard'), showBoard), ghost(T('home.practice'), startPractice)),
        h('p', { class: 'fine', text: fine }))),
    stage ? () => { stage.layout(); stage.setHeight(0, false); } : null);
  }

  /* ---------- screen: play ---------- */

  function showPlay() {
    const stage = makeStage();
    const pips = h('div', { class: 'pips' });
    const heightNum = h('b'), zoneLabel = h('span'), zoneBadge = h('img', { alt: '' });
    const question = h('h2', { class: 'question' });
    const flyNumber = h('p', { class: 'fly-number', 'aria-hidden': 'true' }); // "Fly 3 of 5", over the question (on a computer)
    const pop = h('p', { class: 'pop', hidden: true, 'aria-hidden': 'true' });
    const fly = makeFly();
    // On a computer, the right edge shows the six places of the tree, the frog's one lit (style.css hides it on a phone)
    const places = C.ZONES.slice().reverse().map((zone) => h('img', { src: badge(zone), alt: '', 'data-from': zone.from }));
    stage.el.append(
      h('div', { class: 'hud' },
        h('div', { class: 'hud-left' }, h('img', { class: 'hud-logo', src: 'img/ui/logo.webp', alt: '' }), pips),
        h('div', { class: 'alt' }, zoneBadge, zoneLabel, heightNum)),
      h('div', { class: 'bubble' }, flyNumber, question),
      h('div', { class: 'meter', 'aria-hidden': 'true' }, places),
      pop);

    const rangeLine = h('p', { class: 'range', 'aria-live': 'polite' });
    const tapeEl = h('div', { class: 'tape' });
    const widths = h('div', { class: 'widths', role: 'group', 'aria-label': T('play.widths') });
    const answer = h('p', { class: 'answer' });
    const howBox = h('div', { class: 'how', hidden: true });
    const howToggle = h('button', { class: 'link', type: 'button', text: T('play.how'), 'aria-expanded': 'false', onclick: () => {
      howBox.hidden = !howBox.hidden;
      howToggle.setAttribute('aria-expanded', String(!howBox.hidden));
    } });
    const after = h('div', { class: 'after', hidden: true }, h('div', { class: 'answer-row' }, answer, howToggle), howBox);
    const go = h('button', { class: 'go', type: 'button', onclick: press });
    const screen = h('div', { class: 'screen play' },
      stage.el,
      h('div', { class: 'deck' }, rangeLine, tapeEl, widths, after, go, h('p', { class: 'keys', 'aria-hidden': 'true', text: T('play.keys') })),
      fly);

    let index = game.ranges.length;
    let phase = 'ask'; // ask -> busy -> done
    const tape = Tape.createTape(tapeEl, refresh,
      { hint: T('play.drag'), label: T('play.scale'), compact: (n) => C.compactAmount(n, profile.lang) });

    C.WIDTHS.forEach((ratio, i) => {
      widths.append(h('button', { type: 'button', 'aria-label': T('play.width', { ratio: amount(ratio), points: C.POINTS[i] }),
        onclick: () => tape.setWidth(i) },
        h('small', { text: '×' + amount(ratio) }), h('b', { text: String(C.POINTS[i]) })));
    });
    tapeEl.addEventListener('pointerdown', () => { if (phase === 'ask') stage.pose('ponder'); });
    screen.addEventListener('keydown', (event) => {
      if (phase === 'ask' && event.key >= '1' && event.key <= '5') tape.setWidth(Number(event.key) - 1);
      // the arrow keys move the scale wherever the keyboard is (the scale answers them itself when it has the focus)
      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !tapeEl.contains(event.target)) {
        event.preventDefault();
        tapeEl.dispatchEvent(new KeyboardEvent('keydown', { key: event.key, shiftKey: event.shiftKey, bubbles: true }));
      }
      // Space or Enter: the same as the main button. Not on the other buttons and fields, which answer these keys themselves;
      // but a width button keeps the focus after a click, and Space there should still catch.
      const own = event.target.closest('a, input, textarea, button');
      if ((event.key === ' ' || event.key === 'Enter') && (!own || widths.contains(own))) {
        event.preventDefault();
        press();
      }
    });

    function refresh() {
      if (phase !== 'ask') return;
      const [low, high] = tape.range();
      const q = game.qs[index];
      const sig = tape.width() >= 3 ? 3 : 2;
      rangeLine.replaceChildren(
        ...phrase('play.range', { low: h('b', { text: amount(low, sig) }), high: h('b', { text: amount(high, sig) }) }),
        q.unit ? ' ' + T('unit.' + q.unit) : '');
      tapeEl.setAttribute('aria-valuetext', rangeLine.textContent);
      [...widths.children].forEach((button, i) => {
        button.classList.toggle('on', i === tape.width());
        button.setAttribute('aria-pressed', String(i === tape.width()));
      });
    }

    function drawHud(points) {
      heightNum.textContent = String(points);
      zoneLabel.textContent = zoneWord(C.zoneFor(points));
      zoneBadge.src = badge(C.zoneFor(points));
      pips.replaceChildren(...game.qs.map((q, i) => h('i', {
        class: i < game.ranges.length ? (outcome(i).score.hit ? 'caught' : 'missed') : i === index ? 'now' : null })));
      pips.setAttribute('aria-label', T('play.fly', { n: Math.min(index + 1, ROUND), total: ROUND }));
      const here = C.zoneFor(points).from;
      for (const img of places) {
        const from = Number(img.dataset.from);
        img.classList.toggle('dim', from > here);
        img.classList.toggle('here', from === here);
      }
    }

    function ask(i) {
      index = i;
      phase = 'ask';
      question.textContent = said(game.qs[i]).q;
      flyNumber.textContent = T('play.fly', { n: i + 1, total: ROUND });
      screen.classList.remove('revealed', 'hit', 'miss');
      after.hidden = true;
      howBox.hidden = true;
      howToggle.setAttribute('aria-expanded', 'false');
      widths.hidden = false;
      fly.hidden = true;
      go.textContent = T('play.catch');
      stage.pose('think');
      tape.reset();
      drawHud(total());
    }

    /* ---- the fly ---- */
    const local = (point) => { const box = screen.getBoundingClientRect(); return { x: point.x - box.left, y: point.y - box.top }; };
    const spot = (p) => 'translate(' + p.x.toFixed(1) + 'px, ' + p.y.toFixed(1) + 'px)';
    function flyMove(from, to, ms, easing) {
      fly.hidden = false;
      fly.style.transform = spot(to);
      if (still || !fly.animate) return Promise.resolve();
      const move = fly.animate([{ transform: spot(from) }, { transform: spot(to) }], { duration: ms, easing: easing || 'ease-out' });
      return Promise.race([move.finished.catch(() => {}), sleep(ms + 200)]); // a hidden tab never finishes: do not wait forever
    }

    function showPop(text) {
      pop.textContent = text;
      pop.hidden = false;
      pop.classList.remove('run');
      void pop.offsetWidth; // start the animation again
      pop.classList.add('run');
      setTimeout(() => { pop.hidden = true; }, 1150);
    }

    function countUp(from, to, ms) {
      if (still) return;
      const start = performance.now();
      (function step(now) {
        const k = Math.min(1, (now - start) / ms);
        heightNum.textContent = String(Math.round(from + (to - from) * k));
        if (k < 1) requestAnimationFrame(step);
      })(start);
    }

    // The frog jumps up by the points it just won.
    async function climb(from, to) {
      stage.pose('jump');
      stage.frog.classList.add('hop');
      stage.setHeight(to, true);
      countUp(from, to, 850);
      await sleep(950);
      stage.frog.classList.remove('hop');
      stage.pose(to >= C.MAX_SCORE ? 'astronaut' : 'cheer');
      drawHud(to);
      if (C.zoneFor(to) !== C.zoneFor(from)) { showPop(T('play.zone', { zone: zoneWord(C.zoneFor(to)) })); await sleep(650); }
    }

    async function press() {
      if (phase === 'done') return index + 1 < ROUND ? ask(index + 1) : showEnd();
      if (phase !== 'ask') return;
      phase = 'busy';
      go.disabled = true;
      const before = total();
      game.ranges.push(tape.range());
      if (game.mode === 'daily') {
        store.days[today] = { ...store.days[today], ranges: game.ranges };
        save();
      }
      const o = outcome(index);

      fly.gold(tape.width() === C.WIDTHS.length - 1); // the narrowest range goes for the golden fly
      await tape.lock(o.q.answer);
      const landing = local(tape.answerPoint());
      await flyMove({ x: landing.x - 46, y: landing.y - 80 }, landing, 340);
      screen.classList.add('revealed', o.score.hit ? 'hit' : 'miss');
      await sleep(380);

      if (o.score.hit) {
        // In the "catch" picture the tongue points to the upper right. The fly goes there to be caught.
        const box = stage.frog.getBoundingClientRect();
        await flyMove(landing, local({ x: box.left + box.width * 1.02, y: box.top + box.height * 0.1 }), 320, 'ease-in');
        fly.hidden = true;
        stage.pose('catch');
        rangeLine.textContent = T('play.caught', { n: o.score.points });
        showPop('+' + o.score.points);
        await sleep(650);
        await climb(before, before + o.score.points);
      } else {
        stage.pose('panic');
        rangeLine.textContent = T('play.missed');
        const side = landing.x > screen.clientWidth / 2 ? -80 : screen.clientWidth + 80;
        await flyMove(landing, { x: side, y: landing.y - 260 }, 650, 'ease-in');
        fly.hidden = true;
        drawHud(before);
      }

      const words = said(o.q);
      answer.textContent = words.text;
      howBox.replaceChildren(h('p', { text: words.how }), h('p', { class: 'source', text: T('play.source', { source: words.source }) }));
      widths.hidden = true;
      after.hidden = false;
      go.textContent = T(index + 1 < ROUND ? 'play.next' : 'play.end');
      go.disabled = false;
      phase = 'done';
      go.focus({ preventScroll: true });
    }

    show(screen, () => { stage.layout(); stage.setHeight(total(), false); tape.refit(); });
    ask(index);
  }

  /* ---------- the tree: the whole world, with every frog at its height ---------- */

  function makeTree(myTotal) {
    const scenery = h('div', { class: 'world', 'aria-hidden': 'true' });
    const layer = h('div', { class: 'tree-layer' });
    const el = h('div', { class: 'stage tree', tabindex: '0', 'aria-label': T('board.tree') },
      h('p', { class: 'tree-label', 'aria-hidden': 'true', text: T('board.title') }),
      h('div', { class: 'tree-inner' }, scenery, layer));
    let world = null, board = null, myEntry = null, centred = false;

    // a name tag: the player's frog, then the name and the score
    const tag = (cls, avatar, text) => h('div', { class: cls }, h('img', { src: face(avatar), alt: '' }), h('span', { text }));

    function draw() {
      if (!world) return;
      const kids = [];
      const put = (node, top) => { node.style.top = Math.round(top) + 'px'; kids.push(node); return node; };
      for (const zone of C.ZONES) {
        put(h('div', { class: 'zone-line' }, h('span', null, h('img', { src: badge(zone), alt: '' }), zoneWord(zone) + ' ' + zone.from)),
          world.floorOf(zone.from));
      }

      // the other players: two columns of name tags, moved down a little when two would overlap
      const rows = board ? board.top.filter((e) => e.id !== myEntry).slice(0, 24) : [];
      const used = [[], []];
      for (const e of rows) {
        let y = world.yOf(e.total), column = -1;
        for (let tries = 0; tries < 8 && column < 0; tries++) {
          column = used.findIndex((ys) => ys.every((other) => Math.abs(other - y) >= 24));
          if (column < 0) y += 24;
        }
        if (column < 0) continue;
        used[column].push(y);
        put(tag('tag', e.avatar, e.name + ' ' + e.total), y).style.right = column === 0 ? '2%' : '37%';
      }

      if (myTotal != null) {
        const y = world.yOf(myTotal);
        const first = !!board && !!board.me && board.me.id === myEntry && board.me.rank === 1;
        put(h('img', { class: 'tree-frog', src: sprite(first ? 'champion' : finalPose(myTotal)), alt: '' }), y); // a crown for the top frog
        put(tag('tag me', profile.avatar, T('board.tag', { n: myTotal })), y + 14).style.left = '4%';
      }
      layer.replaceChildren(...kids);
    }

    return {
      el,
      layout() {
        if (!el.clientWidth) return;
        world = World.buildTree(scenery, el.clientWidth);
        draw();
        if (!centred) { centred = true; el.scrollTop = world.yOf(myTotal == null ? 60 : myTotal) - el.clientHeight * 0.62; }
      },
      setBoard(next, entry) { board = next; myEntry = entry; draw(); },
    };
  }

  /* ---------- the leaderboard, as a block that fills itself ---------- */

  function boardRows(board, myEntry) {
    if (!board.count) return [h('p', { class: 'note', text: T('board.empty') })];
    const row = (e) => h('li', { class: e.id === myEntry ? 'me' : null },
      h('span', { class: 'rank', text: String(e.rank) }),
      h('img', { class: 'face', src: face(e.avatar), alt: '' }),
      h('span', { class: 'name', text: e.id === myEntry ? T('board.you', { name: e.name }) : e.name }),
      h('span', { class: 'score', text: String(e.total) }));
    const rows = board.top.map(row);
    const mine = board.me && board.me.id === myEntry ? board.me : null;
    if (mine && !board.top.some((e) => e.id === mine.id)) rows.push(h('li', { class: 'skip', 'aria-hidden': 'true', text: '…' }), row(mine));
    const frogs = board.count === 1 ? T('board.frog') : T('board.frogs', { n: board.count });
    const summary = mine ? T('board.rank', { rank: I.ordinal(profile.lang, mine.rank), frogs }) : T('board.count', { frogs });
    return [h('p', { class: 'note', text: summary }), h('ol', { class: 'board' }, rows)];
  }

  // Today's board. If the player finished today's round and did not post yet, the form comes first.
  function boardSection(tree) {
    const saved = store.days[today] || {};
    const formSlot = h('div');
    const listSlot = h('div', { 'aria-live': 'polite' }, h('p', { class: 'note', text: T('board.loading') }));
    let latest = 0; // a slow first answer must not overwrite a newer board
    const entry = () => (store.days[today] || {}).entry;
    const drawBoard = (board) => { listSlot.replaceChildren(...boardRows(board, entry())); tree.setBoard(board, entry()); };

    const asked = ++latest;
    api('GET', '/api/scores?day=' + today + (saved.entry ? '&entry=' + saved.entry : '')).then(
      (board) => { if (asked === latest) drawBoard(board); },
      (error) => { if (asked === latest) listSlot.replaceChildren(h('p', { class: 'note', text: error.message })); });

    if (isDone(today) && !saved.entry) {
      const name = h('input', { id: 'name', type: 'text', maxlength: '16', autocomplete: 'nickname', autocapitalize: 'words',
        spellcheck: 'false', value: profile.name, 'aria-describedby': 'post-problem' });
      const problem = h('p', { class: 'problem', id: 'post-problem', role: 'alert' });
      const button = h('button', { class: 'go', type: 'submit', text: T('board.post') });
      formSlot.append(h('form', { class: 'post', novalidate: true, onsubmit: async (event) => {
        event.preventDefault();
        const clean = C.cleanName(name.value);
        if (!clean) { problem.textContent = T('board.needName'); name.focus(); return; }
        profile.name = clean;
        saveProfile();
        problem.textContent = '';
        button.disabled = true;
        const mine = ++latest;
        try {
          const out = await api('POST', '/api/scores',
            { day: today, player: playerId(), name: clean, avatar: profile.avatar, ranges: store.days[today].ranges });
          store.days[today].entry = out.entry;
          save();
          formSlot.replaceChildren();
          if (mine === latest) drawBoard(out.board);
          toast(T('board.posted'));
        } catch (error) {
          problem.textContent = error.message;
          button.disabled = false;
        }
      } },
        h('label', { for: 'name', text: T('board.name') }),
        name,
        button,
        problem,
        h('p', { class: 'note', text: T('board.note') })));
    }

    return h('section', { class: 'board-box' }, h('h3', { text: T('board.title') }), formSlot, listSlot);
  }

  /* ---------- screen: the climb (result) ---------- */

  function showEnd() {
    const daily = game.mode === 'daily';
    const rows = game.qs.map((q, i) => outcome(i));
    const points = rows.map((o) => o.score.points);
    const sum = C.sum(points);
    const zone = C.zoneFor(sum);
    const tree = makeTree(sum);

    let shareBox = null;
    if (daily) {
      const fallback = h('textarea', { rows: '4', readonly: true, hidden: true, 'aria-label': T('end.result') });
      const copy = () => {
        const text = [
          T('share.title', { n: today }),
          T('share.score', { points: sum, where: T('where.' + zone.id) }),
          C.squares(points),
          location.origin + location.pathname,
        ].join('\n');
        const manual = () => { fallback.value = text; fallback.hidden = false; fallback.focus(); fallback.select(); toast(T('end.select')); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => toast(T('end.copied')), manual);
        } else manual();
      };
      shareBox = h('div', { class: 'share' }, ghost(T('end.copy'), copy), fallback);
    }

    // The medal, the verdict and the score. On a phone they head the panel, under the tree.
    // On a computer they are a card over a wide scene of the frog at its height, and the tree is a column beside it.
    const head = [
      h('img', { class: 'medal', src: badge(zone), alt: '' }),
      h('h2', { class: 'verdict', text: T('end.verdict', { where: T('where.' + zone.id) }) }),
      h('p', { class: 'total' }, h('b', { text: String(sum) }), ' ' + T('end.of', { max: C.MAX_SCORE }))];
    const stage = wideScreen() ? makeStage() : null;
    if (stage) {
      stage.pose(finalPose(sum));
      stage.el.append(h('div', { class: 'verdict-card' }, head));
    }

    show(h('div', { class: 'screen end' + (stage ? ' climb' : '') },
      stage ? stage.el : null,
      tree.el,
      h('div', { class: 'deck' },
        stage ? null : head,
        h('ul', { class: 'catches', 'aria-label': T('end.flies') },
          rows.map((o) => h('li', { class: o.score.hit ? 'caught' : 'missed', title: said(o.q).short + ' = ' + said(o.q).text,
            text: o.score.hit ? '+' + o.score.points : T('end.miss') }))),
        daily ? boardSection(tree) : null,
        shareBox,
        h('div', { class: 'pair' },
          ghost(T(daily ? 'end.practice' : 'end.again'), startPractice),
          ghost(T('end.home'), showHome)),
        daily ? h('p', { class: 'fine', text: T('end.midnight') }) : null)),
    () => { tree.layout(); if (stage) { stage.layout(); stage.setHeight(sum, false); } });
  }

  /* ---------- screen: leaderboard ---------- */

  function showBoard() {
    game = null;
    const done = isDone(today);
    let mine = null;
    if (done) {
      const qs = C.pickDaily(QUESTIONS, today, ROUND);
      mine = C.sum(store.days[today].ranges.map((r, i) => C.scoreRange(r[0], r[1], qs[i].answer).points));
    }
    const tree = makeTree(mine);
    // On a computer, like the result: a wide scene of the player's frog (at its height once today's round is done),
    // the title on a card over it, the tree as a column beside it, the board in the deep water below.
    const title = h('h2', { class: 'verdict', text: T('board.who') });
    const stage = wideScreen() ? makeStage() : null;
    if (stage) {
      stage.pose(done ? finalPose(mine) : 'think');
      stage.el.append(h('div', { class: 'verdict-card' },
        h('img', { class: 'medal', src: badge(C.zoneFor(mine || 0)), alt: '' }),
        title,
        done ? h('p', { class: 'total' }, h('b', { text: String(mine) }), ' ' + T('end.of', { max: C.MAX_SCORE })) : null));
    }
    show(h('div', { class: 'screen end' + (stage ? ' climb board-screen' : '') },
      stage ? stage.el : null,
      tree.el,
      h('div', { class: 'deck' },
        stage ? null : title,
        boardSection(tree),
        done ? null : h('button', { class: 'go', type: 'button', text: T(store.days[today] ? 'home.continue' : 'home.play'), onclick: startDaily }),
        ghost(T('end.home'), showHome))),
    () => { tree.layout(); if (stage) { stage.layout(); stage.setHeight(mine || 0, false); } });
  }

  /* ---------- the pond ---------- */

  // The frog on its lily pad, for the pond: its still picture, with an animation laid over it once that has arrived.
  // It rests ("float"). When its pad knocks against the bank it gets a fright ("bump"), then goes back to resting.
  function floatingFrog() {
    const img = h('img', { src: sprite('float'), alt: '', draggable: 'false' });
    const film = h('div', { class: 'frog-film', hidden: true });
    let playing = '', stop = () => {};
    function act(name, then) {
      const sheet = SHEETS[name];
      if (name === playing || !sheet || still) return;
      playing = name;
      whenReady(sheet, () => {
        if (playing !== name) return; // it changed its mind while the picture was on its way
        stop();
        stop = roll(film, sheet, then);
        img.classList.add('under');
      });
    }
    act('float');
    return { el: h('div', { class: 'pond-frog' }, img, film), startle: () => act('bump', () => act('float')) };
  }

  // Nothing to win here: the frog rests on a lily pad that floats where you point, or where you tilt the phone (pond.js).
  function makePond() {
    const finger = matchMedia('(pointer: coarse)').matches;
    const water = h('div', { class: 'pond' });
    const frog = floatingFrog();
    const pond = Pond.create(water, still, frog.el, frog.startle);
    const hint = h('p', { class: 'pond-hint', 'aria-live': 'polite', text: T('pond.hint') });
    // A phone only tells its tilt after a tap, and an iPhone asks the player first: hence a button.
    const tiltButton = finger && 'DeviceOrientationEvent' in window
      ? h('button', { class: 'ghost pond-tilt', type: 'button', text: T('pond.tilt'), onclick: async () => {
        tiltButton.disabled = true;
        const felt = await pond.tilt();
        hint.textContent = T(felt ? 'pond.tilting' : 'pond.noTilt');
        tiltButton.hidden = true;
      } })
      : null;
    return h('div', { class: 'pond-box' }, water, h('div', { class: 'pond-foot' }, hint, tiltButton));
  }

  /* ---------- screen: the pond, on the whole screen ---------- */

  function showPond() {
    game = null;
    show(h('div', { class: 'screen pond-screen' },
      h('h2', { class: 'sr', text: T('home.pond') }),
      makePond(),
      h('div', { class: 'hud' }, h('button', { class: 'home-link', type: 'button', text: '◀ ' + T('end.home'), onclick: showHome }))));
  }

  /* ---------- screen: the paid plan ---------- */

  // What the plan gives, and the way to pay. The card is typed on Stripe's page, never here (see account.mjs).
  function showPlan() {
    game = null;
    const mine = supports();
    const stage = makeStage();
    stage.pose(mine ? 'cheer' : 'proud');
    const fly = makeFly(); // the golden fly is the plan's sign
    fly.gold(true);
    fly.hidden = false;
    stage.el.append(fly, h('div', { class: 'hud' },
      h('button', { class: 'home-link', type: 'button', text: '◀ ' + T('end.home'), onclick: showHome })));

    const price = I.price(profile.lang, P.PLAN.cents, P.PLAN.currency);
    const perk = (picture, key) => h('li', null, h('img', { src: picture, alt: '' }), T(key));

    async function buy(event) {
      const button = event.currentTarget;
      button.disabled = true; // one press, one payment page
      try {
        const out = await (await fetch('/api/buy', { method: 'POST' })).json();
        if (out.url) { location.assign(out.url); return; } // off to the payment page; the player comes back with ?bought=
        if (out.plan === P.PLAN.id) { account.plan = out.plan; showPlan(); return; } // already bought, on another device
      } catch (e) { /* offline */ }
      button.disabled = false;
      toast(T('plan.failed'));
    }

    // The bottom of the screen: a thank-you, the way to pay, or signing in first (the plan is kept in the account).
    const offer = mine ? h('p', { class: 'thanks', text: T('plan.thanks') })
      : account.signedIn ? [
        h('button', { class: 'go', type: 'button', text: T('plan.buy', { price }), disabled: !account.selling, onclick: buy }),
        h('p', { class: 'fine', text: T('plan.fine') })]
      : [
        h('a', { class: 'google', href: '/api/auth/google' }, googleSign(), h('span', { text: T('account.signin') })),
        h('p', { class: 'fine', text: T('plan.signin') })];

    show(h('div', { class: 'screen end plan' },
      stage.el,
      h('div', { class: 'deck' },
        h('h2', { class: 'verdict', text: T('plan.title') }),
        mine ? null : h('p', { class: 'pitch', text: T('plan.pitch', { price }) }),
        h('ul', { class: 'perks' },
          perk(face('think'), 'plan.archive'), perk(face('wink'), 'plan.stats'), perk(bug('gold-up'), 'plan.look'), perk(face('sleep'), 'plan.freeze')),
        offer,
        ghost(T('plan.back'), () => showProfile()))),
    () => { stage.layout(); stage.setHeight(0, false); });
  }

  /* ---------- screen: profile ---------- */

  // The player's name, frog, language and colour. Each change is saved at once: there is no "save" button.
  // `focusOn` names the group to give the keyboard back to, after the screen is drawn again in a new language.
  function showProfile(focusOn) {
    game = null;
    const stage = makeStage();
    stage.pose(profile.avatar);
    stage.el.append(h('div', { class: 'hud' },
      h('button', { class: 'home-link', type: 'button', text: '◀ ' + T('end.home'), onclick: showHome })));

    // one button of a group is the chosen one
    const choose = (group, chosen) => [...group.children].forEach((button) => button.setAttribute('aria-pressed', String(button === chosen)));
    // `part` names the section, for the computer's layout (style.css places each one)
    const section = (part, title, ...kids) => h('section', { class: 'part-' + part }, h('h3', { text: title }), kids);

    const name = h('input', { id: 'profile-name', type: 'text', maxlength: '16', autocomplete: 'nickname', autocapitalize: 'words',
      spellcheck: 'false', value: profile.name, oninput: () => { profile.name = C.cleanName(name.value); saveProfile(); } });

    const frogs = h('div', { class: 'frogs', role: 'group', 'aria-label': T('profile.frog') },
      P.AVATARS.map((pose, i) => h('button', { type: 'button', 'aria-pressed': String(pose === profile.avatar),
        'aria-label': T('profile.pick', { n: i + 1 }),
        onclick: (event) => { profile.avatar = pose; saveProfile(); stage.pose(pose); choose(frogs, event.currentTarget); } },
        h('img', { src: face(pose), alt: '' }))));

    const langs = h('div', { class: 'choices', role: 'group', 'aria-label': T('profile.language') },
      P.LANGS.map((code) => h('button', { type: 'button', lang: code, 'aria-pressed': String(code === profile.lang), text: I.NAMES[code],
        onclick: () => { if (code === profile.lang) return; profile.lang = code; saveProfile(); applyLook(); showProfile('langs'); } })));

    const colours = h('div', { class: 'swatches', role: 'group', 'aria-label': T('profile.colour') },
      P.COLOURS.map((id) => h('button', { class: 'swatch', type: 'button', 'data-colour': id, 'aria-pressed': String(id === profile.colour),
        'aria-label': T('colour.' + id), title: T('colour.' + id),
        onclick: (event) => { profile.colour = id; saveProfile(); applyLook(); choose(colours, event.currentTarget); } })));

    const stats = P.stats(store.days, QUESTIONS, today);
    const tile = (number, label) => h('li', null, h('b', { text: String(number) }), label);

    // The door to the paid plan: there once the plan is on sale, and for good once it is bought.
    const planDoor = () => (supports() || account.selling
      ? h('button', { class: 'ghost gold', type: 'button', onclick: showPlan }, h('img', { src: bug('gold-up'), alt: '' }), T(supports() ? 'plan.thanks' : 'plan.title'))
      : null);

    // Signing in: off when the server has no Google keys, a Google button when signed out, two ways out when signed in.
    function accountPart() {
      if (!account.configured) return h('p', { class: 'note part-account', text: T('profile.account') });
      if (!account.signedIn) {
        return section('account', T('account.title'),
          h('a', { class: 'google', href: '/api/auth/google' }, googleSign(), h('span', { text: T('account.signin') })),
          h('p', { class: 'note', text: T('account.why') }),
          h('a', { class: 'note', href: '/privacy.html', text: T('account.privacy') }),
          planDoor());
      }
      const leave = async (method, path) => {
        try { await fetch(path, { method }); } catch (e) { /* offline: the cookie stays, nothing is lost */ }
        account = signedOut();
      };
      const wipe = ghost(T('account.delete'), async () => {
        if (wipe.dataset.sure !== 'yes') { // asked twice: this cannot be undone
          wipe.dataset.sure = 'yes';
          wipe.textContent = T('account.deleteSure');
          return;
        }
        await leave('DELETE', '/api/me');
        toast(T('account.deleted'));
        showProfile();
      });
      return section('account', T('account.title'),
        h('p', { class: 'note', text: T('account.signedIn') }),
        planDoor(),
        h('div', { class: 'pair' }, ghost(T('account.signout'), async () => { await leave('POST', '/api/signout'); showProfile(); }), wipe));
    }

    show(h('div', { class: 'screen end profile' },
      stage.el,
      h('div', { class: 'deck' },
        h('h2', { class: 'verdict', text: T('profile.title') }),
        h('div', { class: 'field part-name' }, h('label', { for: 'profile-name', text: T('profile.name') }), name),
        section('frog', T('profile.frog'), frogs),
        section('language', T('profile.language'), langs),
        section('colour', T('profile.colour'), colours),
        section('stats', T('profile.stats'),
          h('ul', { class: 'stats' },
            tile(stats.played, T('profile.played')), tile(stats.best, T('profile.best')), tile(stats.streak, T('profile.streak')))),
        // the six places of the tree: the ones this player has reached are lit
        section('places', T('profile.places'),
          h('ul', { class: 'places' }, C.ZONES.map((zone, i) => h('li', { class: stats.reached[i] ? null : 'dim', 'aria-hidden': stats.reached[i] ? null : 'true' },
            h('img', { src: badge(zone), alt: zoneWord(zone), title: zoneWord(zone) }))))),
        accountPart(),
        ghost(T('end.home'), showHome))),
    () => { stage.layout(); stage.setHeight(0, false); });

    if (focusOn === 'langs') langs.querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
  }

  /* ---------- go ---------- */

  applyLook();
  showHome();
  meetAccount();
})();
