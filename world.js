/* Fermi Frog: the world.
   Six scenes painted with Gemini, one per zone of height: pond, reeds, trunk, canopy, clouds, moon.
   On a computer, a scene with a wide version (so far the pond) shows that one instead.

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
  // Scenes that also have a wide picture, for a computer's screen (from Higgsfield, see design/desktop): its height divided by width
  const WIDE = { pond: 1344 / 3168 };
  const MOON_FEET = 0.68;    // on the moon, the frog's feet are this far down the picture: on the flat ground
  const BAND = 1.25;         // on the leaderboard, each scene is a band this many times taller than wide
  const BLEND = 0.3;         // each scene runs this far into the scene below, and fades out there (style.css)
  const MOON_SPOT = 0.72;    // the moon's frogs stand this far down their band
  // Which part of each picture its band shows, from its top (0) to its bottom (1): the pond shows its water,
  // the reeds hide their low sun, so the tree never has two suns.
  const SHOWS = [1, 0, 0.45, 0.45, 0.45, 0.45];

  // The pond at the bottom of the world can be another season (a supporter choice, see profile.js): 'pond-autumn' and so on.
  // Every season has a tall and a wide picture of the same sizes as the pond's.
  let pondName = 'pond';
  const setPond = (season) => { pondName = !season || season === 'pond' ? 'pond' : 'pond-' + season; };
  const sceneName = (zone) => (zone === 0 ? pondName : SCENES[zone]);

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

  // `el` is an empty box that fills the scene window. `feet` is how far down that window the frog's feet are (0 to 1),
  // or a function that says it (the frog stands lower on a computer).
  function createBackdrop(el, feet) {
    let shown = null; // { zone, img, y }
    let size = null;  // the window and the picture, in screen pixels

    function measure() {
      size = { windowW: el.clientWidth, windowH: el.clientHeight };
    }
    // The picture of a zone, at the size that covers the window. A window wider than tall (a computer)
    // takes the zone's wide picture, when it has one.
    function art(zone) {
      const name = sceneName(zone);
      const wide = size.windowW > size.windowH * 1.3 && WIDE[SCENES[zone]];
      const ratio = wide || RATIO;
      const w = Math.max(size.windowW, Math.ceil(size.windowH / ratio)); // the picture always covers the window
      return { name: wide ? name + '-wide' : name, w, h: Math.round(w * ratio) };
    }
    function fit(img, look) {
      img.style.width = look.w + 'px';
      img.style.height = look.h + 'px';
      img.style.left = Math.round((size.windowW - look.w) / 2) + 'px';
    }
    function move(img, y, animate, opacity) {
      img.classList.toggle('instant', !animate);
      img.style.transform = 'translateY(' + Math.round(y) + 'px)';
      img.style.opacity = opacity == null ? '1' : String(opacity);
    }
    // How far the picture of this score's zone is slid. 0 shows its top, `spare` (a negative number) shows its bottom.
    function slide(score, look) {
      const zone = zoneOf(score), spare = size.windowH - look.h;
      if (zone === TOP) return clamp(size.windowH * (typeof feet === 'function' ? feet() : feet) - MOON_FEET * look.h, spare, 0);
      return spare * (1 - (score - zone * ZONE) / ZONE);
    }

    function show(score, animate) {
      if (!size) measure();
      if (!size.windowW) return;
      const zone = zoneOf(score), look = art(zone), y = slide(score, look);
      if (shown && shown.zone === zone) {
        move(shown.img, y, animate);
        shown.y = y;
        return;
      }
      const img = picture(look.name);
      fit(img, look);
      if (!shown || !animate) {
        el.replaceChildren(img);
        move(img, y, false);
      } else {
        // The frog climbs into another zone: both pictures slide by half a window, the new one from above,
        // and one fades into the other, so no hard edge crosses the screen.
        const old = shown, way = zone > old.zone ? 1 : -1, travel = size.windowH * 0.5;
        move(img, y - way * travel, false, 0);
        el.append(img);
        void img.offsetWidth; // the browser must see the starting place before the slide begins
        move(old.img, old.y + way * travel, true, 0);
        move(img, y, true, 1);
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
    if (!el.firstChild) for (let zone = TOP; zone >= 0; zone--) el.append(picture(sceneName(zone)));
    el.style.width = width + 'px';
    el.style.height = band * SCENES.length + 'px';
    [...el.children].forEach((img, i) => {
      const zone = TOP - i;
      img.style.top = i * band + 'px';
      img.style.height = Math.round(band * (zone ? 1 + BLEND : 1)) + 'px'; // the pond, at the bottom, has nothing to fade into
      img.style.zIndex = String(zone + 1);                                  // a higher scene lies over the one below
      img.style.objectPosition = '50% ' + Math.round(SHOWS[zone] * 100) + '%';
      img.classList.toggle('fades', zone > 0);
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

  root.FermiWorld = { createBackdrop, buildTree, perchFor, setPond };
})(typeof globalThis !== 'undefined' ? globalThis : this);
