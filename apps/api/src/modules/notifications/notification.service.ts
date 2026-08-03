import type { Notification as NotificationRow, Prisma } from '@prisma/client';
import type { AuthUser, Notification, Paginated } from '@aegisdrive/types';
import { AuditAction, NotificationStatus } from '@aegisdrive/types';
import { NotFoundError, normalisePagination, paginate } from '@aegisdrive/shared';
import { recordAudit } from '../audit-logs/audit.service';
import {
  countUnread,
  findNotifications,
  insertNotifications,
  markAllRead,
  markRead,
} from './notification.repository';
import type { ListNotificationsQuery, SendNotificationInput } from './notification.schema';

function toNotificationDto(row: NotificationRow): Notification {
  return {
    id: row.id,
    recipientUserId: row.recipientUserId,
    channel: row.channel,
    status: row.status,
    subject: row.subject,
    body: row.body,
    alertId: row.alertId,
    incidentId: row.incidentId,
    sentAt: row.sentAt?.toISOString() ?? null,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A principal only ever sees their own notifications. */
export async function listMyNotifications(
  user: AuthUser,
  query: ListNotificationsQuery,
): Promise<Paginated<Notification>> {
  const pagination = normalisePagination(query);

  const { rows, total } = await findNotifications({
    ...pagination,
    recipientUserId: user.id,
    status: query.status,
    unreadOnly: query.unreadOnly,
  });

  return paginate(rows.map(toNotificationDto), pagination, total);
}

export async function unreadCount(user: AuthUser): Promise<{ unread: number }> {
  return { unread: await countUnread(user.id) };
}

export async function markNotificationRead(
  user: AuthUser,
  notificationId: string,
): Promise<Notification> {
  const row = await markRead(user.id, notificationId);
  if (!row) throw new NotFoundError('Notification', notificationId);
  return toNotificationDto(row);
}

export async function markEverythingRead(user: AuthUser): Promise<{ updated: number }> {
  return { updated: await markAllRead(user.id) };
}

/**
 * Enqueues a notification for every recipient × channel pair.
 *
 * Rows land in QUEUED. `services/notifications` polls for them, performs
 * delivery and advances the status. Keeping delivery out of the request means a
 * dead SMS provider cannot block an operator's browser.
 */
export async function enqueueNotifications(
  user: AuthUser,
  input: SendNotificationInput,
): Promise<{ queued: number }> {
  const rows: Prisma.NotificationCreateManyInput[] = input.recipientUserIds.flatMap(
    (recipientUserId) =>
      input.channels.map((channel) => ({
        recipientUserId,
        channel,
        status: NotificationStatus.QUEUED,
        subject: input.subject,
        body: input.body,
        alertId: input.alertId ?? null,
        incidentId: input.incidentId ?? null,
      })),
  );

  const queued = await insertNotifications(rows);

  void recordAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    actorEmail: user.email,
    action: AuditAction.CREATE,
    resourceType: 'notification',
    metadata: {
      recipients: input.recipientUserIds.length,
      channels: input.channels,
      queued,
    },
  });

  return { queued };
}
