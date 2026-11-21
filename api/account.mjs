/* Online: signing in, saving and buying, for /api/auth/..., /api/me, /api/signout and /api/buy.
   vercel.json sends those addresses here, with the address's name in "route".
   All it does is hand each request to the accounts set up in _accounts.mjs (the keys are listed there). */
import { accounts } from './_accounts.mjs';

export default { fetch: (request) => accounts.handle(request) };
