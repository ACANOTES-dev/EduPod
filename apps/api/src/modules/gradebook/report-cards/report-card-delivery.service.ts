import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ReportCardDelivery } from '@prisma/client';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { ConfigurationReadFacade } from '../../configuration/configuration-read.facade';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ReportCardDeliveryService {
  private readonly logger = new Logger(ReportCardDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationReadFacade: ConfigurationReadFacade,
  ) {}
  // ─── Deliver to all parents ───────────────────────────────────────────────

  async deliver(tenantId: string, reportCardId: string) {
    const reportCard = await this.prisma.reportCard.findFirst({
      where: { id: reportCardId, tenant_id: tenantId },
      select: {
        id: true,
        status: true,
        student: {
          select: {
            id: true,
            student_parents: {
              select: { parent_id: true },
            },
          },
        },
      },
    });

    if (!reportCard) {
      throw new NotFoundException({
        error: {
          code: 'REPORT_CARD_NOT_FOUND',
          message: `Report card "${reportCardId}" not found`,
        },
      });
    }

    if (reportCard.status !== 'published') {
      throw new NotFoundException({
        error: {
          code: 'REPORT_CARD_NOT_PUBLISHED',
          message: 'Only published report cards can be delivered',
        },
      });
    }

    const parents = reportCard.student.student_parents.map((sp) => ({ id: sp.parent_id }));

    if (parents.length === 0) {
      return { delivered_count: 0, message: 'No parents/guardians found for this student' };
    }

    // Determine delivery channel from tenant settings
    const channel = await this.getDeliveryChannel(tenantId);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const deliveries = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const created: ReportCardDelivery[] = [];
      for (const parent of parents) {
        // Skip if already delivered
        const existing = await db.reportCardDelivery.findFirst({
          where: { tenant_id: tenantId, report_card_id: reportCardId, parent_id: parent.id },
        });
        if (existing) continue;

        // Primary delivery channel
        const delivery = await db.reportCardDelivery.create({
          data: {
            tenant_id: tenantId,
            report_card_id: reportCardId,
            parent_id: parent.id,
            channel,
            status: 'pending_delivery',
          },
        });
        created.push(delivery);

        // Always create in_app delivery as secondary
        if (channel !== 'in_app') {
          const inAppDelivery = await db.reportCardDelivery.create({
            data: {
              tenant_id: tenantId,
              report_card_id: reportCardId,
              parent_id: parent.id,
              channel: 'in_app',
              status: 'pending_delivery',
            },
          });
          created.push(inAppDelivery);
        }
      }
      return created;
    })) as ReportCardDelivery[];

    // Best-effort: mark in_app deliveries as sent immediately (they're DB-stored)
    for (const delivery of deliveries) {
      if (delivery.channel === 'in_app') {
        await this.prisma.reportCardDelivery
          .update({
            where: { id: delivery.id },
            data: { status: 'sent', sent_at: new Date() },
          })
          .catch(() => {
            this.logger.warn(`Failed to mark in_app delivery ${delivery.id} as sent`);
          });
      }
    }

    return { delivered_count: deliveries.length, deliveries };
  }

  // ─── Bulk Deliver ─────────────────────────────────────────────────────────

  async bulkDeliver(tenantId: string, reportCardIds: string[]) {
    const results: Array<{
      report_card_id: string;
      success: boolean;
      delivered_count?: number;
      error?: string;
    }> = [];

    for (const reportCardId of reportCardIds) {
      try {
        const result = await this.deliver(tenantId, reportCardId);
        results.push({
          report_card_id: reportCardId,
          success: true,
          delivered_count: result.delivered_count,
        });
      } catch (err) {
        results.push({
          report_card_id: reportCardId,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return { results, succeeded, failed };
  }

  // ─── Mark Viewed ──────────────────────────────────────────────────────────

  async markViewed(tenantId: string, deliveryId: string) {
    const delivery = await this.prisma.reportCardDelivery.findFirst({
      where: { id: deliveryId, tenant_id: tenantId },
    });

    if (!delivery) {
      throw new NotFoundException({
        error: {
          code: 'DELIVERY_NOT_FOUND',
          message: `Delivery record "${deliveryId}" not found`,
        },
      });
    }

    if (delivery.viewed_at) {
      return delivery; // Already viewed
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.reportCardDelivery.update({
        where: { id: deliveryId },
        data: { status: 'viewed', viewed_at: new Date() },
      });
    });
  }

  // ─── Get Delivery Status ──────────────────────────────────────────────────

  async getDeliveryStatus(tenantId: string, reportCardId: string) {
    const reportCard = await this.prisma.reportCard.findFirst({
      where: { id: reportCardId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!reportCard) {
      throw new NotFoundException({
        error: {
          code: 'REPORT_CARD_NOT_FOUND',
          message: `Report card "${reportCardId}" not found`,
        },
      });
    }

    const deliveries = await this.prisma.reportCardDelivery.findMany({
      where: { tenant_id: tenantId, report_card_id: reportCardId },
      orderBy: { created_at: 'desc' },
      include: {
        parent: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
      },
    });

    const summary = {
      total: deliveries.length,
      pending: deliveries.filter((d) => d.status === 'pending_delivery').length,
      sent: deliveries.filter((d) => d.status === 'sent').length,
      failed: deliveries.filter((d) => d.status === 'failed').length,
      viewed: deliveries.filter((d) => d.status === 'viewed').length,
    };

    return { summary, deliveries };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private async getDeliveryChannel(tenantId: string): Promise<'email' | 'whatsapp' | 'in_app'> {
    try {
      const settingsRow = await this.configurationReadFacade.findSettings(tenantId);

      const s = settingsRow?.settings as Record<string, unknown> | null;
      const reportCardSettings = s?.reportCards as Record<string, unknown> | undefined;
      const channel = reportCardSettings?.deliveryChannel as string | undefined;

      if (channel === 'whatsapp') return 'whatsapp';
      return 'email';
    } catch {
      return 'email';
    }
  }
}
