import type { RequestHandler } from 'express';
import { ErrorCode, RateLimitError } from '@aegisdrive/shared';
import { redis } from '../cache/redis';
import { env } from '../config/env';
import { logger } from '../core/logger';
import { clientIp } from '../core/http';
import { rateLimitRejectionsTotal } from '../observability/metrics';

export interface RateLimitOptions {
  /** Window length in seconds. */
  windowSeconds?: number;
  /** Requests permitted per key per window. */
  max?: number;
  /** Key namespace, so separate limiters do not share a counter. */
  bucket?: string;
  code?: ErrorCode;
  message?: string;
}

/**
 * Fixed-window rate limiter backed by Redis.
 *
 * Redis rather than in-process memory because the API runs as N replicas behind
 * a load balancer; a per-process counter would grant N times the intended
 * budget. A fixed window can allow a 2× burst across a boundary, which is
 * acceptable here — this is abuse control, not billing.
 *
 * If Redis is unreachable the request is allowed through. Losing the cache must
 * degrade protection, not availability.
 */
export function rateLimit(options: RateLimitOptions = {}): RequestHandler {
  const windowSeconds = options.windowSeconds ?? env.RATE_LIMIT_WINDOW_SECONDS;
  const max = options.max ?? env.RATE_LIMIT_MAX_REQUESTS;
  const bucket = options.bucket ?? 'global';

  return async (req, res, next) => {
    // Authenticated callers are limited per user; anonymous ones per IP.
    const identity = req.user?.id ?? clientIp(req) ?? 'unknown';
    const window = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = `ratelimit:${bucket}:${identity}:${window}`;

    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }

      const remaining = Math.max(0, max - count);
      res.setHeader('RateLimit-Limit', String(max));
      res.setHeader('RateLimit-Remaining', String(remaining));
      res.setHeader('RateLimit-Reset', String((window + 1) * windowSeconds));

      if (count > max) {
        rateLimitRejectionsTotal.inc({ bucket });
        const retryAfter = (window + 1) * windowSeconds - Math.floor(Date.now() / 1000);
        next(
          new RateLimitError(
            Math.max(1, retryAfter),
            options.message ?? 'Too many requests. Please slow down.',
            options.code ?? ErrorCode.RATE_LIMITED,
          ),
        );
        return;
      }

      next();
    } catch (error) {
      logger.warn({ err: error, bucket }, 'Rate limiter unavailable; allowing request');
      next();
    }
  };
}

/** Tight limiter for credential endpoints, keyed separately from the global budget. */
export const authRateLimit = rateLimit({
  bucket: 'auth',
  windowSeconds: 300,
  max: 20,
  code: ErrorCode.TOO_MANY_LOGIN_ATTEMPTS,
  message: 'Too many authentication attempts. Try again shortly.',
});

/** Generous limiter for device telemetry, which is high-volume by nature. */
export const ingestRateLimit = rateLimit({
  bucket: 'ingest',
  windowSeconds: 60,
  max: 6_000,
});
