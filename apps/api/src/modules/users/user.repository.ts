import type { Prisma } from '@prisma/client';
import type { PaginationQuery, RoleName, UserStatus } from '@aegisdrive/types';
import { toSkipTake } from '@aegisdrive/shared';
import { prisma } from '../../db/prisma';

const WITH_ROLES = { roles: { select: { role: { select: { name: true } } } } } as const;

export type UserRowWithRoles = Prisma.UserGetPayload<{ include: typeof WITH_ROLES }>;

export interface UserFilter extends PaginationQuery {
  organizationId: string;
  status?: UserStatus;
  role?: RoleName;
  search?: string;
}

function buildWhere(filter: UserFilter): Prisma.UserWhereInput {
  return {
    organizationId: filter.organizationId,
    status: filter.status,
    ...(filter.role ? { roles: { some: { role: { name: filter.role } } } } : {}),
    ...(filter.search
      ? {
          OR: [
            { firstName: { contains: filter.search, mode: 'insensitive' } },
            { lastName: { contains: filter.search, mode: 'insensitive' } },
            { email: { contains: filter.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

export async function findUsers(filter: UserFilter) {
  const where = buildWhere(filter);
  const { skip, take } = toSkipTake(filter);

  const [rows, total] = await prisma.$transaction([
    prisma.user.findMany({ where, orderBy: { lastName: 'asc' }, skip, take, include: WITH_ROLES }),
    prisma.user.count({ where }),
  ]);

  return { rows, total };
}

export async function findUserById(organizationId: string, userId: string) {
  return prisma.user.findFirst({ where: { id: userId, organizationId }, include: WITH_ROLES });
}

/**
 * Creates a user and assigns roles in one transaction.
 *
 * Roles are looked up by name rather than id so callers work against the RBAC
 * vocabulary rather than against database keys.
 */
export async function insertUser(input: {
  organizationId: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string | null;
  status: UserStatus;
  roles: RoleName[];
}) {
  return prisma.user.create({
    data: {
      organizationId: input.organizationId,
      email: input.email,
      password: input.passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phoneNumber: input.phoneNumber ?? null,
      status: input.status,
      roles: {
        create: input.roles.map((name) => ({ role: { connect: { name } } })),
      },
    },
    include: WITH_ROLES,
  });
}

export async function updateUserById(
  organizationId: string,
  userId: string,
  data: Prisma.UserUpdateInput,
) {
  const result = await prisma.user.updateMany({ where: { id: userId, organizationId }, data });
  if (result.count === 0) return null;
  return prisma.user.findUnique({ where: { id: userId }, include: WITH_ROLES });
}

/** Replaces the whole role set. Partial updates invite drift between the two lists. */
export async function replaceUserRoles(userId: string, roles: RoleName[]) {
  return prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId } });

    if (roles.length > 0) {
      const roleRows = await tx.role.findMany({
        where: { name: { in: roles } },
        select: { id: true },
      });

      await tx.userRole.createMany({
        data: roleRows.map((role) => ({ userId, roleId: role.id })),
      });
    }

    return tx.user.findUnique({ where: { id: userId }, include: WITH_ROLES });
  });
}

export async function setUserPassword(userId: string, passwordHash: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { password: passwordHash, failedLoginCount: 0, lockedUntil: null },
  });
}

export async function findPasswordDigest(userId: string): Promise<string | null> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
  return row?.password ?? null;
}

export async function countUsers(organizationId: string): Promise<number> {
  return prisma.user.count({ where: { organizationId } });
}
