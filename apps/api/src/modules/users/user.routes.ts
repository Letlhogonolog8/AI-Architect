import { Router } from 'express';
import { authenticate, requirePermissions, validate } from '../../middleware';
import {
  assignRolesHandler,
  changeUserStatusHandler,
  getUserHandler,
  inviteUserHandler,
  listUsersHandler,
  resetPasswordHandler,
  updateUserHandler,
} from './user.controller';
import {
  assignRolesSchema,
  changeUserStatusSchema,
  inviteUserSchema,
  listUsersQuerySchema,
  resetPasswordSchema,
  updateUserSchema,
  userIdParamSchema,
} from './user.schema';

export const userRoutes: Router = Router();

userRoutes.use(authenticate);

userRoutes.get(
  '/',
  requirePermissions('user:read'),
  validate({ query: listUsersQuerySchema }),
  listUsersHandler,
);

userRoutes.post(
  '/',
  requirePermissions('user:create'),
  validate({ body: inviteUserSchema }),
  inviteUserHandler,
);

userRoutes.get(
  '/:userId',
  requirePermissions('user:read'),
  validate({ params: userIdParamSchema }),
  getUserHandler,
);

userRoutes.patch(
  '/:userId',
  requirePermissions('user:update'),
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  updateUserHandler,
);

userRoutes.post(
  '/:userId/status',
  requirePermissions('user:update'),
  validate({ params: userIdParamSchema, body: changeUserStatusSchema }),
  changeUserStatusHandler,
);

/** Changing a role set changes the authorisation policy, so it needs `role:manage`. */
userRoutes.put(
  '/:userId/roles',
  requirePermissions('user:update', 'role:manage'),
  validate({ params: userIdParamSchema, body: assignRolesSchema }),
  assignRolesHandler,
);

userRoutes.post(
  '/:userId/reset-password',
  requirePermissions('user:update'),
  validate({ params: userIdParamSchema, body: resetPasswordSchema }),
  resetPasswordHandler,
);
