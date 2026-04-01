import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { sanitiseHtml } from '../../common/utils/sanitise-html';
import { ApprovalRequestsService } from '../approvals/approval-requests.service';
import { PrismaService } from '../prisma/prisma.service';

import { AudienceResolutionService } from './audience-resolution.service';
import { NotificationsService } from './notifications.service';

interface ListAnnouncementsFilters {
  page: number;
  pageSize: number;
  status?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalService: ApprovalRequestsService,
    private readonly audienceService: AudienceResolutionService,
    private readonly notificationsService: NotificationsService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  async list(tenantId: string, filters: ListAnnouncementsFilters) {
    const { page, pageSize, status, sort = 'created_at', order = 'desc' } = filters;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (status) where.status = status;

    const [announcements, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [sort]: order },
        include: {
          author: {
            select: { id: true, first_name: true, last_name: true, email: true },
          },
        },
      }),
      this.prisma.announcement.count({ where }),
    ]);

    return { data: announcements, meta: { page, pageSize, total } };
  }

  async getById(tenantId: string, id: string) {
    const announcement = await this.prisma.announcement.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        author: {
          select: { id: true, first_name: true, last_name: true, email: true },
        },
        approval_request: true,
      },
    });

    if (!announcement) {
      throw new NotFoundException({
        code: 'ANNOUNCEMENT_NOT_FOUND',
        message: `Announcement with id "${id}" not found`,
      });
    }

    return announcement;
  }

  async create(
    tenantId: string,
    userId: string,
    dto: {
      title: string;
      body_html: string;
      scope: string;
      target_payload: Record<string, unknown>;
      scheduled_publish_at?: string | null;
      delivery_channels?: string[];
    },
  ) {
    const cleanHtml = sanitiseHtml(dto.body_html);

    // Ensure in_app is always present
    const channels = dto.delivery_channels ?? ['in_app'];
    if (!channels.includes('in_app')) {
      channels.unshift('in_app');
    }

    return this.prisma.announcement.create({
      data: {
        tenant_id: tenantId,
        title: dto.title,
        body_html: cleanHtml,
        status: 'draft',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        scope: dto.scope as any, // Prisma enum cast
        target_payload: dto.target_payload as Prisma.InputJsonValue,
        scheduled_publish_at: dto.scheduled_publish_at ? new Date(dto.scheduled_publish_at) : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delivery_channels: channels as any,
        author_user_id: userId,
      },
      include: {
        author: {
          select: { id: true, first_name: true, last_name: true, email: true },
        },
      },
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: {
      title?: string;
      body_html?: string;
      scope?: string;
      target_payload?: Record<string, unknown>;
      scheduled_publish_at?: string | null;
      delivery_channels?: string[];
    },
  ) {
    const existing = await this.getById(tenantId, id);

    if (existing.status !== 'draft') {
      throw new BadRequestException({
        code: 'ANNOUNCEMENT_NOT_DRAFT',
        message: 'Only draft announcements can be edited',
      });
    }

    const updateData: Record<string, unknown> = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.body_html !== undefined) updateData.body_html = sanitiseHtml(dto.body_html);
    if (dto.scope !== undefined) updateData.scope = dto.scope;
    if (dto.target_payload !== undefined) updateData.target_payload = dto.target_payload;
    if (dto.scheduled_publish_at !== undefined) {
      updateData.scheduled_publish_at = dto.scheduled_publish_at
        ? new Date(dto.scheduled_publish_at)
        : null;
    }
    if (dto.delivery_channels !== undefined) {
      const channels = [...dto.delivery_channels];
      if (!channels.includes('in_app')) channels.unshift('in_app');
      updateData.delivery_channels = channels;
    }

    return this.prisma.announcement.update({
      where: { id },
      data: updateData,
      include: {
        author: {
          select: { id: true, first_name: true, last_name: true, email: true },
        },
      },
    });
  }

  async publish(
    tenantId: string,
    userId: string,
    id: string,
    dto: { scheduled_publish_at?: string | null },
  ) {
    const announcement = await this.getById(tenantId, id);

    if (announcement.status !== 'draft') {
      throw new BadRequestException({
        code: 'ANNOUNCEMENT_NOT_DRAFT',
        message: 'Only draft announcements can be published',
      });
    }

    // Check if approval is required
    const settings = await this.prisma.tenantSetting.findFirst({
      where: { tenant_id: tenantId },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settingsJson = (settings?.settings as Record<string, any>) ?? {};
    const requireApproval = settingsJson?.communications?.requireApprovalForAnnouncements ?? true;

    if (requireApproval) {
      // R-21: Approval creation + entity status change must be atomic
      const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
      const approvalTxResult = (await rlsClient.$transaction(async (tx) => {
        const db = tx as unknown as typeof this.prisma;

        const approvalResult = await this.approvalService.checkAndCreateIfNeeded(
          tenantId,
          'announcement_publish',
          'announcement',
          id,
          userId,
          false,
          db,
        );

        if (!approvalResult.approved) {
          const updated = await db.announcement.update({
            where: { id },
            data: {
              status: 'pending_approval',
              approval_request_id: approvalResult.request_id,
            },
            include: {
              author: {
                select: { id: true, first_name: true, last_name: true, email: true },
              },
            },
          });

          return { needsApproval: true as const, data: updated };
        }

        return { needsApproval: false as const };
      })) as { needsApproval: true; data: Record<string, unknown> } | { needsApproval: false };

      if (approvalTxResult.needsApproval) {
        return { data: approvalTxResult.data, approval_required: true };
      }
    }

    // Determine scheduled or immediate
    const scheduledAt = dto.scheduled_publish_at
      ? new Date(dto.scheduled_publish_at)
      : announcement.scheduled_publish_at;

    if (scheduledAt && scheduledAt > new Date()) {
      const updated = await this.prisma.announcement.update({
        where: { id },
        data: { status: 'scheduled', scheduled_publish_at: scheduledAt },
        include: {
          author: {
            select: { id: true, first_name: true, last_name: true, email: true },
          },
        },
      });

      // Enqueue delayed job
      const delay = scheduledAt.getTime() - Date.now();
      await this.notificationsQueue.add(
        'communications:publish-announcement',
        { tenant_id: tenantId, announcement_id: id },
        { delay, attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
      );

      return { data: updated, approval_required: false };
    }

    // Immediate publish
    await this.executePublish(tenantId, id);
    const updated = await this.getById(tenantId, id);
    return { data: updated, approval_required: false };
  }

  async executePublish(tenantId: string, id: string) {
    const announcement = await this.prisma.announcement.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!announcement) return;

    // Update status
    await this.prisma.announcement.update({
      where: { id },
      data: { status: 'published', published_at: new Date() },
    });

    // Resolve audience
    const targets = await this.audienceService.resolve(
      tenantId,
      announcement.scope,
      announcement.target_payload as Record<string, unknown>,
    );

    if (targets.length === 0) return;

    // Use announcement's delivery channels (always includes in_app)
    const deliveryChannels = (announcement.delivery_channels as string[]) ?? ['in_app'];

    // Create notifications in batches of 100
    const batchSize = 100;
    for (let i = 0; i < targets.length; i += batchSize) {
      const batch = targets.slice(i, i + batchSize);
      const notifications = batch.flatMap((target) =>
        deliveryChannels.map((channel) => ({
          tenant_id: tenantId,
          recipient_user_id: target.user_id,
          channel,
          template_key: 'announcement.published',
          locale: target.locale,
          payload_json: {
            announcement_id: id,
            announcement_title: announcement.title,
          },
          source_entity_type: 'announcement',
          source_entity_id: id,
        })),
      );

      await this.notificationsService.createBatch(tenantId, notifications);

      // Enqueue dispatch job for non-in_app notifications
      const nonInAppNotifications = notifications.filter((n) => n.channel !== 'in_app');

      if (nonInAppNotifications.length > 0) {
        await this.notificationsQueue.add(
          'communications:dispatch-notifications',
          { tenant_id: tenantId, announcement_id: id, batch_index: i },
          { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
        );
      }
    }
  }

  async archive(tenantId: string, id: string) {
    const announcement = await this.getById(tenantId, id);

    if (announcement.status !== 'published' && announcement.status !== 'draft') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: 'Only published or draft announcements can be archived',
      });
    }

    return this.prisma.announcement.update({
      where: { id },
      data: { status: 'archived' },
      include: {
        author: {
          select: { id: true, first_name: true, last_name: true, email: true },
        },
      },
    });
  }

  async getDeliveryStatus(tenantId: string, id: string) {
    await this.getById(tenantId, id);

    const statuses = await this.prisma.notification.groupBy({
      by: ['status'],
      where: {
        tenant_id: tenantId,
        source_entity_type: 'announcement',
        source_entity_id: id,
      },
      _count: true,
    });

    const result = { total: 0, queued: 0, sent: 0, delivered: 0, failed: 0, read: 0 };
    for (const s of statuses) {
      const key = s.status as keyof typeof result;
      if (key in result && key !== 'total') {
        result[key] = s._count;
        result.total += s._count;
      }
    }

    return result;
  }

  async listForParent(
    tenantId: string,
    userId: string,
    filters: { page: number; pageSize: number },
  ) {
    const { page, pageSize } = filters;
    const skip = (page - 1) * pageSize;

    // Find announcements that were notified to this user
    const notifications = await this.prisma.notification.findMany({
      where: {
        tenant_id: tenantId,
        recipient_user_id: userId,
        source_entity_type: 'announcement',
      },
      select: { source_entity_id: true },
      distinct: ['source_entity_id'],
    });

    const announcementIds = notifications
      .map((n) => n.source_entity_id)
      .filter((announcementId): announcementId is string => announcementId !== null);

    if (announcementIds.length === 0) {
      return { data: [], meta: { page, pageSize, total: 0 } };
    }

    const where = {
      id: { in: announcementIds },
      tenant_id: tenantId,
      status: 'published' as const,
    };

    const [announcements, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { published_at: 'desc' },
        select: {
          id: true,
          title: true,
          body_html: true,
          published_at: true,
          scope: true,
        },
      }),
      this.prisma.announcement.count({ where }),
    ]);

    return { data: announcements, meta: { page, pageSize, total } };
  }
}
