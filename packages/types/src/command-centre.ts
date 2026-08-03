import type { GeoPoint, GeoPosition, ISODateString, TenantScoped, UUID } from './common';
import type { IncidentSeverity, IncidentType, ThreatLevel } from './enums';
import type { Permission } from './auth';

/**
 * Command-centre domain.
 *
 * These are the entities the Security Operations Centre renders that are not
 * part of the core fleet model: response assets, safe corridors, hotspots,
 * camera feeds and the AI decision stream.
 *
 * They live in `@aegisdrive/types` rather than in the web app because the
 * mobile app and the AI services will consume the same shapes. Nothing here
 * imports a UI library or a runtime.
 */

// ============================================================================
// Response assets
// ============================================================================

export const ResponderKind = {
  POLICE: 'POLICE',
  HOSPITAL: 'HOSPITAL',
  SECURITY: 'SECURITY',
  FIRE: 'FIRE',
  TOW: 'TOW',
} as const;
export type ResponderKind = (typeof ResponderKind)[keyof typeof ResponderKind];

export const ResponderStatus = {
  AVAILABLE: 'AVAILABLE',
  EN_ROUTE: 'EN_ROUTE',
  ON_SCENE: 'ON_SCENE',
  BUSY: 'BUSY',
  OFFLINE: 'OFFLINE',
} as const;
export type ResponderStatus = (typeof ResponderStatus)[keyof typeof ResponderStatus];

/**
 * A dispatchable unit or a fixed facility.
 *
 * Police vehicles, armed-response units, hospitals and fire stations are all
 * modelled as one entity because the control room asks the same question of
 * each: what is nearest, is it available, and how long until it arrives.
 * `kind` drives presentation; it does not change the shape.
 */
export interface ResponderAsset {
  id: UUID;
  kind: ResponderKind;
  name: string;
  /** Radio identifier, e.g. `ZA-JHB-07`. Absent for fixed facilities. */
  callSign: string | null;
  status: ResponderStatus;
  position: GeoPoint;
  /** Null for a facility, which does not move. */
  heading: number | null;
  contactNumber: string | null;
  /** Beds for a hospital, crew for a unit. Null when not applicable. */
  capacity: number | null;
  /** Straight-line distance to the currently selected incident, in metres. */
  distanceMetres: number | null;
  /** Estimated arrival at the selected incident, in minutes. */
  etaMinutes: number | null;
  lastUpdatedAt: ISODateString;
}

// ============================================================================
// SafeCorridor
// ============================================================================

export const CorridorStatus = {
  CLEAR: 'CLEAR',
  CAUTION: 'CAUTION',
  DEGRADED: 'DEGRADED',
  CLOSED: 'CLOSED',
} as const;
export type CorridorStatus = (typeof CorridorStatus)[keyof typeof CorridorStatus];

/**
 * A vetted route between two points.
 *
 * SafeCorridor is the preventive half of the product: rather than reacting to
 * a hijacking, it routes a vehicle along a path whose historical risk is known
 * and whose response coverage is understood.
 */
export interface SafeCorridor {
  id: UUID;
  name: string;
  originLabel: string;
  destinationLabel: string;
  status: CorridorStatus;
  /** Ordered polyline. The first and last points are the endpoints. */
  waypoints: GeoPoint[];
  lengthKm: number;
  averageTransitMinutes: number;
  /** 0-100. Aggregated from the hotspots the corridor passes through. */
  riskScore: number;
  /** Vehicles currently travelling this corridor. */
  activeVehicleCount: number;
  /** Response units within reach along its length. */
  responderCoverage: number;
  lastAssessedAt: ISODateString;
}

// ============================================================================
// Crime intelligence
// ============================================================================

export interface CrimeHotspot {
  id: UUID;
  name: string;
  level: ThreatLevel;
  centre: GeoPoint;
  radiusMetres: number;
  /** Incidents recorded in this zone over the trailing 90 days. */
  incidentCount90d: number;
  dominantIncidentType: IncidentType;
  /** Hour-of-day window in which the zone is most active, 0-23. */
  activeFromHour: number | null;
  activeToHour: number | null;
  /** 0-1 confidence in the classification. */
  confidence: number;
  /** `INTERNAL`, `SAPS`, `PARTNER_FEED`. */
  source: string;
  lastUpdatedAt: ISODateString;
}

// ============================================================================
// Camera feeds
// ============================================================================

export const CameraKind = {
  CABIN: 'CABIN',
  FORWARD: 'FORWARD',
  REAR: 'REAR',
  SIDE: 'SIDE',
  FIXED: 'FIXED',
} as const;
export type CameraKind = (typeof CameraKind)[keyof typeof CameraKind];

export const CameraStatus = {
  LIVE: 'LIVE',
  RECORDING: 'RECORDING',
  DEGRADED: 'DEGRADED',
  OFFLINE: 'OFFLINE',
} as const;
export type CameraStatus = (typeof CameraStatus)[keyof typeof CameraStatus];

/** One object the vision model found in a frame. */
export interface CameraDetection {
  id: UUID;
  label: string;
  /** 0-1. */
  confidence: number;
  /** Normalised 0-1 box, `[x, y, width, height]`, origin top-left. */
  boundingBox: [number, number, number, number] | null;
  /** Versioned producing model, e.g. `vision-v2`. */
  modelId: string;
  detectedAt: ISODateString;
  /** True for detections that should raise an operator's attention immediately. */
  isCritical: boolean;
}

export interface CameraFeed {
  id: UUID;
  vehicleId: UUID | null;
  label: string;
  kind: CameraKind;
  status: CameraStatus;
  /** Signed HLS URL. Null while the feed is offline or unauthorised. */
  streamUrl: string | null;
  resolution: string;
  framesPerSecond: number;
  aiAnalysisEnabled: boolean;
  lastFrameAt: ISODateString | null;
  detections: CameraDetection[];
}

// ============================================================================
// AI decision stream
// ============================================================================

export const AIDecisionKind = {
  THREAT_ASSESSMENT: 'THREAT_ASSESSMENT',
  ROUTE_RECOMMENDATION: 'ROUTE_RECOMMENDATION',
  DISPATCH_RECOMMENDATION: 'DISPATCH_RECOMMENDATION',
  COUNTERMEASURE: 'COUNTERMEASURE',
  ESCALATION: 'ESCALATION',
  ANOMALY_EXPLANATION: 'ANOMALY_EXPLANATION',
} as const;
export type AIDecisionKind = (typeof AIDecisionKind)[keyof typeof AIDecisionKind];

export const AIDecisionStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  AUTO_EXECUTED: 'AUTO_EXECUTED',
  EXPIRED: 'EXPIRED',
} as const;
export type AIDecisionStatus = (typeof AIDecisionStatus)[keyof typeof AIDecisionStatus];

/**
 * How much latitude the model has.
 *
 * `ADVISORY` shows a suggestion. `SUPERVISED` pre-fills the action but a human
 * commits it. `AUTONOMOUS` executes and reports. Only reversible, low-severity
 * actions may ever be `AUTONOMOUS` — immobilising a vehicle must not be.
 */
export const AutonomyLevel = {
  ADVISORY: 'ADVISORY',
  SUPERVISED: 'SUPERVISED',
  AUTONOMOUS: 'AUTONOMOUS',
} as const;
export type AutonomyLevel = (typeof AutonomyLevel)[keyof typeof AutonomyLevel];

/**
 * One action an operator can take on a decision.
 *
 * `permission` is the permission the action requires. The console reads it to
 * disable controls the operator cannot use — and the API enforces it again when
 * the action is actually submitted.
 */
export interface AIRecommendedAction {
  id: string;
  label: string;
  /** Maps to the endpoint the console will call. */
  kind: 'DISPATCH' | 'IMMOBILISE' | 'ESCALATE' | 'NOTIFY' | 'REROUTE' | 'ACKNOWLEDGE' | 'DISMISS';
  permission: Permission;
  /** Irreversible or physically consequential. Rendered as a danger control. */
  destructive: boolean;
  /** Opaque payload forwarded to the endpoint. */
  payload: Record<string, unknown> | null;
}

/**
 * A model's output, in the form an operator can act on.
 *
 * `rationale` is required and is a list, not a paragraph: an operator deciding
 * whether to dispatch armed responders needs to see the discrete signals that
 * drove the score, not a summary they cannot audit.
 */
export interface AIDecision extends TenantScoped {
  id: UUID;
  kind: AIDecisionKind;
  status: AIDecisionStatus;
  /** Versioned producing model, e.g. `tailing-v3`. */
  modelId: string;
  title: string;
  /** Ordered, most significant first. */
  rationale: string[];
  /** 0-1. */
  confidence: number;
  severity: IncidentSeverity;
  autonomyLevel: AutonomyLevel;
  recommendedActions: AIRecommendedAction[];
  vehicleId: UUID | null;
  incidentId: UUID | null;
  /** Milliseconds the model took. Surfaced so a slow model is visible. */
  inferenceMs: number;
  createdAt: ISODateString;
  decidedAt: ISODateString | null;
  decidedByUserId: UUID | null;
}

// ============================================================================
// KPIs
// ============================================================================

export const KpiTrend = {
  UP: 'UP',
  DOWN: 'DOWN',
  FLAT: 'FLAT',
} as const;
export type KpiTrend = (typeof KpiTrend)[keyof typeof KpiTrend];

/**
 * A headline metric with its recent history.
 *
 * `isPositive` is separate from `trend` on purpose: for response time, down is
 * good; for vehicles protected, up is good. Colour must follow meaning, not
 * direction.
 */
export interface KpiMetric {
  id: string;
  label: string;
  value: number;
  /** Rendered after the value, e.g. `s`, `%`, `km`. */
  unit: string | null;
  /** Absolute change over the comparison window. */
  delta: number | null;
  trend: KpiTrend;
  isPositive: boolean;
  /** Operational target, when one is defined. Drives the target marker. */
  target: number | null;
  /** Oldest to newest. Drives the sparkline. */
  series: number[];
  /** Human label for the comparison window, e.g. `vs. last hour`. */
  comparisonLabel: string;
}

// ============================================================================
// Incident summarisation
// ============================================================================

/**
 * A natural-language summary of an incident, produced by a model.
 *
 * Kept distinct from `Incident.summary`, which is what a human wrote. Conflating
 * the two would make it impossible to tell later whether an operator or a model
 * characterised an event.
 */
export interface AIIncidentSummary {
  incidentId: UUID;
  modelId: string;
  headline: string;
  narrative: string;
  /** Discrete findings, ordered by significance. */
  keyFindings: string[];
  /** What the model believes should happen next. */
  suggestedNextSteps: string[];
  confidence: number;
  severity: IncidentSeverity;
  generatedAt: ISODateString;
}

// ============================================================================
// Map layers
// ============================================================================

/** A vehicle as the tactical map needs it — position plus what to draw. */
export interface MapVehicle {
  id: UUID;
  registrationNumber: string;
  position: GeoPosition;
  threatLevel: ThreatLevel;
  riskScore: number;
  isUnderThreat: boolean;
  corridorId: UUID | null;
  lastSeenAt: ISODateString;
}

/** Everything the tactical map renders, in one payload. */
export interface TacticalPicture {
  vehicles: MapVehicle[];
  responders: ResponderAsset[];
  hotspots: CrimeHotspot[];
  corridors: SafeCorridor[];
  /** Bounding box the client should frame, `[west, south, east, north]`. */
  bounds: [number, number, number, number];
  generatedAt: ISODateString;
}
