import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { Driver, Paginated, Vehicle, VehicleStatus } from '@aegisdrive/types';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/app/query-client';

export interface VehicleListFilters {
  page?: number;
  pageSize?: number;
  status?: VehicleStatus;
  search?: string;
}

export function useVehicles(filters: VehicleListFilters = {}): UseQueryResult<Paginated<Vehicle>> {
  return useQuery({
    queryKey: queryKeys.vehicles.list(filters),
    queryFn: () => api.get<Paginated<Vehicle>>('/vehicles', { query: { ...filters } }),
    // Keeps the previous page on screen while the next one loads, so paging
    // does not flash an empty table.
    placeholderData: (previous) => previous,
  });
}

export function useVehicle(vehicleId: string | undefined): UseQueryResult<Vehicle> {
  return useQuery({
    queryKey: queryKeys.vehicles.detail(vehicleId ?? ''),
    queryFn: () => api.get<Vehicle>(`/vehicles/${vehicleId}`),
    enabled: Boolean(vehicleId),
  });
}

export interface DriverListFilters {
  page?: number;
  pageSize?: number;
  search?: string;
}

export function useDrivers(filters: DriverListFilters = {}): UseQueryResult<Paginated<Driver>> {
  return useQuery({
    queryKey: queryKeys.drivers.list(filters),
    queryFn: () => api.get<Paginated<Driver>>('/drivers', { query: { ...filters } }),
    placeholderData: (previous) => previous,
  });
}

/**
 * Remote immobilisation.
 *
 * No optimistic update: this is an irreversible physical action, and showing it
 * as done before the server confirms would let an operator believe a vehicle
 * was stopped when the command failed.
 */
export function useImmobiliseVehicle(): UseMutationResult<
  Vehicle,
  Error,
  { vehicleId: string; reason: string; incidentId?: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ vehicleId, reason, incidentId }) =>
      api.post<Vehicle>(`/vehicles/${vehicleId}/immobilise`, { reason, incidentId }),
    onSuccess: (vehicle) => {
      queryClient.setQueryData(queryKeys.vehicles.detail(vehicle.id), vehicle);
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.snapshot });
    },
  });
}
