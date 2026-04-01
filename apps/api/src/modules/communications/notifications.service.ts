import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { toNotificationChannel } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

interface ListNotificationsFilters {
  page: number;
  pageSize: number;
  status?: string;
  unread_only?: boolean;
}

interface CreateNotificationInput {
  tenant_id: string;
  recipient_user_id: string;
  channel: string;
  template_key: string | null;
  locale: string;
  payload_json: Record<string, unknown>;
  source_entity_type?: string;
  source_entity_id?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async listForUser(tenantId: string, userId: string, filters: ListNotificationsFilters) {
    const { page, pageSize, status, unread_only } = filters;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      recipient_user_id: userId,
    };
    if (status) where.status = status;
    if (unread_only) {
      where.status = { in: ['queued', 'sent', 'delivered'] };
    }

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { data: notifications, meta: { page, pageSize, total } };
  }

  async getUnreadCount(tenantId: string, userId: string): Promise<number> {
    const cacheKey = `tenant:${tenantId}:user:${userId}:unread_notifications`;
    const client = this.redis.getClient();

    const cached = await client.get(cacheKey);
    if (cached !== null && cached !== undefined) {
      return parseInt(cached, 10);
    }

    const count = await this.prisma.notification.count({
      where: {
        tenant_id: tenantId,
        recipient_user_id: userId,
        status: { in: ['queued', 'sent', 'delivered'] },
      },
    });

    await client.set(cacheKey, count.toString(), 'EX', 30);
    return count;
  }

  async markAsRead(tenantId: string, userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        tenant_id: tenantId,
        recipient_user_id: userId,
      },
    });

    if (!notification) {
      throw new NotFoundException({
        code: 'NOTIFICATION_NOT_FOUND',
        message: `Notification with id "${notificationId}" not found`,
      });
    }

    if (notification.status === 'read') return;

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: 'read', read_at: new Date() },
    });

    const cacheKey = `tenant:${tenantId}:user:${userId}:unread_notifications`;
    await this.redis.getClient().del(cacheKey);
  }

  async markAllAsRead(tenantId: string, userId: string) {
    await this.prisma.notification.updateMany({
      where: {
        tenant_id: tenantId,
        recipient_user_id: userId,
        status: { in: ['queued', 'sent', 'delivered'] },
      },
      data: { status: 'read', read_at: new Date() },
    });

    const cacheKey = `tenant:${tenantId}:user:${userId}:unread_notifications`;
    await this.redis.getClient().set(cacheKey, '0', 'EX', 30);
  }

  async listFailed(tenantId: string, filters: { page: number; pageSize: number }) {
    const { page, pageSize } = filters;
    const skip = (page - 1) * pageSize;

    const where = {
      tenant_id: tenantId,
      status: 'failed' as const,
    };

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          recipient: {
            select: { id: true, first_name: true, last_name: true, email: true },
          },
        },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { data: notifications, meta: { page, pageSize, total } };
  }

  async createBatch(tenantId: string, notifications: CreateNotificationInput[]) {
    const data = notifications.map((n) => ({
      tenant_id: tenantId,
      recipient_user_id: n.recipient_user_id,
      channel: toNotificationChannel(n.channel),
      template_key: n.template_key,
      locale: n.locale,
      status: n.channel === 'in_app' ? ('delivered' as const) : ('queued' as const),
      payload_json: n.payload_json as Prisma.InputJsonValue,
      source_entity_type: n.source_entity_type ?? null,
      source_entity_id: n.source_entity_id ?? null,
      delivered_at: n.channel === 'in_app' ? new Date() : null,
    }));

    await this.prisma.notification.createMany({ data });

    // Invalidate unread count caches for all recipients
    const uniqueUserIds = [...new Set(notifications.map((n) => n.recipient_user_id))];
    const client = this.redis.getClient();
    await Promise.all(
      uniqueUserIds.map((userId) =>
        client.del(`tenant:${tenantId}:user:${userId}:unread_notifications`),
      ),
    );
  }
}
