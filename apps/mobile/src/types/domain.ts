import type {
  CorridorStatus,
  DriverStatus,
  EvidenceStatus,
  EvidenceType,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  ProtectionMode,
  RoleName,
  ThreatLevel,
  UserStatus,
  VehicleStatus,
} from './enums';

/**
 * Wire types for the driver app.
 *
 * A **subset** of `packages/types/src/domain.ts`, not a copy: this app is a
 * driver's client, so it never sees other drivers' vehicles, the audit trail,
 * user administration or the tenant roster. Mirroring only what is consumed
 * keeps the surface that can drift small.
 */

export type UUID = string;
export type ISODateString = string;

export interface GeoPoint {
  longitude: number;
  latitude: number;
}

export interface GeoPosition extends GeoPoint {
  altitude?: number | null;
  heading?: number | null;
  speedKph?: number | null;
  accuracy?: number | null;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

export type ApiResponse<T> =
  | { success: true; data: T; requestId: string }
  | { success: false; error: ApiErrorBody; requestId: string };

export interface Paginated<T> {
  items: T[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

// ============================================================================
// Identity
// ============================================================================

export interface AuthUser {
  id: UUID;
  email: string;
  firstName: string;
  lastName: string;
  organizationId: UUID;
  status: UserStatus;
  roles: RoleName[];
  permissions: string[];
}

export interface TokenPair {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

export interface LoginResponse {
  user: AuthUser;
  tokens: TokenPair;
}

// ============================================================================
// Fleet
// ============================================================================

export interface Vehicle {
  id: UUID;
  organizationId: UUID;
  registrationNumber: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  colour: string;
  status: VehicleStatus;
  protectionMode: ProtectionMode;
  riskScore: number;
  threatLevel: ThreatLevel;
  assignedDriverId: UUID | null;
  lastPosition: GeoPosition | null;
  lastSeenAt: ISODateString | null;
  odometerKm: number;
  deviceSerial: string | null;
}

export interface Driver {
  id: UUID;
  organizationId: UUID;
  userId: UUID | null;
  firstName: string;
  lastName: string;
  licenceNumber: string;
  phoneNumber: string;
  status: DriverStatus;
  safetyScore: number;
  assignedVehicleId: UUID | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

// ============================================================================
// Operations
// ============================================================================

export interface Incident {
  id: UUID;
  organizationId: UUID;
  reference: string;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  summary: string;
  vehicleId: UUID | null;
  driverId: UUID | null;
  position: GeoPoint | null;
  detectedAt: ISODateString;
  acknowledgedAt: ISODateString | null;
  resolvedAt: ISODateString | null;
  evidenceCount: number;
}

export interface IncidentTimelineEntry {
  id: UUID;
  kind: string;
  message: string;
  occurredAt: ISODateString;
}

export interface Evidence {
  id: UUID;
  incidentId: UUID | null;
  vehicleId: UUID | null;
  type: EvidenceType;
  status: EvidenceStatus;
  label: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  checksum: string;
  capturedAt: ISODateString;
  sealedAt: ISODateString | null;
}

export interface SafeCorridor {
  id: UUID;
  name: string;
  originLabel: string;
  destinationLabel: string;
  status: CorridorStatus;
  waypoints: GeoPoint[];
  lengthKm: number;
  averageTransitMinutes: number;
  riskScore: number;
  responderCoverage: number;
}

export interface CrimeHotspot {
  id: UUID;
  name: string;
  level: ThreatLevel;
  centre: GeoPoint;
  radiusMetres: number;
  activeFromHour: number | null;
  activeToHour: number | null;
}

// ============================================================================
// Driver-app specific
// ============================================================================

/** A person to reach when the driver cannot be reached. */
export interface EmergencyContact {
  id: UUID;
  name: string;
  relationship: string;
  phoneNumber: string;
  /** Contacted first, in order. */
  priority: number;
  /** Included on the automatic notification when an incident opens. */
  notifyOnIncident: boolean;
}

/** One message in the secure operator ↔ driver thread. */
export interface SecureMessage {
  id: UUID;
  incidentId: UUID | null;
  direction: 'INBOUND' | 'OUTBOUND';
  body: string;
  /** Present on outbound messages that have not yet reached the server. */
  pendingSync: boolean;
  sentAt: ISODateString;
  readAt: ISODateString | null;
  /** Control-room operator who sent an inbound message. */
  senderName: string | null;
}

/** A canned reply, so a driver under duress can answer with one tap. */
export interface QuickReply {
  id: string;
  label: string;
  body: string;
  /** Sends silently, with no visible or audible confirmation. */
  covert: boolean;
}
