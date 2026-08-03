/**
 * Primitive aliases and transport-level envelopes shared by every AEGISDRIVE
 * surface (API, web, mobile, background services).
 */

/** RFC 4122 identifier, serialised as a string on the wire. */
export type UUID = string;

/** ISO-8601 timestamp, e.g. `2026-07-30T08:12:44.201Z`. */
export type ISODateString = string;

/** WGS-84 coordinate pair. Longitude first is deliberate: it matches GeoJSON. */
export interface GeoPoint {
  longitude: number;
  latitude: number;
}

export interface GeoPosition extends GeoPoint {
  /** Metres above sea level, when the source device reports it. */
  altitude?: number | null;
  /** Degrees clockwise from true north. */
  heading?: number | null;
  /** Kilometres per hour. */
  speedKph?: number | null;
  /** Horizontal accuracy radius in metres. */
  accuracy?: number | null;
}

export type SortOrder = 'asc' | 'desc';

export interface PaginationQuery {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: SortOrder;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

/** Successful API envelope. Every 2xx response body has this shape. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  requestId: string;
}

/** Failure API envelope. Every non-2xx response body has this shape. */
export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
  requestId: string;
}

export interface ApiErrorBody {
  /** Stable machine-readable code, e.g. `AUTH_INVALID_CREDENTIALS`. */
  code: string;
  /** Human-readable summary safe to surface to an operator. */
  message: string;
  /** Field-level validation detail, keyed by dot-path. */
  details?: Record<string, string[]>;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** Marks entities that carry standard lifecycle columns. */
export interface Timestamped {
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Every tenant-scoped entity carries its owning organization. */
export interface TenantScoped {
  organizationId: UUID;
}
