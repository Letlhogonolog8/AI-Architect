import { Router } from 'express';
import { authRateLimit, authenticate, validate } from '../../middleware';
import {
  currentUserHandler,
  listSessionsHandler,
  loginHandler,
  logoutEverywhereHandler,
  logoutHandler,
  refreshHandler,
  revokeSessionHandler,
} from './auth.controller';
import { loginSchema, refreshSchema, sessionParamSchema } from './auth.schema';

export const authRoutes: Router = Router();

// Unauthenticated. Rate-limited separately from the global budget so a
// credential-stuffing run cannot exhaust the quota for legitimate traffic.
authRoutes.post('/login', authRateLimit, validate({ body: loginSchema }), loginHandler);
authRoutes.post('/refresh', authRateLimit, validate({ body: refreshSchema }), refreshHandler);

// Authenticated.
authRoutes.post('/logout', authenticate, logoutHandler);
authRoutes.post('/logout-all', authenticate, logoutEverywhereHandler);
authRoutes.get('/me', authenticate, currentUserHandler);
authRoutes.get('/sessions', authenticate, listSessionsHandler);
authRoutes.delete(
  '/sessions/:sessionId',
  authenticate,
  validate({ params: sessionParamSchema }),
  revokeSessionHandler,
);
