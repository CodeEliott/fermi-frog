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

  // Make a complete, valid profile out of whatever was saved. `lang` is the language to start with.
  function clean(saved, lang) {
    const raw = saved && typeof saved === 'object' ? saved : {};
    return {
      name: C.cleanName(typeof raw.name === 'string' ? raw.name : ''),
      avatar: C.cleanAvatar(raw.avatar),
      lang: LANGS.includes(raw.lang) ? raw.lang : LANGS.includes(lang) ? lang : LANGS[0],
      colour: COLOURS.includes(raw.colour) ? raw.colour : COLOURS[0],
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
  function stats(days, questions, today) {
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
    return { played, best, streak: C.streak(days || {}, today), reached };
  }

  root.FermiProfile = { LANGS, COLOURS, AVATARS, clean, guessLang, stats };
})(typeof globalThis !== 'undefined' ? globalThis : this);
