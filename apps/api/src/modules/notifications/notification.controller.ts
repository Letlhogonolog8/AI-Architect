import type { Request, Response } from 'express';
import { asyncHandler, sendPaginated, sendSuccess } from '../../core/http';
import { requirePrincipal } from '../../core/principal';
import * as notificationService from './notification.service';
import type { ListNotificationsQuery, SendNotificationInput } from './notification.schema';

export const listNotificationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const page = await notificationService.listMyNotifications(
    requirePrincipal(req),
    req.query as unknown as ListNotificationsQuery,
  );
  sendPaginated(res, page);
});

export const unreadCountHandler = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await notificationService.unreadCount(requirePrincipal(req)));
});

export const markReadHandler = asyncHandler(async (req: Request, res: Response) => {
  const notification = await notificationService.markNotificationRead(
    requirePrincipal(req),
    req.params.notificationId as string,
  );
  sendSuccess(res, notification);
});

export const markAllReadHandler = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await notificationService.markEverythingRead(requirePrincipal(req)));
});

export const sendNotificationHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await notificationService.enqueueNotifications(
    requirePrincipal(req),
    req.body as SendNotificationInput,
  );
  // 202: queued for the notifications service, not yet delivered.
  sendSuccess(res, result, 202);
});
