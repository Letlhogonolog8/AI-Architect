import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  AIDecision,
  AIIncidentSummary,
  Alert,
  CameraFeed,
  CrimeHotspot,
  Evidence,
  FleetSnapshot,
  Incident,
  KpiMetric,
  Paginated,
  ResponderAsset,
  ResponderKind,
  SafeCorridor,
  TacticalPicture,
  Vehicle,
} from '@aegisdrive/types';
import { dataSource } from '@/data';
import { queryKeys } from '@/app/query-client';

/**
 * Command-centre reads.
 *
 * Every hook goes through `dataSource`, never through the REST client directly.
 * That indirection is what lets the whole dashboard run against the simulation
 * or against the API without a widget knowing which.
 *
 * `refetchInterval` is set per resource according to how fast it actually
 * changes. Polling everything at one rate either wastes requests on a hotspot
 * table that updates hourly or starves the incident list that updates by the
 * second. Anything genuinely live arrives over the socket instead; these
 * intervals are the safety net for a silently dead connection.
 */

export function useFleetSnapshotQuery(): UseQueryResult<FleetSnapshot> {
  return useQuery({
    queryKey: queryKeys.commandCentre.snapshot(),
    queryFn: () => dataSource.getFleetSnapshot(),
    refetchInterval: 20_000,
  });
}

export function useKpiMetrics(): UseQueryResult<KpiMetric[]> {
  return useQuery({
    queryKey: queryKeys.commandCentre.kpis(),
    queryFn: () => dataSource.getKpiMetrics(),
    refetchInterval: 30_000,
  });
}

export function useTacticalPicture(): UseQueryResult<TacticalPicture> {
  return useQuery({
    queryKey: queryKeys.commandCentre.tacticalPicture(),
    queryFn: () => dataSource.getTacticalPicture(),
    // The static layers — corridors, hotspots, facilities — are what this
    // fetches. Vehicle and unit motion arrives over the socket, so a slow
    // refetch here is correct rather than lazy.
    refetchInterval: 60_000,
  });
}

export function useLiveVehicles(): UseQueryResult<Vehicle[]> {
  return useQuery({
    queryKey: queryKeys.commandCentre.vehicles(),
    queryFn: () => dataSource.getVehicles(),
    refetchInterval: 45_000,
  });
}

export function useCommandCentreIncidents(
  options: { openOnly?: boolean; limit?: number } = {},
): UseQueryResult<Paginated<Incident>> {
  return useQuery({
    queryKey: queryKeys.commandCentre.incidents(options),
    queryFn: () => dataSource.getIncidents(options),
    refetchInterval: 25_000,
  });
}

export function useCommandCentreAlerts(limit = 20): UseQueryResult<Alert[]> {
  return useQuery({
    queryKey: queryKeys.commandCentre.alerts(),
    queryFn: () => dataSource.getAlerts({ limit }),
    refetchInterval: 20_000,
  });
}

export function useSafeCorridors(): UseQueryResult<SafeCorridor[]> {
  return useQuery({
    queryKey: queryKeys.commandCentre.corridors(),
    queryFn: () => dataSource.getSafeCorridors(),
    refetchInterval: 120_000,
  });
}

export function useResponderAssets(kind?: ResponderKind): UseQueryResult<ResponderAsset[]> {
  return useQuery({
    queryKey: queryKeys.commandCentre.responders(kind),
    queryFn: () => dataSource.getResponderAssets(kind),
    refetchInterval: 60_000,
  });
}

export function useCrimeHotspots(): UseQueryResult<CrimeHotspot[]> {
  return useQuery({
    queryKey: queryKeys.commandCentre.hotspots(),
    queryFn: () => dataSource.getCrimeHotspots(),
    // Hotspots are recomputed from 90 days of history. Anything faster than
    // a five-minute refresh is asking a question whose answer cannot have moved.
    refetchInterval: 300_000,
  });
}

export function useCameraFeeds(): UseQueryResult<CameraFeed[]> {
  return useQuery({
    queryKey: queryKeys.commandCentre.cameras(),
    queryFn: () => dataSource.getCameraFeeds(),
    refetchInterval: 60_000,
  });
}

export function useAIDecisions(limit = 20): UseQueryResult<AIDecision[]> {
  return useQuery({
    queryKey: queryKeys.commandCentre.decisions(),
    queryFn: () => dataSource.getAIDecisions({ limit }),
    refetchInterval: 30_000,
  });
}

export function useIncidentSummary(
  incidentId: string | null,
): UseQueryResult<AIIncidentSummary | null> {
  return useQuery({
    queryKey: queryKeys.commandCentre.incidentSummary(incidentId ?? ''),
    queryFn: () => dataSource.getIncidentSummary(incidentId as string),
    enabled: Boolean(incidentId),
    // Model output for a fixed incident does not change on its own.
    staleTime: 300_000,
  });
}

export function useRecentEvidence(limit = 12): UseQueryResult<Evidence[]> {
  return useQuery({
    queryKey: queryKeys.commandCentre.evidence(),
    queryFn: () => dataSource.getRecentEvidence({ limit }),
    refetchInterval: 90_000,
  });
}

// ============================================================================
// Commands
// ============================================================================

export function useResolveAIDecision(): UseMutationResult<
  AIDecision,
  Error,
  { decisionId: string; outcome: 'ACCEPTED' | 'REJECTED'; actionId: string | null }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ decisionId, outcome, actionId }) =>
      dataSource.resolveAIDecision(decisionId, outcome, actionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.commandCentre.decisions() });
    },
  });
}

export function useAcknowledgeAlert(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (alertId) => dataSource.acknowledgeAlert(alertId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.commandCentre.alerts() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.commandCentre.snapshot() });
    },
  });
}

export function useSendNotification(): UseMutationResult<
  { queued: number },
  Error,
  { recipientUserIds: string[]; channels: string[]; subject: string; body: string }
> {
  return useMutation({
    mutationFn: (input) => dataSource.sendNotification(input),
  });
}
