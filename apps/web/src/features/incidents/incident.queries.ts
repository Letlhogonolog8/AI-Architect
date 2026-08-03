import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { Incident, IncidentSeverity, IncidentStatus, Paginated } from '@aegisdrive/types';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/app/query-client';

export interface IncidentListFilters {
  page?: number;
  pageSize?: number;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  openOnly?: boolean;
  search?: string;
}

export interface TimelineEntry {
  id: string;
  kind: string;
  message: string;
  actorUserId: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
}

export function useIncidents(
  filters: IncidentListFilters = {},
): UseQueryResult<Paginated<Incident>> {
  return useQuery({
    queryKey: queryKeys.incidents.list(filters),
    queryFn: () => api.get<Paginated<Incident>>('/incidents', { query: { ...filters } }),
    placeholderData: (previous) => previous,
  });
}

export function useIncident(incidentId: string | undefined): UseQueryResult<Incident> {
  return useQuery({
    queryKey: queryKeys.incidents.detail(incidentId ?? ''),
    queryFn: () => api.get<Incident>(`/incidents/${incidentId}`),
    enabled: Boolean(incidentId),
  });
}

export function useIncidentTimeline(
  incidentId: string | undefined,
): UseQueryResult<TimelineEntry[]> {
  return useQuery({
    queryKey: queryKeys.incidents.timeline(incidentId ?? ''),
    queryFn: () => api.get<TimelineEntry[]>(`/incidents/${incidentId}/timeline`),
    enabled: Boolean(incidentId),
  });
}

export function useChangeIncidentStatus(): UseMutationResult<
  Incident,
  Error,
  { incidentId: string; status: IncidentStatus; note?: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ incidentId, status, note }) =>
      api.post<Incident>(`/incidents/${incidentId}/status`, { status, note }),
    onSuccess: (incident) => {
      queryClient.setQueryData(queryKeys.incidents.detail(incident.id), incident);
      void queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.incidents.timeline(incident.id),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.snapshot });
    },
  });
}

export function useDispatchResponder(): UseMutationResult<
  Incident,
  Error,
  { incidentId: string; responder: string; notes?: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ incidentId, responder, notes }) =>
      api.post<Incident>(`/incidents/${incidentId}/dispatch`, { responder, notes }),
    onSuccess: (incident) => {
      queryClient.setQueryData(queryKeys.incidents.detail(incident.id), incident);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.incidents.timeline(incident.id),
      });
    },
  });
}
