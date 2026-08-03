import type { AuthUser, Paginated, Vehicle } from '@aegisdrive/types';
import { AuditAction, VehicleStatus } from '@aegisdrive/types';
import { ConflictError, NotFoundError, normalisePagination, paginate } from '@aegisdrive/shared';
import { moduleLogger } from '../../core/logger';
import { recordAudit } from '../audit-logs/audit.service';
import { emitVehiclePosition } from '../../realtime/emitter';
import {
  deleteVehicleById,
  findVehicleById,
  findVehicles,
  insertVehicle,
  updateVehicleById,
} from './vehicle.repository';
import { toVehicleDto } from './vehicle.mapper';
import type {
  ChangeVehicleStatusInput,
  CreateVehicleInput,
  ListVehiclesQuery,
  UpdateVehicleInput,
} from './vehicle.schema';

const log = moduleLogger('vehicles');

export async function listVehicles(
  user: AuthUser,
  query: ListVehiclesQuery,
): Promise<Paginated<Vehicle>> {
  const pagination = normalisePagination(query);

  const { rows, total } = await findVehicles({
    ...pagination,
    organizationId: user.organizationId,
    status: query.status,
    type: query.type,
    threatLevel: query.threatLevel,
    protectionMode: query.protectionMode,
    assignedDriverId: query.assignedDriverId,
    search: query.search,
  });

  return paginate(rows.map(toVehicleDto), pagination, total);
}

export async function getVehicle(user: AuthUser, vehicleId: string): Promise<Vehicle> {
  const row = await findVehicleById(user.organizationId, vehicleId);
  if (!row) throw new NotFoundError('Vehicle', vehicleId);
  return toVehicleDto(row);
}

export async function createVehicle(user: AuthUser, input: CreateVehicleInput): Promise<Vehicle> {
  const row = await insertVehicle(user.organizationId, {
    registrationNumber: input.registrationNumber,
    vin: input.vin,
    make: input.make,
    model: input.model,
    year: input.year,
    colour: input.colour,
    type: input.type,
    protectionMode: input.protectionMode,
    odometerKm: input.odometerKm,
    deviceSerial: input.deviceSerial ?? null,
    ...(input.assignedDriverId
      ? { assignedDriver: { connect: { id: input.assignedDriverId } } }
      : {}),
  });

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.CREATE,
    resourceType: 'vehicle',
    resourceId: row.id,
    metadata: { registrationNumber: row.registrationNumber },
  });

  return toVehicleDto(row);
}

export async function updateVehicle(
  user: AuthUser,
  vehicleId: string,
  input: UpdateVehicleInput,
): Promise<Vehicle> {
  const existing = await findVehicleById(user.organizationId, vehicleId);
  if (!existing) throw new NotFoundError('Vehicle', vehicleId);

  const { assignedDriverId, deviceSerial, ...scalars } = input;

  const row = await updateVehicleById(user.organizationId, vehicleId, {
    ...scalars,
    ...(deviceSerial !== undefined ? { deviceSerial: deviceSerial ?? null } : {}),
    ...(assignedDriverId !== undefined
      ? assignedDriverId
        ? { assignedDriver: { connect: { id: assignedDriverId } } }
        : { assignedDriver: { disconnect: true } }
      : {}),
  });

  if (!row) throw new NotFoundError('Vehicle', vehicleId);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'vehicle',
    resourceId: vehicleId,
    metadata: { changed: Object.keys(input) },
  });

  return toVehicleDto(row);
}

export async function changeVehicleStatus(
  user: AuthUser,
  vehicleId: string,
  input: ChangeVehicleStatusInput,
): Promise<Vehicle> {
  const existing = await findVehicleById(user.organizationId, vehicleId);
  if (!existing) throw new NotFoundError('Vehicle', vehicleId);

  const row = await updateVehicleById(user.organizationId, vehicleId, { status: input.status });
  if (!row) throw new NotFoundError('Vehicle', vehicleId);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.UPDATE,
    resourceType: 'vehicle',
    resourceId: vehicleId,
    metadata: { from: existing.status, to: input.status, reason: input.reason },
  });

  broadcastPosition(row);

  return toVehicleDto(row);
}

/**
 * Remote immobilisation.
 *
 * The command channel to the in-vehicle device is not wired yet; this records
 * the intent, flips the tracked state and audits the decision. When the device
 * gateway lands, it consumes this state transition rather than being called
 * from here, so a failed radio link cannot roll back the audit entry.
 */
export async function immobiliseVehicle(
  user: AuthUser,
  vehicleId: string,
  reason: string,
  incidentId?: string,
): Promise<Vehicle> {
  const existing = await findVehicleById(user.organizationId, vehicleId);
  if (!existing) throw new NotFoundError('Vehicle', vehicleId);

  if (existing.status === VehicleStatus.IMMOBILISED) {
    throw new ConflictError('This vehicle is already immobilised.');
  }

  if (existing.status === VehicleStatus.DECOMMISSIONED) {
    throw new ConflictError('A decommissioned vehicle cannot be immobilised.');
  }

  const row = await updateVehicleById(user.organizationId, vehicleId, {
    status: VehicleStatus.IMMOBILISED,
  });

  if (!row) throw new NotFoundError('Vehicle', vehicleId);

  log.warn({ vehicleId, userId: user.id, incidentId }, 'Vehicle immobilisation requested');

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.IMMOBILISE,
    resourceType: 'vehicle',
    resourceId: vehicleId,
    metadata: { reason, incidentId, previousStatus: existing.status },
  });

  broadcastPosition(row);

  return toVehicleDto(row);
}

export async function deleteVehicle(user: AuthUser, vehicleId: string): Promise<void> {
  const deleted = await deleteVehicleById(user.organizationId, vehicleId);
  if (!deleted) throw new NotFoundError('Vehicle', vehicleId);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.DELETE,
    resourceType: 'vehicle',
    resourceId: vehicleId,
  });
}

/** Pushes the current tracked state to every control room watching this tenant. */
function broadcastPosition(row: Awaited<ReturnType<typeof findVehicleById>>): void {
  if (!row || row.lastLongitude === null || row.lastLatitude === null) return;

  emitVehiclePosition(row.organizationId, {
    vehicleId: row.id,
    position: {
      longitude: row.lastLongitude,
      latitude: row.lastLatitude,
      heading: row.lastHeading,
      speedKph: row.lastSpeedKph,
    },
    status: row.status,
    riskScore: row.riskScore,
    threatLevel: row.threatLevel,
    recordedAt: (row.lastSeenAt ?? row.updatedAt).toISOString(),
  });
}
