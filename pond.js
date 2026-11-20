/* Fermi Frog: the pond, seen from above.
   The frog rests on a lily pad. Hold the mouse button or a finger down and the pad drifts over to you;
   tilt the phone and it slides that way. The small leaves around make way for it.

   Two halves:
     the rules  (step, aim, tiltFrom, nudge)  plain arithmetic, checked by `node --test` in pond.test.mjs
     the scene  (create)                      puts it on the page and runs it

   Places are counted in "pond widths": x goes from 0 (left bank) to 1 (right bank),
   y from 0 (top) to `tall` (bottom), where tall = height / width. So the rules never need pixels. */
(function (root) {
  'use strict';

  // This frog is resting. Everything here is slow on purpose.
  const PACE = 0.16;    // its cruising speed, in pond widths a second: the pond takes six seconds to cross
  const EASE = 0.22;    // how quickly it gathers or loses speed: under a second from rest to its pace
  const ARRIVE = 1.4;   // close to where it is going, it slows: its speed is this many times the way left
  const DRIFT = 1;      // left alone, the water slows it: higher stops it sooner
  const BOUNCE = 0.2;   // the share of its speed the pad keeps when it bumps a bank
  const TURN = 2.5;     // how fast it turns to face where it is going
  const FINE = 1 / 120; // the rules run in steps this short, so a slow phone floats the pad like a fast one

  // One tick of the water. `pad` is { x, y, vx, vy, turn }; `input` is { target, tilt, tall, radius }.
  // target: where the player holds. tilt: the phone's lean, each part from -1 to 1 (it wins over the target).
  // The answer also says `bump`: how fast the pad hit a bank during this tick (0 when it did not).
  function step(pad, input, dt) {
    let { x, y, vx, vy, turn } = pad;
    const r = input.radius, tall = input.tall;
    const steps = Math.max(1, Math.ceil(dt / FINE - 1e-9));
    const h = dt / steps;
    let bump = 0;
    for (let i = 0; i < steps; i++) {
      // the speed it would like to have right now...
      let wantX = 0, wantY = 0, steered = false;
      if (input.tilt) {
        wantX = input.tilt.x * PACE; wantY = input.tilt.y * PACE; steered = true;
      } else if (input.target) {
        const dx = input.target.x - x, dy = input.target.y - y, way = Math.hypot(dx, dy);
        const speed = Math.min(PACE, way * ARRIVE); // never more than its pace, and slower as it arrives
        if (way > 1e-9) { wantX = (dx / way) * speed; wantY = (dy / way) * speed; }
        steered = true;
      }
      if (steered) {
        // ...and it only changes speed so fast: that is the gentle start, and the soft stop
        let cx = wantX - vx, cy = wantY - vy;
        const change = Math.hypot(cx, cy), most = EASE * h;
        if (change > most) { cx *= most / change; cy *= most / change; }
        vx += cx; vy += cy;
      } else {
        const kept = Math.exp(-DRIFT * h); // nobody is calling: it coasts and slows, like anything on water
        vx *= kept; vy *= kept;
      }
      x += vx * h;
      y += vy * h;
      // the banks: stop there, and bounce back a little
      if (x < r) { bump = Math.max(bump, -vx); x = r; vx = Math.abs(vx) * BOUNCE; }
      else if (x > 1 - r) { bump = Math.max(bump, vx); x = 1 - r; vx = -Math.abs(vx) * BOUNCE; }
      if (y < r) { bump = Math.max(bump, -vy); y = r; vy = Math.abs(vy) * BOUNCE; }
      else if (y > tall - r) { bump = Math.max(bump, vy); y = tall - r; vy = -Math.abs(vy) * BOUNCE; }
      if (Math.hypot(vx, vy) > 0.04) {
        let gap = Math.atan2(vy, vx) - turn;                 // angle 0 points right, a quarter turn points down
        gap = Math.atan2(Math.sin(gap), Math.cos(gap));      // the short way round, never a full spin
        turn += gap * (1 - Math.exp(-TURN * h));
      }
    }
    return { x, y, vx, vy, turn, bump };
  }

  // Where the frog is asked to go. Only a press counts: moving the mouse about, without holding, does nothing.
  // `now` is { held, target }; `kind` is 'down', 'move' or 'up'; `point` is where, in pond widths.
  function aim(now, kind, point) {
    if (kind === 'down') return { held: true, target: point };
    if (kind === 'move') return now.held ? { held: true, target: point } : now;
    return { held: false, target: null };
  }

  // The phone's tilt as a push. beta is the tip toward or away from you, gamma the lean left or right, in degrees.
  // `restBeta` is how the phone was held when tilt was turned on: that counts as flat.
  function tiltFrom(beta, gamma, restBeta) {
    const SHAKE = 3, FULL = 30; // under 3 degrees is a shaky hand; at 30 the push is full
    const push = (degrees) => {
      const size = Math.min(1, Math.max(0, (Math.abs(degrees) - SHAKE) / (FULL - SHAKE)));
      return size ? Math.sign(degrees) * size : 0;
    };
    return { x: push(gamma), y: push(beta - restBeta) };
  }

  // A small leaf { x, y, home, radius } next to the pad: pushed aside while the pad is on it, drifting home after.
  function nudge(leaf, pad, dt) {
    let { x, y } = leaf;
    const apart = leaf.radius + pad.radius;
    let dx = x - pad.x, dy = y - pad.y, d = Math.hypot(dx, dy);
    if (d < apart) {
      if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
      const out = (apart - Math.hypot(x - pad.x, y - pad.y)) * (1 - Math.exp(-14 * dt));
      x += (dx / d) * out;
      y += (dy / d) * out;
    } else {
      const back = 1 - Math.exp(-1.2 * dt);
      x += (leaf.home.x - x) * back;
      y += (leaf.home.y - y) * back;
    }
    return { ...leaf, x, y };
  }

  /* ---------- the scene ---------- */

  // The small leaves and flowers around: where each sits (x in pond widths, v as a share of the pond's height),
  // its size (middle to edge, in pond widths), how it is turned, and its picture in img/pond/.
  const FLOATING = [
    { x: 0.14, v: 0.09, radius: 0.11, turn: 0.4, art: 'leaf-1' }, { x: 0.40, v: 0.05, radius: 0.055, turn: 0, art: 'flower-1' },
    { x: 0.85, v: 0.13, radius: 0.10, turn: 2.2, art: 'leaf-2' }, { x: 0.11, v: 0.37, radius: 0.08, turn: 4.0, art: 'leaf-3' },
    { x: 0.89, v: 0.60, radius: 0.07, turn: 1.1, art: 'leaf-4' }, { x: 0.85, v: 0.80, radius: 0.10, turn: 5.2, art: 'leaf-5' },
    { x: 0.70, v: 0.72, radius: 0.05, turn: 0, art: 'flower-2' }, { x: 0.57, v: 0.94, radius: 0.08, turn: 3.0, art: 'leaf-6' },
    { x: 0.21, v: 0.90, radius: 0.09, turn: 0.9, art: 'leaf-2' }, { x: 0.30, v: 0.20, radius: 0.045, turn: 0, art: 'flower-3' },
  ];
  const RAFT = 0.17; // the frog's pad is this wide, from its middle to its edge, in pond widths

  // Build the pond inside `el` and start it. `quiet` is for players who asked their device for less motion.
  // `frog` is the frog on its pad, drawn with its head up (the page makes it, since it may be animated).
  // `onBump()` is called when the pad knocks against a bank.
  // Returns { tilt() }: ask the phone for its tilt (must follow a tap). It answers true if the phone can feel one.
  function create(el, quiet, frog, onBump) {
    const part = (cls, kid) => { const node = document.createElement('div'); node.className = cls; if (kid) node.append(kid); return node; };
    const picture = (art) => { const img = document.createElement('img'); img.src = 'img/pond/' + art + '.webp'; img.alt = ''; img.draggable = false; return img; };
    // the water lapping at the pad: three pairs of short arcs that widen and fade. They go where the pad goes.
    const lap = part('pond-lap');
    for (let i = 0; i < 3; i++) lap.append(document.createElement('i'));
    const raft = part('pond-raft', frog);
    const leafNodes = FLOATING.map((leaf) => part('pond-leaf', picture(leaf.art)));
    el.replaceChildren(...leafNodes, lap, raft);

    let width = 0, tall = 0;
    let pad = null; // { x, y, vx, vy, turn, bump }: placed in the middle the first time the pond has a size
    let leaves = [];
    let hold = { held: false, target: null }, tilt = null, last = 0, lastBump = 0, shown = false;

    // Read the pond's size. False while it has none yet (it is built before it is put on the page).
    function measure() {
      if (!el.clientWidth || !el.clientHeight) return false;
      width = el.clientWidth;
      tall = el.clientHeight / width;
      leaves = FLOATING.map((leaf, i) => {
        const home = { x: leaf.x, y: leaf.v * tall };
        return { ...(leaves[i] || home), home, radius: leaf.radius, turn: leaf.turn };
      });
      if (!pad) pad = { x: 0.5, y: tall / 2, vx: 0, vy: 0, turn: -Math.PI / 2, bump: 0 }; // in the middle, head up
      pad.y = Math.min(pad.y, tall - RAFT);
      return true;
    }

    const put = (node, x, y, radius, turn) => {
      node.style.width = (radius * 2 * width).toFixed(1) + 'px';
      node.style.transform = 'translate(' + ((x - radius) * width).toFixed(1) + 'px, ' + ((y - radius) * width).toFixed(1) + 'px) rotate(' + turn.toFixed(3) + 'rad)';
    };

    function paint() {
      put(raft, pad.x, pad.y, RAFT, pad.turn + Math.PI / 2); // the picture has the frog's head up; angle 0 points right
      put(lap, pad.x, pad.y, RAFT, 0);
      // still water laps faintly; the faster the pad goes, the more it stirs
      lap.style.opacity = quiet ? '0' : (0.3 + 0.7 * Math.min(1, Math.hypot(pad.vx, pad.vy) / PACE)).toFixed(2);
      leaves.forEach((leaf, i) => put(leafNodes[i], leaf.x, leaf.y, leaf.radius, leaf.turn));
    }

    let unseen = 0;
    function frame(now) {
      if (!el.isConnected) {
        // Not on the page: either the screen was left, or this pond has not been shown yet.
        // Give a new pond a little time to appear, then stop for good: never run on for nothing.
        if (shown || ++unseen > 120) { root.removeEventListener('deviceorientation', onTilt); return; }
        root.requestAnimationFrame(frame);
        return;
      }
      shown = true;
      root.requestAnimationFrame(frame);
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
      last = now;
      if (!pad || width !== el.clientWidth || Math.abs(tall * width - el.clientHeight) > 1) {
        if (!measure()) return; // it has no size yet: wait
      }
      pad = step(pad, { target: hold.target, tilt: tilt && !hold.held ? tilt : null, tall, radius: RAFT }, dt);
      leaves = leaves.map((leaf) => nudge(leaf, { x: pad.x, y: pad.y, radius: RAFT }, dt));
      if (onBump && pad.bump > 0.06 && now - lastBump > 2500) { lastBump = now; onBump(); } // not twice in a row
      paint();
    }

    /* ---- holding: the mouse button, or a finger ---- */
    const press = (kind) => (event) => {
      const box = el.getBoundingClientRect();
      hold = aim(hold, kind, { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.width });
      if (kind === 'down') {
        try { el.setPointerCapture(event.pointerId); } catch (error) { /* keeps following outside the pond when it can; no harm when it cannot */ }
      }
    };
    el.addEventListener('pointerdown', press('down'));
    el.addEventListener('pointermove', press('move'));
    el.addEventListener('pointerup', press('up'));
    el.addEventListener('pointercancel', press('up'));

    /* ---- tilting ---- */
    let rest = null, heard = false;
    function onTilt(event) {
      if (event.beta == null || event.gamma == null) return;
      heard = true;
      if (rest == null) rest = event.beta; // however the phone is held now counts as flat
      tilt = tiltFrom(event.beta, event.gamma, rest);
    }
    async function askTilt() {
      const Motion = root.DeviceOrientationEvent;
      if (!Motion) return false;
      if (typeof Motion.requestPermission === 'function') { // iPhones ask the player first, and only after a tap
        try { if (await Motion.requestPermission() !== 'granted') return false; } catch (error) { return false; }
      }
      root.addEventListener('deviceorientation', onTilt);
      await new Promise((resolve) => setTimeout(resolve, 700)); // a computer has the event but never sends one
      if (!heard) { root.removeEventListener('deviceorientation', onTilt); tilt = null; }
      return heard;
    }

    if (measure()) paint();
    root.requestAnimationFrame(frame);
    return { tilt: askTilt };
  }

  root.FermiPond = { PACE, step, aim, tiltFrom, nudge, create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
