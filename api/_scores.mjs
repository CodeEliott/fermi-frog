/* Fermi Frog online: the leaderboard on Vercel.

   On this computer, server.mjs answers /api/scores and keeps scores in a file.
   Online there is no computer that stays on: Vercel starts this code for each request, then stops it.
   So the scores live in Vercel Blob, a private file store: one small JSON file per day.

     the page ──▶ /api/scores ──▶ createHandler ──▶ leaderboard.mjs (the same rules) ──▶ blobStore ──▶ scores/day-5.json

   The file name starts with "_" so Vercel does not turn it into a web address of its own.
   scores.mjs, next to it, is the address: it plugs the real Vercel Blob into the two functions below.
   Nothing in this file talks to Vercel directly, so `node --test` can check it with a stand-in (online.test.mjs). */
import { createBoard } from '../leaderboard.mjs';

const C = globalThis.FermiCore;
const MAX_BODY = 4096;     // bytes; a real score is under 400
const MAX_PER_DAY = 1000;  // a day's scores are one file, written again on each post: it has to stay small
const TRIES = 5;

// Scores in Vercel Blob. `sdk` is { get, put } from the @vercel/blob package.
// Same shape as the other stores (see leaderboard.mjs): list(day) and add(day, entry).
export function blobStore(sdk) {
  const fileOf = (day) => 'scores/day-' + day + '.json';

  // The day's entries, and the file's version stamp ("etag"): it changes each time the file is written.
  async function read(day) {
    const found = await sdk.get(fileOf(day), { access: 'private', useCache: false }); // no cache: a read must see the last write
    if (!found || found.statusCode !== 200) return { entries: [], etag: null };
    const entries = JSON.parse(await new Response(found.stream).text()); // a damaged file stops here: it is never overwritten
    if (!Array.isArray(entries)) throw new Error('The scores of day ' + day + ' are not a list.');
    return { entries, etag: found.blob.etag };
  }

  return {
    async list(day) { return (await read(day)).entries; },

    // Two players can post in the same instant. Each one reads the file, adds a line, and writes it back:
    // without care, the second write would erase the first player's line.
    // So a write says "only if the file is still the version I read". If it is not, read again and retry.
    async add(day, entry) {
      let problem;
      for (let attempt = 0; attempt < TRIES; attempt++) {
        const { entries, etag } = await read(day);
        if (entries.some((e) => e.player === entry.player)) return; // already kept: the first score stays
        try {
          await sdk.put(fileOf(day), JSON.stringify([...entries, entry]), {
            access: 'private',
            contentType: 'application/json',
            ...(etag ? { allowOverwrite: true, ifMatch: etag } : { allowOverwrite: false }), // no file yet: create it, never replace one
          });
          return;
        } catch (error) {
          problem = error; // most likely someone wrote first
        }
      }
      throw problem;
    },
  };
}

// The function behind /api/scores, in the web's own terms: a Request comes in, a Response goes out.
// It answers exactly like the local server does (server.test.mjs and online.test.mjs ask both the same things).
// `supporter(request)` says whether the player posting is a supporter (account.mjs); left out, nobody is.
export function createHandler({ store, supporter = async () => false, today = () => C.dayNumber(new Date()) }) {
  const board = createBoard(store, { maxPerDay: MAX_PER_DAY });

  const send = (status, body, extra) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra },
  });

  async function answer(request) {
    const url = new URL(request.url);
    if (request.method === 'GET') {
      const dayText = url.searchParams.get('day') || '';
      const day = /^\d{1,6}$/.test(dayText) ? Number(dayText) : NaN;
      if (!(day >= 1 && day <= today() + 1)) return send(400, { error: 'That round does not exist.' });
      const entry = url.searchParams.get('entry') || '';
      return send(200, await board.view(day, /^[0-9a-f]{12}$/.test(entry) ? entry : null));
    }
    if (request.method === 'POST') {
      const text = await request.text();
      if (Buffer.byteLength(text) > MAX_BODY) return send(413, { error: 'The score is too large.' });
      let body;
      try { body = JSON.parse(text); } catch (error) { return send(400, { error: 'The score is not readable.' }); }
      const out = await board.submit(body, today(), Date.now(), { gold: await supporter(request) });
      if (out.error) return send(out.status, { error: out.error });
      return send(200, { entry: out.entry, board: out.board });
    }
    return send(405, { error: 'Use GET or POST.' }, { Allow: 'GET, POST' });
  }

  return async (request) => {
    try {
      return await answer(request);
    } catch (error) {
      console.error(error);
      return send(500, { error: 'The server hit a problem.' });
    }
  };
}
