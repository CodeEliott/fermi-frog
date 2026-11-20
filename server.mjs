/* Fermi Frog: the small server. No packages to install.

   Run:  node server.mjs        then open http://localhost:8123
         node server.mjs 9000   for another port

   It does two jobs:
     1. gives the game's pages to the browser (only the files listed in PAGES, and the pictures)
     2. keeps the leaderboard:
          GET  /api/scores?day=3            -> the board of day 3
          GET  /api/scores?day=3&entry=ID   -> the same, plus your own line
          POST /api/scores                  -> { day, player, name, ranges } : score it and keep it

   Scores are kept in data/scores.json, on this computer. It only answers this computer (127.0.0.1). */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createBoard } from './leaderboard.mjs';

const C = globalThis.FermiCore;
const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_BODY = 4096; // bytes; a real score is under 400

const PAGES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/boot.js': ['boot.js', 'text/javascript; charset=utf-8'],
  '/core.js': ['core.js', 'text/javascript; charset=utf-8'],
  '/profile.js': ['profile.js', 'text/javascript; charset=utf-8'],
  '/i18n.js': ['i18n.js', 'text/javascript; charset=utf-8'],
  '/questions.js': ['questions.js', 'text/javascript; charset=utf-8'],
  '/world.js': ['world.js', 'text/javascript; charset=utf-8'],
  '/tape.js': ['tape.js', 'text/javascript; charset=utf-8'],
  '/sprites.js': ['sprites.js', 'text/javascript; charset=utf-8'],
  '/sheets.js': ['sheets.js', 'text/javascript; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
};
// The game's pictures, in eight known folders under img/. The strict pattern keeps every other file out.
const PICTURE = /^\/img\/(frog|frog-plain|anim|bugs|world|perch|badge|ui)\/([a-z0-9-]+)\.(webp|png|jpg)$/;
const PICTURE_TYPES = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg' };

// The page may run only its own code. Fonts come from Google Fonts.
const CSP = "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

// Scores in one JSON file. Good for one computer; a hosted game needs a real database.
export function fileStore(path) {
  let data = {};
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Cannot read ' + path + ': ' + error.message); // never overwrite a damaged file
  }
  return {
    async list(day) { return data[day] || []; },
    async add(day, entry) {
      (data[day] ||= []).push(entry);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path + '.tmp', JSON.stringify(data));
      renameSync(path + '.tmp', path); // swap in one step, so a crash never leaves half a file
    },
  };
}

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extra,
  });
  res.end(payload);
}

// Read the request body, but refuse one that is too large.
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > MAX_BODY) reject(Object.assign(new Error('too large'), { status: 413 }));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

export function createApp({ store, root = HERE, today = () => C.dayNumber(new Date()) }) {
  const board = createBoard(store);

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/api/scores') {
      if (req.method === 'GET') {
        const dayText = url.searchParams.get('day') || '';
        const day = /^\d{1,6}$/.test(dayText) ? Number(dayText) : NaN;
        if (!(day >= 1 && day <= today() + 1)) return send(res, 400, { error: 'That round does not exist.' });
        const entry = url.searchParams.get('entry') || '';
        return send(res, 200, await board.view(day, /^[0-9a-f]{12}$/.test(entry) ? entry : null));
      }
      if (req.method === 'POST') {
        let body;
        try {
          body = JSON.parse(await readBody(req));
        } catch (error) {
          if (error.status === 413) return send(res, 413, { error: 'The score is too large.' });
          return send(res, 400, { error: 'The score is not readable.' });
        }
        const out = await board.submit(body, today());
        if (out.error) return send(res, out.status, { error: out.error });
        return send(res, 200, { entry: out.entry, board: out.board });
      }
      return send(res, 405, { error: 'Use GET or POST.' }, undefined, { Allow: 'GET, POST' });
    }

    const picture = PICTURE.exec(url.pathname);
    const page = Object.hasOwn(PAGES, url.pathname) ? PAGES[url.pathname]
      : picture ? [join('img', picture[1], picture[2] + '.' + picture[3]), PICTURE_TYPES[picture[3]]] : null;
    if (!page || (req.method !== 'GET' && req.method !== 'HEAD')) {
      return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    }
    const [file, type] = page;
    let data;
    try {
      data = await readFile(join(root, file));
    } catch (error) {
      if (error.code === 'ENOENT') return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
      throw error;
    }
    return send(res, 200, req.method === 'HEAD' ? '' : data, type, file === 'index.html' ? { 'Content-Security-Policy': CSP } : {});
  }

  return createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error(error);
      if (!res.headersSent) send(res, 500, { error: 'The server hit a problem.' });
      else res.end();
    });
  });
}

// Started directly (not imported by a test): serve on this computer only.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2] || process.env.PORT || 8123);
  const store = fileStore(join(HERE, 'data', 'scores.json'));
  createApp({ store }).listen(port, '127.0.0.1', () => {
    console.log('Fermi Frog is running: http://localhost:' + port);
  });
}
