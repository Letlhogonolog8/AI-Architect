import { z } from 'zod';
import { enumSchema, paginationQuerySchema, uuidSchema } from '@aegisdrive/shared';
import { NotificationChannel, NotificationStatus } from '@aegisdrive/types';

export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  status: enumSchema(NotificationStatus).optional(),
  unreadOnly: z.coerce.boolean().optional(),
});

/**
 * Fan-out request. The API only enqueues; `services/notifications` owns delivery,
 * retries and provider selection, so this endpoint returns as soon as the rows
 * are durable rather than waiting on an SMS gateway.
 */
export const sendNotificationSchema = z.object({
  recipientUserIds: z.array(uuidSchema).min(1).max(500),
  channels: z.array(enumSchema(NotificationChannel)).min(1).max(6),
  subject: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(4_000),
  alertId: uuidSchema.nullish(),
  incidentId: uuidSchema.nullish(),
});

export const notificationIdParamSchema = z.object({ notificationId: uuidSchema });

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;
