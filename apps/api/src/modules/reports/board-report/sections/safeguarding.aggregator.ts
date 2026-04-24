import { Injectable } from '@nestjs/common';

import type { SafeguardingSection } from '@school/shared/reports';

import type {
  PrismaTransaction,
  ResolvedTerm,
  SafeguardingAggregator,
  SectionAggregatorOptions,
} from './section-aggregator.types';

/**
 * Safeguarding aggregator.
 *
 * Reports on open concerns (board packets get counts not names by
 * default), the distribution of how long each concern has been open
 * (age histogram), total actions taken this term, and
 * critical-incidents count.
 *
 * `detail_summary` is a human-readable summary. When `anonymise=true`
 * (the default), it stays generic — "N concerns currently open across
 * K students". The DLP-detail variant (full names) is layered in by
 * the controller gating on `safeguarding.view_detail`.
 */
const AGE_BUCKETS: ReadonlyArray<{ label: string; lt_days: number }> = [
  { label: '0–7 days', lt_days: 8 },
  { label: '8–14 days', lt_days: 15 },
  { label: '15–30 days', lt_days: 31 },
  { label: '31–60 days', lt_days: 61 },
  { label: '61–90 days', lt_days: 91 },
  { label: '> 90 days', lt_days: Number.POSITIVE_INFINITY },
];
const RESOLVED_STATUSES = ['sg_resolved', 'sealed'] as const;
const CRITICAL_SEVERITIES = ['high_sev', 'critical_sev'] as const;

@Injectable()
export class SafeguardingSectionAggregator implements SafeguardingAggregator {
  readonly key = 'safeguarding' as const;

  async aggregate(
    tx: PrismaTransaction,
    tenantId: string,
    term: ResolvedTerm,
    _options: SectionAggregatorOptions,
  ): Promise<SafeguardingSection> {
    const [openConcerns, actionsThisTerm, criticalCount] = await Promise.all([
      tx.safeguardingConcern.findMany({
        where: {
          tenant_id: tenantId,
          status: { notIn: [...RESOLVED_STATUSES] },
        },
        select: { created_at: true, student_id: true },
      }),
      tx.safeguardingAction.count({
        where: {
          tenant_id: tenantId,
          created_at: { gte: term.term_start, lte: term.term_end },
        },
      }),
      tx.safeguardingConcern.count({
        where: {
          tenant_id: tenantId,
          severity: { in: [...CRITICAL_SEVERITIES] },
          created_at: { gte: term.term_start, lte: term.term_end },
        },
      }),
    ]);

    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const bucketCounts = AGE_BUCKETS.map((b) => ({ ...b, count: 0 }));
    let oldest = 0;

    for (const c of openConcerns) {
      const ageDays = Math.floor((now - c.created_at.getTime()) / DAY);
      if (ageDays > oldest) oldest = ageDays;
      for (const b of bucketCounts) {
        if (ageDays < b.lt_days) {
          b.count += 1;
          break;
        }
      }
    }

    const distinctStudents = new Set<string>();
    for (const c of openConcerns) distinctStudents.add(c.student_id);

    return {
      type: 'safeguarding',
      open_concerns_count: openConcerns.length,
      oldest_open_concern_age_days: openConcerns.length > 0 ? oldest : null,
      age_histogram: bucketCounts.map((b) => ({
        bucket_label: b.label,
        count: b.count,
      })),
      actions_taken_count: actionsThisTerm,
      critical_incidents_count: criticalCount,
      detail_summary:
        openConcerns.length === 0
          ? 'No open safeguarding concerns.'
          : `${openConcerns.length} open concern${
              openConcerns.length === 1 ? '' : 's'
            } across ${distinctStudents.size} student${distinctStudents.size === 1 ? '' : 's'}.`,
    };
  }
}
