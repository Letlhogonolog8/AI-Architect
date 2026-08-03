import type { AuthUser, Incident, IncidentStatus, Paginated } from '@aegisdrive/types';
import { AuditAction, IncidentStatus as Status } from '@aegisdrive/types';
import { ConflictError, NotFoundError, normalisePagination, paginate } from '@aegisdrive/shared';
import { moduleLogger } from '../../core/logger';
import { recordAudit } from '../audit-logs/audit.service';
import { emitIncidentCreated, emitIncidentUpdated } from '../../realtime/emitter';
import {
  allocateReference,
  appendTimelineEntry,
  findIncidentById,
  findIncidents,
  findTimeline,
  insertIncident,
  updateIncidentById,
} from './incident.repository';
import { toIncidentDto } from './incident.mapper';
import type {
  AddTimelineNoteInput,
  ChangeIncidentStatusInput,
  CreateIncidentInput,
  DispatchInput,
  ListIncidentsQuery,
  UpdateIncidentInput,
} from './incident.schema';

const log = moduleLogger('incidents');

/**
 * Permitted status transitions.
 *
 * Encoded explicitly rather than left to the caller: an incident that jumps
 * from DETECTED straight to ARCHIVED skips the triage record the platform is
 * legally expected to produce. Terminal states accept no further transitions.
 */
const ALLOWED_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  [Status.DETECTED]: [Status.TRIAGED, Status.ESCALATED, Status.FALSE_POSITIVE],
  [Status.TRIAGED]: [Status.ESCALATED, Status.RESPONDING, Status.RESOLVED, Status.FALSE_POSITIVE],
  [Status.ESCALATED]: [Status.RESPONDING, Status.CONTAINED, Status.RESOLVED],
  [Status.RESPONDING]: [Status.CONTAINED, Status.RESOLVED],
  [Status.CONTAINED]: [Status.RESOLVED],
  [Status.RESOLVED]: [Status.ARCHIVED],
  [Status.FALSE_POSITIVE]: [Status.ARCHIVED],
  [Status.ARCHIVED]: [],
};

export async function listIncidents(
  user: AuthUser,
  query: ListIncidentsQuery,
): Promise<Paginated<Incident>> {
  const pagination = normalisePagination(query);

  const { rows, total } = await findIncidents({
    ...pagination,
    organizationId: user.organizationId,
    status: query.status,
    severity: query.severity,
    type: query.type,
    vehicleId: query.vehicleId,
    driverId: query.driverId,
    assignedToUserId: query.assignedToUserId,
    openOnly: query.openOnly,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    search: query.search,
  });

  return paginate(rows.map(toIncidentDto), pagination, total);
}

export async function getIncident(user: AuthUser, incidentId: string): Promise<Incident> {
  const row = await findIncidentById(user.organizationId, incidentId);
  if (!row) throw new NotFoundError('Incident', incidentId);
  return toIncidentDto(row);
}

export async function createIncident(
  user: AuthUser,
  input: CreateIncidentInput,
): Promise<Incident> {
  const reference = await allocateReference(user.organizationId);

  const row = await insertIncident(user.organizationId, {
    reference,
    type: input.type,
    severity: input.severity,
    title: input.title,
    summary: input.summary,
    longitude: input.position?.longitude ?? null,
    latitude: input.position?.latitude ?? null,
    detectedAt: input.detectedAt ? new Date(input.detectedAt) : new Date(),
    aiConfidence: input.aiConfidence ?? null,
    ...(input.vehicleId ? { vehicle: { connect: { id: input.vehicleId } } } : {}),
    ...(input.driverId ? { driver: { connect: { id: input.driverId } } } : {}),
  });

  await appendTimelineEntry({
    incidentId: row.id,
    kind: 'STATUS_CHANGE',
    message: `Incident opened as ${input.severity} ${input.type}.`,
    actorUserId: user.id,
    metadata: {
      severity: input.severity,
      type: input.type,
      aiConfidence: input.aiConfidence ?? null,
    },
  });

  const dto = toIncidentDto(row);

  log.warn({ incidentId: row.id, reference, severity: row.severity }, 'Incident opened');

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.CREATE,
    resourceType: 'incident',
    resourceId: row.id,
    metadata: { reference, type: input.type, severity: input.severity },
  });

  emitIncidentCreated(dto);

  return dto;
}

export async function updateIncident(
  user: AuthUser,
  incidentId: string,
  input: UpdateIncidentInput,
): Promise<Incident> {
  const existing = await findIncidentById(user.organizationId, incidentId);
  if (!existing) throw new NotFoundError('Incident', incidentId);

  const { assignedToUserId, ...scalars } = input;

  const row = await updateIncidentById(user.organizationId, incidentId, {
    ...scalars,
    ...(assignedToUserId !== undefined
      ? assignedToUserId
        ? { assignedTo: { connect: { id: assignedToUserId } } }
        : { assignedTo: { disconnect: true } }
      : {}),
  });

  if (!row) throw new NotFoundError('Incident', incidentId);

  if (assignedToUserId !== undefined) {
    await appendTimelineEntry({
      incidentId,
      kind: 'NOTE',
      message: assignedToUserId ? 'Incident reassigned.' : 'Incident unassigned.',
      actorUserId: user.id,
      metadata: { assignedToUserId },
    });
  }

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'incident',
    resourceId: incidentId,
    metadata: { changed: Object.keys(input) },
  });

  const dto = toIncidentDto(row);
  emitIncidentUpdated(dto, user.id);
  return dto;
}

export async function changeIncidentStatus(
  user: AuthUser,
  incidentId: string,
  input: ChangeIncidentStatusInput,
): Promise<Incident> {
  const existing = await findIncidentById(user.organizationId, incidentId);
  if (!existing) throw new NotFoundError('Incident', incidentId);

  const permitted = ALLOWED_TRANSITIONS[existing.status];

  if (!permitted.includes(input.status)) {
    throw new ConflictError(
      permitted.length === 0
        ? `An incident in ${existing.status} is closed and cannot change status.`
        : `An incident in ${existing.status} may only move to: ${permitted.join(', ')}.`,
    );
  }

  const now = new Date();
  const isAcknowledgement =
    existing.acknowledgedAt === null && input.status !== Status.FALSE_POSITIVE;
  const isClosure = input.status === Status.RESOLVED || input.status === Status.FALSE_POSITIVE;

  const row = await updateIncidentById(user.organizationId, incidentId, {
    status: input.status,
    ...(isAcknowledgement ? { acknowledgedAt: now } : {}),
    ...(isClosure ? { resolvedAt: now } : {}),
  });

  if (!row) throw new NotFoundError('Incident', incidentId);

  await appendTimelineEntry({
    incidentId,
    kind: 'STATUS_CHANGE',
    message: input.note ?? `Status changed from ${existing.status} to ${input.status}.`,
    actorUserId: user.id,
    metadata: { from: existing.status, to: input.status },
  });

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'incident',
    resourceId: incidentId,
    metadata: { from: existing.status, to: input.status, note: input.note },
  });

  const dto = toIncidentDto(row);
  emitIncidentUpdated(dto, user.id);
  return dto;
}

/**
 * Records a dispatch to a responder.
 *
 * Moves the incident to RESPONDING when the transition is legal, but does not
 * fail the dispatch if it is not — the responder is on their way either way,
 * and the timeline is the authoritative record.
 */
export async function dispatchResponder(
  user: AuthUser,
  incidentId: string,
  input: DispatchInput,
): Promise<Incident> {
  const existing = await findIncidentById(user.organizationId, incidentId);
  if (!existing) throw new NotFoundError('Incident', incidentId);

  await appendTimelineEntry({
    incidentId,
    kind: 'DISPATCH',
    message: `Dispatched ${input.responder}.`,
    actorUserId: user.id,
    metadata: { responder: input.responder, notes: input.notes ?? null },
  });

  const canAdvance = ALLOWED_TRANSITIONS[existing.status].includes(Status.RESPONDING);

  const row = canAdvance
    ? await updateIncidentById(user.organizationId, incidentId, {
        status: Status.RESPONDING,
        acknowledgedAt: existing.acknowledgedAt ?? new Date(),
      })
    : existing;

  if (!row) throw new NotFoundError('Incident', incidentId);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.DISPATCH,
    resourceType: 'incident',
    resourceId: incidentId,
    metadata: { responder: input.responder, statusAdvanced: canAdvance },
  });

  const dto = toIncidentDto(row);
  emitIncidentUpdated(dto, user.id);
  return dto;
}

export async function addTimelineNote(
  user: AuthUser,
  incidentId: string,
  input: AddTimelineNoteInput,
): Promise<void> {
  const existing = await findIncidentById(user.organizationId, incidentId);
  if (!existing) throw new NotFoundError('Incident', incidentId);

  await appendTimelineEntry({
    incidentId,
    kind: 'NOTE',
    message: input.message,
    actorUserId: user.id,
  });
}

export interface TimelineEntryDto {
  id: string;
  kind: string;
  message: string;
  actorUserId: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
}

export async function getTimeline(user: AuthUser, incidentId: string): Promise<TimelineEntryDto[]> {
  const existing = await findIncidentById(user.organizationId, incidentId);
  if (!existing) throw new NotFoundError('Incident', incidentId);

  const rows = await findTimeline(incidentId);

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    message: row.message,
    actorUserId: row.actorUserId,
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null,
    occurredAt: row.occurredAt.toISOString(),
  }));
}
