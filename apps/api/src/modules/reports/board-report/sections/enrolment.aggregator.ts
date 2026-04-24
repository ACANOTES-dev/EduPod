import { Injectable } from '@nestjs/common';

import type { EnrolmentSection } from '@school/shared/reports';

import type {
  EnrolmentAggregator,
  PrismaTransaction,
  ResolvedTerm,
  SectionAggregatorOptions,
} from './section-aggregator.types';

/**
 * Enrolment & Demographics aggregator.
 *
 * Reports the student body as it stood during the requested term.
 * "Active" students whose `entry_date <= term_end` (or null) and
 * `exit_date >= term_start` (or null) are counted; the prior-term
 * comparison uses the same definition shifted to the prior term's
 * bounds. Year-group display names are looked up in bulk; students
 * with no year group assigned bucket under the literal label
 * "Unassigned".
 */
@Injectable()
export class EnrolmentSectionAggregator implements EnrolmentAggregator {
  readonly key = 'enrolment' as const;

  async aggregate(
    tx: PrismaTransaction,
    tenantId: string,
    term: ResolvedTerm,
    _options: SectionAggregatorOptions,
  ): Promise<EnrolmentSection> {
    const [students, priorStudents, yearGroups] = await Promise.all([
      tx.student.findMany({
        where: this.enrolledDuring(tenantId, term.term_start, term.term_end),
        select: {
          year_group_id: true,
          gender: true,
          nationality: true,
        },
      }),
      term.prior_term
        ? tx.student.count({
            where: this.enrolledDuring(
              tenantId,
              term.prior_term.term_start,
              term.prior_term.term_end,
            ),
          })
        : Promise.resolve(0),
      tx.yearGroup.findMany({
        where: { tenant_id: tenantId },
        select: { id: true, name: true },
      }),
    ]);

    const yearGroupMap = new Map<string, string>();
    for (const yg of yearGroups) yearGroupMap.set(yg.id, yg.name);

    const headcountByYearGroup = new Map<string | null, number>();
    const genderSplit = new Map<string, number>();
    const nationalitySplit = new Map<string, number>();

    for (const student of students) {
      const ygId = student.year_group_id ?? null;
      headcountByYearGroup.set(ygId, (headcountByYearGroup.get(ygId) ?? 0) + 1);

      const gender = student.gender ?? 'unknown';
      genderSplit.set(gender, (genderSplit.get(gender) ?? 0) + 1);

      const nationality = (student.nationality ?? '').trim() || 'unknown';
      nationalitySplit.set(nationality, (nationalitySplit.get(nationality) ?? 0) + 1);
    }

    const headcount_by_year_group = Array.from(headcountByYearGroup.entries())
      .map(([id, count]) => ({
        year_group_id: id,
        year_group_name: id ? (yearGroupMap.get(id) ?? 'Unassigned') : 'Unassigned',
        count,
      }))
      .sort((a, b) => a.year_group_name.localeCompare(b.year_group_name));

    const gender_split = Array.from(genderSplit.entries())
      .map(([gender, count]) => ({ gender, count }))
      .sort((a, b) => b.count - a.count);

    const nationality_split = Array.from(nationalitySplit.entries())
      .map(([nationality, count]) => ({ nationality, count }))
      .sort((a, b) => b.count - a.count);

    return {
      type: 'enrolment',
      total_headcount: students.length,
      headcount_by_year_group,
      gender_split,
      nationality_split,
      enrolment_change_vs_prior_term: {
        current: students.length,
        prior: priorStudents,
        delta: students.length - priorStudents,
      },
    };
  }

  private enrolledDuring(tenantId: string, start: Date, end: Date) {
    return {
      tenant_id: tenantId,
      status: 'active' as const,
      AND: [
        { OR: [{ entry_date: null }, { entry_date: { lte: end } }] },
        { OR: [{ exit_date: null }, { exit_date: { gte: start } }] },
      ],
    };
  }
}
