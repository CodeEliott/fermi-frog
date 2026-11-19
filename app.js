/* Fermi Frog: the page.
   Four screens: start, play, the climb (result), the leaderboard.
   The rules live in core.js, the world in world.js, the scale in tape.js.
   The leaderboard lives on the server (server.mjs): the page talks to it only to read the board,
   and to post a score when the player asks. */
(function () {
  'use strict';

  const C = window.FermiCore;
  const QUESTIONS = window.FERMI_QUESTIONS;
  const World = window.FermiWorld;
  const Tape = window.FermiTape;
  const ROUND = C.ROUND;
  const STORE_KEY = 'fermi-frog:v1';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const UNREACHABLE = 'The leaderboard is not reachable right now. Your score is saved in this browser.';
  const FEET = 0.74; // where the frog's feet are in the scene, as a share of the scene's height (same as style.css)
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const sprite = (pose) => 'img/frog/' + pose + '.webp';
  const bug = (name) => 'img/bugs/' + name + '.webp';
  // Load the pictures of a round before they are needed, so no pose appears late.
  ['think', 'ponder', 'catch', 'jump', 'cheer', 'panic'].forEach((pose) => { new Image().src = sprite(pose); });
  ['fly-up', 'fly-down', 'gold-up', 'gold-down'].forEach((name) => { new Image().src = bug(name); });

  const badge = (zone) => 'img/badge/' + zone.name.toLowerCase() + '.webp';

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
  const s = (tag, props, ...kids) => fill(document.createElementNS(SVG_NS, tag), props, kids);
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

  function ordinal(n) {
    const tens = n % 100;
    if (tens >= 11 && tens <= 13) return n + 'th';
    return n + (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
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
    const fresh = { name: '', player: '', days: {} };
    try {
      const data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!data || typeof data !== 'object' || typeof data.days !== 'object' || !data.days) return fresh;
      for (const [day, saved] of Object.entries(data.days)) {
        const ranges = cleanRanges(saved && saved.ranges);
        if (!ranges.length) continue;
        fresh.days[day] = { ranges };
        // `entry` is this player's line on that day's leaderboard, once the score is posted
        if (typeof saved.entry === 'string' && /^[0-9a-f]{12}$/.test(saved.entry)) fresh.days[day].entry = saved.entry;
      }
      fresh.name = C.cleanName(data.name);
      if (typeof data.player === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(data.player)) fresh.player = data.player;
    } catch (e) { /* private window or blocked storage: play without memory */ }
    return fresh;
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* same */ }
  }

  const store = load();
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

  /* ---------- talking to the leaderboard ---------- */

  async function api(method, path, body) {
    let res, data = null;
    try {
      res = await fetch(path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      data = await res.json();
    } catch (e) {
      throw new Error(UNREACHABLE);
    }
    if (!res.ok) throw new Error(data && typeof data.error === 'string' ? data.error : UNREACHABLE);
    return data;
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
    stage.el.append(h('img', { class: 'logo', src: 'img/ui/logo.webp', alt: '', draggable: 'false' }));

    const started = !!store.days[today] && !isDone(today);
    const label = isDone(today) ? 'See my climb' : started ? 'Keep climbing' : 'Play';
    const run = C.streak(store.days, today);
    const date = C.dateOfDay(today);

    show(h('div', { class: 'screen home' },
      stage.el,
      h('div', { class: 'deck' },
        h('h2', { class: 'tagline', text: 'Five flies a day. Guess the number, catch the fly, climb the tree.' }),
        h('ol', { class: 'steps' },
          h('li', { text: 'Drag the scale' }), h('li', { text: 'Pick a width' }), h('li', { text: 'Catch the fly' })),
        h('button', { class: 'go', type: 'button', text: label, onclick: startDaily }),
        h('div', { class: 'pair' }, ghost('Leaderboard', showBoard), ghost('Practice', startPractice)),
        h('p', { class: 'fine', text: 'Round ' + today + ', ' + date.getUTCDate() + ' ' + MONTHS[date.getUTCMonth()] + '.'
          + (run >= 2 ? ' ' + run + ' days in a row.' : '') }))),
    () => { stage.layout(); stage.setHeight(0, false); });
  }

  /* ---------- screen: play ---------- */

  function showPlay() {
    const stage = makeStage();
    const pips = h('div', { class: 'pips' });
    const heightNum = h('b'), zoneName = h('span'), zoneBadge = h('img', { alt: '' });
    const question = h('h2', { class: 'question' });
    const pop = h('p', { class: 'pop', hidden: true, 'aria-hidden': 'true' });
    const fly = makeFly();
    stage.el.append(
      h('div', { class: 'hud' }, pips, h('div', { class: 'alt' }, zoneBadge, zoneName, heightNum)),
      h('div', { class: 'bubble' }, question),
      pop);

    const rangeLine = h('p', { class: 'range', 'aria-live': 'polite' });
    const tapeEl = h('div', { class: 'tape' });
    const widths = h('div', { class: 'widths', role: 'group', 'aria-label': 'How wide is your range' });
    const answer = h('p', { class: 'answer' });
    const howBox = h('div', { class: 'how', hidden: true });
    const howToggle = h('button', { class: 'link', type: 'button', text: 'How?', 'aria-expanded': 'false', onclick: () => {
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
    const tape = Tape.createTape(tapeEl, refresh);

    C.WIDTHS.forEach((ratio, i) => {
      widths.append(h('button', { type: 'button', 'aria-label': ratio + ' times wide, ' + C.POINTS[i] + ' points',
        onclick: () => tape.setWidth(i) },
        h('small', { text: '×' + ratio }), h('b', { text: String(C.POINTS[i]) })));
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
        h('b', { text: C.formatAmount(low, sig) }), ' to ', h('b', { text: C.formatAmount(high, sig) }), q.unit ? ' ' + q.unit : '');
      tapeEl.setAttribute('aria-valuetext', rangeLine.textContent);
      [...widths.children].forEach((button, i) => {
        button.classList.toggle('on', i === tape.width());
        button.setAttribute('aria-pressed', String(i === tape.width()));
      });
    }

    function drawHud(points) {
      heightNum.textContent = String(points);
      zoneName.textContent = C.zoneFor(points).name;
      zoneBadge.src = badge(C.zoneFor(points));
      pips.replaceChildren(...game.qs.map((q, i) => h('i', {
        class: i < game.ranges.length ? (outcome(i).score.hit ? 'caught' : 'missed') : i === index ? 'now' : null })));
      pips.setAttribute('aria-label', 'Fly ' + Math.min(index + 1, ROUND) + ' of ' + ROUND);
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
      go.textContent = 'Catch it';
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
      if (C.zoneFor(to) !== C.zoneFor(from)) { showPop(C.zoneFor(to).name + '!'); await sleep(650); }
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
        rangeLine.textContent = 'Caught! +' + o.score.points;
        showPop('+' + o.score.points);
        await sleep(650);
        await climb(before, before + o.score.points);
      } else {
        stage.pose('panic');
        rangeLine.textContent = 'It got away';
        const side = landing.x > screen.clientWidth / 2 ? -80 : screen.clientWidth + 80;
        await flyMove(landing, { x: side, y: landing.y - 260 }, 650, 'ease-in');
        fly.hidden = true;
        drawHud(before);
      }

      answer.textContent = o.q.text;
      howBox.replaceChildren(h('p', { text: o.q.how }), h('p', { class: 'source', text: 'Source: ' + o.q.source }));
      widths.hidden = true;
      after.hidden = false;
      go.textContent = index + 1 < ROUND ? 'Next fly' : 'See my climb';
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
    const el = h('div', { class: 'stage tree', tabindex: '0', 'aria-label': 'The tree. Scroll it to see the other frogs.' },
      h('div', { class: 'tree-inner' }, scenery, layer));
    let world = null, board = null, myEntry = null, centred = false;

    function draw() {
      if (!world) return;
      const kids = [];
      const put = (node, top) => { node.style.top = Math.round(top) + 'px'; kids.push(node); return node; };
      for (const zone of C.ZONES) {
        put(h('div', { class: 'zone-line' }, h('span', null, h('img', { src: badge(zone), alt: '' }), zone.name + ' ' + zone.from)),
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
        put(h('div', { class: 'tag', text: e.name + ' ' + e.total }), y).style.right = column === 0 ? '2%' : '37%';
      }

      if (myTotal != null) {
        const y = world.yOf(myTotal);
        const first = !!board && !!board.me && board.me.id === myEntry && board.me.rank === 1;
        put(h('img', { class: 'tree-frog', src: sprite(first ? 'champion' : finalPose(myTotal)), alt: '' }), y); // a crown for the top frog
        put(h('div', { class: 'tag me', text: 'You ' + myTotal }), y + 14).style.left = '4%';
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
    if (!board.count) return [h('p', { class: 'note', text: 'No frogs on the tree yet. Be the first.' })];
    const row = (e) => h('li', { class: e.id === myEntry ? 'me' : null },
      h('span', { class: 'rank', text: String(e.rank) }),
      h('span', { class: 'name', text: e.id === myEntry ? e.name + ' (you)' : e.name }),
      h('span', { class: 'score', text: String(e.total) }));
    const rows = board.top.map(row);
    const mine = board.me && board.me.id === myEntry ? board.me : null;
    if (mine && !board.top.some((e) => e.id === mine.id)) rows.push(h('li', { class: 'skip', 'aria-hidden': 'true', text: '…' }), row(mine));
    const frogs = board.count === 1 ? '1 frog' : board.count + ' frogs';
    const summary = mine ? 'You are ' + ordinal(mine.rank) + ' of ' + frogs + ' today.' : frogs + ' on the tree today.';
    return [h('p', { class: 'note', text: summary }), h('ol', { class: 'board' }, rows)];
  }

  // Today's board. If the player finished today's round and did not post yet, the form comes first.
  function boardSection(tree) {
    const saved = store.days[today] || {};
    const formSlot = h('div');
    const listSlot = h('div', { 'aria-live': 'polite' }, h('p', { class: 'note', text: 'Looking up the tree…' }));
    let latest = 0; // a slow first answer must not overwrite a newer board
    const entry = () => (store.days[today] || {}).entry;
    const drawBoard = (board) => { listSlot.replaceChildren(...boardRows(board, entry())); tree.setBoard(board, entry()); };

    const asked = ++latest;
    api('GET', '/api/scores?day=' + today + (saved.entry ? '&entry=' + saved.entry : '')).then(
      (board) => { if (asked === latest) drawBoard(board); },
      (error) => { if (asked === latest) listSlot.replaceChildren(h('p', { class: 'note', text: error.message })); });

    if (isDone(today) && !saved.entry) {
      const name = h('input', { id: 'name', type: 'text', maxlength: '16', autocomplete: 'nickname', autocapitalize: 'words',
        spellcheck: 'false', value: store.name, 'aria-describedby': 'post-problem' });
      const problem = h('p', { class: 'problem', id: 'post-problem', role: 'alert' });
      const button = h('button', { class: 'go', type: 'submit', text: 'Put me on the tree' });
      formSlot.append(h('form', { class: 'post', novalidate: true, onsubmit: async (event) => {
        event.preventDefault();
        const clean = C.cleanName(name.value);
        if (!clean) { problem.textContent = 'Type a name for the tree.'; name.focus(); return; }
        store.name = clean;
        save();
        problem.textContent = '';
        button.disabled = true;
        const mine = ++latest;
        try {
          const out = await api('POST', '/api/scores', { day: today, player: playerId(), name: clean, ranges: store.days[today].ranges });
          store.days[today].entry = out.entry;
          save();
          formSlot.replaceChildren();
          if (mine === latest) drawBoard(out.board);
          toast('You are on the tree');
        } catch (error) {
          problem.textContent = error.message;
          button.disabled = false;
        }
      } },
        h('label', { for: 'name', text: 'Your name on the tree' }),
        name,
        button,
        problem,
        h('p', { class: 'note', text: 'This sends the name and your five ranges. Everyone sees the name and the score.' })));
    }

    return h('section', { class: 'board-box' }, h('h3', { text: 'Today\'s tree' }), formSlot, listSlot);
  }

  /* ---------- screen: the climb (result) ---------- */

  function showEnd() {
    const daily = game.mode === 'daily';
    const rows = game.qs.map((q, i) => outcome(i));
    const points = rows.map((o) => o.score.points);
    const sum = C.sum(points);
    const tree = makeTree(sum);

    let shareBox = null;
    if (daily) {
      const fallback = h('textarea', { rows: '4', readonly: true, hidden: true, 'aria-label': 'Your result, ready to copy' });
      const copy = () => {
        const text = C.shareText({ day: today, pts: points, url: location.origin + location.pathname });
        const manual = () => { fallback.value = text; fallback.hidden = false; fallback.focus(); fallback.select(); toast('Select the text and copy it'); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => toast('Result copied'), manual);
        } else manual();
      };
      shareBox = h('div', { class: 'share' }, ghost('Copy my result', copy), fallback);
    }

    show(h('div', { class: 'screen end' },
      tree.el,
      h('div', { class: 'deck' },
        h('img', { class: 'medal', src: badge(C.zoneFor(sum)), alt: '' }),
        h('h2', { class: 'verdict', text: 'You finished ' + C.zoneFor(sum).where }),
        h('p', { class: 'total' }, h('b', { text: String(sum) }), ' of ' + C.MAX_SCORE),
        h('ul', { class: 'catches', 'aria-label': 'Your five flies' },
          rows.map((o) => h('li', { class: o.score.hit ? 'caught' : 'missed', title: o.q.short + ': ' + o.q.text,
            text: o.score.hit ? '+' + o.score.points : 'miss' }))),
        daily ? boardSection(tree) : null,
        shareBox,
        h('div', { class: 'pair' },
          ghost(daily ? 'Practice' : 'Practice again', startPractice),
          ghost('Home', showHome)),
        daily ? h('p', { class: 'fine', text: 'New flies at midnight.' }) : null)),
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
        h('h2', { class: 'verdict', text: 'Who climbed highest today?' }),
        boardSection(tree),
        done ? null : h('button', { class: 'go', type: 'button', text: store.days[today] ? 'Keep climbing' : 'Play', onclick: startDaily }),
        ghost('Home', showHome))),
    () => tree.layout());
  }

  /* ---------- go ---------- */

  showHome();
})();
