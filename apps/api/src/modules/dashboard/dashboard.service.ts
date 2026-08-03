import type { AuthUser, FleetSnapshot, IncidentSeverity, ThreatLevel } from '@aegisdrive/types';
import { IncidentSeverity as Severity, VehicleStatus } from '@aegisdrive/types';
import { CacheKey, CacheTtlSeconds, riskScoreToThreatLevel } from '@aegisdrive/shared';
import { cached } from '../../cache/redis';
import { countOpenAlerts } from '../alerts/alert.repository';
import { countDriversOnDuty } from '../drivers/driver.repository';
import { countOpenBySeverity } from '../incidents/incident.repository';
import { averageRiskScore, countVehiclesByStatus } from '../vehicles/vehicle.repository';
import { countUnacknowledgedByLevel } from '../threat-events/threat.repository';

/**
 * The dashboard header aggregate.
 *
 * Six independent aggregate queries, issued concurrently and cached for 15
 * seconds. The cache matters: every open control-room tab polls this, and
 * without it a twenty-operator room turns six grouped scans into 1,200 per
 * minute. Fifteen seconds is short enough that the number on screen is never
 * meaningfully stale, and the realtime channel carries anything urgent
 * immediately regardless.
 */
export async function getFleetSnapshot(user: AuthUser): Promise<FleetSnapshot> {
  return cached(
    CacheKey.fleetSnapshot(user.organizationId),
    CacheTtlSeconds.fleetSnapshot,
    async () => {
      const [statusCounts, driversOnDuty, openBySeverity, openAlerts, avgRisk] = await Promise.all([
        countVehiclesByStatus(user.organizationId),
        countDriversOnDuty(user.organizationId),
        countOpenBySeverity(user.organizationId),
        countOpenAlerts(user.organizationId),
        averageRiskScore(user.organizationId),
      ]);

      const byStatus = new Map(statusCounts.map((row) => [row.status, row._count._all]));
      const totalVehicles = statusCounts.reduce((sum, row) => sum + row._count._all, 0);

      const openIncidents = openBySeverity.reduce((sum, row) => sum + row._count._all, 0);
      const criticalIncidents =
        openBySeverity.find((row) => row.severity === Severity.CRITICAL)?._count._all ?? 0;

      return {
        totalVehicles,
        vehiclesInTransit: byStatus.get(VehicleStatus.IN_TRANSIT) ?? 0,
        vehiclesUnderThreat:
          (byStatus.get(VehicleStatus.UNDER_THREAT) ?? 0) +
          (byStatus.get(VehicleStatus.STOLEN) ?? 0),
        driversOnDuty,
        openIncidents,
        criticalIncidents,
        openAlerts,
        averageRiskScore: avgRisk,
        postureLevel: derivePosture(avgRisk, criticalIncidents),
        generatedAt: new Date().toISOString(),
      } satisfies FleetSnapshot;
    },
  );
}

/**
 * Organisational posture.
 *
 * A single critical incident outranks a calm average: a fleet of 300 quiet
 * vehicles and one active hijacking is not a "minimal" posture, however the
 * mean risk score reads.
 */
function derivePosture(averageRisk: number, criticalIncidents: number): ThreatLevel {
  if (criticalIncidents > 0) return 'SEVERE';
  return riskScoreToThreatLevel(averageRisk);
}

export interface AnalyticsSummary {
  vehiclesByStatus: Array<{ status: string; count: number }>;
  openIncidentsBySeverity: Array<{ severity: IncidentSeverity; count: number }>;
  unacknowledgedThreatsByLevel: Array<{ level: ThreatLevel; count: number }>;
  averageRiskScore: number;
  generatedAt: string;
}

/**
 * Breakdown feeding the Analytics page.
 *
 * Uncached and intentionally so: analytics is a low-frequency, deliberate read
 * where correctness beats latency, unlike the dashboard header.
 */
export async function getAnalyticsSummary(user: AuthUser): Promise<AnalyticsSummary> {
  const [statusCounts, openBySeverity, threatsByLevel, avgRisk] = await Promise.all([
    countVehiclesByStatus(user.organizationId),
    countOpenBySeverity(user.organizationId),
    countUnacknowledgedByLevel(user.organizationId),
    averageRiskScore(user.organizationId),
  ]);

  return {
    vehiclesByStatus: statusCounts.map((row) => ({ status: row.status, count: row._count._all })),
    openIncidentsBySeverity: openBySeverity.map((row) => ({
      severity: row.severity,
      count: row._count._all,
    })),
    unacknowledgedThreatsByLevel: threatsByLevel.map((row) => ({
      level: row.level,
      count: row._count._all,
    })),
    averageRiskScore: avgRisk,
    generatedAt: new Date().toISOString(),
  };
}
