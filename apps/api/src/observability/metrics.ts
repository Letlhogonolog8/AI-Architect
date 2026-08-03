import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * The Prometheus registry.
 *
 * A dedicated `Registry` instance rather than the global default: importing
 * this module twice (once directly, once transitively through a test mock)
 * must not register the same metric name twice and throw.
 */
export const registry = new Registry();

collectDefaultMetrics({ register: registry, prefix: 'aegisdrive_api_' });

export const httpRequestDuration = new Histogram({
  name: 'aegisdrive_api_http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status_code'],
  // Tuned around the 200ms slow-query threshold in src/db/prisma.ts: enough
  // resolution below it to see normal latency move, enough above it to size
  // an incident.
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const httpRequestsTotal = new Counter({
  name: 'aegisdrive_api_http_requests_total',
  help: 'Total HTTP requests handled.',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

/** Incremented from rate-limit.middleware.ts; one series per limiter bucket. */
export const rateLimitRejectionsTotal = new Counter({
  name: 'aegisdrive_api_rate_limit_rejections_total',
  help: 'Requests rejected by the rate limiter.',
  labelNames: ['bucket'],
  registers: [registry],
});

/** Incremented from db/prisma.ts for every query at or above its slow-query threshold. */
export const dbSlowQueriesTotal = new Counter({
  name: 'aegisdrive_api_db_slow_queries_total',
  help: 'Queries at or above the 200ms slow-query threshold (see db/prisma.ts).',
  registers: [registry],
});

/** Maintained by realtime/socket-server.ts on connect/disconnect — cheaper than recomputing per scrape. */
export const realtimeConnectedClients = new Gauge({
  name: 'aegisdrive_api_realtime_connected_clients',
  help: 'Sockets currently connected to the realtime namespace on this replica.',
  registers: [registry],
});

/**
 * Set from modules/health/health.service.ts on every readiness check.
 *
 * There is no separate poller: the Kubernetes readiness probe already calls
 * `/health/ready` every few seconds (see k8s/base/api-deployment.yaml), so
 * this gauge is at most one probe interval stale for free.
 */
export const dependencyUp = new Gauge({
  name: 'aegisdrive_api_dependency_up',
  help: '1 if the dependency answered its health check, 0 otherwise.',
  labelNames: ['dependency'],
  registers: [registry],
});
