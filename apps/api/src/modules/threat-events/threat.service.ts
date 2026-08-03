import type { ThreatEvent as ThreatEventRow } from '@prisma/client';
import type { AuthUser, Paginated, ThreatEvent, ThreatLevel } from '@aegisdrive/types';
import { AuditAction } from '@aegisdrive/types';
import { NotFoundError, normalisePagination, paginate } from '@aegisdrive/shared';
import { recordAudit } from '../audit-logs/audit.service';
import { emitThreatDetected } from '../../realtime/emitter';
import {
  acknowledgeThreatEventById,
  findActiveThreatZones,
  findThreatEventById,
  findThreatEvents,
  insertThreatEvent,
} from './threat.repository';
import type { ListThreatEventsQuery, RecordThreatEventInput } from './threat.schema';

function toThreatEventDto(row: ThreatEventRow): ThreatEvent {
  return {
    id: row.id,
    organizationId: row.organizationId,
    type: row.type,
    level: row.level,
    vehicleId: row.vehicleId,
    incidentId: row.incidentId,
    position:
      row.longitude !== null && row.latitude !== null
        ? { longitude: row.longitude, latitude: row.latitude }
        : null,
    detectedAt: row.detectedAt.toISOString(),
    confidence: row.confidence,
    modelId: row.modelId,
    description: row.description,
    acknowledged: row.acknowledged,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listThreatEvents(
  user: AuthUser,
  query: ListThreatEventsQuery,
): Promise<Paginated<ThreatEvent>> {
  const pagination = normalisePagination(query);

  const { rows, total } = await findThreatEvents({
    ...pagination,
    organizationId: user.organizationId,
    type: query.type,
    level: query.level,
    vehicleId: query.vehicleId,
    acknowledged: query.acknowledged,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
  });

  return paginate(rows.map(toThreatEventDto), pagination, total);
}

export async function getThreatEvent(user: AuthUser, threatEventId: string): Promise<ThreatEvent> {
  const row = await findThreatEventById(user.organizationId, threatEventId);
  if (!row) throw new NotFoundError('Threat event', threatEventId);
  return toThreatEventDto(row);
}

export async function recordThreatEvent(
  user: AuthUser,
  input: RecordThreatEventInput,
): Promise<ThreatEvent> {
  const row = await insertThreatEvent(user.organizationId, {
    type: input.type,
    level: input.level,
    confidence: input.confidence,
    modelId: input.modelId,
    description: input.description,
    longitude: input.position?.longitude ?? null,
    latitude: input.position?.latitude ?? null,
    detectedAt: input.detectedAt ? new Date(input.detectedAt) : new Date(),
    ...(input.vehicleId ? { vehicle: { connect: { id: input.vehicleId } } } : {}),
    ...(input.incidentId ? { incident: { connect: { id: input.incidentId } } } : {}),
  });

  const dto = toThreatEventDto(row);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.CREATE,
    resourceType: 'threat_event',
    resourceId: row.id,
    metadata: { type: input.type, level: input.level, modelId: input.modelId },
  });

  emitThreatDetected(dto);

  return dto;
}

export async function acknowledgeThreatEvent(
  user: AuthUser,
  threatEventId: string,
): Promise<ThreatEvent> {
  const row = await acknowledgeThreatEventById(user.organizationId, threatEventId);
  if (!row) throw new NotFoundError('Threat event', threatEventId);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'threat_event',
    resourceId: threatEventId,
    metadata: { acknowledged: true },
  });

  return toThreatEventDto(row);
}

export interface ThreatZoneDto {
  id: string;
  name: string;
  description: string | null;
  level: ThreatLevel;
  centre: { longitude: number; latitude: number };
  radiusMetres: number;
  activeFromHour: number | null;
  activeToHour: number | null;
  source: string;
}

/** Feeds the risk overlay on the tactical map. */
export async function listThreatZones(user: AuthUser): Promise<ThreatZoneDto[]> {
  const rows = await findActiveThreatZones(user.organizationId);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    level: row.level,
    centre: { longitude: row.centreLongitude, latitude: row.centreLatitude },
    radiusMetres: row.radiusMetres,
    activeFromHour: row.activeFromHour,
    activeToHour: row.activeToHour,
    source: row.source,
  }));
}
