import type { Request } from 'express';
import type { AuthUser } from '@aegisdrive/types';
import { UnauthorizedError } from '@aegisdrive/shared';

/**
 * Narrows `req.user` from optional to present.
 *
 * Routes behind `authenticate` always have a principal, but the Express type is
 * optional so that public routes are honest about it. This is the single place
 * that bridges the two — one throw here beats a non-null assertion in every
 * controller, and if the middleware is ever mis-mounted the failure is a clean
 * 401 rather than a `TypeError` on undefined.
 */
export function requirePrincipal(req: Request): AuthUser {
  if (!req.user) {
    throw new UnauthorizedError('Authentication is required for this endpoint.');
  }
  return req.user;
}
