import type { AuthUser, Organization } from '@aegisdrive/types';
import { AuditAction } from '@aegisdrive/types';
import { NotFoundError } from '@aegisdrive/shared';
import { recordAudit } from '../audit-logs/audit.service';
import {
  findOrganizationById,
  updateOrganizationById,
  type OrganizationRow,
} from './organization.repository';
import type { UpdateOrganizationInput } from './organization.schema';

function toOrganizationDto(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    tier: row.tier,
    countryCode: row.countryCode,
    timezone: row.timezone,
    isActive: row.isActive,
    vehicleCount: row._count.vehicles,
    userCount: row._count.users,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * A principal can only ever read or write their own organization. The id comes
 * from the token, never from the URL, so there is no tenant-id parameter to
 * tamper with.
 */
export async function getMyOrganization(user: AuthUser): Promise<Organization> {
  const row = await findOrganizationById(user.organizationId);
  if (!row) throw new NotFoundError('Organization', user.organizationId);
  return toOrganizationDto(row);
}

export async function updateMyOrganization(
  user: AuthUser,
  input: UpdateOrganizationInput,
): Promise<Organization> {
  const row = await updateOrganizationById(user.organizationId, input);
  if (!row) throw new NotFoundError('Organization', user.organizationId);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'organization',
    resourceId: user.organizationId,
    metadata: { changed: Object.keys(input) },
  });

  return toOrganizationDto(row);
}
