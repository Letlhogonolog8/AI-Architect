import type { Driver } from '@aegisdrive/types';
import type { DriverRowWithVehicle } from './driver.repository';

export function toDriverDto(row: DriverRowWithVehicle): Driver {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    firstName: row.firstName,
    lastName: row.lastName,
    licenceNumber: row.licenceNumber,
    licenceExpiresAt: row.licenceExpiresAt?.toISOString() ?? null,
    phoneNumber: row.phoneNumber,
    status: row.status,
    safetyScore: row.safetyScore,
    assignedVehicleId: row.assignedVehicle?.id ?? null,
    emergencyContactName: row.emergencyContactName,
    emergencyContactPhone: row.emergencyContactPhone,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
