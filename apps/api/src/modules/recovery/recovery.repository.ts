import type { Prisma } from '@prisma/client';
import type {
  IncidentSeverity,
  PaginationQuery,
  RecoveryStatus,
  GeofenceKind,
} from '@aegisdrive/types';
import { ACTIVE_SEARCH_STATUSES, OPEN_RECOVERY_STATUSES } from '@aegisdrive/types';
import { toSkipTake } from '@aegisdrive/shared';
import { prisma } from '../../db/prisma';

/** Detail includes for a single case: recent track plus the full mesh. */
const CASE_DETAIL_INCLUDE = {
  track: { orderBy: { recordedAt: 'desc' }, take: 50 },
  searchers: { orderBy: { assignedAt: 'desc' } },
  geofences: { orderBy: { createdAt: 'desc' } },
  droneTasks: { orderBy: { requestedAt: 'desc' } },
} as const satisfies Prisma.RecoveryCaseInclude;

// ------------------------------------------------------------------- cases

export interface CaseFilter extends PaginationQuery {
  organizationId: string;
  status?: RecoveryStatus;
  priority?: IncidentSeverity;
  vehicleId?: string;
  openOnly?: boolean;
  from?: Date;
  to?: Date;
}

function buildCaseWhere(filter: CaseFilter): Prisma.RecoveryCaseWhereInput {
  return {
    organizationId: filter.organizationId,
    status: filter.openOnly ? { in: [...OPEN_RECOVERY_STATUSES] } : filter.status,
    priority: filter.priority,
    vehicleId: filter.vehicleId,
    openedAt: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
  };
}

export async function findCases(filter: CaseFilter) {
  const where = buildCaseWhere(filter);
  const { skip, take } = toSkipTake(filter);

  const [rows, total] = await prisma.$transaction([
    prisma.recoveryCase.findMany({ where, orderBy: { openedAt: 'desc' }, skip, take }),
    prisma.recoveryCase.count({ where }),
  ]);

  return { rows, total };
}

export async function findCaseById(organizationId: string, caseId: string) {
  return prisma.recoveryCase.findFirst({
    where: { id: caseId, organizationId },
    include: CASE_DETAIL_INCLUDE,
  });
}

export async function insertCase(
  organizationId: string,
  data: Omit<Prisma.RecoveryCaseCreateInput, 'organization'>,
) {
  return prisma.recoveryCase.create({
    data: { ...data, organization: { connect: { id: organizationId } } },
    include: CASE_DETAIL_INCLUDE,
  });
}

export async function updateCaseById(
  organizationId: string,
  caseId: string,
  data: Prisma.RecoveryCaseUpdateInput,
) {
  const result = await prisma.recoveryCase.updateMany({
    where: { id: caseId, organizationId },
    data,
  });
  if (result.count === 0) return null;
  return prisma.recoveryCase.findUnique({ where: { id: caseId }, include: CASE_DETAIL_INCLUDE });
}

/** An open case already running for this vehicle, so a second is not opened. */
export async function findOpenCaseForVehicle(organizationId: string, vehicleId: string) {
  return prisma.recoveryCase.findFirst({
    where: { organizationId, vehicleId, status: { in: [...OPEN_RECOVERY_STATUSES] } },
    orderBy: { openedAt: 'desc' },
  });
}

export async function countCasesByStatus(organizationId: string) {
  return prisma.recoveryCase.groupBy({
    by: ['status'],
    where: { organizationId },
    _count: { _all: true },
  });
}

/**
 * Terminal cases within the trailing window, for the dashboard's rate and
 * mean-time figures. One query returns everything the aggregation needs.
 */
export async function findTerminalCasesSince(organizationId: string, since: Date) {
  return prisma.recoveryCase.findMany({
    where: {
      organizationId,
      status: { in: ['RECOVERED', 'LOST', 'CLOSED'] },
      OR: [{ recoveredAt: { gte: since } }, { closedAt: { gte: since } }],
    },
    select: { status: true, openedAt: true, recoveredAt: true },
  });
}

/**
 * Allocates the next per-tenant, per-year recovery reference.
 *
 * Serialisable, like the incident reference allocator, so two recoveries opened
 * in the same millisecond cannot be handed the same number.
 */
export async function allocateRecoveryReference(organizationId: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `REC-${year}-`;

  return prisma.$transaction(
    async (tx) => {
      const latest = await tx.recoveryCase.findFirst({
        where: { organizationId, reference: { startsWith: prefix } },
        orderBy: { reference: 'desc' },
        select: { reference: true },
      });

      const lastSequence = latest ? Number.parseInt(latest.reference.slice(prefix.length), 10) : 0;
      const next = Number.isNaN(lastSequence) ? 1 : lastSequence + 1;

      return `${prefix}${String(next).padStart(6, '0')}`;
    },
    { isolationLevel: 'Serializable' },
  );
}

// ------------------------------------------------------------------- track

export async function insertTrackPoint(row: Prisma.RecoveryTrackPointCreateManyInput) {
  return prisma.recoveryTrackPoint.create({ data: row });
}

export async function findTrack(
  organizationId: string,
  caseId: string,
  pagination: PaginationQuery,
) {
  const where: Prisma.RecoveryTrackPointWhereInput = { organizationId, recoveryCaseId: caseId };
  const { skip, take } = toSkipTake(pagination);

  const [rows, total] = await prisma.$transaction([
    prisma.recoveryTrackPoint.findMany({ where, orderBy: { recordedAt: 'desc' }, skip, take }),
    prisma.recoveryTrackPoint.count({ where }),
  ]);

  return { rows, total };
}

// --------------------------------------------------------------- searchers

export async function insertSearcher(row: Prisma.SearchAssignmentCreateManyInput) {
  return prisma.searchAssignment.create({ data: row });
}

export async function findSearcherById(organizationId: string, assignmentId: string) {
  return prisma.searchAssignment.findFirst({ where: { id: assignmentId, organizationId } });
}

export async function findSearchers(organizationId: string, caseId: string) {
  return prisma.searchAssignment.findMany({
    where: { organizationId, recoveryCaseId: caseId },
    orderBy: { assignedAt: 'desc' },
  });
}

export async function updateSearcherById(
  organizationId: string,
  assignmentId: string,
  data: Prisma.SearchAssignmentUpdateInput,
) {
  const result = await prisma.searchAssignment.updateMany({
    where: { id: assignmentId, organizationId },
    data,
  });
  if (result.count === 0) return null;
  return prisma.searchAssignment.findUnique({ where: { id: assignmentId } });
}

export async function countActiveSearchers(organizationId: string): Promise<number> {
  return prisma.searchAssignment.count({
    where: { organizationId, status: { in: [...ACTIVE_SEARCH_STATUSES] } },
  });
}

// -------------------------------------------------------------- geofencing

export interface GeofenceFilter extends PaginationQuery {
  organizationId: string;
  kind?: GeofenceKind;
  recoveryCaseId?: string;
  activeOnly?: boolean;
}

export async function findGeofences(filter: GeofenceFilter) {
  const where: Prisma.GeofenceWhereInput = {
    organizationId: filter.organizationId,
    kind: filter.kind,
    recoveryCaseId: filter.recoveryCaseId,
    ...(filter.activeOnly ? { isActive: true } : {}),
  };
  const { skip, take } = toSkipTake(filter);

  const [rows, total] = await prisma.$transaction([
    prisma.geofence.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.geofence.count({ where }),
  ]);

  return { rows, total };
}

export async function findGeofenceById(organizationId: string, geofenceId: string) {
  return prisma.geofence.findFirst({ where: { id: geofenceId, organizationId } });
}

export async function insertGeofence(
  organizationId: string,
  data: Omit<Prisma.GeofenceCreateInput, 'organization'>,
) {
  return prisma.geofence.create({
    data: { ...data, organization: { connect: { id: organizationId } } },
  });
}

export async function updateGeofenceById(
  organizationId: string,
  geofenceId: string,
  data: Prisma.GeofenceUpdateInput,
) {
  const result = await prisma.geofence.updateMany({
    where: { id: geofenceId, organizationId },
    data,
  });
  if (result.count === 0) return null;
  return prisma.geofence.findUnique({ where: { id: geofenceId } });
}

/** Active, unexpired fences to evaluate a position against. */
export async function findActiveGeofences(organizationId: string) {
  const now = new Date();
  return prisma.geofence.findMany({
    where: {
      organizationId,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
}

export async function insertGeofenceEvent(row: Prisma.GeofenceEventCreateManyInput) {
  return prisma.geofenceEvent.create({ data: row });
}

export async function findGeofenceEvents(
  organizationId: string,
  geofenceId: string,
  pagination: PaginationQuery,
) {
  const where: Prisma.GeofenceEventWhereInput = { organizationId, geofenceId };
  const { skip, take } = toSkipTake(pagination);

  const [rows, total] = await prisma.$transaction([
    prisma.geofenceEvent.findMany({ where, orderBy: { occurredAt: 'desc' }, skip, take }),
    prisma.geofenceEvent.count({ where }),
  ]);

  return { rows, total };
}

/** The most recent crossing for a (fence, vehicle) pair — the before-state. */
export async function lastGeofenceEventForVehicle(
  organizationId: string,
  geofenceId: string,
  vehicleId: string,
) {
  return prisma.geofenceEvent.findFirst({
    where: { organizationId, geofenceId, vehicleId },
    orderBy: { occurredAt: 'desc' },
  });
}

export async function countActiveGeofences(organizationId: string): Promise<number> {
  const now = new Date();
  return prisma.geofence.count({
    where: {
      organizationId,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
}

export async function countGeofenceBreachesSince(
  organizationId: string,
  since: Date,
): Promise<number> {
  return prisma.geofenceEvent.count({
    where: { organizationId, occurredAt: { gte: since } },
  });
}

// ------------------------------------------------------------------ drones

export async function insertDroneTask(row: Prisma.DroneTaskCreateManyInput) {
  return prisma.droneTask.create({ data: row });
}

export async function findDroneTaskById(organizationId: string, taskId: string) {
  return prisma.droneTask.findFirst({ where: { id: taskId, organizationId } });
}

export async function findDroneTasks(organizationId: string, caseId: string) {
  return prisma.droneTask.findMany({
    where: { organizationId, recoveryCaseId: caseId },
    orderBy: { requestedAt: 'desc' },
  });
}

export async function updateDroneTaskById(
  organizationId: string,
  taskId: string,
  data: Prisma.DroneTaskUpdateInput,
) {
  const result = await prisma.droneTask.updateMany({
    where: { id: taskId, organizationId },
    data,
  });
  if (result.count === 0) return null;
  return prisma.droneTask.findUnique({ where: { id: taskId } });
}

export async function countDroneTasks(organizationId: string): Promise<number> {
  return prisma.droneTask.count({ where: { organizationId } });
}

export async function countAirborneDrones(organizationId: string): Promise<number> {
  return prisma.droneTask.count({
    where: { organizationId, status: { in: ['LAUNCHED', 'ON_STATION', 'RETURNING'] } },
  });
}
