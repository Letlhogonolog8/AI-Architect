import { pino, type Logger } from 'pino';
import { env, isDevelopment } from '../config/env';

/**
 * Structured logging.
 *
 * JSON to stdout in every environment except local development, where a
 * pretty transport is worth the worker thread. The redaction list is not
 * optional: this service handles credentials, tokens and location data, and a
 * single logged `Authorization` header is a reportable incident.
 */
export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'aegisdrive-api', env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.refreshToken',
      '*.accessToken',
      '*.mfaSecret',
      'password',
      'refreshToken',
      'accessToken',
    ],
    censor: '[redacted]',
  },
  ...(isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname,service,env',
          },
        },
      }
    : {}),
});

/** Child logger tagged with a subsystem name, e.g. `logger.child({ module: 'auth' })`. */
export function moduleLogger(name: string): Logger {
  return logger.child({ module: name });
}
