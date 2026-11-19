/* Fermi Frog: the leaderboard rules. Runs on the server only.

   A player sends five ranges. The server scores them with the same core.js as the page,
   so a made-up total is impossible. It keeps one score per player per day.

   `store` is where scores are kept. It needs two functions:
     list(day)        -> the entries of that day
     add(day, entry)  -> keep one more entry
   Today that is a file on this computer (see server.mjs). A hosted database fits the same shape. */
import { randomBytes } from 'node:crypto';
import './core.js';
import './questions.js';

const C = globalThis.FermiCore;
const QUESTIONS = globalThis.FERMI_QUESTIONS;

export const TOP = 20;            // lines shown on the board
export const MAX_PER_DAY = 5000;  // entries kept for one day

// A store that forgets everything when the program stops. For tests.
export function memoryStore() {
  const days = new Map();
  return {
    async list(day) { return days.get(day) || []; },
    async add(day, entry) {
      if (!days.has(day)) days.set(day, []);
      days.get(day).push(entry);
    },
  };
}

// Highest total first. Equal totals share a rank; the earlier score is listed first.
export function rankEntries(entries) {
  const sorted = entries.slice().sort((a, b) => b.total - a.total || a.at - b.at);
  let rank = 0, last = null;
  return sorted.map((entry, i) => {
    if (entry.total !== last) { rank = i + 1; last = entry.total; }
    return { ...entry, rank };
  });
}

// What other players may see of an entry. Never the player id, never the ranges.
function publicRow(entry) {
  return { id: entry.id, rank: entry.rank, name: entry.name, total: entry.total };
}

// Is this a complete, possible score? Returns the cleaned fields, or { error }.
function check(body, today) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'The score is not readable.' };
  const { day, player, ranges } = body;
  // The player's clock decides their day, so yesterday and tomorrow stay open.
  if (!Number.isInteger(day) || day < 1 || Math.abs(day - today) > 1) return { error: 'This round is closed.' };
  if (typeof player !== 'string' || !/^[A-Za-z0-9-]{16,64}$/.test(player)) return { error: 'The score has no player id.' };
  const name = typeof body.name === 'string' ? C.cleanName(body.name) : '';
  if (!name) return { error: 'Type a name for the leaderboard.' };
  const complete = Array.isArray(ranges) && ranges.length === C.ROUND && ranges.every((r) =>
    Array.isArray(r) && r.length === 2 &&
    typeof r[0] === 'number' && typeof r[1] === 'number' &&
    Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[0] > 0 && r[1] >= r[0]);
  if (!complete) return { error: 'The score is not complete.' };
  return { day, player, name, ranges };
}

export function createBoard(store, options = {}) {
  const top = options.top || TOP;
  const maxPerDay = options.maxPerDay || MAX_PER_DAY;

  // The board of one day. `entryId` is the public id of the asking player's line, if any.
  async function view(day, entryId) {
    const ranked = rankEntries(await store.list(day));
    const mine = entryId ? ranked.find((entry) => entry.id === entryId) : null;
    return { day, count: ranked.length, top: ranked.slice(0, top).map(publicRow), me: mine ? publicRow(mine) : null };
  }

  // Score and keep a player's round. A second try on the same day returns the first score.
  async function submit(body, today, now = Date.now()) {
    const checked = check(body, today);
    if (checked.error) return { status: 400, error: checked.error };
    const { day, player, name, ranges } = checked;

    const entries = await store.list(day);
    let entry = entries.find((e) => e.player === player);
    if (!entry) {
      if (entries.length >= maxPerDay) return { status: 409, error: 'The leaderboard for this round is full.' };
      const questions = C.pickDaily(QUESTIONS, day, C.ROUND);
      const pts = questions.map((q, i) => C.scoreRange(ranges[i][0], ranges[i][1], q.answer).points);
      entry = { id: randomBytes(6).toString('hex'), player, name, pts, total: C.sum(pts), at: now };
      await store.add(day, entry);
    }
    return { status: 200, entry: entry.id, board: await view(day, entry.id) };
  }

  return { view, submit };
}
