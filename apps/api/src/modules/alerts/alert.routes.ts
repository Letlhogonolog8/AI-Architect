import { Router } from 'express';
import { authenticate, requirePermissions, validate } from '../../middleware';
import {
  acknowledgeAlertHandler,
  getAlertHandler,
  listAlertsHandler,
  raiseAlertHandler,
  suppressAlertHandler,
} from './alert.controller';
import {
  acknowledgeAlertSchema,
  alertIdParamSchema,
  listAlertsQuerySchema,
  raiseAlertSchema,
  suppressAlertSchema,
} from './alert.schema';

export const alertRoutes: Router = Router();

alertRoutes.use(authenticate);

alertRoutes.get(
  '/',
  requirePermissions('alert:read'),
  validate({ query: listAlertsQuerySchema }),
  listAlertsHandler,
);

alertRoutes.post(
  '/',
  requirePermissions('alert:acknowledge'),
  validate({ body: raiseAlertSchema }),
  raiseAlertHandler,
);

alertRoutes.get(
  '/:alertId',
  requirePermissions('alert:read'),
  validate({ params: alertIdParamSchema }),
  getAlertHandler,
);

alertRoutes.post(
  '/:alertId/acknowledge',
  requirePermissions('alert:acknowledge'),
  validate({ params: alertIdParamSchema, body: acknowledgeAlertSchema }),
  acknowledgeAlertHandler,
);

alertRoutes.post(
  '/:alertId/suppress',
  requirePermissions('alert:suppress'),
  validate({ params: alertIdParamSchema, body: suppressAlertSchema }),
  suppressAlertHandler,
);
