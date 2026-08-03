import type { Prisma, Vehicle } from '@prisma/client';
import type {
  PaginationQuery,
  ProtectionMode,
  ThreatLevel,
  VehicleStatus,
  VehicleType,
} from '@aegisdrive/types';
import { toSkipTake } from '@aegisdrive/shared';
import { prisma } from '../../db/prisma';

/**
 * Vehicle persistence.
 *
 * Every function takes `organizationId` as its first argument and puts it in
 * the `where` clause. That is the tenant boundary: a repository method that can
 * be called without a tenant is a data-leak waiting for a careless controller.
 */

export interface VehicleFilter extends PaginationQuery {
  organizationId: string;
  status?: VehicleStatus;
  type?: VehicleType;
  threatLevel?: ThreatLevel;
  protectionMode?: ProtectionMode;
  assignedDriverId?: string;
  search?: string;
}

const SORTABLE_FIELDS = new Set<keyof Prisma.VehicleOrderByWithRelationInput>([
  'registrationNumber',
  'riskScore',
  'status',
  'lastSeenAt',
  'createdAt',
  'updatedAt',
]);

/**
 * Whitelisted sorting. Passing an arbitrary caller-supplied string to Prisma's
 * `orderBy` lets a client sort by any column, including ones deliberately kept
 * out of the DTO.
 */
function buildOrderBy(filter: VehicleFilter): Prisma.VehicleOrderByWithRelationInput {
  const field = filter.sortBy as keyof Prisma.VehicleOrderByWithRelationInput | undefined;
  if (field && SORTABLE_FIELDS.has(field)) {
    return { [field]: filter.sortOrder ?? 'desc' };
  }
  return { updatedAt: 'desc' };
}

function buildWhere(filter: VehicleFilter): Prisma.VehicleWhereInput {
  return {
    organizationId: filter.organizationId,
    status: filter.status,
    type: filter.type,
    threatLevel: filter.threatLevel,
    protectionMode: filter.protectionMode,
    assignedDriverId: filter.assignedDriverId,
    ...(filter.search
      ? {
          OR: [
            { registrationNumber: { contains: filter.search, mode: 'insensitive' } },
            { vin: { contains: filter.search, mode: 'insensitive' } },
            { make: { contains: filter.search, mode: 'insensitive' } },
            { model: { contains: filter.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

export async function findVehicles(filter: VehicleFilter) {
  const where = buildWhere(filter);
  const { skip, take } = toSkipTake(filter);

  const [rows, total] = await prisma.$transaction([
    prisma.vehicle.findMany({ where, orderBy: buildOrderBy(filter), skip, take }),
    prisma.vehicle.count({ where }),
  ]);

  return { rows, total };
}

export async function findVehicleById(
  organizationId: string,
  vehicleId: string,
): Promise<Vehicle | null> {
  return prisma.vehicle.findFirst({ where: { id: vehicleId, organizationId } });
}

export async function insertVehicle(
  organizationId: string,
  data: Omit<Prisma.VehicleCreateInput, 'organization'>,
): Promise<Vehicle> {
  return prisma.vehicle.create({
    data: { ...data, organization: { connect: { id: organizationId } } },
  });
}

/**
 * Scoped update. `updateMany` is used rather than `update` because it accepts a
 * compound `where` — an `update` keyed on id alone would let a caller from one
 * tenant modify another's row if the id ever leaked.
 */
export async function updateVehicleById(
  organizationId: string,
  vehicleId: string,
  data: Prisma.VehicleUpdateInput,
): Promise<Vehicle | null> {
  const result = await prisma.vehicle.updateMany({
    where: { id: vehicleId, organizationId },
    data,
  });

  if (result.count === 0) return null;

  return prisma.vehicle.findUnique({ where: { id: vehicleId } });
}

export async function deleteVehicleById(
  organizationId: string,
  vehicleId: string,
): Promise<boolean> {
  const result = await prisma.vehicle.deleteMany({ where: { id: vehicleId, organizationId } });
  return result.count > 0;
}

/**
 * Writes the denormalised position columns from a telemetry frame.
 *
 * Called on the ingest hot path, so it is a single narrow update rather than a
 * read-modify-write.
 */
export async function updateLastPosition(
  vehicleId: string,
  position: {
    longitude: number;
    latitude: number;
    heading?: number | null;
    speedKph?: number | null;
    recordedAt: Date;
  },
): Promise<void> {
  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: {
      lastLongitude: position.longitude,
      lastLatitude: position.latitude,
      lastHeading: position.heading ?? null,
      lastSpeedKph: position.speedKph ?? null,
      lastSeenAt: position.recordedAt,
    },
  });
}

/** Counts by status for one tenant, in a single grouped query. */
export async function countVehiclesByStatus(organizationId: string) {
  return prisma.vehicle.groupBy({
    by: ['status'],
    where: { organizationId },
    _count: { _all: true },
  });
}

export async function averageRiskScore(organizationId: string): Promise<number> {
  const result = await prisma.vehicle.aggregate({
    where: { organizationId },
    _avg: { riskScore: true },
  });
  return Math.round(result._avg.riskScore ?? 0);
}
