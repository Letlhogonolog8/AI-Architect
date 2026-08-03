import { z } from 'zod';

/**
 * Tier and slug are absent. Both are commercial facts owned by the platform
 * operator, not settings a tenant administrator can change about themselves.
 */
export const updateOrganizationSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .length(2, 'Must be an ISO 3166-1 alpha-2 country code.')
      .optional(),
    timezone: z
      .string()
      .trim()
      .regex(/^[A-Za-z]+\/[A-Za-z_+-]+$/, 'Must be an IANA timezone, e.g. Africa/Johannesburg.')
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
