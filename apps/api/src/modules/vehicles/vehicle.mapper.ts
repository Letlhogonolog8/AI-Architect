import type { Vehicle as VehicleRow } from '@prisma/client';
import type { GeoPosition, Vehicle } from '@aegisdrive/types';

/**
 * Prisma row → wire DTO.
 *
 * The last-known position is stored as four loose columns for index efficiency
 * and reassembled here, so no client ever has to know that layout.
 */
function toPosition(row: VehicleRow): GeoPosition | null {
  if (row.lastLongitude === null || row.lastLatitude === null) return null;

  return {
    longitude: row.lastLongitude,
    latitude: row.lastLatitude,
    heading: row.lastHeading,
    speedKph: row.lastSpeedKph,
  };
}

export function toVehicleDto(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    organizationId: row.organizationId,
    registrationNumber: row.registrationNumber,
    vin: row.vin,
    make: row.make,
    model: row.model,
    year: row.year,
    colour: row.colour,
    type: row.type,
    status: row.status,
    protectionMode: row.protectionMode,
    riskScore: row.riskScore,
    threatLevel: row.threatLevel,
    assignedDriverId: row.assignedDriverId,
    lastPosition: toPosition(row),
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    odometerKm: row.odometerKm,
    deviceSerial: row.deviceSerial,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
