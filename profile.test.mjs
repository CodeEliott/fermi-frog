// The rules of the player's profile, written as checks. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import './core.js';
import './questions.js';
import './profile.js';

const C = globalThis.FermiCore;
const P = globalThis.FermiProfile;
const QUESTIONS = globalThis.FERMI_QUESTIONS;

// A finished day where every fly is caught with the range of this width.
const day = (n, width) => ({ ranges: C.pickDaily(QUESTIONS, n, 5).map((q) => C.rangeFor(Math.log10(q.answer), width)) });

test('a new player gets a complete profile', () => {
  assert.deepEqual(P.clean(null), { name: '', avatar: 'wink', lang: 'en', colour: 'pond' });
  assert.deepEqual(P.clean({}, 'fr'), { name: '', avatar: 'wink', lang: 'fr', colour: 'pond' });
});

test('a saved profile is kept, and anything odd in it is replaced', () => {
  assert.deepEqual(P.clean({ name: '  Léa  ', avatar: 'astronaut', lang: 'fr', colour: 'dusk' }),
    { name: 'Léa', avatar: 'astronaut', lang: 'fr', colour: 'dusk' });
  assert.deepEqual(P.clean({ name: 'x'.repeat(50), avatar: 'dragon', lang: 'klingon', colour: 'url(evil)' }),
    { name: 'x'.repeat(16), avatar: 'wink', lang: 'en', colour: 'pond' });
  assert.deepEqual(P.clean('nonsense'), { name: '', avatar: 'wink', lang: 'en', colour: 'pond' });
});

test('the first language follows the browser', () => {
  assert.equal(P.guessLang(['fr-FR', 'en']), 'fr');
  assert.equal(P.guessLang(['en-GB', 'fr']), 'en');
  assert.equal(P.guessLang(['de-DE', 'fr-CA']), 'fr', 'the first language the game speaks wins');
  assert.equal(P.guessLang(['es-MX', 'en']), 'es');
  assert.equal(P.guessLang(['ja']), 'en');
  assert.equal(P.guessLang(undefined), 'en');
});

test('the choices offered are the ones the rest of the game knows', () => {
  assert.deepEqual(P.LANGS, ['en', 'fr', 'es']);
  assert.ok(P.COLOURS.includes('pond') && P.COLOURS.length >= 4);
  assert.deepEqual(P.AVATARS, C.AVATARS);
});

test('the stats count finished rounds only', () => {
  const none = P.stats({}, QUESTIONS, 5);
  assert.deepEqual(none, { played: 0, best: 0, streak: 0, reached: [false, false, false, false, false, false] });

  const half = { ranges: day(3, 4).ranges.slice(0, 2) };
  const days = { 1: day(1, 0), 2: day(2, 3), 3: half };  // 50 points, 350 points, unfinished
  const s = P.stats(days, QUESTIONS, 3);
  assert.equal(s.played, 2);
  assert.equal(s.best, 350);
  assert.equal(s.streak, 2);
  assert.deepEqual(s.reached, [true, false, false, true, false, false], 'the pond (50) and the canopy (350)');
});

test('a perfect day reaches the moon', () => {
  const s = P.stats({ 7: day(7, 4) }, QUESTIONS, 7);
  assert.equal(s.best, 500);
  assert.equal(s.reached[5], true);
});
