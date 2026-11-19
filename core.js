/* Fermi Frog: the rules.
   Pure functions only: no page, no storage. That way `node --test` can check them.
   The page and the server both read them from `FermiCore`. */
(function (root) {
  'use strict';

  const NAME = 'Fermi Frog';                 // the game's name, wherever code writes it
  const ROUND = 5;                           // questions (flies) in one round
  const LAUNCH_UTC = Date.UTC(2026, 10, 16); // round no. 1 is 16 Nov 2026
  const DAY_MS = 86400000;

  // How wide a range can be (its high end divided by its low end), and what a catch is worth.
  // A narrow range is harder to land, so it pays more.
  const WIDTHS = [100, 10, 3, 2, 1.3];
  const POINTS = [10, 25, 50, 70, 100];
  const MAX_SCORE = ROUND * POINTS[POINTS.length - 1];

  // The score is a height. Each height has a place on the tree. (`id` names its pictures and its translations.)
  const ZONES = [
    { id: 'pond', name: 'Pond', from: 0 },
    { id: 'reeds', name: 'Reeds', from: 100 },
    { id: 'trunk', name: 'Trunk', from: 200 },
    { id: 'canopy', name: 'Canopy', from: 300 },
    { id: 'clouds', name: 'Clouds', from: 400 },
    { id: 'moon', name: 'Moon', from: 500 },
  ];

  // The frogs a player can choose as a profile picture. The server accepts only these.
  const AVATARS = ['wink', 'think', 'cheer', 'proud', 'shrug', 'astronaut', 'sleep', 'splash'];
  const cleanAvatar = (value) => (AVATARS.includes(value) ? value : AVATARS[0]);

  /* ---------- writing numbers ---------- */

  function roundSig(n, sig) {
    if (!Number.isFinite(n) || n === 0) return n;
    const e = sig - 1 - Math.floor(Math.log10(Math.abs(n)));
    if (e >= 0) { const p = Math.pow(10, e); return Math.round(n * p) / p; }
    const p = Math.pow(10, -e);
    return Math.round(n / p) * p;
  }

  // How each language writes numbers. `big` are the words for the readout, `short` the labels on the scale.
  // Each entry: [from this size, word for one, word for several].
  const NUMBERS = {
    en: {
      locale: 'en-US',
      big: [[1e12, ' trillion', ' trillion'], [1e9, ' billion', ' billion'], [1e6, ' million', ' million']],
      short: [[1e15, 'Q'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'k']],
    },
    // French has no everyday word for a million million, so it keeps counting in milliards.
    fr: {
      locale: 'fr-FR',
      big: [[1e9, ' milliard', ' milliards'], [1e6, ' million', ' millions']],
      short: [[1e9, ' Md'], [1e6, ' M'], [1e3, ' k']],
    },
  };
  const numbersOf = (lang) => NUMBERS[lang] || NUMBERS.en;

  function digits(n, sig, lang) {
    return n.toLocaleString(numbersOf(lang).locale, { maximumSignificantDigits: sig });
  }

  // 384400 -> "384,400", 2500000 -> "2.5 million". `sig` is how many digits to keep (4 unless told).
  function formatAmount(n, sig, lang) {
    if (!Number.isFinite(n)) return '';
    const keep = sig || 4;
    const r = roundSig(n, keep);
    const a = Math.abs(r);
    if (a >= 1e15) return r.toExponential(2).replace('e+', ' × 10^');
    for (const [size, one, several] of numbersOf(lang).big) {
      if (a >= size) return digits(r / size, keep, lang) + (a / size < 2 ? one : several);
    }
    return digits(r, keep, lang);
  }

  // Short labels for the scale: 1k, 50k, 2M, 1B
  function compactAmount(n, lang) {
    const r = roundSig(n, 3);
    const a = Math.abs(r);
    for (const [size, mark] of numbersOf(lang).short) {
      if (a >= size) return digits(r / size, 3, lang) + mark;
    }
    return digits(r, 3, lang);
  }

  /* ---------- scoring ---------- */

  // ratio = high / low: how many times wide the range is.
  // The points are those of the narrowest width that still holds the range. Wider than the widest: nothing.
  function pointsForRatio(ratio) {
    let points = 0;
    for (let i = 0; i < WIDTHS.length; i++) if (ratio <= WIDTHS[i] * 1.0001) points = POINTS[i];
    return points;
  }

  // The range of width number `widthIndex`, centred on 10^centre. (centre 5 = one hundred thousand)
  function rangeFor(centre, widthIndex) {
    const half = Math.log10(WIDTHS[widthIndex]) / 2;
    return [Math.pow(10, centre - half), Math.pow(10, centre + half)];
  }

  // Did the answer land inside [low, high]? If not, by how many times did the range miss?
  function scoreRange(low, high, truth) {
    const ratio = high / low;
    const slack = 1e-9; // the edges count as inside
    if (truth < low * (1 - slack)) return { hit: false, points: 0, ratio, side: 'high', off: low / truth };
    if (truth > high * (1 + slack)) return { hit: false, points: 0, ratio, side: 'low', off: truth / high };
    return { hit: true, points: pointsForRatio(ratio), ratio };
  }

  function zoneFor(score) {
    let zone = ZONES[0];
    for (const z of ZONES) if (score >= z.from) zone = z;
    return zone;
  }

  /* ---------- the same game for everyone: seeded randomness ---------- */

  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // A small random generator. The same seed always gives the same numbers.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, seed) {
    const out = list.slice();
    const rng = mulberry32(seed);
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function dayNumber(date) {
    const local = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.max(1, Math.round((local - LAUNCH_UTC) / DAY_MS) + 1);
  }

  function dateOfDay(day) {
    return new Date(LAUNCH_UTC + (day - 1) * DAY_MS);
  }

  // The bank is dealt like a deck of cards: shuffle, deal `count` a day, reshuffle when it runs out.
  function pickDaily(questions, day, count) {
    const daysPerCycle = Math.max(1, Math.floor(questions.length / count));
    const cycle = Math.floor((day - 1) / daysPerCycle);
    const position = (day - 1) % daysPerCycle;
    const deck = shuffle(questions, hashString('fermi-cycle-' + cycle));
    return deck.slice(position * count, position * count + count);
  }

  /* ---------- names and sharing ---------- */

  // A leaderboard name: no control characters, 16 characters at most.
  function cleanName(name) {
    return String(name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16);
  }

  // One square per fly: green for a narrow catch, yellow for a wide catch, red for a miss.
  function squares(pts) {
    return pts.map((p) => (p >= 70 ? '🟩' : p > 0 ? '🟨' : '🟥')).join('');
  }

  function sum(list) { return list.reduce((a, b) => a + b, 0); }

  // Days played in a row. Today may still be open: the streak stays alive until midnight.
  function streak(days, today) {
    const done = (d) => !!(days[d] && Array.isArray(days[d].ranges) && days[d].ranges.length >= ROUND);
    let d = done(today) ? today : today - 1;
    let n = 0;
    while (d >= 1 && done(d)) { n++; d--; }
    return n;
  }

  root.FermiCore = {
    NAME, ROUND, WIDTHS, POINTS, MAX_SCORE, ZONES, AVATARS, cleanAvatar,
    formatAmount, compactAmount, roundSig,
    pointsForRatio, rangeFor, scoreRange, zoneFor,
    hashString, mulberry32, shuffle, dayNumber, dateOfDay, pickDaily,
    cleanName, squares, sum, streak,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
