/** Cross-cutting constants. Anything tunable per environment belongs in env config, not here. */

export const APP_NAME = 'AEGISDRIVE AI';
export const APP_TAGLINE = 'Vehicle Protection Operating System';

/** Every REST route is mounted under this prefix. Bump the version, never the shape. */
export const API_VERSION = 'v1';
export const API_PREFIX = `/api/${API_VERSION}`;

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;

/** Header used to correlate a request across the API, services and logs. */
export const REQUEST_ID_HEADER = 'x-request-id';
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/** Cookie that carries the refresh token. Never readable from JavaScript. */
export const REFRESH_TOKEN_COOKIE = 'aegis_rt';

/**
 * Redis key namespaces. Centralised so a rename cannot leave orphaned keys
 * behind in production.
 */
export const CacheKey = {
  session: (sessionId: string): string => `session:${sessionId}`,
  userPermissions: (userId: string): string => `perm:${userId}`,
  vehicleLastPosition: (vehicleId: string): string => `vehicle:pos:${vehicleId}`,
  fleetSnapshot: (organizationId: string): string => `fleet:snapshot:${organizationId}`,
  recoveryDashboard: (organizationId: string): string => `recovery:dashboard:${organizationId}`,
  loginAttempts: (email: string): string => `login:attempts:${email.toLowerCase()}`,
  revokedToken: (jti: string): string => `token:revoked:${jti}`,
} as const;

export const CacheTtlSeconds = {
  userPermissions: 300,
  fleetSnapshot: 15,
  recoveryDashboard: 15,
  vehicleLastPosition: 3600,
  loginAttempts: 900,
} as const;

/** Brute-force protection thresholds applied by the auth module. */
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_SECONDS = 900;

/** Minimum acceptable password strength, enforced by the shared validator. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Telemetry older than this is rolled into aggregates and dropped from the hot table. */
export const TELEMETRY_HOT_RETENTION_DAYS = 30;

/** Evidence retention floor mandated by chain-of-custody policy. */
export const EVIDENCE_RETENTION_DAYS = 365 * 7;
