import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-client';

/**
 * React Query defaults tuned for a control room.
 *
 * `refetchOnWindowFocus` stays on: an operator returning to the tab after
 * dealing with something else must not be looking at a stale incident list.
 * `staleTime` is short for the same reason — 15 seconds matches the API's
 * dashboard cache, so the client never displays data older than the server was
 * willing to serve.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: (failureCount, error) => {
          // A 4xx will fail identically however many times it is retried, and
          // retrying a 401 races the token refresh the client is already doing.
          if (error instanceof ApiError && error.status < 500) return false;
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
      },
      mutations: {
        // Mutations are operator-initiated and often not idempotent
        // (dispatching a responder, immobilising a vehicle). Never auto-retry.
        retry: false,
      },
    },
  });
}

/**
 * Filter bag embedded in a list query key.
 *
 * `object` rather than `Record<string, unknown>`: TypeScript does not give
 * interfaces an implicit index signature, so every caller passing a declared
 * `…ListFilters` interface would otherwise fail to type-check. React Query only
 * requires the value be structurally hashable, which `object` guarantees.
 */
type QueryFilters = object;

/**
 * Query key factory.
 *
 * Centralised so an invalidation cannot silently miss a cache entry because two
 * call sites spelled the key differently.
 */
export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
    sessions: ['auth', 'sessions'] as const,
  },
  dashboard: {
    snapshot: ['dashboard', 'snapshot'] as const,
  },
  analytics: {
    summary: ['analytics', 'summary'] as const,
  },
  vehicles: {
    all: ['vehicles'] as const,
    list: (filters: QueryFilters) => ['vehicles', 'list', filters] as const,
    detail: (vehicleId: string) => ['vehicles', 'detail', vehicleId] as const,
  },
  drivers: {
    all: ['drivers'] as const,
    list: (filters: QueryFilters) => ['drivers', 'list', filters] as const,
    detail: (driverId: string) => ['drivers', 'detail', driverId] as const,
  },
  incidents: {
    all: ['incidents'] as const,
    list: (filters: QueryFilters) => ['incidents', 'list', filters] as const,
    detail: (incidentId: string) => ['incidents', 'detail', incidentId] as const,
    timeline: (incidentId: string) => ['incidents', 'timeline', incidentId] as const,
  },
  evidence: {
    all: ['evidence'] as const,
    list: (filters: QueryFilters) => ['evidence', 'list', filters] as const,
    custody: (evidenceId: string) => ['evidence', 'custody', evidenceId] as const,
  },
  alerts: {
    all: ['alerts'] as const,
    list: (filters: QueryFilters) => ['alerts', 'list', filters] as const,
  },
  threats: {
    all: ['threats'] as const,
    list: (filters: QueryFilters) => ['threats', 'list', filters] as const,
    zones: ['threats', 'zones'] as const,
  },
  users: {
    all: ['users'] as const,
    list: (filters: QueryFilters) => ['users', 'list', filters] as const,
  },
  roles: {
    all: ['roles'] as const,
  },
  organization: {
    current: ['organization'] as const,
  },
  auditLogs: {
    list: (filters: QueryFilters) => ['audit-logs', 'list', filters] as const,
  },
  /**
   * Command-centre reads go through the data-source abstraction rather than the
   * REST client, so they get their own namespace. Sharing keys with the REST
   * queries would let an invalidation from one source clobber the other's cache
   * while the app is running against the simulation.
   */
  commandCentre: {
    all: ['command-centre'] as const,
    snapshot: () => ['command-centre', 'snapshot'] as const,
    kpis: () => ['command-centre', 'kpis'] as const,
    tacticalPicture: () => ['command-centre', 'tactical-picture'] as const,
    vehicles: () => ['command-centre', 'vehicles'] as const,
    incidents: (filters?: QueryFilters) => ['command-centre', 'incidents', filters ?? {}] as const,
    alerts: () => ['command-centre', 'alerts'] as const,
    corridors: () => ['command-centre', 'corridors'] as const,
    responders: (kind?: string) => ['command-centre', 'responders', kind ?? 'all'] as const,
    hotspots: () => ['command-centre', 'hotspots'] as const,
    cameras: () => ['command-centre', 'cameras'] as const,
    decisions: () => ['command-centre', 'decisions'] as const,
    incidentSummary: (incidentId: string) =>
      ['command-centre', 'incident-summary', incidentId] as const,
    evidence: () => ['command-centre', 'evidence'] as const,
    identity: () => ['command-centre', 'identity'] as const,
  },
} as const;
