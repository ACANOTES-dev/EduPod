import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ReportCardAcknowledgmentService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Acknowledge ──────────────────────────────────────────────────────────

  async acknowledge(
    tenantId: string,
    reportCardId: string,
    parentId: string,
    ipAddress?: string,
  ) {
    const reportCard = await this.prisma.reportCard.findFirst({
      where: { id: reportCardId, tenant_id: tenantId },
      select: { id: true, status: true },
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
      throw new ConflictException({
        error: {
          code: 'REPORT_CARD_NOT_PUBLISHED',
          message: 'Only published report cards can be acknowledged',
        },
      });
    }

    // Check if already acknowledged
    const existing = await this.prisma.reportCardAcknowledgment.findFirst({
      where: { tenant_id: tenantId, report_card_id: reportCardId, parent_id: parentId },
    });
    if (existing) {
      return existing; // Idempotent — return existing
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.reportCardAcknowledgment.create({
        data: {
          tenant_id: tenantId,
          report_card_id: reportCardId,
          parent_id: parentId,
          acknowledged_at: new Date(),
          ip_address: ipAddress ?? null,
        },
      });
    });
  }

  // ─── Get Acknowledgment Status ────────────────────────────────────────────

  async getAcknowledgmentStatus(tenantId: string, reportCardId: string) {
    const reportCard = await this.prisma.reportCard.findFirst({
      where: { id: reportCardId, tenant_id: tenantId },
      select: {
        id: true,
        student: {
          select: {
            id: true,
            student_parents: {
              select: {
                parent: {
                  select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                  },
                },
              },
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

    const parents = reportCard.student.student_parents.map((sp) => ({
      id: sp.parent.id,
      first_name: sp.parent.first_name,
      last_name: sp.parent.last_name,
    }));

    const acknowledgments = await this.prisma.reportCardAcknowledgment.findMany({
      where: { tenant_id: tenantId, report_card_id: reportCardId },
    });

    const acknowledgedParentIds = new Set(acknowledgments.map((a) => a.parent_id));

    const parentStatuses = parents.map((parent) => ({
      parent_id: parent.id,
      parent_name: `${parent.first_name} ${parent.last_name}`,
      acknowledged: acknowledgedParentIds.has(parent.id),
      acknowledged_at: acknowledgments.find((a) => a.parent_id === parent.id)?.acknowledged_at ?? null,
    }));

    const totalParents = parents.length;
    const acknowledgedCount = parentStatuses.filter((p) => p.acknowledged).length;

    return {
      report_card_id: reportCardId,
      total_parents: totalParents,
      acknowledged_count: acknowledgedCount,
      all_acknowledged: totalParents > 0 && acknowledgedCount === totalParents,
      parent_statuses: parentStatuses,
    };
  }
}
