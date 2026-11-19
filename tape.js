/* Fermi Frog: the scale you drag.
   Each step to the right is ten times more, so 1 and 1 trillion fit on one strip.
   The range stays in the middle. You slide the numbers under it, like an old radio dial.
   Choosing a narrower width zooms in: the range covers fewer numbers. */
(function (root) {
  'use strict';

  const C = root.FermiCore;
  const MIN = 0, MAX = 15;  // the strip runs from 1 to 1 quadrillion, counted in powers of ten
  const BAND = 0.42;        // the range always takes this share of the strip's width
  const START = 3;          // every question starts centred on one thousand, so the start gives no clue

  function part(cls) {
    const node = document.createElement('div');
    node.className = cls;
    return node;
  }

  // Build a scale inside `el`. `onChange` runs each time the range moves.
  // `words` come from the page, in the player's language: { hint, label, compact(n) } where compact writes a short number.
  function createTape(el, onChange, words) {
    const ticks = part('tape-ticks'), band = part('tape-band'), mark = part('tape-mark'), hint = part('tape-hint');
    hint.textContent = words.hint;
    el.replaceChildren(ticks, band, mark, hint);
    el.tabIndex = 0;
    el.setAttribute('role', 'slider');
    el.setAttribute('aria-label', words.label);

    let centre = START;  // the middle of the view, as a power of ten
    let width = 0;       // which of the five widths is chosen
    let zoom = 0;        // screen pixels for one power of ten
    let locked = null;   // { lo, hi, answer } as powers of ten, once the player has locked
    let glide = 0;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const size = () => el.clientWidth;
    const span = () => Math.log10(C.WIDTHS[width]);
    const zoomFor = (w) => (size() * BAND) / Math.log10(C.WIDTHS[w]);
    const xOf = (power) => size() / 2 + (power - centre) * zoom;

    function draw() {
      const w = size(), half = w / 2;
      const lo = locked ? locked.lo : centre - span() / 2, hi = locked ? locked.hi : centre + span() / 2;
      const steps = zoom < 80 ? [1] : zoom < 500 ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 9];
      const marks = document.createDocumentFragment();
      for (let d = Math.floor(centre - half / zoom) - 1; d <= Math.ceil(centre + half / zoom) + 1; d++) {
        if (d < MIN || d > MAX) continue;
        for (const m of steps) {
          if (d === MAX && m > 1) break;
          const x = half + (d + Math.log10(m) - centre) * zoom;
          if (x < -60 || x > w + 60) continue;
          const labelled = m === 1 || (zoom > 200 && (m === 2 || m === 5)) || (zoom > 700 && Number.isInteger(m));
          const tick = document.createElement('i');
          if (m === 1) tick.className = 'big';
          tick.style.left = x.toFixed(1) + 'px';
          if (labelled) {
            const label = document.createElement('b');
            label.textContent = words.compact(m * Math.pow(10, d));
            tick.append(label);
          }
          marks.append(tick);
        }
      }
      ticks.replaceChildren(marks);
      band.style.left = xOf(lo).toFixed(1) + 'px';
      band.style.width = ((hi - lo) * zoom).toFixed(1) + 'px';
      if (locked) mark.style.left = xOf(locked.answer).toFixed(1) + 'px';
    }

    function tween(toCentre, toZoom, ms) {
      return new Promise((resolve) => {
        const c0 = centre, z0 = Math.log(zoom), z1 = Math.log(toZoom), start = performance.now();
        let done = false;
        const finish = () => { if (done) return; done = true; centre = toCentre; zoom = toZoom; draw(); resolve(); };
        if (still) return finish();
        setTimeout(finish, ms + 120); // a hidden tab gets no animation frames: never wait forever
        (function step(now) {
          if (done) return;
          const k = Math.min(1, (now - start) / ms), ease = 1 - Math.pow(1 - k, 3);
          centre = c0 + (toCentre - c0) * ease;
          zoom = Math.exp(z0 + (z1 - z0) * ease);
          draw();
          if (k < 1) requestAnimationFrame(step); else finish();
        })(start);
      });
    }

    function move(powers) {
      centre = Math.max(MIN, Math.min(MAX, centre + powers));
      draw();
      onChange();
    }

    function touched() { hint.hidden = true; }

    /* ---- dragging, with a little glide after a flick ---- */
    let last = null, speed = 0;
    el.addEventListener('pointerdown', (e) => {
      if (locked) return;
      cancelAnimationFrame(glide);
      last = { x: e.clientX, t: e.timeStamp };
      speed = 0;
      el.setPointerCapture(e.pointerId);
      touched();
    });
    el.addEventListener('pointermove', (e) => {
      if (!last) return;
      const dx = e.clientX - last.x, dt = Math.max(1, e.timeStamp - last.t);
      speed = 0.7 * (dx / dt) + 0.3 * speed;
      last = { x: e.clientX, t: e.timeStamp };
      move(-dx / zoom);
    });
    function release(e) {
      if (!last) return;
      const idle = e.timeStamp - last.t;
      last = null;
      if (still || idle > 80 || Math.abs(speed) < 0.15) return;
      let before = performance.now();
      (function step(now) {
        const dt = Math.min(40, now - before);
        before = now;
        move((-speed * dt) / zoom);
        speed *= Math.pow(0.992, dt);
        if (Math.abs(speed) > 0.03 && !locked) glide = requestAnimationFrame(step);
      })(before);
    }
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);

    el.addEventListener('keydown', (e) => {
      if (locked || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault();
      touched();
      const px = e.shiftKey ? 60 : 12;
      move(((e.key === 'ArrowRight' ? 1 : -1) * px) / zoom);
    });
    el.addEventListener('wheel', (e) => {
      if (locked || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // only a sideways swipe moves the scale
      e.preventDefault();
      touched();
      move(e.deltaX / zoom);
    }, { passive: false });

    return {
      // the range as two numbers, low and high
      range() { return locked ? [Math.pow(10, locked.lo), Math.pow(10, locked.hi)] : C.rangeFor(centre, width); },
      width() { return width; },
      setWidth(i) {
        if (locked || i === width) return Promise.resolve();
        width = i;
        onChange();
        return tween(centre, zoomFor(i), 240);
      },
      // Freeze the range, then zoom out until the range and the answer are both in view.
      lock(answer) {
        cancelAnimationFrame(glide);
        const lo = centre - span() / 2, hi = centre + span() / 2, power = Math.log10(answer);
        locked = { lo, hi, answer: power };
        el.classList.add('locked');
        hint.hidden = true;
        const left = Math.min(lo, power), right = Math.max(hi, power);
        return tween((left + right) / 2, Math.min(zoom, (size() * 0.74) / (right - left)), 520);
      },
      // where the answer sits on the screen, for the fly
      answerPoint() {
        const box = el.getBoundingClientRect();
        return { x: box.left + xOf(locked.answer), y: box.top + box.height * 0.62 };
      },
      reset() {
        cancelAnimationFrame(glide);
        locked = null;
        el.classList.remove('locked');
        centre = START;
        width = 0;
        zoom = zoomFor(0);
        hint.hidden = false;
        draw();
        onChange();
      },
      // call after the strip changes size
      refit() {
        if (!size()) return;
        if (!locked) zoom = zoomFor(width);
        draw();
      },
    };
  }

  root.FermiTape = { createTape };
})(typeof globalThis !== 'undefined' ? globalThis : this);
