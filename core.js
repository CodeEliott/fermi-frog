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

  // The score is a height. Each height has a place on the tree.
  const ZONES = [
    { name: 'Pond', from: 0, where: 'in the pond' },
    { name: 'Reeds', from: 100, where: 'in the reeds' },
    { name: 'Trunk', from: 200, where: 'on the trunk' },
    { name: 'Canopy', from: 300, where: 'in the canopy' },
    { name: 'Clouds', from: 400, where: 'in the clouds' },
    { name: 'Moon', from: 500, where: 'on the moon' },
  ];

  /* ---------- writing numbers ---------- */

  function roundSig(n, sig) {
    if (!Number.isFinite(n) || n === 0) return n;
    const e = sig - 1 - Math.floor(Math.log10(Math.abs(n)));
    if (e >= 0) { const p = Math.pow(10, e); return Math.round(n * p) / p; }
    const p = Math.pow(10, -e);
    return Math.round(n / p) * p;
  }

  function digits(n, sig) {
    return n.toLocaleString('en-US', { maximumSignificantDigits: sig });
  }

  // 384400 -> "384,400", 2500000 -> "2.5 million". `sig` is how many digits to keep (4 unless told).
  function formatAmount(n, sig) {
    if (!Number.isFinite(n)) return '';
    const keep = sig || 4;
    const r = roundSig(n, keep);
    const a = Math.abs(r);
    if (a >= 1e15) return r.toExponential(2).replace('e+', ' × 10^');
    if (a >= 1e12) return digits(r / 1e12, keep) + ' trillion';
    if (a >= 1e9) return digits(r / 1e9, keep) + ' billion';
    if (a >= 1e6) return digits(r / 1e6, keep) + ' million';
    return digits(r, keep);
  }

  // Short labels for the scale: 1k, 50k, 2M, 1B
  function compactAmount(n) {
    const r = roundSig(n, 3);
    const a = Math.abs(r);
    if (a >= 1e15) return digits(r / 1e15, 3) + 'Q';
    if (a >= 1e12) return digits(r / 1e12, 3) + 'T';
    if (a >= 1e9) return digits(r / 1e9, 3) + 'B';
    if (a >= 1e6) return digits(r / 1e6, 3) + 'M';
    if (a >= 1e3) return digits(r / 1e3, 3) + 'k';
    return digits(r, 3);
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

  function shareText(r) {
    const total = sum(r.pts);
    return [
      NAME + ' no. ' + r.day,
      total + ' points, ' + zoneFor(total).where,
      squares(r.pts),
      r.url,
    ].join('\n');
  }

  // Days played in a row. Today may still be open: the streak stays alive until midnight.
  function streak(days, today) {
    const done = (d) => !!(days[d] && Array.isArray(days[d].ranges) && days[d].ranges.length >= ROUND);
    let d = done(today) ? today : today - 1;
    let n = 0;
    while (d >= 1 && done(d)) { n++; d--; }
    return n;
  }

  root.FermiCore = {
    NAME, ROUND, WIDTHS, POINTS, MAX_SCORE, ZONES,
    formatAmount, compactAmount, roundSig,
    pointsForRatio, rangeFor, scoreRange, zoneFor,
    hashString, mulberry32, shuffle, dayNumber, dateOfDay, pickDaily,
    cleanName, squares, sum, shareText, streak,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
