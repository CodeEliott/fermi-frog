/* Fermi Frog: the player's profile.
   Four things a player owns: a name, a frog (the profile picture), a language and a colour for the app.
   Pure functions only, like core.js, so `node --test` can check them.

   Where the profile lives:
     today   in the browser (app.js saves it with the player's days). The name and the frog also travel
             with a score when the player posts it, so the tree can show them.
     later   a Google account can own it. The plan: the page signs in with Google, the server checks the
             sign-in and keeps the profile under the account instead of the browser's random player id.
             Nothing here needs to change for that: `clean` already decides what a valid profile is. */
(function (root) {
  'use strict';

  const C = root.FermiCore;

  const LANGS = ['en', 'fr', 'es'];
  // App colours. Each one is a set of colours in style.css, under :root[data-colour="..."].
  const COLOURS = ['pond', 'reeds', 'lotus', 'dusk', 'moon'];
  const AVATARS = C.AVATARS;
  // Supporter scenes: the pond in another season. 'pond' is the usual one, for everyone.
  const SCENES = ['pond', 'autumn', 'winter', 'blossom'];

  // Make a complete, valid profile out of whatever was saved. `lang` is the language to start with.
  function clean(saved, lang) {
    const raw = saved && typeof saved === 'object' ? saved : {};
    return {
      name: C.cleanName(typeof raw.name === 'string' ? raw.name : ''),
      avatar: C.cleanAvatar(raw.avatar),
      lang: LANGS.includes(raw.lang) ? raw.lang : LANGS.includes(lang) ? lang : LANGS[0],
      colour: COLOURS.includes(raw.colour) ? raw.colour : COLOURS[0],
      scene: SCENES.includes(raw.scene) ? raw.scene : SCENES[0],
      night: raw.night === true,
    };
  }

  // The first language of the browser that the game speaks. ["de-DE", "fr-CA"] -> "fr"
  function guessLang(languages) {
    for (const tag of Array.isArray(languages) ? languages : []) {
      const short = String(tag).slice(0, 2).toLowerCase();
      if (LANGS.includes(short)) return short;
    }
    return LANGS[0];
  }

  // What the player has done so far: rounds finished, best score, days in a row, and which places were reached.
  function stats(days, questions, today, freeze = false) {
    const reached = C.ZONES.map(() => false);
    let played = 0, best = 0;
    for (const [day, saved] of Object.entries(days || {})) {
      const ranges = saved && Array.isArray(saved.ranges) ? saved.ranges : [];
      if (ranges.length < C.ROUND) continue;
      const round = C.pickDaily(questions, Number(day), C.ROUND);
      const total = C.sum(round.map((q, i) => C.scoreRange(ranges[i][0], ranges[i][1], q.answer).points));
      played++;
      best = Math.max(best, total);
      reached[C.ZONES.indexOf(C.zoneFor(total))] = true;
    }
    return { played, best, streak: C.streak(days || {}, today, freeze), reached };
  }

  // Stats on the player's guesses, over finished rounds (a supporter extra).
  //   caught    the answer was inside the range (even a range too wide to score)
  //   tooHigh   the whole range was above the answer; tooLow, below it
  //   average   points per fly
  //   closest   the fly that scored most { id, points }; furthest, the worst miss { id, off: how many times off }
  function guessStats(days, questions) {
    const out = { flies: 0, caught: 0, tooHigh: 0, tooLow: 0, average: 0, closest: null, furthest: null };
    let points = 0;
    for (const [day, saved] of Object.entries(days || {})) {
      const ranges = saved && Array.isArray(saved.ranges) ? saved.ranges : [];
      if (ranges.length < C.ROUND) continue;
      C.pickDaily(questions, Number(day), C.ROUND).forEach((q, i) => {
        const s = C.scoreRange(ranges[i][0], ranges[i][1], q.answer);
        out.flies++;
        points += s.points;
        if (s.hit) out.caught++;
        else if (s.side === 'high') out.tooHigh++;
        else out.tooLow++;
        if (s.hit && (!out.closest || s.points > out.closest.points)) out.closest = { id: q.id, points: s.points };
        if (!s.hit && (!out.furthest || s.off > out.furthest.off)) out.furthest = { id: q.id, off: Number(s.off.toPrecision(3)) };
      });
    }
    out.average = out.flies ? Math.round(points / out.flies) : 0;
    return out;
  }

  /* ---------- saved data: what a device keeps, and what an account keeps ----------
     { profile, profileAt, days }
       profileAt  when the profile was last changed (a clock time), so the newest one can win
       days       { 5: { ranges: [[low, high], ...], entry? } }  the rounds played, by day number.
                  `entry` is the player's line on that day's leaderboard, once the score is posted. */

  // The ranges of one round: stop at the first one that is not a real range, and never more than a round has flies.
  function cleanRanges(ranges) {
    const out = [];
    for (const r of Array.isArray(ranges) ? ranges : []) {
      if (!Array.isArray(r) || !(r[0] > 0) || !(r[1] >= r[0]) || !Number.isFinite(r[1])) break;
      out.push([r[0], r[1]]);
    }
    return out.slice(0, C.ROUND);
  }

  // Only real days (whole numbers from 1) with at least one real range.
  function cleanDays(days) {
    const out = {};
    for (const [day, saved] of Object.entries(days && typeof days === 'object' ? days : {})) {
      if (!/^[1-9]\d{0,5}$/.test(day)) continue;
      const ranges = cleanRanges(saved && saved.ranges);
      if (!ranges.length) continue;
      out[day] = { ranges };
      if (typeof saved.entry === 'string' && /^[0-9a-f]{12}$/.test(saved.entry)) out[day].entry = saved.entry;
    }
    return out;
  }

  // Two copies of the same player (a phone and a laptop, or a device and the account) made into one.
  // No round is lost: a day keeps the copy that got further. The profile changed last wins.
  function mergeData(a, b) {
    const tidy = (copy) => {
      const raw = copy && typeof copy === 'object' ? copy : {};
      const has = raw.profile && typeof raw.profile === 'object';
      return { profile: has ? clean(raw.profile) : null, at: has && Number.isFinite(raw.profileAt) ? raw.profileAt : 0, days: cleanDays(raw.days) };
    };
    const [x, y] = [tidy(a), tidy(b)];
    const newest = y.profile && (!x.profile || y.at > x.at) ? y : x;
    const days = {};
    for (const day of [...new Set([...Object.keys(x.days), ...Object.keys(y.days)])].sort((m, n) => m - n)) {
      const [p, q] = [x.days[day], y.days[day]];
      const further = !p ? q : !q ? p : q.ranges.length > p.ranges.length ? q : p;
      days[day] = { ranges: further.ranges };
      const entry = further.entry || (p && p.entry) || (q && q.entry);
      if (entry) days[day].entry = entry;
    }
    return { profile: newest.profile || clean(null), profileAt: newest.profile ? newest.at : 0, days };
  }

  // When a saved profile was last changed. One saved before accounts existed carries no date:
  // it counts as "long ago" (1), which still beats an account that has no profile yet (0).
  const changedAt = (saved) => (!saved || typeof saved !== 'object' ? 0 : Number.isFinite(saved.profileAt) ? saved.profileAt : 1);

  // The moment a device signs in. Its rounds join the account's. Its profile gives way to the account's, if the
  // account has one: signing in means "show me my frog", even when a name was typed on this device a minute ago.
  function signIn(device, account) {
    const known = !!account && typeof account === 'object' && account.profileAt > 0;
    return mergeData(known ? { ...device, profileAt: 0 } : device, account);
  }

  // The paid plan: one payment, kept for good. The price is in cents, as payment services count.
  const PLAN = { id: 'supporter', cents: 400, currency: 'eur' };

  root.FermiProfile = { LANGS, COLOURS, AVATARS, SCENES, PLAN, clean, guessStats, guessLang, stats, cleanDays, mergeData, changedAt, signIn };
})(typeof globalThis !== 'undefined' ? globalThis : this);
