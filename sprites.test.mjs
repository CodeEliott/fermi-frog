// The frog's animations: the flip-book arithmetic, and the sheets the game ships. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import './sprites.js';
import './sheets.js';
import { createApp } from './server.mjs';
import { memoryStore } from './leaderboard.mjs';

const S = globalThis.FermiSprites;
const SHEETS = globalThis.FERMI_SHEETS;

// 10 pictures in a grid of 4 columns and 3 rows, 10 pictures a second
const loop = { src: 'img/anim/x.webp', frames: 10, cols: 4, rows: 3, fps: 10, loop: true, box: [0.25, 0.3, 0.5, 0.5] };
const once = { ...loop, loop: false };

test('a loop starts again after its last picture', () => {
  assert.equal(S.frameAt(loop, 0), 0);
  assert.equal(S.frameAt(loop, 99), 0);
  assert.equal(S.frameAt(loop, 100), 1);
  assert.equal(S.frameAt(loop, 950), 9);
  assert.equal(S.frameAt(loop, 1000), 0, 'one second is one full turn');
  assert.equal(S.frameAt(loop, 2350), 3);
  assert.equal(S.ended(loop, 99999), false, 'a loop never ends');
});

test('a one-time animation stops on its last picture', () => {
  assert.equal(S.frameAt(once, 0), 0);
  assert.equal(S.frameAt(once, 950), 9);
  assert.equal(S.frameAt(once, 5000), 9);
  assert.equal(S.ended(once, 999), false);
  assert.equal(S.ended(once, 1000), true);
  assert.equal(S.length(once), 1000);
});

test('each picture is found in the grid, row by row', () => {
  assert.deepEqual(S.cellOf(loop, 0), { col: 0, row: 0 });
  assert.deepEqual(S.cellOf(loop, 3), { col: 3, row: 0 });
  assert.deepEqual(S.cellOf(loop, 4), { col: 0, row: 1 });
  assert.deepEqual(S.cellOf(loop, 9), { col: 1, row: 2 });
  // as the browser wants it: 0% is the first column or row, 100% the last
  assert.equal(S.positionOf(loop, 0), '0% 0%');
  assert.equal(S.positionOf(loop, 3), '100% 0%');
  assert.equal(S.positionOf(loop, 9), '33.333% 100%');
  assert.equal(S.positionOf({ ...loop, cols: 1, rows: 1, frames: 1 }, 0), '0% 0%', 'a single picture never divides by zero');
});

test('the animated frog covers the still frog exactly', () => {
  // the still takes the middle half of a cell: the cell must be twice the still, moved up and left
  assert.deepEqual(S.place(loop), { width: '200%', height: '200%', left: '-50%', top: '-60%' });
  assert.deepEqual(S.place({ ...loop, box: [0, 0, 1, 1] }), { width: '100%', height: '100%', left: '0%', top: '0%' });
  // a cell cut tight around the frog is smaller than the still picture, which has empty room around its drawing
  assert.deepEqual(S.place({ ...loop, box: [-0.1, -0.05, 1.25, 1.25] }), { width: '80%', height: '80%', left: '8%', top: '4%' });
});

test('every sheet the game ships is complete and its picture exists', async () => {
  const server = createApp({ store: memoryStore() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const file of ['/sprites.js', '/sheets.js']) assert.equal((await fetch(base + file)).status, 200, file);
    for (const [pose, sheet] of Object.entries(SHEETS)) {
      assert.deepEqual(S.problems(sheet), [], pose);
      assert.match(sheet.src, /^img\/anim\/[a-z0-9-]+\.webp$/, pose);
      assert.ok(existsSync(new URL('./' + sheet.src, import.meta.url)), pose + ': ' + sheet.src);
      const still = sheet.still || pose; // the picture this animation is laid over, and the one shown to players who ask for less motion
      assert.ok(existsSync(new URL('./img/frog-plain/' + still + '.webp', import.meta.url)), pose + ' needs the still "' + still + '"');
      const answer = await fetch(base + '/' + sheet.src);
      assert.equal(answer.status, 200, sheet.src);
      assert.equal(answer.headers.get('content-type'), 'image/webp');
    }
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('a sheet with a mistake is caught', () => {
  assert.deepEqual(S.problems(loop), []);
  assert.ok(S.problems({ ...loop, frames: 13 }).length, 'more pictures than the grid holds');
  assert.ok(S.problems({ ...loop, fps: 0 }).length);
  assert.deepEqual(S.problems({ ...loop, box: [-0.1, -0.05, 1.25, 1.25] }), [], 'the still may be larger than the cell');
  assert.ok(S.problems({ ...loop, box: [1.2, 0, 0.5, 1] }).length, 'the still and the cell do not even touch');
  assert.ok(S.problems({ ...loop, box: [0, 0, 0, 1] }).length, 'a still with no width');
  assert.ok(S.problems({ ...loop, src: '' }).length);
});
