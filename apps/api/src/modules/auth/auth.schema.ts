import { z } from 'zod';
import { emailSchema, passwordSchema, uuidSchema } from '@aegisdrive/shared';

export const loginSchema = z.object({
  email: emailSchema,
  /**
   * Deliberately *not* `passwordSchema`. Validating an existing password
   * against current policy would reject accounts created under an older one,
   * and the length hint leaks policy to an unauthenticated caller.
   */
  password: z.string().min(1, 'Password is required.').max(256),
});

export const refreshSchema = z.object({
  /** Optional in the body: the cookie is the primary transport for browsers. */
  refreshToken: z.string().min(1).optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Your current password is required.'),
    newPassword: passwordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: 'The new password must differ from the current one.',
  });

export const sessionParamSchema = z.object({ sessionId: uuidSchema });

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
