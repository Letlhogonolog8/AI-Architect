import { z } from 'zod';
import {
  enumSchema,
  isoDateSchema,
  paginationQuerySchema,
  phoneNumberSchema,
  uuidSchema,
} from '@aegisdrive/shared';
import { DriverStatus } from '@aegisdrive/types';

export const listDriversQuerySchema = paginationQuerySchema.extend({
  status: enumSchema(DriverStatus).optional(),
  search: z.string().trim().min(1).max(64).optional(),
});

export const createDriverSchema = z.object({
  firstName: z.string().trim().min(1).max(64),
  lastName: z.string().trim().min(1).max(64),
  licenceNumber: z.string().trim().min(4).max(32),
  licenceExpiresAt: isoDateSchema.nullish(),
  phoneNumber: phoneNumberSchema,
  emergencyContactName: z.string().trim().min(1).max(96).nullish(),
  emergencyContactPhone: phoneNumberSchema.nullish(),
  /** Links this driver record to an existing app login. */
  userId: uuidSchema.nullish(),
});

export const updateDriverSchema = createDriverSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

/**
 * `DISTRESS` is intentionally accepted here: a control-room operator must be
 * able to flag a driver in duress when the driver cannot reach their own panic
 * control. The transition is audited.
 */
export const changeDriverStatusSchema = z.object({
  status: enumSchema(DriverStatus),
  reason: z.string().trim().max(500).optional(),
});

export const driverIdParamSchema = z.object({ driverId: uuidSchema });

export type ListDriversQuery = z.infer<typeof listDriversQuerySchema>;
export type CreateDriverInput = z.infer<typeof createDriverSchema>;
export type UpdateDriverInput = z.infer<typeof updateDriverSchema>;
export type ChangeDriverStatusInput = z.infer<typeof changeDriverStatusSchema>;
