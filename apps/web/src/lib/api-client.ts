import { API_PREFIX, type ErrorDetails } from '@aegisdrive/shared';
import type { ApiResponse, TokenPair } from '@aegisdrive/types';
import { webEnv } from '@/config/env';

/**
 * The single HTTP client.
 *
 * Responsibilities, in order of importance:
 *
 *   1. Unwrap the `ApiResponse` envelope so callers get `data`, not a wrapper.
 *   2. Turn a failure envelope into a typed `ApiError` that forms and toasts
 *      can both read.
 *   3. Refresh an expired access token **once**, transparently, and replay the
 *      original request — with concurrent 401s sharing a single refresh so a
 *      dashboard firing six parallel queries does not rotate six times and
 *      trip the API's replay detection.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ErrorDetails;
  readonly requestId?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    options: { details?: ErrorDetails; requestId?: string } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = options.details;
    this.requestId = options.requestId;
  }

  /** True when re-authenticating could plausibly fix this. */
  get isAuthFailure(): boolean {
    return this.status === 401;
  }
}

type TokenListener = (tokens: TokenPair | null) => void;

let accessToken: string | null = null;
let refreshToken: string | null = null;
let onTokensChanged: TokenListener = () => {};
let refreshInFlight: Promise<boolean> | null = null;

/** Wires the client to the auth store. Called once, during store creation. */
export function configureApiClient(options: {
  initialTokens: TokenPair | null;
  onTokensChanged: TokenListener;
}): void {
  accessToken = options.initialTokens?.accessToken ?? null;
  refreshToken = options.initialTokens?.refreshToken ?? null;
  onTokensChanged = options.onTokensChanged;
}

export function setTokens(tokens: TokenPair | null): void {
  accessToken = tokens?.accessToken ?? null;
  refreshToken = tokens?.refreshToken ?? null;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Serialised into the query string; `undefined` and `null` entries are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Skips the Authorization header and the refresh retry. Used by login and refresh. */
  anonymous?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${webEnv.apiBaseUrl}${API_PREFIX}${path}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }

  const serialised = params.toString();
  return serialised ? `${url}?${serialised}` : url;
}

async function parseBody<T>(response: Response): Promise<ApiResponse<T> | null> {
  if (response.status === 204) return null;

  try {
    return (await response.json()) as ApiResponse<T>;
  } catch {
    // A non-JSON body means the failure happened before the API — a gateway
    // timeout, an ingress error page — so there is no envelope to read.
    return null;
  }
}

async function execute<T>(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!options.anonymous && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  return fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
    // Sends the httpOnly refresh cookie, which is how browsers refresh.
    credentials: 'include',
  });
}

/**
 * Rotates the token pair. Concurrent callers await the same promise: a refresh
 * token is single-use on the API, so two parallel rotations would revoke each
 * other and log the operator out mid-incident.
 */
async function refreshTokens(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await execute<TokenPair>('/auth/refresh', {
        method: 'POST',
        anonymous: true,
        body: refreshToken ? { refreshToken } : {},
      });

      const payload = await parseBody<TokenPair>(response);

      if (!response.ok || !payload?.success) {
        setTokens(null);
        onTokensChanged(null);
        return false;
      }

      setTokens(payload.data);
      onTokensChanged(payload.data);
      return true;
    } catch {
      setTokens(null);
      onTokensChanged(null);
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await execute<T>(path, options);

  if (response.status === 401 && !options.anonymous) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      response = await execute<T>(path, options);
    }
  }

  const payload = await parseBody<T>(response);

  if (response.status === 204) return undefined as T;

  if (!response.ok || !payload || !payload.success) {
    throw new ApiError(
      response.status,
      payload && !payload.success ? payload.error.code : 'NETWORK_ERROR',
      payload && !payload.success
        ? payload.error.message
        : 'The server could not be reached. Check your connection and try again.',
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
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};
