import { isCacheReachable } from '../../cache/redis';
import { isDatabaseReachable } from '../../db/prisma';
import { connectedClientCount } from '../../realtime/emitter';
import { env } from '../../config/env';

export interface DependencyHealth {
  status: 'up' | 'down';
  latencyMs: number;
}

export interface HealthReport {
  status: 'healthy' | 'degraded';
  version: string;
  environment: string;
  uptimeSeconds: number;
  realtimeClients: number;
  dependencies: {
    database: DependencyHealth;
    cache: DependencyHealth;
  };
  checkedAt: string;
}

async function timed(probe: () => Promise<boolean>): Promise<DependencyHealth> {
  const startedAt = performance.now();
  const ok = await probe();
  return { status: ok ? 'up' : 'down', latencyMs: Math.round(performance.now() - startedAt) };
}

/**
 * Readiness report.
 *
 * The database is load-bearing: without it the API cannot serve anything, so a
 * down database means `degraded` and a 503. Redis being down costs caching and
 * rate limiting but not correctness — the process stays healthy, and the
 * individual dependency status makes the degradation visible to operators.
 */
export async function checkHealth(): Promise<HealthReport> {
  const [database, cache] = await Promise.all([
    timed(isDatabaseReachable),
    timed(isCacheReachable),
  ]);

  return {
    status: database.status === 'up' ? 'healthy' : 'degraded',
    version: process.env.npm_package_version ?? '0.1.0',
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    realtimeClients: await connectedClientCount(),
    dependencies: { database, cache },
    checkedAt: new Date().toISOString(),
  };
}
