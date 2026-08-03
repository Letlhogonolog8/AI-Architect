import type {
  AIDecision,
  AIIncidentSummary,
  Alert,
  CameraFeed,
  CrimeHotspot,
  Evidence,
  FleetSnapshot,
  IdentityAssessment,
  Incident,
  KpiMetric,
  Paginated,
  ResponderAsset,
  ResponderKind,
  SafeCorridor,
  TacticalPicture,
  Vehicle,
} from '@aegisdrive/types';
import { api } from '@/lib/api-client';
import type { CommandCentreClient } from './data-source';

/**
 * The real implementation, backed by the REST API.
 *
 * Several endpoints do not exist on the API yet — responder assets, corridors,
 * camera feeds, the AI decision stream. Those methods throw a precise error
 * naming the missing endpoint rather than returning `[]`.
 *
 * Returning an empty array would be worse than throwing: the widget would
 * render its "no data" state, and a control room would conclude there are no
 * police units nearby when in fact nothing was ever asked. In this product that
 * distinction is a safety property, not a code-quality preference.
 */
class NotImplementedOnApiError extends Error {
  constructor(endpoint: string) {
    super(
      `${endpoint} is not implemented on the API yet. The command centre is running against the live data source; switch VITE_DATA_SOURCE=mock for the simulated SOC, or implement the endpoint.`,
    );
    this.name = 'NotImplementedOnApiError';
  }
}

export class LiveDataSource implements CommandCentreClient {
  readonly kind = 'live' as const;

  async getFleetSnapshot(): Promise<FleetSnapshot> {
    return api.get<FleetSnapshot>('/dashboard/snapshot');
  }

  async getKpiMetrics(): Promise<KpiMetric[]> {
    throw new NotImplementedOnApiError('GET /analytics/kpis');
  }

  async getVehicles(): Promise<Vehicle[]> {
    const page = await api.get<Paginated<Vehicle>>('/vehicles', { query: { pageSize: 200 } });
    return page.items;
  }

  async getIncidents(options: { openOnly?: boolean; limit?: number } = {}) {
    return api.get<Paginated<Incident>>('/incidents', {
      query: { openOnly: options.openOnly, pageSize: options.limit ?? 25 },
    });
  }

  async getAlerts(options: { limit?: number } = {}): Promise<Alert[]> {
    const page = await api.get<Paginated<Alert>>('/alerts', {
      query: { status: 'OPEN', pageSize: options.limit ?? 25 },
    });
    return page.items;
  }

  async getTacticalPicture(): Promise<TacticalPicture> {
    throw new NotImplementedOnApiError('GET /dashboard/tactical-picture');
  }

  async getResponderAssets(_kind?: ResponderKind): Promise<ResponderAsset[]> {
    throw new NotImplementedOnApiError('GET /responders');
  }

  async getSafeCorridors(): Promise<SafeCorridor[]> {
    throw new NotImplementedOnApiError('GET /corridors');
  }

  async getCrimeHotspots(): Promise<CrimeHotspot[]> {
    // The zones endpoint exists but returns the narrower ThreatZone shape;
    // it needs the incident-count aggregation before it can back this widget.
    throw new NotImplementedOnApiError('GET /threat-events/hotspots');
  }

  async getCameraFeeds(_options?: { vehicleId?: string }): Promise<CameraFeed[]> {
    throw new NotImplementedOnApiError('GET /cameras');
  }

  async getAIDecisions(_options?: { limit?: number }): Promise<AIDecision[]> {
    throw new NotImplementedOnApiError('GET /ai/decisions');
  }

  async getIncidentSummary(incidentId: string): Promise<AIIncidentSummary | null> {
    throw new NotImplementedOnApiError(`GET /incidents/${incidentId}/ai-summary`);
  }

  async getIdentityAssessments(options: { limit?: number } = {}): Promise<IdentityAssessment[]> {
    const page = await api.get<Paginated<IdentityAssessment>>('/identity/assessments', {
      query: { pageSize: options.limit ?? 12 },
    });
    return page.items;
  }

  async getRecentEvidence(options: { limit?: number } = {}): Promise<Evidence[]> {
    const page = await api.get<Paginated<Evidence>>('/evidence', {
      query: { pageSize: options.limit ?? 12 },
    });
    return page.items;
  }

  async acknowledgeAlert(alertId: string): Promise<void> {
    await api.post(`/alerts/${alertId}/acknowledge`, {});
  }

  async resolveAIDecision(): Promise<AIDecision> {
    throw new NotImplementedOnApiError('POST /ai/decisions/:decisionId/resolve');
  }

  async dispatchResponder(input: {
    incidentId: string;
    responderId: string;
    notes?: string;
  }): Promise<void> {
    await api.post(`/incidents/${input.incidentId}/dispatch`, {
      responder: input.responderId,
      notes: input.notes,
    });
  }

  async sendNotification(input: {
    recipientUserIds: string[];
    channels: string[];
    subject: string;
    body: string;
  }): Promise<{ queued: number }> {
    return api.post<{ queued: number }>('/notifications/send', input);
  }
}
