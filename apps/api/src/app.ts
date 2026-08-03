import express, { type Express } from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { API_PREFIX } from '@aegisdrive/shared';
import { logger } from './core/logger';
import { getRequestId } from './core/request-context';
import {
  corsMiddleware,
  errorHandler,
  metricsMiddleware,
  notFoundHandler,
  rateLimit,
  requestContext,
  securityHeaders,
} from './middleware';
import { healthRoutes } from './modules/health/health.routes';
import { metricsRoutes } from './observability/metrics.routes';
import { apiRouter } from './routes';

/**
 * Builds the Express application.
 *
 * Kept separate from `index.ts` so integration tests can mount the app without
 * binding a port or opening a realtime server.
 *
 * **Middleware order is load-bearing** and reads top to bottom:
 *   1. `trust proxy`   — so client IPs are real behind the load balancer.
 *   2. request context — everything below logs and audits with a request id.
 *   3. security + CORS — reject disallowed origins before doing any work.
 *   4. body parsing    — with a size cap, before anything reads `req.body`.
 *   5. health, metrics — outside the rate limiter, so probes and scrapes are
 *                        never throttled.
 *   6. rate limit      — protects only the application surface.
 *   7. routes          — the API itself.
 *   8. 404, then error — terminal handlers, error last.
 */
export function createApp(): Express {
  const app = express();

  // One hop: the ingress controller. Trusting further would let a client forge
  // its own X-Forwarded-For and defeat per-IP rate limiting.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestContext);

  app.use(
    pinoHttp({
      logger,
      genReqId: () => getRequestId(),
      // Expected 4xx responses are not warnings; only unexpected failures are.
      customLogLevel: (_req, res, error) => {
        if (error || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'info';
        return 'debug';
      },
      autoLogging: {
        ignore: (req) => req.url?.startsWith('/health') || req.url?.startsWith('/metrics'),
      },
    }),
  );

  app.use(securityHeaders);
  app.use(corsMiddleware);
  // Telemetry batches and dashboard payloads are large, repetitive JSON — a
  // good compression ratio for near-zero CPU cost at this traffic level.
  app.use(compression());
  app.use(metricsMiddleware);

  // 2 MB is generous for JSON. Media never travels through this process — it is
  // uploaded directly to object storage against a signed URL.
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '256kb' }));
  app.use(cookieParser());

  app.use('/health', healthRoutes);
  app.use('/metrics', metricsRoutes);

  app.use(rateLimit());

  app.use(API_PREFIX, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
