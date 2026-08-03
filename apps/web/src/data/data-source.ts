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

/**
 * The command centre's read contract.
 *
 * Both implementations satisfy it: `LiveDataSource` calls the REST API,
 * `MockDataSource` serves generated fixtures. Widgets depend on this interface
 * and never on either implementation, so switching is one line in
 * `data/index.ts` and no widget changes.
 *
 * Every method returns a promise even where the mock answers synchronously —
 * a widget written against a synchronous mock breaks the moment it meets a
 * network.
 */
export interface CommandCentreDataSource {
  /** Which implementation is active. Rendered in the UI so a demo is never mistaken for production. */
  readonly kind: 'mock' | 'live';

  // Fleet and operations
  getFleetSnapshot(): Promise<FleetSnapshot>;
  getKpiMetrics(): Promise<KpiMetric[]>;
  getVehicles(): Promise<Vehicle[]>;
  getIncidents(options?: { openOnly?: boolean; limit?: number }): Promise<Paginated<Incident>>;
  getAlerts(options?: { limit?: number }): Promise<Alert[]>;

  // Tactical picture
  getTacticalPicture(): Promise<TacticalPicture>;
  getResponderAssets(kind?: ResponderKind): Promise<ResponderAsset[]>;
  getSafeCorridors(): Promise<SafeCorridor[]>;
  getCrimeHotspots(): Promise<CrimeHotspot[]>;

  // Surveillance
  getCameraFeeds(options?: { vehicleId?: string }): Promise<CameraFeed[]>;

  // AI
  getAIDecisions(options?: { limit?: number }): Promise<AIDecision[]>;
  getIncidentSummary(incidentId: string): Promise<AIIncidentSummary | null>;

  // Continuous Identity Engine
  getIdentityAssessments(options?: { limit?: number }): Promise<IdentityAssessment[]>;

  // Evidence
  getRecentEvidence(options?: { limit?: number }): Promise<Evidence[]>;
}

/**
 * The command centre's write contract.
 *
 * Separated from reads because the mock implements these as optimistic local
 * mutations while the live source performs audited, permission-checked API
 * calls. Keeping them apart makes it obvious at a glance which operations have
 * real-world consequences.
 */
export interface CommandCentreCommands {
  acknowledgeAlert(alertId: string): Promise<void>;
  /** Resolves an AI recommendation. `actionId` is null when simply dismissed. */
  resolveAIDecision(
    decisionId: string,
    outcome: 'ACCEPTED' | 'REJECTED',
    actionId: string | null,
  ): Promise<AIDecision>;
  dispatchResponder(input: {
    incidentId: string;
    responderId: string;
    notes?: string;
  }): Promise<void>;
  sendNotification(input: {
    recipientUserIds: string[];
    channels: string[];
    subject: string;
    body: string;
  }): Promise<{ queued: number }>;
}

export type CommandCentreClient = CommandCentreDataSource & CommandCentreCommands;
