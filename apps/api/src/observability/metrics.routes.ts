import { Router } from 'express';
import { env } from '../config/env';
import { registry } from './metrics';

/**
 * `GET /metrics` — Prometheus scrape endpoint.
 *
 * Mounted outside the application rate limiter, the same way `/health` is:
 * a scraper polling every 15 seconds must never be throttled as abuse. The
 * primary access boundary is the NetworkPolicy in k8s/base/networkpolicy.yaml,
 * which only lets the monitoring namespace reach this port; METRICS_TOKEN is
 * the fallback for environments where that policy is absent.
 */
export const metricsRoutes: Router = Router();

metricsRoutes.get('/', async (req, res) => {
  if (env.METRICS_TOKEN) {
    const provided = req.headers.authorization?.replace(/^Bearer /, '');
    if (provided !== env.METRICS_TOKEN) {
      res.status(401).end();
      return;
    }
  }

  res.setHeader('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});
