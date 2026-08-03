import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { FleetSnapshot } from '@aegisdrive/types';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/app/query-client';
import { useAuthStore } from '@/stores/auth.store';

export interface AnalyticsSummary {
  vehiclesByStatus: Array<{ status: string; count: number }>;
  openIncidentsBySeverity: Array<{ severity: string; count: number }>;
  unacknowledgedThreatsByLevel: Array<{ level: string; count: number }>;
  averageRiskScore: number;
  generatedAt: string;
}

/**
 * The dashboard header aggregate.
 *
 * Polled every 20 seconds as a safety net. The socket delivers anything urgent
 * immediately; this exists so a silently dead socket shows stale-but-moving
 * numbers rather than a frozen screen, and so counts stay right after a
 * missed event.
 */
export function useFleetSnapshot(): UseQueryResult<FleetSnapshot> {
  const canRead = useAuthStore((state) => state.can('dashboard:read'));

  return useQuery({
    queryKey: queryKeys.dashboard.snapshot,
    queryFn: () => api.get<FleetSnapshot>('/dashboard/snapshot'),
    refetchInterval: 20_000,
    // A driver has no `dashboard:read`; firing the request anyway would put a
    // predictable 403 in the audit log on every app load.
    enabled: canRead,
  });
}

export function useAnalyticsSummary(): UseQueryResult<AnalyticsSummary> {
  return useQuery({
    queryKey: queryKeys.analytics.summary,
    queryFn: () => api.get<AnalyticsSummary>('/analytics/summary'),
  });
}
