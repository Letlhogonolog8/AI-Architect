import type { Alert, AuthUser, Paginated } from '@aegisdrive/types';
import { AlertStatus, AuditAction } from '@aegisdrive/types';
import { ConflictError, NotFoundError, normalisePagination, paginate } from '@aegisdrive/shared';
import { recordAudit } from '../audit-logs/audit.service';
import { emitAlertAcknowledged, emitAlertRaised } from '../../realtime/emitter';
import { findAlertById, findAlerts, insertAlert, updateAlertById } from './alert.repository';
import { toAlertDto } from './alert.mapper';
import type {
  AcknowledgeAlertInput,
  ListAlertsQuery,
  RaiseAlertInput,
  SuppressAlertInput,
} from './alert.schema';

export async function listAlerts(
  user: AuthUser,
  query: ListAlertsQuery,
): Promise<Paginated<Alert>> {
  const pagination = normalisePagination(query);

  const { rows, total } = await findAlerts({
    ...pagination,
    organizationId: user.organizationId,
    status: query.status,
    type: query.type,
    severity: query.severity,
    vehicleId: query.vehicleId,
    incidentId: query.incidentId,
  });

  return paginate(rows.map(toAlertDto), pagination, total);
}

export async function getAlert(user: AuthUser, alertId: string): Promise<Alert> {
  const row = await findAlertById(user.organizationId, alertId);
  if (!row) throw new NotFoundError('Alert', alertId);
  return toAlertDto(row);
}

/**
 * Raises an alert and pushes it to every connected control room for the tenant.
 *
 * Most alerts arrive from the AI services rather than this endpoint; the route
 * exists so an operator can raise one manually and so the ingest path has a
 * single, audited entry point.
 */
export async function raiseAlert(user: AuthUser, input: RaiseAlertInput): Promise<Alert> {
  const row = await insertAlert(user.organizationId, {
    type: input.type,
    severity: input.severity,
    title: input.title,
    message: input.message,
    ...(input.vehicleId ? { vehicle: { connect: { id: input.vehicleId } } } : {}),
    ...(input.driverId ? { driver: { connect: { id: input.driverId } } } : {}),
    ...(input.incidentId ? { incident: { connect: { id: input.incidentId } } } : {}),
  });

  const dto = toAlertDto(row);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.CREATE,
    resourceType: 'alert',
    resourceId: row.id,
    metadata: { type: input.type, severity: input.severity },
  });

  emitAlertRaised(dto);

  return dto;
}

export async function acknowledgeAlert(
  user: AuthUser,
  alertId: string,
  input: AcknowledgeAlertInput,
): Promise<Alert> {
  const existing = await findAlertById(user.organizationId, alertId);
  if (!existing) throw new NotFoundError('Alert', alertId);

  if (existing.status !== AlertStatus.OPEN) {
    throw new ConflictError(`This alert is already ${existing.status.toLowerCase()}.`);
  }

  const row = await updateAlertById(user.organizationId, alertId, {
    status: AlertStatus.ACKNOWLEDGED,
    acknowledgedAt: new Date(),
    acknowledgedBy: { connect: { id: user.id } },
  });

  if (!row) throw new NotFoundError('Alert', alertId);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'alert',
    resourceId: alertId,
    metadata: { acknowledged: true, note: input.note ?? null },
  });

  const dto = toAlertDto(row);
  emitAlertAcknowledged(dto);
  return dto;
}

/** Suppression closes the alert without treating it as handled. */
export async function suppressAlert(
  user: AuthUser,
  alertId: string,
  input: SuppressAlertInput,
): Promise<Alert> {
  const row = await updateAlertById(user.organizationId, alertId, {
    status: AlertStatus.SUPPRESSED,
    acknowledgedAt: new Date(),
    acknowledgedBy: { connect: { id: user.id } },
  });

  if (!row) throw new NotFoundError('Alert', alertId);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'alert',
    resourceId: alertId,
    metadata: { suppressed: true, reason: input.reason },
  });

  return toAlertDto(row);
}
