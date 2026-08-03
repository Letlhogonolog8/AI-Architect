import type { Driver, Prisma } from '@prisma/client';
import type { DriverStatus, PaginationQuery } from '@aegisdrive/types';
import { toSkipTake } from '@aegisdrive/shared';
import { prisma } from '../../db/prisma';

export interface DriverFilter extends PaginationQuery {
  organizationId: string;
  status?: DriverStatus;
  search?: string;
}

function buildWhere(filter: DriverFilter): Prisma.DriverWhereInput {
  return {
    organizationId: filter.organizationId,
    status: filter.status,
    ...(filter.search
      ? {
          OR: [
            { firstName: { contains: filter.search, mode: 'insensitive' } },
            { lastName: { contains: filter.search, mode: 'insensitive' } },
            { licenceNumber: { contains: filter.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

export async function findDrivers(filter: DriverFilter) {
  const where = buildWhere(filter);
  const { skip, take } = toSkipTake(filter);

  const [rows, total] = await prisma.$transaction([
    prisma.driver.findMany({
      where,
      orderBy: { lastName: filter.sortOrder ?? 'asc' },
      skip,
      take,
      include: { assignedVehicle: { select: { id: true } } },
    }),
    prisma.driver.count({ where }),
  ]);

  return { rows, total };
}

export async function findDriverById(organizationId: string, driverId: string) {
  return prisma.driver.findFirst({
    where: { id: driverId, organizationId },
    include: { assignedVehicle: { select: { id: true } } },
  });
}

export async function insertDriver(
  organizationId: string,
  data: Omit<Prisma.DriverCreateInput, 'organization'>,
) {
  return prisma.driver.create({
    data: { ...data, organization: { connect: { id: organizationId } } },
    include: { assignedVehicle: { select: { id: true } } },
  });
}

export async function updateDriverById(
  organizationId: string,
  driverId: string,
  data: Prisma.DriverUpdateInput,
) {
  const result = await prisma.driver.updateMany({ where: { id: driverId, organizationId }, data });
  if (result.count === 0) return null;

  return prisma.driver.findUnique({
    where: { id: driverId },
    include: { assignedVehicle: { select: { id: true } } },
  });
}

export async function deleteDriverById(organizationId: string, driverId: string): Promise<boolean> {
  const result = await prisma.driver.deleteMany({ where: { id: driverId, organizationId } });
  return result.count > 0;
}

export async function countDriversOnDuty(organizationId: string): Promise<number> {
  return prisma.driver.count({
    where: { organizationId, status: { in: ['ON_DUTY', 'DRIVING'] } },
  });
}

export type DriverRowWithVehicle = Driver & { assignedVehicle: { id: string } | null };
