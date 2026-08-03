import { z } from 'zod';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../constants';

/**
 * Reusable Zod primitives.
 *
 * The API validates every inbound payload against schemas built from these, and
 * the web forms reuse the same objects through `@hookform/resolvers`, so client
 * and server validation cannot drift apart.
 */

export const uuidSchema = z.string().uuid('Must be a valid identifier.');

/**
 * Builds a Zod enum from one of the const-object enums in `@aegisdrive/types`.
 *
 * `z.nativeEnum` is the obvious choice but infers a widened `string` for frozen
 * const objects, which loses the literal union the domain types depend on.
 * Reading the values explicitly keeps the schema's output assignable to the
 * enum type it came from.
 */
export function enumSchema<T extends Record<string, string>>(source: T) {
  const values = Object.values(source) as [T[keyof T], ...Array<T[keyof T]>];
  return z.enum(values);
}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email('Must be a valid email address.');

/**
 * Password policy. Length carries most of the entropy, so the floor is high and
 * the composition rules stay light rather than pushing users toward `P@ssw0rd!`.
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Must be at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH)
  .regex(/[a-z]/, 'Must contain a lowercase letter.')
  .regex(/[A-Z]/, 'Must contain an uppercase letter.')
  .regex(/\d/, 'Must contain a digit.');

/** E.164, which is what the notification service requires for SMS and voice. */
export const phoneNumberSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Must be an international number, e.g. +27821234567.');

export const isoDateSchema = z.string().datetime({ offset: true });

export const geoPointSchema = z.object({
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
});

export const geoPositionSchema = geoPointSchema.extend({
  altitude: z.number().nullish(),
  heading: z.number().min(0).max(360).nullish(),
  speedKph: z.number().min(0).nullish(),
  accuracy: z.number().min(0).nullish(),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sortBy: z.string().trim().min(1).max(64).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
});

export const idParamSchema = z.object({ id: uuidSchema });

export type PaginationQueryInput = z.infer<typeof paginationQuerySchema>;
