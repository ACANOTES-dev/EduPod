import { Injectable } from '@nestjs/common';

import type { ExecutiveSummarySection } from '@school/shared/reports';

import type {
  ExecutiveSummaryAggregator,
  PrismaTransaction,
  ResolvedTerm,
  SectionAggregatorOptions,
} from './section-aggregator.types';
import { round, toNumber } from './section-aggregator.types';

/**
 * Executive Summary aggregator — rolls up the five headline metrics
 * (headcount, attendance rate, collection rate, at-risk count,
 * safeguarding caseload) that sit at the top of the board packet. The
 * `narrative` field stays empty here; impl 10 (AI narration) populates
 * it when the tenant has `reports_narration` enabled.
 */
@Injectable()
export class ExecutiveSummarySectionAggregator implements ExecutiveSummaryAggregator {
  readonly key = 'executive' as const;

  async aggregate(
    tx: PrismaTransaction,
    tenantId: string,
    term: ResolvedTerm,
    _options: SectionAggregatorOptions,
  ): Promise<ExecutiveSummarySection> {
    const [headcount, attendanceStats, invoiceAgg, atRiskCount, safeguardingCount] =
      await Promise.all([
        tx.student.count({
          where: { tenant_id: tenantId, status: 'active' },
        }),
        tx.attendanceRecord.groupBy({
          by: ['status'],
          where: {
            tenant_id: tenantId,
            session: {
              session_date: { gte: term.term_start, lte: term.term_end },
            },
          },
          _count: true,
        }),
        tx.invoice.aggregate({
          where: {
            tenant_id: tenantId,
            issue_date: { gte: term.term_start, lte: term.term_end },
          },
          _sum: { total_amount: true, balance_amount: true },
        }),
        tx.studentAcademicRiskAlert.count({
          where: {
            tenant_id: tenantId,
            created_at: { gte: term.term_start, lte: term.term_end },
          },
        }),
        tx.safeguardingConcern.count({
          where: {
            tenant_id: tenantId,
            status: { notIn: ['sg_resolved', 'sealed'] },
          },
        }),
      ]);

    // Attendance rate = present-ish / total, across the term.
    const PRESENT_STATUSES = ['present', 'late', 'left_early'] as const;
    const totalSessions = attendanceStats.reduce((sum, g) => sum + g._count, 0);
    const presentSessions = attendanceStats
      .filter((g) => (PRESENT_STATUSES as readonly string[]).includes(g.status))
      .reduce((sum, g) => sum + g._count, 0);
    const attendanceRatePct =
      totalSessions > 0 ? round((presentSessions / totalSessions) * 100, 1) : 0;

    // Collection rate = (issued - outstanding) / issued.
    const invoiced = toNumber(invoiceAgg._sum.total_amount);
    const outstanding = toNumber(invoiceAgg._sum.balance_amount);
    const collectionRatePct =
      invoiced > 0 ? round(((invoiced - outstanding) / invoiced) * 100, 1) : 0;

    return {
      type: 'executive',
      headline_metrics: {
        student_headcount: headcount,
        attendance_rate_pct: attendanceRatePct,
        collection_rate_pct: collectionRatePct,
        at_risk_student_count: atRiskCount,
        open_safeguarding_concerns: safeguardingCount,
      },
      narrative: '',
    };
  }
}
