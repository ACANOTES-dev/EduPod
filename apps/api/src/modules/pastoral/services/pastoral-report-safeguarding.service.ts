import { Injectable, Logger } from '@nestjs/common';

import type { ReportFilterDto } from '@school/shared/pastoral';

import type { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';
import type { SafeguardingComplianceReportData } from './pastoral-report.service';

// ─── Helpers ───────────────────────────────────────────────────────────────

function defaultDateRange(filters: ReportFilterDto): { from: Date; to: Date } {
  const to = filters.to_date ? new Date(filters.to_date) : new Date();
  const from = filters.from_date
    ? new Date(filters.from_date)
    : new Date(to.getFullYear() - 1, to.getMonth(), to.getDate());
  return { from, to };
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0] ?? '';
}

// ─── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class PastoralReportSafeguardingService {
  private readonly logger = new Logger(PastoralReportSafeguardingService.name);

  constructor(private readonly eventService: PastoralEventService) {}

  // ─── CP Access Check ──────────────────────────────────────────────────────

  private async hasCpAccess(db: PrismaService, tenantId: string, userId: string): Promise<boolean> {
    const grant = await db.cpAccessGrant.findFirst({
      where: {
        tenant_id: tenantId,
        user_id: userId,
        revoked_at: null,
      },
    });
    return grant !== null;
  }

  // ─── Build Safeguarding Compliance Report ─────────────────────────────────

  async build(
    db: PrismaService,
    tenantId: string,
    userId: string,
    filters: ReportFilterDto,
  ): Promise<SafeguardingComplianceReportData> {
    const { from, to } = defaultDateRange(filters);

    // 1. CP access check
    const cpAccess = await this.hasCpAccess(db, tenantId, userId);

    // 2. Concern counts by tier
    const tier1Count = await db.pastoralConcern.count({
      where: { tenant_id: tenantId, tier: 1, created_at: { gte: from, lte: to } },
    });
    const tier2Count = await db.pastoralConcern.count({
      where: { tenant_id: tenantId, tier: 2, created_at: { gte: from, lte: to } },
    });
    let tier3Count: number | null = null;
    if (cpAccess) {
      tier3Count = await db.pastoralConcern.count({
        where: { tenant_id: tenantId, tier: 3, created_at: { gte: from, lte: to } },
      });
    }

    // 3. Mandated reports (CP access only)
    let mandatedReports: { total: number; by_status: Record<string, number> } | null = null;
    if (cpAccess) {
      const cpRecords = await db.cpRecord.findMany({
        where: {
          tenant_id: tenantId,
          created_at: { gte: from, lte: to },
          mandated_report_status: { not: null },
        },
        select: { mandated_report_status: true },
      });

      const byStatus: Record<string, number> = {};
      for (const rec of cpRecords) {
        const status = String(rec.mandated_report_status);
        byStatus[status] = (byStatus[status] ?? 0) + 1;
      }

      mandatedReports = {
        total: cpRecords.length,
        by_status: byStatus,
      };
    }

    // 4. Training compliance — use placeholders as training data may not be available
    const staffTotal = await db.staffProfile.count({
      where: { tenant_id: tenantId },
    });

    const trainingCompliance = {
      dlp_name: 'Not configured',
      dlp_training_date: null as string | null,
      deputy_dlp_name: 'Not configured',
      deputy_dlp_training_date: null as string | null,
      staff_trained_count: 0,
      staff_total_count: staffTotal,
      staff_compliance_rate: 0,
      non_compliant_staff: [] as Array<{ name: string; user_id: string }>,
    };

    // 5. Child safeguarding statement — placeholders
    const childSafeguardingStatement = {
      last_review_date: null as string | null,
      next_review_due: null as string | null,
      board_signed_off: false,
    };

    // 6. Active CP cases (CP access only)
    let activeCpCases: number | null = null;
    if (cpAccess) {
      activeCpCases = await db.pastoralCase.count({
        where: {
          tenant_id: tenantId,
          tier: 3,
          status: { in: ['open', 'active', 'monitoring'] },
        },
      });
    }

    const result: SafeguardingComplianceReportData = {
      period: { from: toISODate(from), to: toISODate(to) },
      concern_counts: {
        tier_1: tier1Count,
        tier_2: tier2Count,
        tier_3: tier3Count,
      },
      mandated_reports: mandatedReports,
      training_compliance: trainingCompliance,
      child_safeguarding_statement: childSafeguardingStatement,
      active_cp_cases: activeCpCases,
    };

    // Fire audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'report_generated',
      entity_type: 'export',
      entity_id: 'report',
      student_id: null,
      actor_user_id: userId,
      tier: 1,
      payload: {
        report_type: 'safeguarding_compliance',
        requested_by: userId,
        filters,
      },
      ip_address: null,
    });

    return result;
  }
}
