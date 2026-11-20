// The server, end to end: a real server on a free port, real requests. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './server.mjs';
import { memoryStore } from './leaderboard.mjs';

const C = globalThis.FermiCore;
const QUESTIONS = globalThis.FERMI_QUESTIONS;
const TODAY = 4;

async function withServer(run) {
  const server = createApp({ store: memoryStore(), today: () => TODAY });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try { await run(base); } finally { await new Promise((resolve) => server.close(resolve)); }
}

function score(player, name) {
  const ranges = C.pickDaily(QUESTIONS, TODAY, 5).map((q) => C.rangeFor(Math.log10(q.answer), 3)); // 70 a fly
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day: TODAY, player, name, ranges }) };
}

test('the server gives the game pages, and nothing else', async () => {
  await withServer(async (base) => {
    const home = await fetch(base + '/');
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type'), /text\/html/);
    assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);
    assert.match(await home.text(), /<title>Fermi Frog<\/title>/);

    for (const file of ['/style.css', '/boot.js', '/core.js', '/profile.js', '/i18n.js', '/questions.js', '/questions-fr.js', '/questions-es.js', '/world.js', '/tape.js', '/pond.js', '/sprites.js', '/sheets.js', '/app.js']) {
      assert.equal((await fetch(base + file)).status, 200, file);
    }
    const pictures = { '/img/frog/think.webp': 'image/webp', '/img/frog-plain/think.webp': 'image/webp', '/img/pond/water.webp': 'image/webp', '/img/bugs/fly-up.webp': 'image/webp', '/img/world/moon.webp': 'image/webp',
      '/img/perch/pad.webp': 'image/webp', '/img/badge/pond.webp': 'image/webp', '/img/ui/logo.webp': 'image/webp',
      '/img/ui/icon-180.png': 'image/png', '/img/ui/share.jpg': 'image/jpeg' };
    for (const [picture, type] of Object.entries(pictures)) {
      const res = await fetch(base + picture);
      assert.equal(res.status, 200, picture);
      assert.equal(res.headers.get('content-type'), type);
    }

    const secrets = ['/data/scores.json', '/server.mjs', '/leaderboard.mjs', '/core.test.mjs', '/.claude/launch.json',
      '/%2e%2e/CLAUDE.md', '/nope', '/img/frog/nope.webp', '/img/frog/..%2f..%2fserver.mjs', '/img/frog/', '/img/secret/think.webp', '/img/frog/think.png', '/img/ui/logo.svg',
      '/design/PROMPTS.md', '/design/frog/sheet.webp'];
    for (const secret of secrets) {
      assert.equal((await fetch(base + secret)).status, 404, secret);
    }
  });
});

test('post a score, then read the board', async () => {
  await withServer(async (base) => {
    const posted = await (await fetch(base + '/api/scores', score('player-aaaa-0000-0001', 'Léa'))).json();
    assert.equal(posted.board.me.total, 350);

    await fetch(base + '/api/scores', score('player-bbbb-0000-0002', 'Sam'));
    const board = await (await fetch(base + '/api/scores?day=' + TODAY + '&entry=' + posted.entry)).json();
    assert.equal(board.count, 2);
    assert.deepEqual(board.top.map((row) => row.name), ['Léa', 'Sam']);
    assert.deepEqual(board.top.map((row) => row.rank), [1, 1]);
    assert.equal(board.me.name, 'Léa');
  });
});

test('bad requests get a clear refusal', async () => {
  await withServer(async (base) => {
    const json = { 'Content-Type': 'application/json' };
    const notJson = await fetch(base + '/api/scores', { method: 'POST', headers: json, body: '{oops' });
    assert.equal(notJson.status, 400);
    assert.ok((await notJson.json()).error);

    const empty = await fetch(base + '/api/scores', { method: 'POST', headers: json, body: '{}' });
    assert.equal(empty.status, 400);

    const huge = await fetch(base + '/api/scores', { method: 'POST', headers: json, body: JSON.stringify({ junk: 'x'.repeat(20000) }) });
    assert.equal(huge.status, 413);

    assert.equal((await fetch(base + '/api/scores?day=999')).status, 400);
    assert.equal((await fetch(base + '/api/scores?day=abc')).status, 400);
    assert.equal((await fetch(base + '/api/scores', { method: 'DELETE' })).status, 405);
    assert.equal((await fetch(base + '/', { method: 'POST', body: 'x' })).status, 404);
  });
});
