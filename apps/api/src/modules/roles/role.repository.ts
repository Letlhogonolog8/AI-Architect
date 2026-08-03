import type { Prisma } from '@prisma/client';
import type { Permission, RoleName } from '@aegisdrive/types';
import { prisma } from '../../db/prisma';

const WITH_USER_COUNT = { _count: { select: { users: true } } } as const;

export type RoleRow = Prisma.RoleGetPayload<{ include: typeof WITH_USER_COUNT }>;

/**
 * Roles are global, not tenant-scoped.
 *
 * The six roles are part of the product's security model rather than tenant
 * configuration; a tenant that could invent a role could invent one holding
 * `evidence:purge`. Tenants differ in who holds which role, not in what the
 * roles mean.
 */
export async function findRoles(): Promise<RoleRow[]> {
  return prisma.role.findMany({ orderBy: { name: 'asc' }, include: WITH_USER_COUNT });
}

export async function findRoleByName(name: RoleName): Promise<RoleRow | null> {
  return prisma.role.findUnique({ where: { name }, include: WITH_USER_COUNT });
}

/**
 * Reconciles a role's grant set against the RBAC matrix. Used by the seed and
 * by the startup consistency check — not exposed over HTTP.
 */
export async function syncRolePermissions(
  name: RoleName,
  displayName: string,
  description: string,
  permissions: readonly Permission[],
): Promise<void> {
  await prisma.role.upsert({
    where: { name },
    create: {
      name,
      displayName,
      description,
      permissions: [...permissions],
      isSystemRole: true,
    },
    update: { displayName, description, permissions: [...permissions] },
  });
}
