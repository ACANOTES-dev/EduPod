/**
 * ComplianceReadFacade — Cross-module read access to compliance data.
 *
 * PURPOSE:
 * Surfaces counts and minimally-scoped row shapes off the `compliance_requests`
 * table (which this module owns) so other modules — specifically the regulatory
 * super-hub — can render "open DSAR" badges without reaching into the owning
 * module's Prisma surface directly.
 *
 * CONVENTIONS:
 * - Every method takes `tenantId: string` as the first parameter.
 * - `tenant_id` is in every `where` clause; no RLS transaction wrapping needed
 *   for counts.
 */
import { Injectable } from '@nestjs/common';
import { ComplianceRequestStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

// Compliance requests are "open" while they are in triage, classified, or
// approved but not yet executed. `completed` and `rejected` are terminal.
const OPEN_COMPLIANCE_STATUSES: ComplianceRequestStatus[] = [
  ComplianceRequestStatus.submitted,
  ComplianceRequestStatus.classified,
  ComplianceRequestStatus.approved,
];

// GDPR standard response window — 30 days from submission.
// A DSAR past this window without reaching a terminal state is "overdue".
const DSAR_OVERDUE_THRESHOLD_DAYS = 30;

export interface RecentDsarRow {
  id: string;
  request_type: string;
  subject_type: string;
  subject_id: string;
  status: string;
  created_at: Date;
}

@Injectable()
export class ComplianceReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Count open (non-terminal) compliance / DSAR requests for the regulatory
   * super-hub GDPR tile badge.
   */
  async countOpenDsarRequests(tenantId: string): Promise<number> {
    return this.prisma.complianceRequest.count({
      where: {
        tenant_id: tenantId,
        status: { in: OPEN_COMPLIANCE_STATUSES },
      },
    });
  }

  /**
   * Count DSARs that are still open and were submitted more than
   * DSAR_OVERDUE_THRESHOLD_DAYS ago. Drives the "Overdue DSARs" KPI on the
   * GDPR sub-hub.
   */
  async countOverdueDsarRequests(tenantId: string): Promise<number> {
    const cutoff = new Date(Date.now() - DSAR_OVERDUE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
    return this.prisma.complianceRequest.count({
      where: {
        tenant_id: tenantId,
        status: { in: OPEN_COMPLIANCE_STATUSES },
        created_at: { lt: cutoff },
      },
    });
  }

  /**
   * Return the N most recent DSAR requests (any status) for the GDPR sub-hub
   * recent-activity feed.
   */
  async findRecentDsarRequests(tenantId: string, limit: number): Promise<RecentDsarRow[]> {
    return this.prisma.complianceRequest.findMany({
      where: { tenant_id: tenantId },
      select: {
        id: true,
        request_type: true,
        subject_type: true,
        subject_id: true,
        status: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
  }
}
