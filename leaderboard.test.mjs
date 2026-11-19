// The rules of the leaderboard, written as checks. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, memoryStore, rankEntries } from './leaderboard.mjs';

const C = globalThis.FermiCore;
const QUESTIONS = globalThis.FERMI_QUESTIONS;

const TODAY = 3;
const PLAYER = 'player-0000-0000-0001';

// Five catches with a range 2 times wide: 70 points a fly, 350 in all.
function fairRanges(day) {
  return C.pickDaily(QUESTIONS, day, 5).map((q) => C.rangeFor(Math.log10(q.answer), 3));
}
// Five catches with the widest range, 100 times wide: 10 points a fly, 50 in all.
function wideRanges(day) {
  return C.pickDaily(QUESTIONS, day, 5).map((q) => C.rangeFor(Math.log10(q.answer), 0));
}
function post(overrides) {
  return { day: TODAY, player: PLAYER, name: 'Léa', ranges: fairRanges(TODAY), ...overrides };
}

test('the server works out the score itself', async () => {
  const board = createBoard(memoryStore());
  const out = await board.submit(post({ total: 500, pts: [100, 100, 100, 100, 100] }), TODAY);
  assert.equal(out.status, 200);
  assert.match(out.entry, /^[0-9a-f]{12}$/);
  assert.equal(out.board.count, 1);
  assert.deepEqual(out.board.me, { id: out.entry, rank: 1, name: 'Léa', total: 350 });
});

test('a player has one score a day: the first one stays', async () => {
  const board = createBoard(memoryStore());
  const first = await board.submit(post({ ranges: wideRanges(TODAY) }), TODAY);
  const second = await board.submit(post(), TODAY);
  assert.equal(second.entry, first.entry);
  assert.equal(second.board.count, 1);
  assert.equal(second.board.me.total, first.board.me.total);
  assert.equal(first.board.me.total, 50);
});

test('yesterday and tomorrow are open too, because of time zones', async () => {
  const board = createBoard(memoryStore());
  for (const day of [TODAY - 1, TODAY, TODAY + 1]) {
    const out = await board.submit(post({ day, ranges: fairRanges(day) }), TODAY);
    assert.equal(out.status, 200, 'day ' + day);
  }
});

test('a score that is not complete or not honest is refused', async () => {
  const board = createBoard(memoryStore());
  const ranges = fairRanges(TODAY);
  const bad = [
    null, 'hello', [],
    post({ day: TODAY + 2 }), post({ day: TODAY - 2 }), post({ day: 0 }), post({ day: 1.5 }), post({ day: '3' }),
    post({ name: '' }), post({ name: '   ' }), post({ name: 42 }),
    post({ player: '' }), post({ player: 'short' }), post({ player: 'x'.repeat(100) }), post({ player: 'bad id with spaces!!' }),
    post({ ranges: ranges.slice(0, 4) }), post({ ranges: 'none' }),
    post({ ranges: ranges.map(([a, b]) => [b, a]) }),
    post({ ranges: ranges.map(() => [0, 10]) }),
    post({ ranges: ranges.map(() => [-5, 10]) }),
    post({ ranges: ranges.map(() => [1, Infinity]) }),
    post({ ranges: ranges.map(() => ['1', '2']) }),
    post({ ranges: ranges.map(() => [1]) }),
  ];
  for (const body of bad) {
    const out = await board.submit(body, TODAY);
    assert.equal(out.status, 400, JSON.stringify(body));
    assert.ok(typeof out.error === 'string' && out.error.length > 0);
  }
  assert.equal((await board.view(TODAY)).count, 0, 'nothing was saved');
});

test('names are cleaned and cut to 16 characters', async () => {
  const board = createBoard(memoryStore());
  const out = await board.submit(post({ name: '  A very long name indeed\u0007  ' }), TODAY);
  assert.equal(out.board.me.name, 'A very long name');
});

test('the highest score is first, and equal scores share a rank', () => {
  const ranked = rankEntries([
    { id: 'a', total: 100, at: 5 },
    { id: 'b', total: 300, at: 9 },
    { id: 'c', total: 200, at: 2 },
    { id: 'd', total: 200, at: 1 },
    { id: 'e', total: 50, at: 0 },
  ]);
  assert.deepEqual(ranked.map((e) => e.id), ['b', 'd', 'c', 'a', 'e'], 'ties: the earlier score is listed first');
  assert.deepEqual(ranked.map((e) => e.rank), [1, 2, 2, 4, 5]);
});

test('the board shows the top players, and always your own line', async () => {
  const board = createBoard(memoryStore(), { top: 3 });
  for (let i = 0; i < 5; i++) await board.submit(post({ player: 'strong-player-000' + i, name: 'P' + i }), TODAY);
  const me = await board.submit(post({ player: 'weak-player-00000', name: 'Me', ranges: wideRanges(TODAY) }), TODAY);

  assert.equal(me.board.count, 6);
  assert.equal(me.board.top.length, 3);
  assert.equal(me.board.me.name, 'Me');
  assert.equal(me.board.me.rank, 6);
  assert.ok(!me.board.top.some((row) => row.id === me.entry), 'outside the top, so given apart');

  const anyone = await board.view(TODAY);
  assert.equal(anyone.me, null);
});

test('the board never gives away player ids or ranges', async () => {
  const board = createBoard(memoryStore());
  await board.submit(post(), TODAY);
  const text = JSON.stringify(await board.view(TODAY));
  assert.ok(!text.includes(PLAYER));
  assert.deepEqual(Object.keys((await board.view(TODAY)).top[0]).sort(), ['id', 'name', 'rank', 'total']);
});

test('an empty day gives an empty board', async () => {
  const board = createBoard(memoryStore());
  assert.deepEqual(await board.view(TODAY), { day: TODAY, count: 0, top: [], me: null });
});

test('a day has a limit of players, so nobody can fill the disk', async () => {
  const board = createBoard(memoryStore(), { maxPerDay: 2 });
  await board.submit(post({ player: 'player-number-00001' }), TODAY);
  await board.submit(post({ player: 'player-number-00002' }), TODAY);
  const out = await board.submit(post({ player: 'player-number-00003' }), TODAY);
  assert.equal(out.status, 409);
  assert.equal((await board.view(TODAY)).count, 2);
});
