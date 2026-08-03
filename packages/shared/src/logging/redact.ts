/**
 * Pino redaction policy, shared by the API and every background worker.
 *
 * Centralised rather than repeated per process: this is a security control,
 * and a worker that copy-pasted an older or incomplete version of this list
 * would silently log credentials the API has always redacted. One constant
 * means one place to add a field when a new one starts carrying a secret.
 */
export const LOG_REDACT_PATHS: string[] = [
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
];

export const LOG_REDACT_CENSOR = '[redacted]';
