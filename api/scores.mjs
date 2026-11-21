/* The address /api/scores, online. Vercel runs this file for each request.
   All it does is plug the real storage (Vercel Blob) into the leaderboard: the logic is in _scores.mjs.
   Vercel gives the function its key to the storage by itself (BLOB_READ_WRITE_TOKEN), once the store is connected to the project. */
import { get, put } from '@vercel/blob';
import { blobStore, createHandler } from './_scores.mjs';
import { accounts } from './_accounts.mjs';

// The accounts answer one question here: is the player posting a supporter? (the golden fly by the name)
export default { fetch: createHandler({ store: blobStore({ get, put }), supporter: accounts.supporter }) };
