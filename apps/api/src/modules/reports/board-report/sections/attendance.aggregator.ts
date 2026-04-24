import { Injectable } from '@nestjs/common';

import type { AttendanceSection } from '@school/shared/reports';

import type {
  AttendanceAggregator,
  PrismaTransaction,
  ResolvedTerm,
  SectionAggregatorOptions,
} from './section-aggregator.types';
import { round } from './section-aggregator.types';

/**
 * Attendance aggregator.
 *
 * Reports the term's session-level attendance rate, per-year-group
 * breakdown, chronic-absenteeism count (students with <85% attendance
 * over the term), and the day-of-week pattern. `late` / `left_early`
 * still count as present for the numerator — they did show up at some
 * point; only `absent_unexcused` / `absent_excused` count as missed.
 */
const PRESENT_STATUSES = ['present', 'late', 'left_early'] as const;
const CHRONIC_THRESHOLD_PCT = 85;
const WEEKDAY_LABELS: ReadonlyArray<string> = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

@Injectable()
export class AttendanceSectionAggregator implements AttendanceAggregator {
  readonly key = 'attendance' as const;

  async aggregate(
    tx: PrismaTransaction,
    tenantId: string,
    term: ResolvedTerm,
    _options: SectionAggregatorOptions,
  ): Promise<AttendanceSection> {
    const records = await tx.attendanceRecord.findMany({
      where: {
        tenant_id: tenantId,
        session: {
          session_date: { gte: term.term_start, lte: term.term_end },
        },
      },
      select: {
        status: true,
        student_id: true,
        student: { select: { year_group_id: true } },
        session: { select: { session_date: true } },
      },
    });

    const yearGroups = await tx.yearGroup.findMany({
      where: { tenant_id: tenantId },
      select: { id: true, name: true },
    });
    const yearGroupMap = new Map<string, string>();
    for (const yg of yearGroups) yearGroupMap.set(yg.id, yg.name);

    const totals = { present: 0, total: 0 };
    type RateBucket = { present: number; total: number };
    const byYg = new Map<string | null, RateBucket>();
    const byWeekday = new Map<number, RateBucket>();
    const studentStats = new Map<string, RateBucket>();

    for (const r of records) {
      const isPresent = (PRESENT_STATUSES as readonly string[]).includes(r.status);

      totals.total += 1;
      if (isPresent) totals.present += 1;

      const ygId = r.student?.year_group_id ?? null;
      const ygBucket = byYg.get(ygId) ?? { present: 0, total: 0 };
      ygBucket.total += 1;
      if (isPresent) ygBucket.present += 1;
      byYg.set(ygId, ygBucket);

      const weekday = r.session.session_date.getUTCDay();
      const wdBucket = byWeekday.get(weekday) ?? { present: 0, total: 0 };
      wdBucket.total += 1;
      if (isPresent) wdBucket.present += 1;
      byWeekday.set(weekday, wdBucket);

      const stBucket = studentStats.get(r.student_id) ?? { present: 0, total: 0 };
      stBucket.total += 1;
      if (isPresent) stBucket.present += 1;
      studentStats.set(r.student_id, stBucket);
    }

    const average_rate_pct = totals.total > 0 ? round((totals.present / totals.total) * 100, 1) : 0;

    const rate_by_year_group = Array.from(byYg.entries())
      .map(([id, bucket]) => ({
        year_group_id: id,
        year_group_name: id ? (yearGroupMap.get(id) ?? 'Unassigned') : 'Unassigned',
        rate_pct: bucket.total > 0 ? round((bucket.present / bucket.total) * 100, 1) : 0,
      }))
      .sort((a, b) => a.year_group_name.localeCompare(b.year_group_name));

    const day_of_week_pattern = Array.from(byWeekday.entries())
      .map(([weekday, bucket]) => ({
        weekday,
        weekday_label: WEEKDAY_LABELS[weekday] ?? `Day ${weekday}`,
        rate_pct: bucket.total > 0 ? round((bucket.present / bucket.total) * 100, 1) : 0,
      }))
      .sort((a, b) => a.weekday - b.weekday);

    let chronic_absenteeism_count = 0;
    for (const bucket of studentStats.values()) {
      if (bucket.total === 0) continue;
      const pct = (bucket.present / bucket.total) * 100;
      if (pct < CHRONIC_THRESHOLD_PCT) chronic_absenteeism_count += 1;
    }

    return {
      type: 'attendance',
      average_rate_pct,
      rate_by_year_group,
      chronic_absenteeism_count,
      chronic_absenteeism_threshold_pct: CHRONIC_THRESHOLD_PCT,
      day_of_week_pattern,
    };
  }
}
