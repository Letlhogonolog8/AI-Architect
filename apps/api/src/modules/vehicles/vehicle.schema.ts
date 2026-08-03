import { z } from 'zod';
import { enumSchema, paginationQuerySchema, uuidSchema } from '@aegisdrive/shared';
import { ProtectionMode, ThreatLevel, VehicleStatus, VehicleType } from '@aegisdrive/types';

const CURRENT_YEAR = new Date().getUTCFullYear();

/** ISO 3779 VIN: 17 characters, excluding I, O and Q to avoid digit confusion. */
const vinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(17, 'A VIN is exactly 17 characters.')
  .regex(/^[A-HJ-NPR-Z0-9]{17}$/, 'A VIN cannot contain the letters I, O or Q.');

const registrationSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2)
  .max(16)
  .regex(/^[A-Z0-9 -]+$/, 'Only letters, digits, spaces and hyphens are permitted.');

export const listVehiclesQuerySchema = paginationQuerySchema.extend({
  status: enumSchema(VehicleStatus).optional(),
  type: enumSchema(VehicleType).optional(),
  threatLevel: enumSchema(ThreatLevel).optional(),
  protectionMode: enumSchema(ProtectionMode).optional(),
  assignedDriverId: uuidSchema.optional(),
  search: z.string().trim().min(1).max(64).optional(),
});

export const createVehicleSchema = z.object({
  registrationNumber: registrationSchema,
  vin: vinSchema,
  make: z.string().trim().min(1).max(48),
  model: z.string().trim().min(1).max(48),
  year: z
    .number()
    .int()
    .min(1950)
    .max(CURRENT_YEAR + 1),
  colour: z.string().trim().min(1).max(32),
  type: enumSchema(VehicleType),
  protectionMode: enumSchema(ProtectionMode).default(ProtectionMode.GUARDIAN),
  odometerKm: z.number().int().min(0).max(5_000_000).default(0),
  deviceSerial: z.string().trim().min(4).max(64).nullish(),
  assignedDriverId: uuidSchema.nullish(),
});

/**
 * Status, risk score and threat level are absent on purpose: they are written
 * by the telemetry and risk engines, not by an operator with a form.
 */
export const updateVehicleSchema = createVehicleSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export const vehicleIdParamSchema = z.object({ vehicleId: uuidSchema });

/** Operator-driven status change, separate from the automated write path. */
export const changeVehicleStatusSchema = z.object({
  status: enumSchema(VehicleStatus),
  reason: z.string().trim().min(3).max(500),
});

export const immobiliseVehicleSchema = z.object({
  /** Free-text justification. Required: this action is logged and reviewable. */
  reason: z
    .string()
    .trim()
    .min(10, 'A justification of at least 10 characters is required.')
    .max(500),
  incidentId: uuidSchema.optional(),
});

export type ListVehiclesQuery = z.infer<typeof listVehiclesQuerySchema>;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type ChangeVehicleStatusInput = z.infer<typeof changeVehicleStatusSchema>;
export type ImmobiliseVehicleInput = z.infer<typeof immobiliseVehicleSchema>;
