// The rules of Fermi Frog, written as checks. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import './core.js';
import './questions.js';

const C = globalThis.FermiCore;
const QUESTIONS = globalThis.FERMI_QUESTIONS;
const close = (a, b) => Math.abs(a - b) <= Math.abs(b) * 1e-9;

test('formatAmount writes numbers the way a person says them', () => {
  assert.equal(C.formatAmount(12), '12');
  assert.equal(C.formatAmount(8.3), '8.3');
  assert.equal(C.formatAmount(384400), '384,400');
  assert.equal(C.formatAmount(2.5e6), '2.5 million');
  assert.equal(C.formatAmount(31536000), '31.54 million');
  assert.equal(C.formatAmount(3e9), '3 billion');
  assert.equal(C.formatAmount(9.46e12), '9.46 trillion');
  assert.equal(C.formatAmount(999999999), '1 billion');
});

test('formatAmount can round harder, for the ends of a range', () => {
  assert.equal(C.formatAmount(79432, 2), '79,000');
  assert.equal(C.formatAmount(251188, 2), '250,000');
  assert.equal(C.formatAmount(2.137e6, 3), '2.14 million');
  assert.equal(C.formatAmount(0.316, 2), '0.32');
});

test('numbers are written in French too', () => {
  const sp = '\u202f'; // French puts a narrow space between thousands
  assert.equal(C.formatAmount(12, 4, 'fr'), '12');
  assert.equal(C.formatAmount(8.3, 4, 'fr'), '8,3');
  assert.equal(C.formatAmount(384400, 4, 'fr'), '384' + sp + '400');
  assert.equal(C.formatAmount(1e6, 4, 'fr'), '1 million');
  assert.equal(C.formatAmount(2.5e6, 4, 'fr'), '2,5 millions');
  assert.equal(C.formatAmount(1.2e9, 4, 'fr'), '1,2 milliard');
  assert.equal(C.formatAmount(3e9, 4, 'fr'), '3 milliards');
  // French has no everyday word for a million million: it counts in milliards
  assert.equal(C.formatAmount(9.46e12, 4, 'fr'), '9' + sp + '460 milliards');
  assert.equal(C.compactAmount(50000, 'fr'), '50 k');
  assert.equal(C.compactAmount(2e6, 'fr'), '2 M');
  assert.equal(C.compactAmount(1e9, 'fr'), '1 Md');
  assert.equal(C.compactAmount(1e12, 'fr'), '1' + sp + '000 Md');

  // Spanish: a dot between thousands (from five digits), a comma for decimals.
  // A Spanish "billón" is a million millions: a thousand millions stay "millones".
  assert.equal(C.formatAmount(8.3, 4, 'es'), '8,3');
  assert.equal(C.formatAmount(7200, 4, 'es'), '7200');
  assert.equal(C.formatAmount(384400, 4, 'es'), '384.400');
  assert.equal(C.formatAmount(1e6, 4, 'es'), '1 millón');
  assert.equal(C.formatAmount(2.5e6, 4, 'es'), '2,5 millones');
  assert.equal(C.formatAmount(2.9e9, 4, 'es'), '2900 millones');
  assert.equal(C.formatAmount(26e9, 4, 'es'), '26.000 millones');
  assert.equal(C.formatAmount(1e12, 4, 'es'), '1 billón');
  assert.equal(C.formatAmount(9.46e12, 4, 'es'), '9,46 billones');
  assert.equal(C.compactAmount(50000, 'es'), '50 mil');
  assert.equal(C.compactAmount(2e6, 'es'), '2 M');
  assert.equal(C.compactAmount(1e9, 'es'), '1000 M');
  assert.equal(C.compactAmount(1e12, 'es'), '1 B');
  assert.equal(C.formatAmount(2.5e6, 4, 'xx'), '2.5 million', 'an unknown language falls back to English');
});

test('compactAmount makes short labels for the scale', () => {
  assert.equal(C.compactAmount(1), '1');
  assert.equal(C.compactAmount(1000), '1k');
  assert.equal(C.compactAmount(50000), '50k');
  assert.equal(C.compactAmount(2e6), '2M');
  assert.equal(C.compactAmount(1e9), '1B');
  assert.equal(C.compactAmount(1e12), '1T');
});

test('the five widths: a narrower range is worth more', () => {
  assert.deepEqual(C.WIDTHS, [100, 10, 3, 2, 1.3]);
  assert.deepEqual(C.POINTS, [10, 25, 50, 70, 100]);
  C.WIDTHS.forEach((width, i) => assert.equal(C.pointsForRatio(width), C.POINTS[i]));
  assert.equal(C.pointsForRatio(1), 100, 'an exact guess gets the top prize');
  assert.equal(C.pointsForRatio(1.7), 70, 'between two widths, the wider one counts');
  assert.equal(C.pointsForRatio(100.5), 0, 'wider than the widest: no points');
  let last = 101;
  for (let r = 1; r < 300; r *= 1.07) {
    const p = C.pointsForRatio(r);
    assert.ok(p <= last, 'points never go up when the range gets wider');
    last = p;
  }
});

test('rangeFor gives a range of the chosen width around the centre', () => {
  for (let i = 0; i < C.WIDTHS.length; i++) {
    const [low, high] = C.rangeFor(5, i); // centred on 100,000
    assert.ok(close(high / low, C.WIDTHS[i]), 'width ' + i);
    assert.ok(close(Math.sqrt(low * high), 1e5), 'centre ' + i);
    assert.equal(C.scoreRange(low, high, 1e5).points, C.POINTS[i]);
  }
});

test('scoreRange: a catch scores, a miss scores nothing', () => {
  const hit = C.scoreRange(50000, 100000, 86400);
  assert.equal(hit.hit, true);
  assert.equal(hit.points, 70);

  const tooHigh = C.scoreRange(200000, 400000, 100000);
  assert.deepEqual(tooHigh, { hit: false, points: 0, ratio: 2, side: 'high', off: 2 });

  const tooLow = C.scoreRange(10, 20, 60);
  assert.equal(tooLow.hit, false);
  assert.equal(tooLow.side, 'low');
  assert.equal(tooLow.off, 3);
});

test('scoreRange: the edges of the range count as inside', () => {
  assert.equal(C.scoreRange(100, 200, 100).hit, true);
  assert.equal(C.scoreRange(100, 200, 200).hit, true);
  assert.equal(C.scoreRange(12, 12, 12).points, 100);
});

test('the score is a height, and each height has a place on the tree', () => {
  assert.deepEqual(C.ZONES.map((z) => z.name), ['Pond', 'Reeds', 'Trunk', 'Canopy', 'Clouds', 'Moon']);
  assert.deepEqual(C.ZONES.map((z) => z.id), ['pond', 'reeds', 'trunk', 'canopy', 'clouds', 'moon']);
  assert.equal(C.zoneFor(0).name, 'Pond');
  assert.equal(C.zoneFor(99).name, 'Pond');
  assert.equal(C.zoneFor(100).name, 'Reeds');
  assert.equal(C.zoneFor(245).name, 'Trunk');
  assert.equal(C.zoneFor(499).name, 'Clouds');
  assert.equal(C.zoneFor(500).name, 'Moon', 'only a perfect day reaches the moon');
  assert.equal(C.MAX_SCORE, 500);
});

test('day numbers start at 1 on launch day', () => {
  assert.equal(C.dayNumber(new Date(2026, 10, 16, 9, 0)), 1);
  assert.equal(C.dayNumber(new Date(2026, 10, 16, 23, 59)), 1);
  assert.equal(C.dayNumber(new Date(2026, 10, 17, 0, 1)), 2);
  assert.equal(C.dayNumber(new Date(2027, 0, 1)), 47);
  assert.equal(C.dayNumber(new Date(2020, 0, 1)), 1); // a wrong clock never breaks the game
  const d = C.dateOfDay(2);
  assert.deepEqual([d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()], [2026, 10, 17]);
});

test('everyone gets the same five questions on the same day', () => {
  const a = C.pickDaily(QUESTIONS, 3, 5).map((q) => q.id);
  const b = C.pickDaily(QUESTIONS, 3, 5).map((q) => q.id);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, 5);
  assert.notDeepEqual(a, C.pickDaily(QUESTIONS, 4, 5).map((q) => q.id));
});

test('the days already played keep the questions they were played with', () => {
  // Saved rounds are scored against that day's questions, so a bigger bank must never change an old day.
  const ids = (day) => C.pickDaily(QUESTIONS, day, 5).map((q) => q.id);
  assert.deepEqual(ids(1), ['paper-eiffel', 'deepest', 'languages', 'heart-day', 'genome']);
  assert.deepEqual(ids(5), ['light-year', 'count-billion', 'mcdo', 'walk-equator', 'heart-life']);
  assert.deepEqual(ids(10), ['heart-pump', 'genome', 'stade', 'great-wall', 'light-year']);
  assert.deepEqual(ids(11), ['cells', 'wheel', 'sec-year', 'universe', 'wikipedia']);
  assert.deepEqual(ids(12), ['eiffel-mass', 'heart-day', 'mcdo', 'heart-life', 'everest']);
});

test('from the new deal on, every day is two easy, two medium and one hard question, easiest first', () => {
  for (let day = C.NEW_DEAL_DAY; day < C.NEW_DEAL_DAY + 400; day++) {
    const round = C.pickDaily(QUESTIONS, day, 5);
    assert.deepEqual(round.map((q) => q.level), [1, 1, 2, 2, 3], 'day ' + day);
    assert.equal(new Set(round.map((q) => q.id)).size, 5, 'day ' + day + ' has five different questions');
  }
});

test('a question does not come back for at least 10 days, even when a deck is reshuffled', () => {
  const lastSeen = new Map();
  // the last old days count too: the first new days must not repeat them
  for (let day = C.NEW_DEAL_DAY - 3; day < C.NEW_DEAL_DAY + 400; day++) {
    for (const q of C.pickDaily(QUESTIONS, day, 5)) {
      if (lastSeen.has(q.id) && day >= C.NEW_DEAL_DAY) {
        assert.ok(day - lastSeen.get(q.id) >= 10, `${q.id} is back on day ${day}, after day ${lastSeen.get(q.id)}`);
      }
      lastSeen.set(q.id, day);
    }
  }
});

test('the new deal gives 20 days without any repeat', () => {
  const seen = new Set();
  for (let day = C.NEW_DEAL_DAY; day < C.NEW_DEAL_DAY + 20; day++) {
    for (const q of C.pickDaily(QUESTIONS, day, 5)) {
      assert.ok(!seen.has(q.id), `${q.id} repeats on day ${day}`);
      seen.add(q.id);
    }
  }
});

test('a fly that escaped when the time ran out is a real range that never scores', () => {
  assert.equal(C.TIME_LIMIT, 60);
  const [low, high] = C.ESCAPED;
  assert.ok(low > 0 && high >= low && Number.isFinite(high), 'the leaderboard and the saved rounds accept it as a range');
  assert.deepEqual(JSON.parse(JSON.stringify(C.ESCAPED)), C.ESCAPED, 'it survives being saved');
  for (const q of QUESTIONS) {
    const s = C.scoreRange(low, high, q.answer);
    assert.equal(s.hit, false);
    assert.equal(s.points, 0);
    assert.equal(s.escaped, true);
  }
  assert.equal(C.scoreRange(10, 20, 60).escaped, undefined, 'an ordinary miss is not an escape');
});

test('the stopwatch counts down from a minute and stops at zero', () => {
  assert.equal(C.secondsLeft(1000, 1000), 60);
  assert.equal(C.secondsLeft(1000, 1000 + 500), 60, 'a started second still shows');
  assert.equal(C.secondsLeft(1000, 1000 + 59001), 1);
  assert.equal(C.secondsLeft(1000, 1000 + 60000), 0);
  assert.equal(C.secondsLeft(1000, 1000 + 999999), 0);
  assert.equal(C.secondsLeft(5000, 1000), 60, 'a clock set back never gives more than a minute');
});

test('a leaderboard name is cleaned and cut to 16 characters', () => {
  assert.equal(C.cleanName('  Léa  '), 'Léa');
  assert.equal(C.cleanName('a'.repeat(40)).length, 16);
  assert.equal(C.cleanName('Sam\u0000\n'), 'Sam');
  assert.equal(C.cleanName(null), '');
});

test('one square per fly: green for a narrow catch, yellow for a wide one, red for a miss', () => {
  assert.equal(C.squares([100, 25, 0, 70, 50]), '🟩🟨🟥🟩🟨');
});

test('a profile picture is one of the known frogs', () => {
  assert.ok(C.AVATARS.length >= 6);
  assert.equal(C.cleanAvatar('astronaut'), 'astronaut');
  for (const bad of ['', 'dragon', '../secret', 42, null, undefined, {}]) assert.equal(C.cleanAvatar(bad), C.AVATARS[0]);
});

test('the streak counts days played in a row', () => {
  const full = { ranges: [[1, 2], [1, 2], [1, 2], [1, 2], [1, 2]] };
  const half = { ranges: [[1, 2]] };
  assert.equal(C.streak({}, 5), 0);
  assert.equal(C.streak({ 5: full }, 5), 1);
  assert.equal(C.streak({ 3: full, 4: full, 5: full }, 5), 3);
  assert.equal(C.streak({ 3: full, 4: full }, 5), 2, 'today not played yet: the streak is still alive');
  assert.equal(C.streak({ 3: full, 4: full, 5: half }, 5), 2, 'a half-played day does not count yet');
  assert.equal(C.streak({ 2: full, 3: full }, 5), 0, 'a missed day ends it');
});

test('a supporter can miss one day a week and keep the streak', () => {
  const full = { ranges: [[1, 2], [1, 2], [1, 2], [1, 2], [1, 2]] };
  const played = (...list) => Object.fromEntries(list.map((d) => [d, full]));
  const upTo = (last, ...missed) => played(...Array.from({ length: last }, (_, i) => i + 1).filter((d) => !missed.includes(d)));

  assert.equal(C.streak(played(1, 2, 4, 5), 5), 2, 'without the plan, a missed day still ends it');
  assert.equal(C.streak(played(1, 2, 4, 5), 5, true), 4, 'the missed day is bridged, but does not count');
  assert.equal(C.streak(played(1, 2, 5), 5, true), 1, 'two missed days in a row end it');
  assert.equal(C.streak(played(3, 4), 6, true), 2, 'missed yesterday, today still open: the streak waits');
  assert.equal(C.streak(upTo(20, 15, 8), 20, true), 18, 'two misses 7 days apart are both bridged');
  assert.equal(C.streak(upTo(20, 15, 10), 20, true), 9, 'a second miss within 7 days ends it');
  assert.equal(C.streak(played(2, 3), 3, true), 2, 'day 1 missed: nothing before it to bridge to');
});

test('supporter frogs are known frogs, kept apart from the free ones', () => {
  assert.equal(C.SUPPORTER_AVATARS.length, 8);
  for (const frog of C.SUPPORTER_AVATARS) {
    assert.ok(!C.AVATARS.includes(frog));
    assert.equal(C.cleanAvatar(frog), frog, 'a supporter frog is a real frog, so the board can show it');
  }
  assert.equal(C.cleanAvatar('dragon'), 'wink');
});

test('every question in the bank is complete', () => {
  assert.ok(QUESTIONS.length >= 100, 'at least 20 days of questions');
  for (const [level, days] of [[1, 2], [2, 2], [3, 1]]) {
    const count = QUESTIONS.filter((q) => q.level === level).length;
    assert.ok(count >= 20 * days, `level ${level} has ${count} questions, not enough for 20 days`);
  }
  const ids = new Set();
  for (const q of QUESTIONS) {
    assert.ok(!ids.has(q.id), `duplicate id ${q.id}`);
    ids.add(q.id);
    assert.ok(typeof q.answer === 'number' && q.answer > 0, `${q.id} answer`);
    assert.ok([1, 2, 3].includes(q.level), `${q.id} needs a level: 1 easy, 2 medium, 3 hard`);
    for (const field of ['id', 'short', 'q', 'text', 'how', 'source']) {
      assert.ok(typeof q[field] === 'string' && q[field].trim().length > 0, `${q.id} needs ${field}`);
    }
    assert.ok(q.q.trim().endsWith('?'), `${q.id} is a question`);
    assert.ok(q.answer >= 1 && q.answer <= 1e15, `${q.id} fits on the scale`);
  }
});
