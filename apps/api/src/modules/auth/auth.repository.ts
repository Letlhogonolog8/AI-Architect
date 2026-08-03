import type { AuthUser, Permission, RoleName } from '@aegisdrive/types';
import { CacheKey, CacheTtlSeconds } from '@aegisdrive/shared';
import { cached, invalidate } from '../../cache/redis';
import { prisma } from '../../db/prisma';
import { hashToken } from './token.service';

/**
 * Identity reads.
 *
 * `loadAuthUser` runs on every authenticated request, so it is cached. The TTL
 * is short (5 minutes) rather than absent because it bounds how long a
 * revoked role stays effective — `invalidateAuthUser` closes that window on
 * any deliberate change.
 */
export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  return cached(CacheKey.userPermissions(userId), CacheTtlSeconds.userPermissions, async () => {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        organizationId: true,
        status: true,
        roles: { select: { role: { select: { name: true, permissions: true } } } },
      },
    });

    if (!row) return null;

    const roles = row.roles.map((assignment) => assignment.role.name as RoleName);
    const permissions = [
      ...new Set(row.roles.flatMap((assignment) => assignment.role.permissions as Permission[])),
    ];

    return {
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      organizationId: row.organizationId,
      status: row.status,
      roles,
      permissions,
    } satisfies AuthUser;
  });
}

/** Drops the cached principal. Call after any role, status or tenancy change. */
export async function invalidateAuthUser(userId: string): Promise<void> {
  await invalidate(CacheKey.userPermissions(userId));
}

/** Credential lookup for login. Returns the digest, so callers must not leak the row. */
export async function findCredentialsByEmail(email: string) {
  return prisma.user.findFirst({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      email: true,
      password: true,
      status: true,
      organizationId: true,
      failedLoginCount: true,
      lockedUntil: true,
    },
  });
}

export async function createSession(input: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  return prisma.session.create({
    data: {
      userId: input.userId,
      refreshTokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
    },
    select: { id: true },
  });
}

export async function findActiveSessionByToken(token: string) {
  return prisma.session.findFirst({
    where: {
      refreshTokenHash: hashToken(token),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, userId: true, expiresAt: true, replacedById: true },
  });
}

/** Used by replay detection: finds the session even once it has been revoked. */
export async function findAnySessionByToken(token: string) {
  return prisma.session.findUnique({
    where: { refreshTokenHash: hashToken(token) },
    select: { id: true, userId: true, revokedAt: true },
  });
}

export async function revokeSession(sessionId: string, replacedById?: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date(), replacedById: replacedById ?? null },
  });
}

/** Nuclear option: used on refresh-token replay and on "sign out everywhere". */
export async function revokeAllSessionsForUser(userId: string): Promise<number> {
  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export async function listSessionsForUser(userId: string) {
  return prisma.session.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      createdAt: true,
      expiresAt: true,
      revokedAt: true,
    },
  });
}

export async function recordLoginSuccess(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
  });
}

export async function recordLoginFailure(userId: string, lockUntil: Date | null): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: { increment: 1 }, lockedUntil: lockUntil },
  });
}
