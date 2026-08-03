import { Router } from 'express';
import { authenticate, requirePermissions, validate } from '../../middleware';
import { getOrganizationHandler, updateOrganizationHandler } from './organization.controller';
import { updateOrganizationSchema } from './organization.schema';

/** Mounted at `/organization` (singular): a principal has exactly one. */
export const organizationRoutes: Router = Router();

organizationRoutes.use(authenticate);

organizationRoutes.get('/', requirePermissions('organization:read'), getOrganizationHandler);

organizationRoutes.patch(
  '/',
  requirePermissions('organization:manage'),
  validate({ body: updateOrganizationSchema }),
  updateOrganizationHandler,
);
