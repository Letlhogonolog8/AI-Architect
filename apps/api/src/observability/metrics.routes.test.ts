import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

async function buildApp() {
  vi.resetModules();
  const { metricsRoutes } = await import('./metrics.routes');
  const app = express();
  app.use('/metrics', metricsRoutes);
  return app;
}

describe('metricsRoutes', () => {
  afterEach(() => {
    process.env = originalEnv;
  });

  it('serves Prometheus-formatted output with no token configured', async () => {
    delete process.env.METRICS_TOKEN;
    const app = await buildApp();

    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('aegisdrive_api_http_requests_total');
  });

  it('rejects an unauthenticated request once a token is configured', async () => {
    process.env.METRICS_TOKEN = 'a-sixteen-plus-char-token';
    const app = await buildApp();

    const response = await request(app).get('/metrics');

    expect(response.status).toBe(401);
  });

  it('accepts the correct bearer token', async () => {
    process.env.METRICS_TOKEN = 'a-sixteen-plus-char-token';
    const app = await buildApp();

    const response = await request(app)
      .get('/metrics')
      .set('Authorization', 'Bearer a-sixteen-plus-char-token');

    expect(response.status).toBe(200);
  });

  it('rejects an incorrect bearer token', async () => {
    process.env.METRICS_TOKEN = 'a-sixteen-plus-char-token';
    const app = await buildApp();

    const response = await request(app).get('/metrics').set('Authorization', 'Bearer wrong-token');

    expect(response.status).toBe(401);
  });
});
