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

/* ---------- saved data: what a device or an account keeps, and how two copies become one ---------- */

test('saved rounds are cleaned: only real days, only real ranges', () => {
  const good = day(3, 2);
  const days = P.cleanDays({
    3: { ...good, entry: 'abcdef012345' },
    4: { ranges: [[1, 2], [5, 1], [3, 4]] },        // the second range is upside down: the round stops before it
    5: { ranges: [] },                               // nothing played: not kept
    6: { ranges: [[1, 2]], entry: 'not an id' },     // an odd leaderboard id is dropped, the round stays
    0: good, '-2': good, 1.5: good, banana: good,    // not day numbers
    7: 'hello', 8: null,
  });
  assert.deepEqual(Object.keys(days), ['3', '4', '6']);
  assert.deepEqual(days[3], { ranges: good.ranges, entry: 'abcdef012345' });
  assert.deepEqual(days[4], { ranges: [[1, 2]] });
  assert.deepEqual(days[6], { ranges: [[1, 2]] });
  assert.deepEqual(P.cleanDays(null), {});
  assert.deepEqual(P.cleanDays('junk'), {});
  const long = P.cleanDays({ 9: { ranges: Array.from({ length: 12 }, () => [1, 2]) } });
  assert.equal(long[9].ranges.length, C.ROUND, 'never more ranges than a round has flies');
});

test('two copies of a player become one, and no round is lost', () => {
  const phone = { profile: { name: 'Léa', avatar: 'proud', lang: 'fr', colour: 'dusk' }, profileAt: 2000, days: { 3: day(3, 2), 5: { ranges: day(5, 2).ranges.slice(0, 2) } } };
  const laptop = { profile: { name: 'Lea', avatar: 'wink', lang: 'en', colour: 'pond' }, profileAt: 1000, days: { 4: day(4, 1), 5: { ...day(5, 2), entry: 'abcdef012345' } } };
  const both = P.mergeData(phone, laptop);
  assert.deepEqual(Object.keys(both.days), ['3', '4', '5'], 'every day either copy knows');
  assert.equal(both.days[5].ranges.length, 5, 'a finished round beats a half-played one');
  assert.equal(both.days[5].entry, 'abcdef012345', 'and its place on the tree comes along');
  assert.deepEqual(both.profile, phone.profile, 'the profile changed last wins');
  assert.equal(both.profileAt, 2000);
  assert.deepEqual(P.mergeData(laptop, phone), both, 'whichever copy comes first');
});

test('merging with nothing, or with rubbish, keeps what was there', () => {
  const mine = { profile: { name: 'Sam', avatar: 'think', lang: 'es', colour: 'moon' }, profileAt: 5, days: { 3: day(3, 2) } };
  for (const other of [null, undefined, {}, 'junk', { days: 'no', profile: 7, profileAt: 'soon' }]) {
    const out = P.mergeData(mine, other);
    assert.deepEqual(out.days, mine.days);
    assert.deepEqual(out.profile, mine.profile);
  }
  const fresh = P.mergeData(null, null);
  assert.deepEqual(fresh, { profile: P.clean(null), profileAt: 0, days: {} });
});

test('a profile saved before accounts existed counts as changed long ago, not never', () => {
  assert.equal(P.changedAt({ profile: { name: 'Léa' }, days: {} }), 1, 'no date: long ago');
  assert.equal(P.changedAt({ profile: { name: '' }, profileAt: 0 }), 0, 'a new browser where nothing was chosen');
  assert.equal(P.changedAt({ profileAt: 1795000000000 }), 1795000000000);
  assert.equal(P.changedAt(null), 0, 'nothing saved at all');
  // so it reaches a brand-new account, whichever side does the merging (the page or the server)
  const old = { profile: { name: 'Léa', avatar: 'wink', lang: 'en', colour: 'pond' }, profileAt: P.changedAt({}), days: {} };
  const account = P.mergeData(null, null);
  assert.equal(P.mergeData(old, account).profile.name, 'Léa');
  assert.equal(P.mergeData(account, old).profile.name, 'Léa');
});

test('the moment a device signs in, the frog of the account wins and the rounds join', () => {
  const account = { profile: { name: 'Léa', avatar: 'proud', lang: 'fr', colour: 'dusk' }, profileAt: 1000, days: { 3: day(3, 2) } };
  // a new phone: a name was typed a minute ago, so its profile is the newest one, but it is not the player's real one
  const phone = { profile: { name: 'Lea', avatar: 'think', lang: 'en', colour: 'pond' }, profileAt: 9000, days: { 4: day(4, 1) } };
  const out = P.signIn(phone, account);
  assert.deepEqual(out.profile, account.profile);
  assert.equal(out.profileAt, 1000);
  assert.deepEqual(Object.keys(out.days), ['3', '4'], 'the rounds played before signing in are kept');
  // a brand-new account has no frog yet: the device keeps its own, which becomes the account's
  const first = P.signIn(phone, P.mergeData(null, null));
  assert.deepEqual(first.profile, phone.profile);
  assert.equal(first.profileAt, 9000);
  assert.deepEqual(P.signIn(phone, null).profile, phone.profile, 'and an unreadable answer changes nothing');
});
