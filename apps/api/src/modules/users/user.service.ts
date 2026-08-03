import { randomBytes } from 'node:crypto';
import type { AuthUser, Paginated, User } from '@aegisdrive/types';
import { AuditAction, RoleName, UserStatus } from '@aegisdrive/types';
import { ConflictError, NotFoundError, normalisePagination, paginate } from '@aegisdrive/shared';
import { moduleLogger } from '../../core/logger';
import { recordAudit } from '../audit-logs/audit.service';
import { invalidateAuthUser } from '../auth/auth.repository';
import { revokeAllSessionsForUser } from '../auth/auth.repository';
import { hashPassword } from '../auth/password.service';
import {
  findUserById,
  findUsers,
  insertUser,
  replaceUserRoles,
  setUserPassword,
  updateUserById,
} from './user.repository';
import { toUserDto } from './user.mapper';
import type {
  AssignRolesInput,
  ChangeUserStatusInput,
  InviteUserInput,
  ListUsersQuery,
  ResetPasswordInput,
  UpdateUserInput,
} from './user.schema';

const log = moduleLogger('users');

export async function listUsers(user: AuthUser, query: ListUsersQuery): Promise<Paginated<User>> {
  const pagination = normalisePagination({ ...query, sortOrder: query.sortOrder ?? 'asc' });

  const { rows, total } = await findUsers({
    ...pagination,
    organizationId: user.organizationId,
    status: query.status,
    role: query.role,
    search: query.search,
  });

  return paginate(rows.map(toUserDto), pagination, total);
}

export async function getUser(actor: AuthUser, userId: string): Promise<User> {
  const row = await findUserById(actor.organizationId, userId);
  if (!row) throw new NotFoundError('User', userId);
  return toUserDto(row);
}

/**
 * Invites a user into the actor's organization.
 *
 * Tenancy is taken from the actor, never from the request body: an admin can
 * only ever create users inside their own organization.
 */
export async function inviteUser(actor: AuthUser, input: InviteUserInput): Promise<User> {
  // Without a temporary password the account gets an unguessable random digest
  // that nothing can satisfy, so the only way in is the invite flow.
  const passwordHash = await hashPassword(
    input.temporaryPassword ?? randomBytes(32).toString('hex'),
  );

  const row = await insertUser({
    organizationId: actor.organizationId,
    email: input.email,
    passwordHash,
    firstName: input.firstName,
    lastName: input.lastName,
    phoneNumber: input.phoneNumber ?? null,
    status: input.temporaryPassword ? UserStatus.ACTIVE : UserStatus.INVITED,
    roles: input.roles,
  });

  void recordAudit({
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    actorEmail: actor.email,
    action: AuditAction.CREATE,
    resourceType: 'user',
    resourceId: row.id,
    metadata: { email: input.email, roles: input.roles },
  });

  return toUserDto(row);
}

export async function updateUser(
  actor: AuthUser,
  userId: string,
  input: UpdateUserInput,
): Promise<User> {
  const { phoneNumber, avatarUrl, ...scalars } = input;

  const row = await updateUserById(actor.organizationId, userId, {
    ...scalars,
    ...(phoneNumber !== undefined ? { phoneNumber: phoneNumber ?? null } : {}),
    ...(avatarUrl !== undefined ? { avatarUrl: avatarUrl ?? null } : {}),
  });

  if (!row) throw new NotFoundError('User', userId);

  await invalidateAuthUser(userId);

  void recordAudit({
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    actorEmail: actor.email,
    action: AuditAction.UPDATE,
    resourceType: 'user',
    resourceId: userId,
    metadata: { changed: Object.keys(input) },
  });

  return toUserDto(row);
}

/**
 * Changes an account's status.
 *
 * Suspending or deactivating an account revokes every session immediately —
 * leaving live refresh tokens behind would make the suspension advisory rather
 * than real.
 */
export async function changeUserStatus(
  actor: AuthUser,
  userId: string,
  input: ChangeUserStatusInput,
): Promise<User> {
  if (userId === actor.id && input.status !== UserStatus.ACTIVE) {
    throw new ConflictError('You cannot suspend or deactivate your own account.');
  }

  const row = await updateUserById(actor.organizationId, userId, { status: input.status });
  if (!row) throw new NotFoundError('User', userId);

  await invalidateAuthUser(userId);

  if (input.status !== UserStatus.ACTIVE) {
    const revoked = await revokeAllSessionsForUser(userId);
    log.info({ userId, status: input.status, revoked }, 'Sessions revoked on status change');
  }

  void recordAudit({
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    actorEmail: actor.email,
    action: AuditAction.UPDATE,
    resourceType: 'user',
    resourceId: userId,
    metadata: { status: input.status, reason: input.reason },
  });

  return toUserDto(row);
}

/** Replaces a user's roles. An admin cannot strip their own ADMIN role. */
export async function assignRoles(
  actor: AuthUser,
  userId: string,
  input: AssignRolesInput,
): Promise<User> {
  const existing = await findUserById(actor.organizationId, userId);
  if (!existing) throw new NotFoundError('User', userId);

  if (userId === actor.id && !input.roles.includes(RoleName.ADMIN)) {
    throw new ConflictError(
      'You cannot remove your own administrator role. Ask another administrator to do it.',
    );
  }

  const row = await replaceUserRoles(userId, input.roles);
  if (!row) throw new NotFoundError('User', userId);

  await invalidateAuthUser(userId);

  void recordAudit({
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    actorEmail: actor.email,
    action: AuditAction.UPDATE,
    resourceType: 'user',
    resourceId: userId,
    metadata: {
      from: existing.roles.map((assignment) => assignment.role.name),
      to: input.roles,
    },
  });

  return toUserDto(row);
}

/** Administrative reset. Every existing session is destroyed. */
export async function resetPassword(
  actor: AuthUser,
  userId: string,
  input: ResetPasswordInput,
): Promise<void> {
  const existing = await findUserById(actor.organizationId, userId);
  if (!existing) throw new NotFoundError('User', userId);

  await setUserPassword(userId, await hashPassword(input.newPassword));
  const revoked = await revokeAllSessionsForUser(userId);
  await invalidateAuthUser(userId);

  void recordAudit({
    organizationId: actor.organizationId,
    actorUserId: actor.id,
    actorEmail: actor.email,
    action: AuditAction.UPDATE,
    resourceType: 'user',
    resourceId: userId,
    metadata: { passwordReset: true, sessionsRevoked: revoked },
  });
}
