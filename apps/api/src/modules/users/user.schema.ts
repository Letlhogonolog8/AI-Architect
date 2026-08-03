import { z } from 'zod';
import {
  emailSchema,
  enumSchema,
  paginationQuerySchema,
  passwordSchema,
  phoneNumberSchema,
  uuidSchema,
} from '@aegisdrive/shared';
import { RoleName, UserStatus } from '@aegisdrive/types';

export const listUsersQuerySchema = paginationQuerySchema.extend({
  status: enumSchema(UserStatus).optional(),
  role: enumSchema(RoleName).optional(),
  search: z.string().trim().min(1).max(64).optional(),
});

export const inviteUserSchema = z.object({
  email: emailSchema,
  firstName: z.string().trim().min(1).max(64),
  lastName: z.string().trim().min(1).max(64),
  phoneNumber: phoneNumberSchema.nullish(),
  roles: z.array(enumSchema(RoleName)).min(1, 'Assign at least one role.').max(6),
  /**
   * Optional. When omitted the account is created INVITED with an unusable
   * random digest, and the user sets their own password from the invite link —
   * which is the path that avoids an administrator ever knowing a credential.
   */
  temporaryPassword: passwordSchema.optional(),
});

export const updateUserSchema = z
  .object({
    firstName: z.string().trim().min(1).max(64).optional(),
    lastName: z.string().trim().min(1).max(64).optional(),
    phoneNumber: phoneNumberSchema.nullish(),
    avatarUrl: z.string().url().max(512).nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export const changeUserStatusSchema = z.object({
  status: enumSchema(UserStatus),
  reason: z.string().trim().max(500).optional(),
});

export const assignRolesSchema = z.object({
  roles: z.array(enumSchema(RoleName)).min(1, 'A user must hold at least one role.').max(6),
});

export const resetPasswordSchema = z.object({
  newPassword: passwordSchema,
});

export const userIdParamSchema = z.object({ userId: uuidSchema });

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ChangeUserStatusInput = z.infer<typeof changeUserStatusSchema>;
export type AssignRolesInput = z.infer<typeof assignRolesSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
