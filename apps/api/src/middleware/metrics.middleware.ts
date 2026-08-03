import type { RequestHandler } from 'express';
import { httpRequestDuration, httpRequestsTotal } from '../observability/metrics';

/**
 * Per-request instrumentation.
 *
 * Labelled on the matched route pattern (`req.route.path`), never the raw URL:
 * a label per distinct resource id would make every id ever requested its own
 * time series, and Prometheus's cardinality cost is per unique label
 * combination, not per metric. Unmatched requests — 404s, path probes — collapse
 * into a single `unmatched` label for the same reason.
 */
export const metricsMiddleware: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    const route = req.route?.path ? `${req.baseUrl}${req.route.path as string}` : 'unmatched';
    const labels = { method: req.method, route, status_code: String(res.statusCode) };

    httpRequestDuration.observe(labels, durationSeconds);
    httpRequestsTotal.inc(labels);
  });

  next();
};
