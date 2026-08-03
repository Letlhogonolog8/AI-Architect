import { Router } from 'express';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { getRoleHandler, listRolesHandler } from './role.controller';
import { roleNameParamSchema } from './role.schema';

export const roleRoutes: Router = Router();

roleRoutes.use(authenticate);

roleRoutes.get('/', requirePermissions('role:read'), listRolesHandler);

roleRoutes.get(
  '/:name',
  requirePermissions('role:read'),
  validate({ params: roleNameParamSchema }),
  getRoleHandler,
);
