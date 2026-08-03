import type { Prisma } from '@prisma/client';
import type {
  EmergencyChannel,
  PaginationQuery,
  SosActivationMethod,
  SosStatus,
} from '@aegisdrive/types';
import { OPEN_SOS_STATUSES } from '@aegisdrive/types';
import { toSkipTake } from '@aegisdrive/shared';
import { prisma } from '../../db/prisma';

const WITH_DISPATCHES = {
  dispatches: { orderBy: { createdAt: 'asc' } },
} as const satisfies Prisma.SosActivationInclude;

export interface ActivationFilter extends PaginationQuery {
  organizationId: string;
  status?: SosStatus;
  method?: SosActivationMethod;
  vehicleId?: string;
  driverId?: string;
  openOnly?: boolean;
  from?: Date;
  to?: Date;
}

const SORTABLE_FIELDS = new Set<keyof Prisma.SosActivationOrderByWithRelationInput>([
  'activatedAt',
  'status',
  'method',
  'createdAt',
  'updatedAt',
]);

function buildOrderBy(filter: ActivationFilter): Prisma.SosActivationOrderByWithRelationInput {
  const field = filter.sortBy as keyof Prisma.SosActivationOrderByWithRelationInput | undefined;
  if (field && SORTABLE_FIELDS.has(field)) return { [field]: filter.sortOrder ?? 'desc' };
  return { activatedAt: 'desc' };
}

function buildWhere(filter: ActivationFilter): Prisma.SosActivationWhereInput {
  return {
    organizationId: filter.organizationId,
    status: filter.openOnly ? { in: [...OPEN_SOS_STATUSES] } : filter.status,
    method: filter.method,
    vehicleId: filter.vehicleId,
    driverId: filter.driverId,
    activatedAt: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
  };
}

export async function findActivations(filter: ActivationFilter) {
  const where = buildWhere(filter);
  const { skip, take } = toSkipTake(filter);

  const [rows, total] = await prisma.$transaction([
    prisma.sosActivation.findMany({
      where,
      orderBy: buildOrderBy(filter),
      skip,
      take,
      include: WITH_DISPATCHES,
    }),
    prisma.sosActivation.count({ where }),
  ]);

  return { rows, total };
}

export async function findActivationById(organizationId: string, activationId: string) {
  return prisma.sosActivation.findFirst({
    where: { id: activationId, organizationId },
    include: WITH_DISPATCHES,
  });
}

/**
 * The most recent still-open activation for a vehicle since a cut-off.
 *
 * The dedupe probe: a driver being hijacked may hit the button repeatedly, and
 * several trigger paths can fire within seconds. A repeat inside the window
 * folds into this row rather than opening a second emergency.
 */
export async function findRecentOpenActivationForVehicle(
  organizationId: string,
  vehicleId: string,
  since: Date,
) {
  return prisma.sosActivation.findFirst({
    where: {
      organizationId,
      vehicleId,
      status: { in: [...OPEN_SOS_STATUSES] },
      activatedAt: { gte: since },
    },
    orderBy: { activatedAt: 'desc' },
    include: WITH_DISPATCHES,
  });
}

export async function insertActivation(
  organizationId: string,
  data: Omit<Prisma.SosActivationCreateInput, 'organization'>,
) {
  return prisma.sosActivation.create({
    data: { ...data, organization: { connect: { id: organizationId } } },
    include: WITH_DISPATCHES,
  });
}

export async function updateActivationById(
  organizationId: string,
  activationId: string,
  data: Prisma.SosActivationUpdateInput,
) {
  const result = await prisma.sosActivation.updateMany({
    where: { id: activationId, organizationId },
    data,
  });

  if (result.count === 0) return null;

  return prisma.sosActivation.findUnique({
    where: { id: activationId },
    include: WITH_DISPATCHES,
  });
}

export async function insertDispatches(
  rows: Prisma.EmergencyDispatchCreateManyInput[],
): Promise<number> {
  const result = await prisma.emergencyDispatch.createMany({ data: rows });
  return result.count;
}

/** A single dispatch, returned — used when the caller needs the new id back. */
export async function insertDispatch(row: Prisma.EmergencyDispatchCreateManyInput) {
  return prisma.emergencyDispatch.create({ data: row });
}

/** The vehicle's registration, for the dispatch payload. Tenant-scoped. */
export async function findVehicleRegistration(
  organizationId: string,
  vehicleId: string,
): Promise<string | null> {
  const row = await prisma.vehicle.findFirst({
    where: { id: vehicleId, organizationId },
    select: { registrationNumber: true },
  });
  return row?.registrationNumber ?? null;
}

export async function findDispatchesByActivation(organizationId: string, activationId: string) {
  return prisma.emergencyDispatch.findMany({
    where: { organizationId, activationId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function findDispatchById(organizationId: string, dispatchId: string) {
  return prisma.emergencyDispatch.findFirst({
    where: { id: dispatchId, organizationId },
  });
}

export async function updateDispatchById(
  organizationId: string,
  dispatchId: string,
  data: Prisma.EmergencyDispatchUpdateInput,
) {
  const result = await prisma.emergencyDispatch.updateMany({
    where: { id: dispatchId, organizationId },
    data,
  });

  if (result.count === 0) return null;
  return prisma.emergencyDispatch.findUnique({ where: { id: dispatchId } });
}

/** Cancels every not-yet-delivered dispatch when an activation is stood down. */
export async function cancelPendingDispatches(
  organizationId: string,
  activationId: string,
  channels: readonly EmergencyChannel[] = [],
): Promise<number> {
  const result = await prisma.emergencyDispatch.updateMany({
    where: {
      organizationId,
      activationId,
      status: { in: ['PENDING', 'UNCONFIGURED'] },
      ...(channels.length ? { channel: { in: [...channels] } } : {}),
    },
    data: { status: 'CANCELLED' },
  });
  return result.count;
}

export async function countActivationsByMethod(organizationId: string) {
  return prisma.sosActivation.groupBy({
    by: ['method'],
    where: { organizationId },
    _count: { _all: true },
  });
}
