import type { Notification, Prisma } from '@prisma/client';
import type { NotificationStatus, PaginationQuery } from '@aegisdrive/types';
import { toSkipTake } from '@aegisdrive/shared';
import { prisma } from '../../db/prisma';

export interface NotificationFilter extends PaginationQuery {
  recipientUserId: string;
  status?: NotificationStatus;
  unreadOnly?: boolean;
}

function buildWhere(filter: NotificationFilter): Prisma.NotificationWhereInput {
  return {
    recipientUserId: filter.recipientUserId,
    status: filter.status,
    ...(filter.unreadOnly ? { readAt: null } : {}),
  };
}

export async function findNotifications(filter: NotificationFilter) {
  const where = buildWhere(filter);
  const { skip, take } = toSkipTake(filter);

  const [rows, total] = await prisma.$transaction([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.notification.count({ where }),
  ]);

  return { rows, total };
}

export async function insertNotifications(
  rows: Prisma.NotificationCreateManyInput[],
): Promise<number> {
  const result = await prisma.notification.createMany({ data: rows });
  return result.count;
}

/**
 * Marks one notification read.
 *
 * Scoped by recipient rather than id alone, so a caller cannot mark someone
 * else's notification read by guessing an identifier.
 */
export async function markRead(
  recipientUserId: string,
  notificationId: string,
): Promise<Notification | null> {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, recipientUserId, readAt: null },
    data: { readAt: new Date(), status: 'READ' },
  });

  if (result.count === 0) return null;
  return prisma.notification.findUnique({ where: { id: notificationId } });
}

export async function markAllRead(recipientUserId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { recipientUserId, readAt: null },
    data: { readAt: new Date(), status: 'READ' },
  });
  return result.count;
}

export async function countUnread(recipientUserId: string): Promise<number> {
  return prisma.notification.count({ where: { recipientUserId, readAt: null } });
}
