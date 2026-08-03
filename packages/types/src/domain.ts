import type { GeoPosition, ISODateString, TenantScoped, Timestamped, UUID } from './common';
import type {
  AlertStatus,
  AlertType,
  AuditAction,
  DriverStatus,
  EvidenceStatus,
  EvidenceType,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  NotificationChannel,
  NotificationStatus,
  OrganizationTier,
  ProtectionMode,
  RoleName,
  TelemetrySource,
  ThreatEventType,
  ThreatLevel,
  UserStatus,
  VehicleStatus,
  VehicleType,
} from './enums';
import type { Permission } from './auth';

/**
 * Read models returned by the API. These are deliberately *not* the Prisma
 * models: dates are ISO strings, secrets are absent, and relations are
 * flattened into the shape the clients actually render.
 */

export interface Organization extends Timestamped {
  id: UUID;
  name: string;
  slug: string;
  tier: OrganizationTier;
  countryCode: string;
  timezone: string;
  isActive: boolean;
  vehicleCount: number;
  userCount: number;
}

export interface Role extends Timestamped {
  id: UUID;
  name: RoleName;
  displayName: string;
  description: string;
  permissions: Permission[];
  isSystemRole: boolean;
  userCount: number;
}

export interface User extends Timestamped, TenantScoped {
  id: UUID;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  roles: RoleName[];
  lastLoginAt: ISODateString | null;
  mfaEnabled: boolean;
}

export interface Vehicle extends Timestamped, TenantScoped {
  id: UUID;
  registrationNumber: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  colour: string;
  type: VehicleType;
  status: VehicleStatus;
  protectionMode: ProtectionMode;
  /** 0-100 composite risk score produced by the AI risk engine. */
  riskScore: number;
  threatLevel: ThreatLevel;
  assignedDriverId: UUID | null;
  lastPosition: GeoPosition | null;
  lastSeenAt: ISODateString | null;
  odometerKm: number;
  deviceSerial: string | null;
}

export interface Driver extends Timestamped, TenantScoped {
  id: UUID;
  userId: UUID | null;
  firstName: string;
  lastName: string;
  licenceNumber: string;
  licenceExpiresAt: ISODateString | null;
  phoneNumber: string;
  status: DriverStatus;
  /** 0-100 behavioural safety score. Higher is safer. */
  safetyScore: number;
  assignedVehicleId: UUID | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

export interface Incident extends Timestamped, TenantScoped {
  id: UUID;
  reference: string;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  summary: string;
  vehicleId: UUID | null;
  driverId: UUID | null;
  position: GeoPosition | null;
  detectedAt: ISODateString;
  acknowledgedAt: ISODateString | null;
  resolvedAt: ISODateString | null;
  assignedToUserId: UUID | null;
  /** 0-1 confidence emitted by the detection model that raised the incident. */
  aiConfidence: number | null;
  evidenceCount: number;
}

export interface Evidence extends Timestamped, TenantScoped {
  id: UUID;
  incidentId: UUID | null;
  vehicleId: UUID | null;
  type: EvidenceType;
  status: EvidenceStatus;
  label: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  /** SHA-256 of the sealed object; the anchor of the chain of custody. */
  checksum: string;
  capturedAt: ISODateString;
  sealedAt: ISODateString | null;
  uploadedByUserId: UUID | null;
}

export interface Alert extends Timestamped, TenantScoped {
  id: UUID;
  type: AlertType;
  status: AlertStatus;
  severity: IncidentSeverity;
  title: string;
  message: string;
  vehicleId: UUID | null;
  driverId: UUID | null;
  incidentId: UUID | null;
  raisedAt: ISODateString;
  acknowledgedAt: ISODateString | null;
  acknowledgedByUserId: UUID | null;
}

export interface Notification extends Timestamped {
  id: UUID;
  recipientUserId: UUID;
  channel: NotificationChannel;
  status: NotificationStatus;
  subject: string;
  body: string;
  alertId: UUID | null;
  incidentId: UUID | null;
  sentAt: ISODateString | null;
  readAt: ISODateString | null;
}

export interface TelemetryPoint extends TenantScoped {
  id: UUID;
  vehicleId: UUID;
  source: TelemetrySource;
  recordedAt: ISODateString;
  position: GeoPosition;
  ignitionOn: boolean;
  fuelLevelPercent: number | null;
  batteryVoltage: number | null;
  engineTempC: number | null;
  harshBraking: boolean;
  harshAcceleration: boolean;
  /** Free-form device payload retained verbatim for forensic replay. */
  raw: Record<string, unknown> | null;
}

export interface ThreatEvent extends Timestamped, TenantScoped {
  id: UUID;
  type: ThreatEventType;
  level: ThreatLevel;
  vehicleId: UUID | null;
  incidentId: UUID | null;
  position: GeoPosition | null;
  detectedAt: ISODateString;
  /** 0-1 model confidence. */
  confidence: number;
  /** Identifier of the model that produced this event, e.g. `tailing-v3`. */
  modelId: string;
  description: string;
  acknowledged: boolean;
}

export interface AuditLog extends TenantScoped {
  id: UUID;
  action: AuditAction;
  actorUserId: UUID | null;
  actorEmail: string | null;
  resourceType: string;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  /** Structured before/after diff or request context. */
  metadata: Record<string, unknown> | null;
  createdAt: ISODateString;
}

/** Aggregate shown on the operations dashboard header. */
export interface FleetSnapshot {
  totalVehicles: number;
  vehiclesInTransit: number;
  vehiclesUnderThreat: number;
  driversOnDuty: number;
  openIncidents: number;
  criticalIncidents: number;
  openAlerts: number;
  averageRiskScore: number;
  postureLevel: ThreatLevel;
  generatedAt: ISODateString;
}
