import { Injectable } from '@nestjs/common';

import type { AcademicSection } from '@school/shared/reports';

import type {
  AcademicAggregator,
  PrismaTransaction,
  ResolvedTerm,
  SectionAggregatorOptions,
} from './section-aggregator.types';
import { displayName, round, toNumber } from './section-aggregator.types';

/**
 * Academic Performance aggregator.
 *
 * Reports per-year-group pass/fail rates, per-subject averages, and
 * anonymised top/bottom performers for the requested term.
 *
 * Score% = `Grade.raw_score / Assessment.max_score`. Pass threshold is
 * 50%; matches the existing GradeAnalyticsService default. Top/bottom
 * 5 students by term average; display labels obey `options.anonymise`
 * (initials by default).
 */
const PASS_THRESHOLD_PCT = 50;
const PERFORMER_LIMIT = 5;

@Injectable()
export class AcademicSectionAggregator implements AcademicAggregator {
  readonly key = 'academic' as const;

  async aggregate(
    tx: PrismaTransaction,
    tenantId: string,
    term: ResolvedTerm,
    options: SectionAggregatorOptions,
  ): Promise<AcademicSection> {
    const grades = await tx.grade.findMany({
      where: {
        tenant_id: tenantId,
        is_missing: false,
        raw_score: { not: null },
        assessment: {
          academic_period_id: term.academic_period_id ?? undefined,
        },
      },
      select: {
        raw_score: true,
        student_id: true,
        student: {
          select: {
            first_name: true,
            last_name: true,
            year_group_id: true,
          },
        },
        assessment: {
          select: {
            max_score: true,
            subject_id: true,
            subject: { select: { id: true, name: true } },
          },
        },
      },
    });

    const yearGroups = await tx.yearGroup.findMany({
      where: { tenant_id: tenantId },
      select: { id: true, name: true },
    });
    const yearGroupMap = new Map<string, string>();
    for (const yg of yearGroups) yearGroupMap.set(yg.id, yg.name);

    type YearStats = { year_group_id: string | null; pass: number; fail: number };
    const yearStats = new Map<string | null, YearStats>();

    type SubjectStats = {
      subject_id: string | null;
      subject_name: string;
      sum_pct: number;
      count: number;
    };
    const subjectStats = new Map<string | null, SubjectStats>();

    type StudentStats = {
      student_id: string;
      first_name: string | null;
      last_name: string | null;
      year_group_id: string | null;
      sum_pct: number;
      count: number;
    };
    const studentStats = new Map<string, StudentStats>();

    for (const g of grades) {
      const max = toNumber(g.assessment.max_score);
      if (max <= 0) continue;
      const raw = toNumber(g.raw_score);
      const pct = (raw / max) * 100;
      const isPass = pct >= PASS_THRESHOLD_PCT;

      const ygId = g.student?.year_group_id ?? null;
      const ys = yearStats.get(ygId) ?? { year_group_id: ygId, pass: 0, fail: 0 };
      if (isPass) ys.pass += 1;
      else ys.fail += 1;
      yearStats.set(ygId, ys);

      const subId = g.assessment.subject?.id ?? null;
      const subName = g.assessment.subject?.name ?? 'Unknown';
      const ss = subjectStats.get(subId) ?? {
        subject_id: subId,
        subject_name: subName,
        sum_pct: 0,
        count: 0,
      };
      ss.sum_pct += pct;
      ss.count += 1;
      subjectStats.set(subId, ss);

      const stKey = g.student_id;
      const sts = studentStats.get(stKey) ?? {
        student_id: stKey,
        first_name: g.student?.first_name ?? null,
        last_name: g.student?.last_name ?? null,
        year_group_id: ygId,
        sum_pct: 0,
        count: 0,
      };
      sts.sum_pct += pct;
      sts.count += 1;
      studentStats.set(stKey, sts);
    }

    const pass_fail_by_year_group = Array.from(yearStats.values())
      .map((ys) => {
        const graded = ys.pass + ys.fail;
        return {
          year_group_id: ys.year_group_id,
          year_group_name: ys.year_group_id
            ? (yearGroupMap.get(ys.year_group_id) ?? 'Unassigned')
            : 'Unassigned',
          pass_rate_pct: graded > 0 ? round((ys.pass / graded) * 100, 1) : 0,
          fail_rate_pct: graded > 0 ? round((ys.fail / graded) * 100, 1) : 0,
          graded_count: graded,
        };
      })
      .sort((a, b) => a.year_group_name.localeCompare(b.year_group_name));

    const subject_averages = Array.from(subjectStats.values())
      .map((ss) => ({
        subject_id: ss.subject_id,
        subject_name: ss.subject_name,
        average_score_pct: ss.count > 0 ? round(ss.sum_pct / ss.count, 1) : 0,
        graded_count: ss.count,
      }))
      .sort((a, b) => b.average_score_pct - a.average_score_pct);

    const studentAverages = Array.from(studentStats.values())
      .filter((s) => s.count > 0)
      .map((s) => ({
        display_label: displayName(s.first_name, s.last_name, options.anonymise),
        year_group_name: s.year_group_id
          ? (yearGroupMap.get(s.year_group_id) ?? 'Unassigned')
          : 'Unassigned',
        average_score_pct: round(s.sum_pct / s.count, 1),
      }));
    studentAverages.sort((a, b) => b.average_score_pct - a.average_score_pct);

    const top_performers = studentAverages.slice(0, PERFORMER_LIMIT);
    const bottom_performers = studentAverages.slice(-PERFORMER_LIMIT).reverse();

    return {
      type: 'academic',
      pass_fail_by_year_group,
      subject_averages,
      top_performers,
      bottom_performers,
    };
  }
}
