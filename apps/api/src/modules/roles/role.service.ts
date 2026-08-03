import type { AuthUser, Permission, Role, RoleName } from '@aegisdrive/types';
import { NotFoundError } from '@aegisdrive/shared';
import { findRoleByName, findRoles, type RoleRow } from './role.repository';

function toRoleDto(row: RoleRow): Role {
  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    description: row.description,
    permissions: row.permissions as Permission[],
    isSystemRole: row.isSystemRole,
    userCount: row._count.users,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * The Roles page is a read-only view of the authorisation policy.
 *
 * There is no create, update or delete here. Changing what a role can do is a
 * change to `ROLE_PERMISSIONS` in `@aegisdrive/shared` — reviewed, versioned
 * and deployed — not a form submission. That is deliberate: an editable
 * permission matrix is a privilege-escalation primitive.
 */
export async function listRoles(_user: AuthUser): Promise<Role[]> {
  const rows = await findRoles();
  return rows.map(toRoleDto);
}

export async function getRole(_user: AuthUser, name: RoleName): Promise<Role> {
  const row = await findRoleByName(name);
  if (!row) throw new NotFoundError('Role', name);
  return toRoleDto(row);
}
