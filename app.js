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
  const World = window.FermiWorld;
  const Tape = window.FermiTape;
  const ROUND = C.ROUND;
  const STORE_KEY = 'fermi-frog:v1'; // boot.js reads the same key
  const FEET = 0.74; // where the frog's feet are in the scene, as a share of the scene's height (same as style.css)
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const sprite = (pose) => 'img/frog/' + pose + '.webp';
  const bug = (name) => 'img/bugs/' + name + '.webp';
  // Load the pictures of a round before they are needed, so no pose appears late.
  ['think', 'ponder', 'catch', 'jump', 'cheer', 'panic'].forEach((pose) => { new Image().src = sprite(pose); });
  ['fly-up', 'fly-down', 'gold-up', 'gold-down'].forEach((name) => { new Image().src = bug(name); });

  const badge = (zone) => 'img/badge/' + zone.id + '.webp';
  const face = (avatar) => sprite(C.cleanAvatar(avatar)); // a player's frog; anything unknown becomes the first frog

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

  function cleanRanges(ranges) {
    const out = [];
    for (const r of Array.isArray(ranges) ? ranges : []) {
      if (!Array.isArray(r) || !(r[0] > 0) || !(r[1] >= r[0]) || !Number.isFinite(r[1])) break;
      out.push([r[0], r[1]]);
    }
    return out.slice(0, ROUND);
  }

  function load() {
    // a new player starts in the browser's language, if the game speaks it
    const fresh = { profile: P.clean(null, P.guessLang(navigator.languages || [navigator.language])), player: '', days: {} };
    try {
      const data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!data || typeof data !== 'object') return fresh;
      // before profiles existed, the name was saved on its own
      fresh.profile = P.clean(data.profile || { name: data.name }, fresh.profile.lang);
      for (const [day, saved] of Object.entries(data.days && typeof data.days === 'object' ? data.days : {})) {
        const ranges = cleanRanges(saved && saved.ranges);
        if (!ranges.length) continue;
        fresh.days[day] = { ranges };
        // `entry` is this player's line on that day's leaderboard, once the score is posted
        if (typeof saved.entry === 'string' && /^[0-9a-f]{12}$/.test(saved.entry)) fresh.days[day].entry = saved.entry;
      }
      if (typeof data.player === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(data.player)) fresh.player = data.player;
    } catch (e) { /* private window or blocked storage: play without memory */ }
    return fresh;
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* same */ }
  }

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
    const backdrop = World.createBackdrop(scenery, FEET);
    const stem = h('div', { class: 'stem' }); // the tall reed that holds the leaf up
    const perch = h('img', { class: 'perch', alt: '', draggable: 'false', hidden: true });
    const img = h('img', { class: 'frog-img', alt: '', draggable: 'false' });
    const frog = h('div', { class: 'frog' }, img);
    const el = h('div', { class: 'stage' + (extra ? ' ' + extra : '') }, scenery, stem, perch, frog);
    let height = 0, pose = '';

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

    return {
      el, frog, layout,
      setHeight(points, animate) { height = points; backdrop.show(points, !!animate && !still); stand(); },
      pose(name) { if (name !== pose) { pose = name; img.src = sprite(name); frog.dataset.pose = name; } },
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
    const stage = makeStage('tall');
    stage.pose(isDone(today) ? 'sleep' : 'write'); // after today's round, the frog rests until midnight
    stage.el.append(
      h('img', { class: 'logo', src: 'img/ui/logo.webp', alt: '', draggable: 'false' }),
      // the player's frog, in the corner: the way to the profile
      h('button', { class: 'me-chip', type: 'button', 'aria-label': T('home.profile'), title: T('home.profile'), onclick: () => showProfile() },
        h('img', { src: face(profile.avatar), alt: '' })));

    const started = !!store.days[today] && !isDone(today);
    const label = T(isDone(today) ? 'home.result' : started ? 'home.continue' : 'home.play');
    const run = C.streak(store.days, today);
    const date = C.dateOfDay(today);
    let fine = T('home.round', { n: today, date: date.getUTCDate() + ' ' + I.month(profile.lang, date.getUTCMonth()) });
    if (!fine.endsWith('.')) fine += '.'; // a short month already ends with a dot: "19 nov."
    if (run >= 2) fine += ' ' + T('home.streak', { n: run });

    show(h('div', { class: 'screen home' },
      stage.el,
      h('div', { class: 'deck' },
        h('h2', { class: 'tagline', text: T('home.tagline') }),
        h('ol', { class: 'steps' },
          h('li', { text: T('home.step1') }), h('li', { text: T('home.step2') }), h('li', { text: T('home.step3') })),
        h('button', { class: 'go', type: 'button', text: label, onclick: startDaily }),
        h('div', { class: 'pair' }, ghost(T('home.leaderboard'), showBoard), ghost(T('home.practice'), startPractice)),
        h('p', { class: 'fine', text: fine }))),
    () => { stage.layout(); stage.setHeight(0, false); });
  }

  /* ---------- screen: play ---------- */

  function showPlay() {
    const stage = makeStage();
    const pips = h('div', { class: 'pips' });
    const heightNum = h('b'), zoneLabel = h('span'), zoneBadge = h('img', { alt: '' });
    const question = h('h2', { class: 'question' });
    const pop = h('p', { class: 'pop', hidden: true, 'aria-hidden': 'true' });
    const fly = makeFly();
    stage.el.append(
      h('div', { class: 'hud' }, pips, h('div', { class: 'alt' }, zoneBadge, zoneLabel, heightNum)),
      h('div', { class: 'bubble' }, question),
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
      h('div', { class: 'deck' }, rangeLine, tapeEl, widths, after, go),
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
    }

    function ask(i) {
      index = i;
      phase = 'ask';
      question.textContent = game.qs[i].q;
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

      answer.textContent = o.q.text;
      howBox.replaceChildren(h('p', { text: o.q.how }), h('p', { class: 'source', text: T('play.source', { source: o.q.source }) }));
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
        save();
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

    show(h('div', { class: 'screen end' },
      tree.el,
      h('div', { class: 'deck' },
        h('img', { class: 'medal', src: badge(zone), alt: '' }),
        h('h2', { class: 'verdict', text: T('end.verdict', { where: T('where.' + zone.id) }) }),
        h('p', { class: 'total' }, h('b', { text: String(sum) }), ' ' + T('end.of', { max: C.MAX_SCORE })),
        h('ul', { class: 'catches', 'aria-label': T('end.flies') },
          rows.map((o) => h('li', { class: o.score.hit ? 'caught' : 'missed', title: o.q.short + ': ' + o.q.text,
            text: o.score.hit ? '+' + o.score.points : T('end.miss') }))),
        daily ? boardSection(tree) : null,
        shareBox,
        h('div', { class: 'pair' },
          ghost(T(daily ? 'end.practice' : 'end.again'), startPractice),
          ghost(T('end.home'), showHome)),
        daily ? h('p', { class: 'fine', text: T('end.midnight') }) : null)),
    () => tree.layout());
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
    show(h('div', { class: 'screen end' },
      tree.el,
      h('div', { class: 'deck' },
        h('h2', { class: 'verdict', text: T('board.who') }),
        boardSection(tree),
        done ? null : h('button', { class: 'go', type: 'button', text: T(store.days[today] ? 'home.continue' : 'home.play'), onclick: startDaily }),
        ghost(T('end.home'), showHome))),
    () => tree.layout());
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
    const section = (title, ...kids) => h('section', null, h('h3', { text: title }), kids);

    const name = h('input', { id: 'profile-name', type: 'text', maxlength: '16', autocomplete: 'nickname', autocapitalize: 'words',
      spellcheck: 'false', value: profile.name, oninput: () => { profile.name = C.cleanName(name.value); save(); } });

    const frogs = h('div', { class: 'frogs', role: 'group', 'aria-label': T('profile.frog') },
      P.AVATARS.map((pose, i) => h('button', { type: 'button', 'aria-pressed': String(pose === profile.avatar),
        'aria-label': T('profile.pick', { n: i + 1 }),
        onclick: (event) => { profile.avatar = pose; save(); stage.pose(pose); choose(frogs, event.currentTarget); } },
        h('img', { src: sprite(pose), alt: '' }))));

    const langs = h('div', { class: 'choices', role: 'group', 'aria-label': T('profile.language') },
      P.LANGS.map((code) => h('button', { type: 'button', lang: code, 'aria-pressed': String(code === profile.lang), text: I.NAMES[code],
        onclick: () => { if (code === profile.lang) return; profile.lang = code; save(); applyLook(); showProfile('langs'); } })));

    const colours = h('div', { class: 'swatches', role: 'group', 'aria-label': T('profile.colour') },
      P.COLOURS.map((id) => h('button', { class: 'swatch', type: 'button', 'data-colour': id, 'aria-pressed': String(id === profile.colour),
        'aria-label': T('colour.' + id), title: T('colour.' + id),
        onclick: (event) => { profile.colour = id; save(); applyLook(); choose(colours, event.currentTarget); } })));

    const stats = P.stats(store.days, QUESTIONS, today);
    const tile = (number, label) => h('li', null, h('b', { text: String(number) }), label);

    show(h('div', { class: 'screen end profile' },
      stage.el,
      h('div', { class: 'deck' },
        h('h2', { class: 'verdict', text: T('profile.title') }),
        h('div', { class: 'field' }, h('label', { for: 'profile-name', text: T('profile.name') }), name),
        section(T('profile.frog'), frogs),
        section(T('profile.language'), langs, profile.lang === 'en' ? null : h('p', { class: 'note', text: T('profile.questions') })),
        section(T('profile.colour'), colours),
        section(T('profile.stats'),
          h('ul', { class: 'stats' },
            tile(stats.played, T('profile.played')), tile(stats.best, T('profile.best')), tile(stats.streak, T('profile.streak')))),
        // the six places of the tree: the ones this player has reached are lit
        section(T('profile.places'),
          h('ul', { class: 'places' }, C.ZONES.map((zone, i) => h('li', { class: stats.reached[i] ? null : 'dim', 'aria-hidden': stats.reached[i] ? null : 'true' },
            h('img', { src: badge(zone), alt: zoneWord(zone), title: zoneWord(zone) }))))),
        h('p', { class: 'note', text: T('profile.account') }),
        ghost(T('end.home'), showHome))),
    () => { stage.layout(); stage.setHeight(0, false); });

    if (focusOn === 'langs') langs.querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
  }

  /* ---------- go ---------- */

  applyLook();
  showHome();
})();
