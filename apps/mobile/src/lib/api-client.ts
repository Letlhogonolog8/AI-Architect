import { mobileEnv } from '@/config/env';
import type { ApiResponse, TokenPair } from '@/types';
import { clearTokens, readTokens, saveTokens } from './secure-storage';

/**
 * HTTP client.
 *
 * Mirrors the web client's contract — same envelope, same silent single-flight
 * refresh — with two differences that matter on a phone:
 *
 *   1. **No cookies.** React Native has no httpOnly cookie jar the app can rely
 *      on, so the refresh token lives in the Keychain/Keystore via
 *      `expo-secure-store` and is sent in the request body.
 *   2. **Every request has a timeout.** A mobile radio will hold a socket open
 *      for minutes on a degraded connection. A driver waiting on a panic
 *      confirmation must not wait that long to find out it failed — the outbox
 *      needs the failure quickly so it can retry.
 */

const API_PREFIX = '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, string[]>;
  readonly requestId?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    options: { details?: Record<string, string[]>; requestId?: string } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = options.details;
    this.requestId = options.requestId;
  }

  /** True when the failure is a lost connection rather than a server refusal. */
  get isOffline(): boolean {
    return this.status === 0;
  }

  /** True when retrying could plausibly succeed. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status >= 500 || this.status === 429;
  }
}

type SessionExpiredListener = () => void;

let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let onSessionExpired: SessionExpiredListener = () => {};

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function onSessionExpiry(listener: SessionExpiredListener): void {
  onSessionExpired = listener;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Skips the Authorization header and the refresh retry. */
  anonymous?: boolean;
  /** Overrides the default timeout. Panic uses a short one deliberately. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${mobileEnv.apiBaseUrl}${API_PREFIX}${path}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }

  const serialised = params.toString();
  return serialised ? `${url}?${serialised}` : url;
}

async function execute(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!options.anonymous && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  // A caller-supplied signal and the timeout both need to abort the same
  // request, so the timeout gets its own controller and the caller's signal is
  // chained onto it.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const abortFromCaller = (): void => controller.abort();
  options.signal?.addEventListener('abort', abortFromCaller);

  try {
    return await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}

/**
 * Rotates the token pair.
 *
 * Single-flight: refresh tokens are single-use on the API, so two concurrent
 * rotations would revoke each other and sign the driver out — which on this app
 * could happen mid-incident.
 */
async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const { refreshToken } = await readTokens();
      if (!refreshToken) return false;

      const response = await execute('/auth/refresh', {
        method: 'POST',
        anonymous: true,
        body: { refreshToken },
      });

      const payload = (await response.json()) as ApiResponse<TokenPair>;

      if (!response.ok || !payload.success) {
        await clearTokens();
        setAccessToken(null);
        onSessionExpired();
        return false;
      }

      await saveTokens(payload.data.accessToken, payload.data.refreshToken);
      setAccessToken(payload.data.accessToken);
      return true;
    } catch {
      // A network failure during refresh is not an expired session. Keep the
      // stored tokens: signing a driver out because they drove through a tunnel
      // would be the worst possible time to demand a password.
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;

  try {
    response = await execute(path, options);
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new ApiError(
      0,
      aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
      aborted ? 'The request timed out.' : 'No connection to the AEGISDRIVE network.',
    );
  }

  if (response.status === 401 && !options.anonymous) {
    if (await refreshSession()) {
      try {
        response = await execute(path, options);
      } catch {
        throw new ApiError(0, 'NETWORK_ERROR', 'No connection to the AEGISDRIVE network.');
      }
    }
  }

  if (response.status === 204) return undefined as T;

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || !payload.success) {
    throw new ApiError(
      response.status,
      payload && !payload.success ? payload.error.code : 'UNEXPECTED_RESPONSE',
      payload && !payload.success
        ? payload.error.message
        : 'The server returned an unexpected response.',
      {
        details: payload && !payload.success ? payload.error.details : undefined,
        requestId: payload?.requestId,
      },
    );
  }

  return payload.data;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};
