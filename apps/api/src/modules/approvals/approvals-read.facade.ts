/**
 * ApprovalsReadFacade — Centralized read service for approval workflow and request data.
 *
 * PURPOSE:
 * The reports module (reports-data-access.service.ts) needs to count approval requests
 * across tenants. This facade provides a single entry point so the reports module does
 * not query the approval_requests table directly.
 *
 * CONVENTIONS:
 * - Every method starts with `tenantId: string` as the first parameter.
 * - No RLS transaction needed for reads — `tenant_id` is in every `where` clause.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Facade ───────────────────────────────────────────────────────────────────

@Injectable()
export class ApprovalsReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Count approval requests matching optional status filter.
   * Used by reports-data-access for dashboard counts.
   */
  async countRequests(
    tenantId: string,
    options: {
      status?: string;
      actionType?: string;
    } = {},
  ): Promise<number> {
    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (options.status) where.status = options.status;
    if (options.actionType) where.action_type = options.actionType;

    return this.prisma.approvalRequest.count({ where });
  }
}
