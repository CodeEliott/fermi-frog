/* Online: signing in, saving and buying, for /api/auth/..., /api/me, /api/signout and /api/buy.
   vercel.json sends those addresses here, with the address's name in "route".
   All it does is plug the real storage (Vercel Blob) and the keys into account.mjs, where the logic is.
   The keys are set in the Vercel project's settings, never in the code: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET,
   and STRIPE_SECRET_KEY to put the paid plan on sale. */
import { get, put, del } from '@vercel/blob';
import { createAccounts, blobAccounts } from '../account.mjs';

const accounts = createAccounts({
  store: blobAccounts({ get, put, del }),
  config: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, sessionSecret: process.env.SESSION_SECRET,
    stripeKey: process.env.STRIPE_SECRET_KEY },
});

export default { fetch: (request) => accounts.handle(request) };
