import type { AuthUser } from '@aegisdrive/types';

/**
 * Augments Express's `Request` with the authenticated principal.
 *
 * `user` is optional by design: making it required would force a non-null
 * assertion in every handler and quietly lie about routes that are public.
 * Handlers behind `authenticate` narrow it once at the top.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
