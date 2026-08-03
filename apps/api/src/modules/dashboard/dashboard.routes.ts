import { Router } from 'express';
import { authenticate, requirePermissions } from '../../middleware';
import { analyticsSummaryHandler, fleetSnapshotHandler } from './dashboard.controller';

export const dashboardRoutes: Router = Router();

dashboardRoutes.use(authenticate);

dashboardRoutes.get('/snapshot', requirePermissions('dashboard:read'), fleetSnapshotHandler);

export const analyticsRoutes: Router = Router();

analyticsRoutes.use(authenticate);

analyticsRoutes.get('/summary', requirePermissions('analytics:read'), analyticsSummaryHandler);
