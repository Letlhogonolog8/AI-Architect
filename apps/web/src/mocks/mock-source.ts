import {
  AIDecisionStatus,
  type AIDecision,
  type AIIncidentSummary,
  type Alert,
  type CameraFeed,
  type CrimeHotspot,
  type Evidence,
  type FleetSnapshot,
  type IdentityAssessment,
  type Incident,
  type KpiMetric,
  type Paginated,
  type ResponderAsset,
  type ResponderKind,
  type SafeCorridor,
  type TacticalPicture,
  type Vehicle,
} from '@aegisdrive/types';
import type { CommandCentreClient } from '@/data/data-source';
import { getSimulation } from './simulation';
import { generateIdentityAssessments } from './identity';
import { createRandomHelpers } from './random';

/**
 * Mock implementation of the command-centre client.
 *
 * Reads from the running simulation rather than holding its own copy, so the
 * numbers a widget fetches over "HTTP" and the positions it receives over the
 * "socket" describe the same world. A mock whose REST and realtime layers
 * disagree teaches developers to distrust the UI.
 *
 * Every method is artificially delayed. Without latency, code paths that only
 * appear while loading — skeletons, disabled submit buttons, race conditions
 * between two queries — never execute during development and break the first
 * time the app meets a real network.
 */
const LATENCY_MIN_MS = 90;
const LATENCY_MAX_MS = 320;

function delay<T>(value: T): Promise<T> {
  const ms = LATENCY_MIN_MS + Math.random() * (LATENCY_MAX_MS - LATENCY_MIN_MS);
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export class MockDataSource implements CommandCentreClient {
  readonly kind = 'mock' as const;

  private get sim() {
    return getSimulation();
  }

  async getFleetSnapshot(): Promise<FleetSnapshot> {
    return delay(this.sim.fleetSnapshot());
  }

  async getKpiMetrics(): Promise<KpiMetric[]> {
    return delay(this.sim.snapshot().kpis);
  }

  async getVehicles(): Promise<Vehicle[]> {
    return delay(this.sim.snapshot().vehicles.map((entry) => entry.vehicle));
  }

  async getIncidents(
    options: { openOnly?: boolean; limit?: number } = {},
  ): Promise<Paginated<Incident>> {
    const all = this.sim.snapshot().incidents;

    const filtered = options.openOnly
      ? all.filter(
          (incident) => !['RESOLVED', 'FALSE_POSITIVE', 'ARCHIVED'].includes(incident.status),
        )
      : all;

    // Severity first, then recency — the order a control room reads in.
    const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
    const sorted = [...filtered].sort((a, b) => {
      const bySeverity = order.indexOf(a.severity) - order.indexOf(b.severity);
      if (bySeverity !== 0) return bySeverity;
      return Date.parse(b.detectedAt) - Date.parse(a.detectedAt);
    });

    const limit = options.limit ?? 25;
    const items = sorted.slice(0, limit);

    return delay({
      items,
      meta: {
        page: 1,
        pageSize: limit,
        totalItems: sorted.length,
        totalPages: Math.ceil(sorted.length / limit),
        hasNextPage: sorted.length > limit,
        hasPreviousPage: false,
      },
    });
  }

  async getAlerts(options: { limit?: number } = {}): Promise<Alert[]> {
    const alerts = this.sim
      .snapshot()
      .alerts.filter((alert) => alert.status === 'OPEN')
      .slice(0, options.limit ?? 20);

    return delay(alerts);
  }

  async getTacticalPicture(): Promise<TacticalPicture> {
    const state = this.sim.snapshot();

    return delay({
      vehicles: state.vehicles.map((entry) => ({
        id: entry.vehicle.id,
        registrationNumber: entry.vehicle.registrationNumber,
        position: entry.vehicle.lastPosition ?? {
          longitude: 0,
          latitude: 0,
        },
        threatLevel: entry.vehicle.threatLevel,
        riskScore: entry.vehicle.riskScore,
        isUnderThreat: entry.vehicle.status === 'UNDER_THREAT',
        corridorId: state.corridors[entry.corridorIndex]?.id ?? null,
        lastSeenAt: entry.vehicle.lastSeenAt ?? new Date().toISOString(),
      })),
      responders: state.responders,
      hotspots: state.hotspots,
      corridors: state.corridors,
      bounds: this.sim.bounds,
      generatedAt: new Date().toISOString(),
    });
  }

  async getResponderAssets(kind?: ResponderKind): Promise<ResponderAsset[]> {
    const assets = this.sim.snapshot().responders;
    return delay(kind ? assets.filter((asset) => asset.kind === kind) : assets);
  }

  async getSafeCorridors(): Promise<SafeCorridor[]> {
    return delay(this.sim.snapshot().corridors);
  }

  async getCrimeHotspots(): Promise<CrimeHotspot[]> {
    return delay(this.sim.snapshot().hotspots);
  }

  async getCameraFeeds(options: { vehicleId?: string } = {}): Promise<CameraFeed[]> {
    const feeds = this.sim.snapshot().cameras;
    return delay(
      options.vehicleId ? feeds.filter((feed) => feed.vehicleId === options.vehicleId) : feeds,
    );
  }

  async getAIDecisions(options: { limit?: number } = {}): Promise<AIDecision[]> {
    const decisions = [...this.sim.snapshot().decisions].sort((a, b) => {
      // Pending first — they are the ones awaiting a human.
      const aPending = a.status === AIDecisionStatus.PENDING ? 0 : 1;
      const bPending = b.status === AIDecisionStatus.PENDING ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });

    return delay(decisions.slice(0, options.limit ?? 20));
  }

  async getIncidentSummary(incidentId: string): Promise<AIIncidentSummary | null> {
    const incident = this.sim.snapshot().incidents.find((entry) => entry.id === incidentId);
    if (!incident) return delay(null);

    const vehicle = this.sim
      .snapshot()
      .vehicles.find((entry) => entry.vehicle.id === incident.vehicleId);

    const registration = vehicle?.vehicle.registrationNumber ?? 'the vehicle';

    return delay({
      incidentId,
      modelId: 'summariser-v1',
      headline: incident.title,
      narrative: `At ${new Date(incident.detectedAt).toLocaleTimeString()}, ${registration} was flagged by the ${incident.aiConfidence === null ? 'operator' : 'detection models'} while travelling its assigned corridor. Telemetry, cabin audio and forward camera were correlated to produce this assessment.`,
      keyFindings: [
        `Severity assessed as ${incident.severity} with ${incident.aiConfidence ? `${(incident.aiConfidence * 100).toFixed(0)}% model confidence` : 'no model confidence — human-filed'}.`,
        `Vehicle risk score at detection was ${vehicle?.vehicle.riskScore ?? 'unknown'}/100.`,
        `${incident.evidenceCount} evidence artefacts were captured and sealed against this incident.`,
        incident.position
          ? `Location fixed at ${incident.position.latitude.toFixed(4)}, ${incident.position.longitude.toFixed(4)}.`
          : 'No position fix was available at detection.',
      ],
      suggestedNextSteps:
        incident.severity === 'CRITICAL'
          ? [
              'Dispatch the nearest armed response unit and confirm ETA with the driver.',
              'Notify SAPS with the vehicle description and last known heading.',
              'Preserve cabin audio and forward camera for the 10 minutes either side of detection.',
            ]
          : [
              'Confirm the driver is safe via the mobile check-in prompt.',
              'Review the corridor risk assessment before the next scheduled trip.',
            ],
      confidence: incident.aiConfidence ?? 0.5,
      severity: incident.severity,
      generatedAt: new Date().toISOString(),
    });
  }

  /**
   * Identity assessments, computed by the real fusion engine.
   *
   * Re-seeded from the tick count so the panel evolves as the simulation
   * runs, rather than freezing on the values generated at startup.
   */
  async getIdentityAssessments(options: { limit?: number } = {}): Promise<IdentityAssessment[]> {
    const random = createRandomHelpers(Math.floor(Date.now() / 30_000));
    return delay(
      generateIdentityAssessments(random, this.sim.snapshot().vehicles, options.limit ?? 12),
    );
  }

  async getRecentEvidence(options: { limit?: number } = {}): Promise<Evidence[]> {
    const evidence = [...this.sim.snapshot().evidence]
      .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))
      .slice(0, options.limit ?? 12);

    return delay(evidence);
  }

  // --------------------------------------------------------------- commands

  async acknowledgeAlert(alertId: string): Promise<void> {
    this.sim.acknowledgeAlert(alertId);
    await delay(undefined);
  }

  async resolveAIDecision(
    decisionId: string,
    outcome: 'ACCEPTED' | 'REJECTED',
  ): Promise<AIDecision> {
    const decision = this.sim.resolveDecision(decisionId, outcome);

    if (!decision) {
      throw new Error(`Decision ${decisionId} no longer exists.`);
    }

    return delay(decision);
  }

  async dispatchResponder(): Promise<void> {
    await delay(undefined);
  }

  async sendNotification(input: {
    recipientUserIds: string[];
    channels: string[];
  }): Promise<{ queued: number }> {
    return delay({ queued: input.recipientUserIds.length * input.channels.length });
  }

  /** Mock-only: nearest units to a point, with distance and ETA populated. */
  respondersNear(point: { longitude: number; latitude: number }): ResponderAsset[] {
    return this.sim.respondersNear(point);
  }
}
