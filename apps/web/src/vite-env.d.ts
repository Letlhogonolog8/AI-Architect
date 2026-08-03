/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_REALTIME_URL?: string;
  readonly VITE_MAPBOX_TOKEN?: string;
  readonly VITE_APP_ENVIRONMENT?: string;
  /** `mock` | `live`. See src/data/index.ts. */
  readonly VITE_DATA_SOURCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
