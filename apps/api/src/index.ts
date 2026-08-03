import { createServer } from 'node:http';
import { env } from './config/env';
import { logger } from './core/logger';
import { connectDatabase, disconnectDatabase } from './db/prisma';
import { connectCache, disconnectCache } from './cache/redis';
import { createRealtimeServer } from './realtime/socket-server';
import { createApp } from './app';

/**
 * Process entry point.
 *
 * Dependencies are connected *before* the port is bound, so a replica never
 * accepts a request it cannot serve. Shutdown runs in the reverse order and is
 * bounded by a hard timeout — a container that will not exit gets killed by the
 * orchestrator anyway, and doing it here at least leaves a log line explaining
 * why.
 */
const SHUTDOWN_TIMEOUT_MS = 15_000;

async function bootstrap(): Promise<void> {
  await connectDatabase();
  await connectCache();

  const app = createApp();
  const httpServer = createServer(app);
  const io = createRealtimeServer(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(env.PORT, env.HOST, resolve);
  });

  logger.info({ port: env.PORT, host: env.HOST, env: env.NODE_ENV }, 'AEGISDRIVE API listening');

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'Shutdown initiated');

    const forceExit = setTimeout(() => {
      logger.fatal('Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    // Do not let this timer hold the event loop open if shutdown finishes first.
    forceExit.unref();

    try {
      // Stop accepting work first, then release the connections that work needs.
      await io.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });

      await disconnectCache();
      await disconnectDatabase();

      clearTimeout(forceExit);
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // An unhandled rejection has left the process in an unknown state. Log it and
  // let the orchestrator restart a clean replica rather than serving from a
  // half-broken one.
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    void shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    void shutdown('uncaughtException');
  });
}

bootstrap().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Failed to start AEGISDRIVE API');
  process.exit(1);
});
