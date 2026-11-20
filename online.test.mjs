// The online game: the leaderboard as a Vercel function, with scores kept in Vercel Blob. Run: node --test
// Nothing here talks to Vercel. `fakeBlob` stands in for the storage and follows the same rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blobStore, createHandler } from './api/_scores.mjs';
import { createBoard, memoryStore } from './leaderboard.mjs';
import { createApp } from './server.mjs';

const C = globalThis.FermiCore;
const QUESTIONS = globalThis.FERMI_QUESTIONS;
const TODAY = 4;
const here = (file) => new URL(file, import.meta.url);

// Vercel Blob in a few lines: named files, each with a version stamp (its "etag") that changes on every write.
// A write can say "only if the file still has this stamp", or "only if the file does not exist yet".
function fakeBlob() {
  const files = new Map();
  const calls = [];
  let stamp = 0;
  class BlobPreconditionFailedError extends Error {}
  const blob = {
    files, calls, BlobPreconditionFailedError,
    beforePut: null, // a test can slip another writer in here, just before a write lands
    async get(pathname, options) {
      calls.push(['get', pathname, options]);
      const file = files.get(pathname);
      return file ? { statusCode: 200, stream: new Response(file.body).body, blob: { etag: file.etag } } : null;
    },
    async put(pathname, body, options) {
      calls.push(['put', pathname, options]);
      if (blob.beforePut) { const slipIn = blob.beforePut; blob.beforePut = null; await slipIn(); }
      const file = files.get(pathname);
      if (file && !options.allowOverwrite) throw new Error('This blob already exists.');
      if (options.ifMatch && (!file || file.etag !== options.ifMatch)) throw new BlobPreconditionFailedError('The blob changed.');
      files.set(pathname, { body, etag: 'stamp-' + (++stamp) });
    },
  };
  return blob;
}

const entry = (player, total) => ({ id: player.slice(-12), player, name: 'P', avatar: 'wink', pts: [total, 0, 0, 0, 0], total, at: total });
const A = 'player-aaaa-0000-0001', B = 'player-bbbb-0000-0002';

/* ---------- where the scores are kept ---------- */

test('each day is one private file, always read fresh', async () => {
  const blob = fakeBlob();
  const store = blobStore(blob);
  assert.deepEqual(await store.list(3), [], 'a day nobody played is empty');
  await store.add(3, entry(A, 100));
  await store.add(3, entry(B, 200));
  await store.add(4, entry(A, 300));

  assert.deepEqual((await store.list(3)).map((e) => e.total), [100, 200]);
  assert.deepEqual((await store.list(4)).map((e) => e.total), [300]);
  assert.deepEqual([...blob.files.keys()].sort(), ['scores/day-3.json', 'scores/day-4.json']);
  for (const [kind, , options] of blob.calls) {
    assert.equal(options.access, 'private', kind + ' is private: the file holds player ids');
    if (kind === 'get') assert.equal(options.useCache, false, 'a read must see the last write');
  }
});

test('two players who post at the same moment are both kept', async () => {
  const blob = fakeBlob();
  const store = blobStore(blob);
  const other = blobStore(blob);
  await store.add(3, entry('player-cccc-0000-0003', 50));
  blob.beforePut = () => other.add(3, entry(B, 200)); // B's score lands between A's read and A's write
  await store.add(3, entry(A, 100));
  assert.deepEqual((await store.list(3)).map((e) => e.total).sort(), [100, 200, 50]);
});

test('the first two players of a day, at the same moment, are both kept', async () => {
  const blob = fakeBlob();
  const store = blobStore(blob);
  const other = blobStore(blob);
  blob.beforePut = () => other.add(3, entry(B, 200)); // the day's file appears while A is creating it
  await store.add(3, entry(A, 100));
  assert.deepEqual((await store.list(3)).map((e) => e.total).sort(), [100, 200]);
});

test('the same player posting twice at the same moment is kept once: the first one stays', async () => {
  const blob = fakeBlob();
  const store = blobStore(blob);
  const other = blobStore(blob);
  blob.beforePut = () => other.add(3, entry(A, 200));
  await store.add(3, entry(A, 100));
  assert.deepEqual((await store.list(3)).map((e) => e.total), [200]);
});

test('when the storage keeps refusing, the post fails instead of pretending', async () => {
  const blob = fakeBlob();
  blob.put = async () => { throw new Error('storage is down'); };
  await assert.rejects(blobStore(blob).add(3, entry(A, 100)), /storage is down/);
});

test('a damaged file is never overwritten', async () => {
  const blob = fakeBlob();
  blob.files.set('scores/day-3.json', { body: '{oops', etag: 'stamp-x' });
  const store = blobStore(blob);
  await assert.rejects(store.add(3, entry(A, 100)));
  await assert.rejects(store.list(3));
  assert.equal(blob.files.get('scores/day-3.json').body, '{oops');
});

test('the leaderboard rules work on top of it', async () => {
  const board = createBoard(blobStore(fakeBlob()));
  const ranges = C.pickDaily(QUESTIONS, TODAY, 5).map((q) => C.rangeFor(Math.log10(q.answer), 3)); // 70 a fly
  const first = await board.submit({ day: TODAY, player: A, name: 'Léa', avatar: 'proud', ranges }, TODAY);
  const again = await board.submit({ day: TODAY, player: A, name: 'Léa', ranges }, TODAY);
  assert.equal(first.status, 200);
  assert.equal(again.entry, first.entry, 'one score a day');
  assert.deepEqual((await board.view(TODAY)).top, [{ id: first.entry, rank: 1, name: 'Léa', avatar: 'proud', total: 350 }]);
});

/* ---------- the function that answers /api/scores ---------- */

const site = 'https://frog.example/api/scores';
const handler = () => createHandler({ store: memoryStore(), today: () => TODAY });
function score(player, name) {
  const ranges = C.pickDaily(QUESTIONS, TODAY, 5).map((q) => C.rangeFor(Math.log10(q.answer), 3));
  return new Request(site, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day: TODAY, player, name, ranges }) });
}

test('online: post a score, then read the board', async () => {
  const ask = handler();
  const posted = await (await ask(score(A, 'Léa'))).json();
  assert.equal(posted.board.me.total, 350);
  await ask(score(B, 'Sam'));
  const answer = await ask(new Request(site + '?day=' + TODAY + '&entry=' + posted.entry));
  assert.equal(answer.status, 200);
  assert.match(answer.headers.get('content-type'), /application\/json/);
  assert.equal(answer.headers.get('cache-control'), 'no-store', 'a board is never served from a cache');
  const board = await answer.json();
  assert.equal(board.count, 2);
  assert.deepEqual(board.top.map((row) => row.name), ['Léa', 'Sam']);
  assert.equal(board.me.name, 'Léa');
});

test('online: bad requests get the same clear refusals as on this computer', async () => {
  const ask = handler();
  const post = (body) => ask(new Request(site, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }));
  const notJson = await post('{oops');
  assert.equal(notJson.status, 400);
  assert.ok((await notJson.json()).error);
  assert.equal((await post('{}')).status, 400);
  assert.equal((await post(JSON.stringify({ junk: 'x'.repeat(20000) }))).status, 413);
  assert.equal((await ask(new Request(site + '?day=999'))).status, 400);
  assert.equal((await ask(new Request(site + '?day=abc'))).status, 400);
  assert.equal((await ask(new Request(site))).status, 400);
  const wrongVerb = await ask(new Request(site, { method: 'DELETE' }));
  assert.equal(wrongVerb.status, 405);
  assert.equal(wrongVerb.headers.get('allow'), 'GET, POST');
});

test('online: when the storage fails, the answer is a plain error, not a crash', async () => {
  const broken = { async list() { throw new Error('storage is down'); }, async add() {} };
  const quiet = console.error;
  console.error = () => {};
  try {
    const answer = await createHandler({ store: broken, today: () => TODAY })(new Request(site + '?day=' + TODAY));
    assert.equal(answer.status, 500);
    assert.ok((await answer.json()).error);
  } finally { console.error = quiet; }
});

/* ---------- what goes online ---------- */

test('online, the page gets the same security rule as on this computer', async () => {
  const server = createApp({ store: memoryStore(), today: () => TODAY });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let local;
  try { local = (await fetch('http://127.0.0.1:' + server.address().port + '/')).headers.get('content-security-policy'); }
  finally { await new Promise((resolve) => server.close(resolve)); }
  const config = JSON.parse(readFileSync(here('./vercel.json'), 'utf8'));
  const online = config.headers.flatMap((rule) => rule.headers).find((h) => h.key === 'Content-Security-Policy');
  assert.equal(online.value, local);
});

test('scores, settings and working files of this computer are never uploaded', () => {
  const ignored = readFileSync(here('./.vercelignore'), 'utf8').split('\n').map((line) => line.trim());
  for (const name of ['data/', '.claude/', '.env*', 'design/', '*.test.mjs']) assert.ok(ignored.includes(name), name);
});
