import type { RoleName, User } from '@aegisdrive/types';
import type { UserRowWithRoles } from './user.repository';

/**
 * Prisma row → wire DTO.
 *
 * The `password` and `mfaSecret` columns are structurally absent from the
 * result: this function names every field it returns, so a new secret column
 * added to the schema cannot leak by being picked up implicitly.
 */
export function toUserDto(row: UserRowWithRoles): User {
  return {
    id: row.id,
    organizationId: row.organizationId,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    phoneNumber: row.phoneNumber,
    avatarUrl: row.avatarUrl,
    status: row.status,
    roles: row.roles.map((assignment) => assignment.role.name as RoleName),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    mfaEnabled: row.mfaEnabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
