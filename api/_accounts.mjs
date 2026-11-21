/* The accounts, online, as one shared setup: account.mjs (sign-in, saving, buying) and scores.mjs (the golden fly) both use it.
   It plugs the real storage (Vercel Blob) and the keys into account.mjs, where the logic is.
   The keys are set in the Vercel project's settings, never in the code: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET,
   and STRIPE_SECRET_KEY to put the paid plan on sale.
   The file name starts with "_" so Vercel does not turn it into a web address of its own. */
import { get, put, del } from '@vercel/blob';
import { createAccounts, blobAccounts } from '../account.mjs';

export const accounts = createAccounts({
  store: blobAccounts({ get, put, del }),
  config: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, sessionSecret: process.env.SESSION_SECRET,
    stripeKey: process.env.STRIPE_SECRET_KEY },
});
