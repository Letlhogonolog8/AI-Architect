import { Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from '../core/logger';

/**
 * Redis connections.
 *
 * Three are created rather than one because Socket.IO's Redis adapter puts its
 * connections into subscriber mode, after which they can no longer issue normal
 * commands. Sharing a single client would break session and cache reads the
 * moment the adapter attaches.
 */
function createClient(role: string): Redis {
  const client = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    connectionName: `aegis-api-${role}`,
    retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
  });

  client.on('error', (error) => logger.error({ err: error, role }, 'Redis error'));
  client.on('ready', () => logger.info({ role }, 'Redis connection ready'));

  return client;
}

/** General-purpose cache and session store. */
export const redis: Redis = createClient('primary');
/** Publisher half of the Socket.IO adapter. */
export const redisPublisher: Redis = createClient('pub');
/** Subscriber half of the Socket.IO adapter. */
export const redisSubscriber: Redis = createClient('sub');

export async function connectCache(): Promise<void> {
  await Promise.all([redis.connect(), redisPublisher.connect(), redisSubscriber.connect()]);
}

export async function disconnectCache(): Promise<void> {
  await Promise.allSettled([redis.quit(), redisPublisher.quit(), redisSubscriber.quit()]);
  logger.info('Redis connections closed');
}

export async function isCacheReachable(): Promise<boolean> {
  try {
    return (await redis.ping()) === 'PONG';
  } catch (error) {
    logger.error({ err: error }, 'Redis health check failed');
    return false;
  }
}

/**
 * Read-through cache helper.
 *
 * A cache failure must never fail the request: on any Redis error the loader
 * runs and its value is returned uncached.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  try {
    const hit = await redis.get(key);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch (error) {
    logger.warn({ err: error, key }, 'Cache read failed; falling through to source');
  }

  const value = await loader();

  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (error) {
    logger.warn({ err: error, key }, 'Cache write failed');
  }

  return value;
}

/** Best-effort invalidation. Used after writes that change a cached projection. */
export async function invalidate(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch (error) {
    logger.warn({ err: error, keys }, 'Cache invalidation failed');
  }
}
