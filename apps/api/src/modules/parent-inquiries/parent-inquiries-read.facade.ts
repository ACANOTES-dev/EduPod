import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Facade ─────────────────────────────────────────────────────────────────

/**
 * ParentInquiriesReadFacade — Read-only facade for parent inquiry data
 * consumed by other modules (early-warning, compliance).
 *
 * All reads use direct Prisma queries with `tenant_id` in `where` — no RLS
 * transaction needed for reads.
 */
@Injectable()
export class ParentInquiriesReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find parent inquiries by parent IDs within a date range.
   * Used by early-warning engagement signals to check parent engagement.
   */
  async findByParentIds(
    tenantId: string,
    parentIds: string[],
    dateRange?: { from: Date; to: Date },
  ): Promise<Array<{ id: string }>> {
    return this.prisma.parentInquiry.findMany({
      where: {
        tenant_id: tenantId,
        parent_id: { in: parentIds },
        ...(dateRange ? { created_at: { gte: dateRange.from, lte: dateRange.to } } : {}),
      },
      select: { id: true },
    });
  }

  /**
   * Count parent inquiries for a single parent within a date range.
   * Used by early-warning engagement signals.
   */
  async countByParentIds(
    tenantId: string,
    parentIds: string[],
    dateRange?: { from: Date; to: Date },
  ): Promise<number> {
    return this.prisma.parentInquiry.count({
      where: {
        tenant_id: tenantId,
        parent_id: { in: parentIds },
        ...(dateRange ? { created_at: { gte: dateRange.from, lte: dateRange.to } } : {}),
      },
    });
  }

  /**
   * Count parent inquiry messages before a cutoff date.
   * Used by retention-policies to determine purgeable records.
   */
  async countMessagesBeforeDate(tenantId: string, cutoffDate: Date): Promise<number> {
    return this.prisma.parentInquiryMessage.count({
      where: {
        tenant_id: tenantId,
        created_at: { lt: cutoffDate },
      },
    });
  }

  /**
   * Find all inquiries for a parent, including messages.
   * Used by DSAR traversal.
   */
  async findByParentIdWithMessages(tenantId: string, parentId: string): Promise<unknown[]> {
    return this.prisma.parentInquiry.findMany({
      where: { parent_id: parentId, tenant_id: tenantId },
      include: { messages: true },
      orderBy: { created_at: 'desc' },
    });
  }
}
