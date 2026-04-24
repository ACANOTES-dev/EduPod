import { Injectable } from '@nestjs/common';

import type { StaffingSection } from '@school/shared/reports';

import type {
  PrismaTransaction,
  ResolvedTerm,
  SectionAggregatorOptions,
  StaffingAggregator,
} from './section-aggregator.types';
import { round } from './section-aggregator.types';

/**
 * Staffing aggregator.
 *
 * Reports headcount (active vs inactive), turnover in the term window,
 * staff attendance rate (present + half_day over total), pending leave
 * requests, and unfilled cover gaps.
 *
 * We use `StaffProfile.created_at` as a proxy for "arrivals" in the
 * term window (first time the profile existed); "departures" are
 * profiles that flipped to `employment_status='inactive'` during the
 * term. The schema has no explicit start/end-date columns, so these
 * are the best signals available today.
 */
const STAFF_PRESENT_STATUSES = ['present', 'half_day'] as const;

@Injectable()
export class StaffingSectionAggregator implements StaffingAggregator {
  readonly key = 'staffing' as const;

  async aggregate(
    tx: PrismaTransaction,
    tenantId: string,
    term: ResolvedTerm,
    _options: SectionAggregatorOptions,
  ): Promise<StaffingSection> {
    const [
      active,
      inactive,
      arrivals,
      departures,
      attendanceGroups,
      pendingLeave,
      absences,
      coverAbsences,
    ] = await Promise.all([
      tx.staffProfile.count({
        where: { tenant_id: tenantId, employment_status: 'active' },
      }),
      tx.staffProfile.count({
        where: { tenant_id: tenantId, employment_status: 'inactive' },
      }),
      tx.staffProfile.count({
        where: {
          tenant_id: tenantId,
          created_at: { gte: term.term_start, lte: term.term_end },
        },
      }),
      tx.staffProfile.count({
        where: {
          tenant_id: tenantId,
          employment_status: 'inactive',
          updated_at: { gte: term.term_start, lte: term.term_end },
        },
      }),
      tx.staffAttendanceRecord.groupBy({
        by: ['status'],
        where: {
          tenant_id: tenantId,
          date: { gte: term.term_start, lte: term.term_end },
        },
        _count: true,
      }),
      tx.leaveRequest.count({
        where: { tenant_id: tenantId, status: 'pending' },
      }),
      tx.teacherAbsence.count({
        where: {
          tenant_id: tenantId,
          absence_date: { gte: term.term_start, lte: term.term_end },
          cancelled_at: null,
        },
      }),
      tx.teacherAbsence.findMany({
        where: {
          tenant_id: tenantId,
          absence_date: { gte: term.term_start, lte: term.term_end },
          cancelled_at: null,
        },
        select: {
          id: true,
          substitution_records: { select: { id: true }, take: 1 },
        },
      }),
    ]);

    const totalStatus = attendanceGroups.reduce((sum, g) => sum + g._count, 0);
    const presentStatus = attendanceGroups
      .filter((g) => (STAFF_PRESENT_STATUSES as readonly string[]).includes(g.status))
      .reduce((sum, g) => sum + g._count, 0);
    const attendance_rate_pct = totalStatus > 0 ? round((presentStatus / totalStatus) * 100, 1) : 0;

    const coverGapsUnfilled = coverAbsences.filter(
      (a) => a.substitution_records.length === 0,
    ).length;

    return {
      type: 'staffing',
      headcount_active: active,
      headcount_inactive: inactive,
      turnover_this_term: { arrivals, departures },
      attendance_rate_pct,
      pending_leave_requests: pendingLeave,
      absences_this_term: absences,
      cover_gaps_unfilled: coverGapsUnfilled,
    };
  }
}
