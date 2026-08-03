import type { AuthUser, Driver, Paginated } from '@aegisdrive/types';
import { AuditAction } from '@aegisdrive/types';
import { NotFoundError, normalisePagination, paginate } from '@aegisdrive/shared';
import { recordAudit } from '../audit-logs/audit.service';
import {
  deleteDriverById,
  findDriverById,
  findDrivers,
  insertDriver,
  updateDriverById,
} from './driver.repository';
import { toDriverDto } from './driver.mapper';
import type {
  ChangeDriverStatusInput,
  CreateDriverInput,
  ListDriversQuery,
  UpdateDriverInput,
} from './driver.schema';

export async function listDrivers(
  user: AuthUser,
  query: ListDriversQuery,
): Promise<Paginated<Driver>> {
  const pagination = normalisePagination({ ...query, sortOrder: query.sortOrder ?? 'asc' });

  const { rows, total } = await findDrivers({
    ...pagination,
    organizationId: user.organizationId,
    status: query.status,
    search: query.search,
  });

  return paginate(rows.map(toDriverDto), pagination, total);
}

export async function getDriver(user: AuthUser, driverId: string): Promise<Driver> {
  const row = await findDriverById(user.organizationId, driverId);
  if (!row) throw new NotFoundError('Driver', driverId);
  return toDriverDto(row);
}

export async function createDriver(user: AuthUser, input: CreateDriverInput): Promise<Driver> {
  const row = await insertDriver(user.organizationId, {
    firstName: input.firstName,
    lastName: input.lastName,
    licenceNumber: input.licenceNumber,
    licenceExpiresAt: input.licenceExpiresAt ? new Date(input.licenceExpiresAt) : null,
    phoneNumber: input.phoneNumber,
    emergencyContactName: input.emergencyContactName ?? null,
    emergencyContactPhone: input.emergencyContactPhone ?? null,
    ...(input.userId ? { user: { connect: { id: input.userId } } } : {}),
  });

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.CREATE,
    resourceType: 'driver',
    resourceId: row.id,
  });

  return toDriverDto(row);
}

export async function updateDriver(
  user: AuthUser,
  driverId: string,
  input: UpdateDriverInput,
): Promise<Driver> {
  const { userId, licenceExpiresAt, emergencyContactName, emergencyContactPhone, ...scalars } =
    input;

  const row = await updateDriverById(user.organizationId, driverId, {
    ...scalars,
    ...(licenceExpiresAt !== undefined
      ? { licenceExpiresAt: licenceExpiresAt ? new Date(licenceExpiresAt) : null }
      : {}),
    ...(emergencyContactName !== undefined
      ? { emergencyContactName: emergencyContactName ?? null }
      : {}),
    ...(emergencyContactPhone !== undefined
      ? { emergencyContactPhone: emergencyContactPhone ?? null }
      : {}),
    ...(userId !== undefined
      ? userId
        ? { user: { connect: { id: userId } } }
        : { user: { disconnect: true } }
      : {}),
  });

  if (!row) throw new NotFoundError('Driver', driverId);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'driver',
    resourceId: driverId,
    metadata: { changed: Object.keys(input) },
  });

  return toDriverDto(row);
}

export async function changeDriverStatus(
  user: AuthUser,
  driverId: string,
  input: ChangeDriverStatusInput,
): Promise<Driver> {
  const existing = await findDriverById(user.organizationId, driverId);
  if (!existing) throw new NotFoundError('Driver', driverId);

  const row = await updateDriverById(user.organizationId, driverId, { status: input.status });
  if (!row) throw new NotFoundError('Driver', driverId);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'driver',
    resourceId: driverId,
    metadata: { from: existing.status, to: input.status, reason: input.reason },
  });

  return toDriverDto(row);
}

export async function deleteDriver(user: AuthUser, driverId: string): Promise<void> {
  const deleted = await deleteDriverById(user.organizationId, driverId);
  if (!deleted) throw new NotFoundError('Driver', driverId);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.DELETE,
    resourceType: 'driver',
    resourceId: driverId,
  });
}
