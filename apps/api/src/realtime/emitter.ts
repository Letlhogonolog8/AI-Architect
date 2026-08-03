import {
  REALTIME_NAMESPACE,
  RealtimeRoom,
  type Alert,
  type BehaviourAssessment,
  type ClientToServerEvents,
  type FleetSnapshot,
  type Incident,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
  type ThreatEvent,
  type VehiclePositionUpdate,
} from '@aegisdrive/types';
import type { Server } from 'socket.io';
import { moduleLogger } from '../core/logger';

const log = moduleLogger('realtime:emit');

type AegisServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * Broadcast surface for the rest of the API.
 *
 * Services import these functions rather than the Socket.IO server itself, so
 * that domain code never holds a transport handle — and so that emitting
 * before the server is up degrades to a warning instead of a crash during
 * startup or in tests.
 */
let io: AegisServer | null = null;

export function setRealtimeServer(server: AegisServer): void {
  io = server;
}

function toOrganization<E extends keyof ServerToClientEvents>(
  organizationId: string,
  event: E,
  ...payload: Parameters<ServerToClientEvents[E]>
): void {
  if (!io) {
    log.warn({ event }, 'Realtime broadcast skipped: server not initialised');
    return;
  }

  io.of(REALTIME_NAMESPACE)
    .to(RealtimeRoom.organization(organizationId))
    .emit(event, ...payload);
}

function toRoom<E extends keyof ServerToClientEvents>(
  room: string,
  event: E,
  ...payload: Parameters<ServerToClientEvents[E]>
): void {
  if (!io) return;
  io.of(REALTIME_NAMESPACE)
    .to(room)
    .emit(event, ...payload);
}

export function emitVehiclePosition(organizationId: string, update: VehiclePositionUpdate): void {
  toOrganization(organizationId, 'vehicle:position', update);
  toRoom(RealtimeRoom.vehicle(update.vehicleId), 'vehicle:position', update);
}

export function emitIncidentCreated(incident: Incident): void {
  toOrganization(incident.organizationId, 'incident:created', incident);
}

export function emitIncidentUpdated(incident: Incident, changedByUserId: string | null): void {
  const payload = {
    incidentId: incident.id,
    incident,
    changedByUserId,
    changedAt: new Date().toISOString(),
  };

  toOrganization(incident.organizationId, 'incident:updated', payload);
  toRoom(RealtimeRoom.incident(incident.id), 'incident:updated', payload);
}

export function emitAlertRaised(alert: Alert): void {
  toOrganization(alert.organizationId, 'alert:raised', alert);
}

export function emitAlertAcknowledged(alert: Alert): void {
  toOrganization(alert.organizationId, 'alert:acknowledged', alert);
}

export function emitThreatDetected(threat: ThreatEvent): void {
  toOrganization(threat.organizationId, 'threat:detected', threat);
}

/**
 * Broadcasts a cabin behaviour assessment.
 *
 * **Organization room only.** Unlike `emitVehiclePosition`, this deliberately
 * does not also emit to `RealtimeRoom.vehicle(...)`, and the omission is the
 * security control rather than an inconsistency.
 *
 * A device inside the vehicle can hold a subscription to that vehicle's room. If
 * the assessment indicates duress, it is exactly the thing an attacker must not
 * learn has been produced — a hijacker who sees the system react knows the
 * driver triggered something, and the driver pays for that. Same reasoning as
 * `BehaviourPolicy.notifyDriver` being false at every level.
 *
 * Adding a `toRoom(RealtimeRoom.vehicle(...))` call here would defeat that
 * control silently, so it is called out rather than left to be noticed.
 */
export function emitBehaviourAssessed(assessment: BehaviourAssessment): void {
  toOrganization(assessment.organizationId, 'behaviour:assessed', assessment);
}

export function emitFleetSnapshot(organizationId: string, snapshot: FleetSnapshot): void {
  toOrganization(organizationId, 'fleet:snapshot', snapshot);
}

/** Number of currently connected sockets. Reported by the health endpoint. */
export async function connectedClientCount(): Promise<number> {
  if (!io) return 0;
  const sockets = await io.of(REALTIME_NAMESPACE).fetchSockets();
  return sockets.length;
}
