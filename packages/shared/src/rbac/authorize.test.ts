import { describe, expect, it } from 'vitest';
import { RoleName, type AuthUser } from '@aegisdrive/types';
import {
  belongsToOrganization,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  hasRole,
  permissionsForRoles,
} from './authorize';
import { ROLE_PERMISSIONS } from './role-permissions';

function principal(overrides: Partial<AuthUser> = {}): Pick<AuthUser, 'permissions'> {
  return { permissions: [...ROLE_PERMISSIONS[RoleName.OPERATOR]], ...overrides };
}

describe('permissionsForRoles', () => {
  it('unions permissions across multiple roles without duplicates', () => {
    const granted = permissionsForRoles([RoleName.DRIVER, RoleName.OPERATOR]);
    const unique = new Set(granted);

    expect(unique.size).toBe(granted.length);
    for (const permission of ROLE_PERMISSIONS[RoleName.DRIVER]) {
      expect(granted).toContain(permission);
    }
  });

  it('returns nothing for an empty role list', () => {
    expect(permissionsForRoles([])).toEqual([]);
  });
});

describe('hasPermission', () => {
  it('is true when the principal holds the exact permission', () => {
    expect(hasPermission(principal(), 'fleet:read')).toBe(true);
  });

  it('is false for a permission outside the role, such as tenant administration', () => {
    // OPERATOR is deliberately denied organization:manage — this is the boundary
    // that keeps day-to-day monitoring separate from tenancy control.
    expect(hasPermission(principal(), 'organization:manage')).toBe(false);
  });

  it('is false for a null principal rather than throwing', () => {
    expect(hasPermission(null, 'fleet:read')).toBe(false);
    expect(hasPermission(undefined, 'fleet:read')).toBe(false);
  });
});

describe('hasAnyPermission', () => {
  it('is true when at least one permission matches', () => {
    expect(hasAnyPermission(principal(), ['organization:manage', 'fleet:read'])).toBe(true);
  });

  it('is true for an empty permission list — nothing to require', () => {
    expect(hasAnyPermission(principal(), [])).toBe(true);
  });

  it('is false for a null principal even with an empty list', () => {
    expect(hasAnyPermission(null, [])).toBe(false);
  });
});

describe('hasAllPermissions', () => {
  it('is false when only some permissions are held', () => {
    expect(hasAllPermissions(principal(), ['fleet:read', 'organization:manage'])).toBe(false);
  });

  it('is true when every permission is held', () => {
    expect(hasAllPermissions(principal(), ['fleet:read', 'vehicle:read'])).toBe(true);
  });
});

describe('hasRole', () => {
  it('matches on any of the supplied roles', () => {
    expect(hasRole({ roles: [RoleName.OPERATOR] }, [RoleName.ADMIN, RoleName.OPERATOR])).toBe(true);
  });

  it('is false when the principal has none of the roles', () => {
    expect(hasRole({ roles: [RoleName.DRIVER] }, [RoleName.ADMIN, RoleName.OPERATOR])).toBe(false);
  });
});

describe('belongsToOrganization', () => {
  it('is true only for an exact tenant match', () => {
    expect(belongsToOrganization({ organizationId: 'org-1' }, 'org-1')).toBe(true);
  });

  it('is false across tenants, which is the whole point of the check', () => {
    expect(belongsToOrganization({ organizationId: 'org-1' }, 'org-2')).toBe(false);
  });

  it('is false for a null principal', () => {
    expect(belongsToOrganization(null, 'org-1')).toBe(false);
  });
});
