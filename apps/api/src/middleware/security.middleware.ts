import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import type { RequestHandler } from 'express';
import { ForbiddenError } from '@aegisdrive/shared';
import { corsOrigins, isProduction } from '../config/env';

/**
 * Baseline HTTP hardening.
 *
 * `contentSecurityPolicy` is disabled here because this process serves JSON
 * only — the web client ships its own CSP from its own edge, and a policy
 * declared in two places drifts. `crossOriginResourcePolicy` stays permissive
 * so signed evidence URLs can be fetched by the browser client on another
 * origin.
 */
export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
  referrerPolicy: { policy: 'no-referrer' },
});

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Same-origin requests and server-to-server callers send no Origin header.
    if (!origin) {
      callback(null, true);
      return;
    }

    if (corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new ForbiddenError(`Origin '${origin}' is not permitted.`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Correlation-Id'],
  exposedHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  maxAge: 86_400,
};

export const corsMiddleware: RequestHandler = cors(corsOptions);
