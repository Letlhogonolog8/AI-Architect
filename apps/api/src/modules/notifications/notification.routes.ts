import { Router } from 'express';
import { authenticate, requirePermissions, validate } from '../../middleware';
import {
  listNotificationsHandler,
  markAllReadHandler,
  markReadHandler,
  sendNotificationHandler,
  unreadCountHandler,
} from './notification.controller';
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
  sendNotificationSchema,
} from './notification.schema';

export const notificationRoutes: Router = Router();

notificationRoutes.use(authenticate);

notificationRoutes.get(
  '/',
  requirePermissions('notification:read'),
  validate({ query: listNotificationsQuerySchema }),
  listNotificationsHandler,
);

notificationRoutes.get(
  '/unread-count',
  requirePermissions('notification:read'),
  unreadCountHandler,
);

notificationRoutes.post('/read-all', requirePermissions('notification:read'), markAllReadHandler);

notificationRoutes.post(
  '/:notificationId/read',
  requirePermissions('notification:read'),
  validate({ params: notificationIdParamSchema }),
  markReadHandler,
);

notificationRoutes.post(
  '/send',
  requirePermissions('notification:send'),
  validate({ body: sendNotificationSchema }),
  sendNotificationHandler,
);
