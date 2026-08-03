import type { GeoPosition, ISODateString, UUID } from './common';
import type { ThreatLevel, VehicleStatus } from './enums';
import type { Alert, FleetSnapshot, Incident, ThreatEvent } from './domain';
import type { BehaviourAssessment } from './behaviour';
import type {
  AIDecision,
  CameraDetection,
  CameraStatus,
  KpiMetric,
  ResponderAsset,
  SafeCorridor,
} from './command-centre';

/**
 * Socket.IO contract.
 *
 * `ServerToClientEvents` and `ClientToServerEvents` are used to parameterise
 * the `Server` on the API and the `Socket` on the clients, so both ends of the
 * wire are checked against the same declaration.
 */

/** Channel names. Rooms are namespaced by organization to enforce tenancy. */
export const REALTIME_NAMESPACE = '/ops' as const;

export const RealtimeRoom = {
  organization: (organizationId: UUID): string => `org:${organizationId}`,
  vehicle: (vehicleId: UUID): string => `vehicle:${vehicleId}`,
  incident: (incidentId: UUID): string => `incident:${incidentId}`,
} as const;

export interface VehiclePositionUpdate {
  vehicleId: UUID;
  position: GeoPosition;
  status: VehicleStatus;
  riskScore: number;
  threatLevel: ThreatLevel;
  recordedAt: ISODateString;
}

export interface IncidentStatusUpdate {
  incidentId: UUID;
  incident: Incident;
  changedByUserId: UUID | null;
  changedAt: ISODateString;
}

export interface ConnectionAck {
  socketId: string;
  organizationId: UUID;
  serverTime: ISODateString;
}

/** A camera's status change or new detection batch. */
export interface CameraUpdate {
  cameraId: UUID;
  status: CameraStatus;
  detections: CameraDetection[];
  lastFrameAt: ISODateString;
}

export interface ServerToClientEvents {
  'connection:ack': (payload: ConnectionAck) => void;
  'vehicle:position': (payload: VehiclePositionUpdate) => void;
  'vehicle:status': (payload: { vehicleId: UUID; status: VehicleStatus }) => void;
  'incident:created': (payload: Incident) => void;
  'incident:updated': (payload: IncidentStatusUpdate) => void;
  'alert:raised': (payload: Alert) => void;
  'alert:acknowledged': (payload: Alert) => void;
  'threat:detected': (payload: ThreatEvent) => void;
  /**
   * A cabin behaviour assessment.
   *
   * **Broadcast to the organization room only, never to a vehicle room.** The
   * vehicle rooms exist so a client watching one vehicle gets its updates
   * cheaply, and a behaviour assessment must never travel down a channel a
   * device in that vehicle could be subscribed to. If duress is indicated, the
   * assessment is precisely the thing an attacker must not learn has been
   * produced. Enforced in `emitBehaviourAssessed`.
   */
  'behaviour:assessed': (payload: BehaviourAssessment) => void;
  'fleet:snapshot': (payload: FleetSnapshot) => void;
  'system:error': (payload: { code: string; message: string }) => void;

  // Command-centre channels. Emitted at a higher rate than the incident events
  // above, and consumed by the SOC dashboard only.
  'responder:updated': (payload: ResponderAsset) => void;
  'corridor:updated': (payload: SafeCorridor) => void;
  'camera:update': (payload: CameraUpdate) => void;
  'ai:decision': (payload: AIDecision) => void;
  'ai:decision-resolved': (payload: AIDecision) => void;
  /** Full KPI set, replacing the previous one. Cheaper than diffing per metric. */
  'kpi:tick': (payload: KpiMetric[]) => void;
}

export interface ClientToServerEvents {
  'vehicle:subscribe': (vehicleId: UUID) => void;
  'vehicle:unsubscribe': (vehicleId: UUID) => void;
  'incident:subscribe': (incidentId: UUID) => void;
  'incident:unsubscribe': (incidentId: UUID) => void;
}

/** Never emitted between server nodes today; reserved for the Redis adapter. */
export interface InterServerEvents {
  ping: () => void;
}

/** Attached to every authenticated socket by the handshake middleware. */
export interface SocketData {
  userId: UUID;
  organizationId: UUID;
}
