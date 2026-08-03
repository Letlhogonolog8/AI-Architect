/**
 * Browser-visible configuration.
 *
 * Everything here ships to every user in plain text. Nothing secret may be
 * added — a value that must stay private belongs behind the API.
 */
export type DataSourceKind = 'mock' | 'live';

interface WebEnv {
  /** Empty means same-origin, which the dev proxy and the production ingress both provide. */
  apiBaseUrl: string;
  realtimeUrl: string;
  mapboxToken: string | null;
  environment: string;
  isProduction: boolean;
  /**
   * Which command-centre backend to use. `mock` runs the in-browser simulation;
   * `live` calls the API. Refused in production builds — see `data/index.ts`.
   */
  dataSource: DataSourceKind;
}

function readOptional(value: string | undefined): string {
  return value?.trim() ?? '';
}

function readDataSource(value: string | undefined): DataSourceKind {
  const normalised = readOptional(value).toLowerCase();
  if (normalised === 'live') return 'live';
  if (normalised === 'mock') return 'mock';

  // Default by environment rather than to a fixed value: a developer who has
  // not configured anything should get the working simulation, and a
  // production build should never silently fall into it.
  return import.meta.env.PROD ? 'live' : 'mock';
}

export const webEnv: WebEnv = {
  apiBaseUrl: readOptional(import.meta.env.VITE_API_BASE_URL),
  realtimeUrl: readOptional(import.meta.env.VITE_REALTIME_URL),
  mapboxToken: readOptional(import.meta.env.VITE_MAPBOX_TOKEN) || null,
  environment: readOptional(import.meta.env.VITE_APP_ENVIRONMENT) || import.meta.env.MODE,
  isProduction: import.meta.env.PROD,
  dataSource: readDataSource(import.meta.env.VITE_DATA_SOURCE),
};
