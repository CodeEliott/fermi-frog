/* Fermi Frog: the world.
   Six scenes painted with Gemini, one per zone of height: pond, reeds, trunk, canopy, clouds, moon.

   In a round, the scene behind the frog is the scene of its zone. Inside a zone the picture slides
   slowly: a higher score shows a higher part of it. When the frog climbs into the next zone,
   the next scene comes down from above.

   On the leaderboard, the six scenes are stacked into one tall tree.

   (Earlier worlds are kept: one drawn in code in design/archive, one made of two pictures in design/world/v1-*.) */
(function (root) {
  'use strict';

  const SCENES = ['pond', 'reeds', 'trunk', 'canopy', 'clouds', 'moon']; // from the bottom of the world to the top
  const ZONE = 100;          // points in one zone
  const TOP = SCENES.length - 1;
  const RATIO = 1376 / 768;  // every scene: height divided by width
  const MOON_FEET = 0.68;    // on the moon, the frog's feet are this far down the picture: on the flat ground
  const BAND = 1.25;         // on the leaderboard, each scene is a band this many times taller than wide
  const MOON_SPOT = 0.72;    // and the moon's frogs stand this far down their band

  const zoneOf = (score) => Math.max(0, Math.min(TOP, Math.floor(score / ZONE)));
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  function picture(name) {
    const img = document.createElement('img');
    img.src = 'img/world/' + name + '.webp';
    img.alt = '';
    img.draggable = false;
    return img;
  }

  // What the frog sits on in each zone. On the moon it stands on the ground.
  const PERCHES = ['pad', 'leaf', 'branch', 'branch', 'cloud', null];
  const perchFor = (score) => PERCHES[zoneOf(score)];

  /* ---------- the backdrop of a round ---------- */

  // `el` is an empty box that fills the scene window. `feet` is how far down that window the frog's feet are (0 to 1).
  function createBackdrop(el, feet) {
    let shown = null; // { zone, img, y }
    let size = null;  // the window and the picture, in screen pixels

    function measure() {
      const windowW = el.clientWidth, windowH = el.clientHeight;
      const w = Math.max(windowW, Math.ceil(windowH / RATIO)); // the picture always covers the window
      size = { windowW, windowH, w, h: Math.round(w * RATIO) };
    }
    function fit(img) {
      img.style.width = size.w + 'px';
      img.style.height = size.h + 'px';
      img.style.left = Math.round((size.windowW - size.w) / 2) + 'px';
    }
    function move(img, y, animate) {
      img.classList.toggle('instant', !animate);
      img.style.transform = 'translateY(' + Math.round(y) + 'px)';
    }
    // How far the picture of this score's zone is slid. 0 shows its top, `spare` (a negative number) shows its bottom.
    function slide(score) {
      const zone = zoneOf(score), spare = size.windowH - size.h;
      if (zone === TOP) return clamp(size.windowH * feet - MOON_FEET * size.h, spare, 0);
      return spare * (1 - (score - zone * ZONE) / ZONE);
    }

    function show(score, animate) {
      if (!size) measure();
      if (!size.windowW) return;
      const zone = zoneOf(score), y = slide(score);
      if (shown && shown.zone === zone) {
        move(shown.img, y, animate);
        shown.y = y;
        return;
      }
      const img = picture(SCENES[zone]);
      fit(img);
      if (!shown || !animate) {
        el.replaceChildren(img);
        move(img, y, false);
      } else {
        // The frog climbs into another zone: both pictures slide by one window, the new one from above.
        const old = shown, way = zone > old.zone ? 1 : -1;
        move(img, y - way * size.windowH, false);
        el.append(img);
        void img.offsetWidth; // the browser must see the starting place before the slide begins
        move(old.img, old.y + way * size.windowH, true);
        move(img, y, true);
        setTimeout(() => old.img.remove(), 1100);
      }
      shown = { zone, img, y };
    }

    return {
      show,
      // call when the window changes size
      layout(score) { measure(); shown = null; show(score, false); },
    };
  }

  /* ---------- the tree of the leaderboard ---------- */

  // Stack the six scenes inside `el`: the moon on top, the pond at the bottom.
  // Returns where things are: yOf(score) is the row of a frog with that score, floorOf(score) is the bottom of its zone.
  function buildTree(el, width) {
    const band = Math.round(width * BAND);
    if (!el.firstChild) for (let zone = TOP; zone >= 0; zone--) el.append(picture(SCENES[zone]));
    el.style.width = width + 'px';
    el.style.height = band * SCENES.length + 'px';
    [...el.children].forEach((img, i) => {
      img.style.top = i * band + 'px';
      img.style.height = band + 'px';
    });
    const topOf = (zone) => (TOP - zone) * band;
    return {
      height: band * SCENES.length,
      floorOf: (score) => topOf(zoneOf(score)) + band,
      yOf(score) {
        const zone = zoneOf(score);
        if (zone === TOP) return topOf(zone) + band * MOON_SPOT;
        return topOf(zone) + band * (0.92 - 0.78 * ((score - zone * ZONE) / ZONE));
      },
    };
  }

  root.FermiWorld = { createBackdrop, buildTree, perchFor };
})(typeof globalThis !== 'undefined' ? globalThis : this);
