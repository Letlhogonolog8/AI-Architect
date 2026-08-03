import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';

const WITH_COUNTS = {
  _count: { select: { vehicles: true, users: true } },
} as const;

export type OrganizationRow = Prisma.OrganizationGetPayload<{ include: typeof WITH_COUNTS }>;

export async function findOrganizationById(
  organizationId: string,
): Promise<OrganizationRow | null> {
  return prisma.organization.findUnique({ where: { id: organizationId }, include: WITH_COUNTS });
}

export async function updateOrganizationById(
  organizationId: string,
  data: Prisma.OrganizationUpdateInput,
): Promise<OrganizationRow | null> {
  return prisma.organization.update({
    where: { id: organizationId },
    data,
    include: WITH_COUNTS,
  });
}
