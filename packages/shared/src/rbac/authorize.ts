import type { AuthUser, Permission, RoleName } from '@aegisdrive/types';
import { ROLE_PERMISSIONS } from './role-permissions';

/** Union of every permission granted by the supplied roles. */
export function permissionsForRoles(roles: readonly RoleName[]): Permission[] {
  const granted = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) {
      granted.add(permission);
    }
  }
  return [...granted];
}

/** True when the principal holds the exact permission. */
export function hasPermission(
  principal: Pick<AuthUser, 'permissions'> | null | undefined,
  permission: Permission,
): boolean {
  return principal?.permissions.includes(permission) ?? false;
}

/** True when the principal holds at least one of the permissions. */
export function hasAnyPermission(
  principal: Pick<AuthUser, 'permissions'> | null | undefined,
  permissions: readonly Permission[],
): boolean {
  if (!principal) return false;
  if (permissions.length === 0) return true;
  return permissions.some((permission) => principal.permissions.includes(permission));
}

/** True only when the principal holds every permission. */
export function hasAllPermissions(
  principal: Pick<AuthUser, 'permissions'> | null | undefined,
  permissions: readonly Permission[],
): boolean {
  if (!principal) return false;
  return permissions.every((permission) => principal.permissions.includes(permission));
}

/** True when the principal has been assigned any of the roles. */
export function hasRole(
  principal: Pick<AuthUser, 'roles'> | null | undefined,
  roles: readonly RoleName[],
): boolean {
  if (!principal) return false;
  return roles.some((role) => principal.roles.includes(role));
}

/**
 * Tenant isolation check. Every repository read is already organization-scoped;
 * this is the belt-and-braces assertion for handlers that resolve a resource by
 * id before filtering.
 */
export function belongsToOrganization(
  principal: Pick<AuthUser, 'organizationId'> | null | undefined,
  resourceOrganizationId: string,
): boolean {
  return principal?.organizationId === resourceOrganizationId;
}
