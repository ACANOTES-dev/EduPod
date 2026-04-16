import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ClassesReadFacade } from '../../classes/classes-read.facade';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReportCardDashboard {
  period_id: string | null;
  total: number;
  published: number;
  draft: number;
  revised: number;
  pending_approval: number;
  completion_rate: number;
  /**
   * @deprecated Reads `report_cards.teacher_comment` which is the legacy
   * comment column. The new comment system writes to
   * report_card_overall_comments / report_card_subject_comments — use the
   * `_finalised` / `_total` counters below for an accurate metric. Kept on
   * the response shape so existing consumers don't break.
   */
  comment_fill_rate: number;
  // Round-2 QA: separate counters for the two comment subsystems. Both are
  // raw counts so the frontend can render "n / m finalised" instead of a
  // misleading single percentage. _total is the count of comments started
  // (any state); _finalised is the subset that have been finalised.
  overall_comments_finalised: number;
  overall_comments_total: number;
  subject_comments_finalised: number;
  subject_comments_total: number;
}

export interface ClassComparisonEntry {
  class_id: string;
  class_name: string;
  student_count: number;
  average_grade: number;
  published_count: number;
  completion_rate: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ReportCardAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classesReadFacade: ClassesReadFacade,
  ) {}

  // ─── Dashboard ────────────────────────────────────────────────────────────

  async getDashboard(tenantId: string, periodId?: string): Promise<ReportCardDashboard> {
    // Phase 1b — Option B: `'full_year'` sentinel scopes to NULL-period rows
    // (the full-year report cards aggregated across every period in the year).
    const isFullYear = periodId === 'full_year';
    const periodFilter: Prisma.ReportCardWhereInput = isFullYear
      ? { academic_period_id: null }
      : periodId
        ? { academic_period_id: periodId }
        : {};
    const where: Prisma.ReportCardWhereInput = {
      tenant_id: tenantId,
      ...periodFilter,
    };

    const [total, published, draft, revised] = await Promise.all([
      this.prisma.reportCard.count({ where }),
      this.prisma.reportCard.count({ where: { ...where, status: 'published' } }),
      this.prisma.reportCard.count({ where: { ...where, status: 'draft' } }),
      this.prisma.reportCard.count({ where: { ...where, status: 'revised' } }),
    ]);

    // Count report cards with pending approval steps
    const approvalPeriodFilter: Prisma.ReportCardApprovalWhereInput = isFullYear
      ? { report_card: { academic_period_id: null } }
      : periodId
        ? { report_card: { academic_period_id: periodId } }
        : {};
    const pendingApproval = await this.prisma.reportCardApproval.count({
      where: {
        tenant_id: tenantId,
        status: 'pending',
        ...approvalPeriodFilter,
      },
    });

    // Legacy comment_fill_rate: % of published report cards that have a
    // teacher comment in the deprecated `teacher_comment` column. Round-2
    // QA found this misleading because the new comment system writes to
    // separate tables — see overall/subject counters below for the
    // canonical metric.
    const publishedWithComment = await this.prisma.reportCard.count({
      where: {
        ...where,
        status: 'published',
        teacher_comment: { not: null },
      },
    });

    // Round-2 QA — comment counters from the new tables. Scope by period
    // (or null period for full-year). Counts apply to the comment rows
    // themselves, not the report cards: a teacher can have written 25
    // overall comments before any report cards exist for the period, so
    // these metrics answer "how much commenting work has been done?"
    // rather than "how many cards have a snapshot stamped?".
    const commentScopeFilter:
      | { academic_period_id: string }
      | { academic_period_id: null }
      | Record<string, never> = isFullYear
      ? { academic_period_id: null }
      : periodId
        ? { academic_period_id: periodId }
        : {};

    const [overallTotal, overallFinalised, subjectTotal, subjectFinalised] = await Promise.all([
      this.prisma.reportCardOverallComment.count({
        where: { tenant_id: tenantId, ...commentScopeFilter },
      }),
      this.prisma.reportCardOverallComment.count({
        where: { tenant_id: tenantId, finalised_at: { not: null }, ...commentScopeFilter },
      }),
      this.prisma.reportCardSubjectComment.count({
        where: { tenant_id: tenantId, ...commentScopeFilter },
      }),
      this.prisma.reportCardSubjectComment.count({
        where: { tenant_id: tenantId, finalised_at: { not: null }, ...commentScopeFilter },
      }),
    ]);

    // Completion rate = published / total generated (not enrolled students).
    // Both the dashboard snapshot and the full analytics page display this
    // value — using the same denominator (total) keeps them consistent.
    const completionRate = total > 0 ? Math.round((published / total) * 10000) / 100 : 0;

    const commentFillRate =
      published > 0 ? Math.round((publishedWithComment / published) * 10000) / 100 : 0;

    return {
      period_id: periodId ?? null,
      total,
      published,
      draft,
      revised,
      pending_approval: pendingApproval,
      completion_rate: completionRate,
      comment_fill_rate: commentFillRate,
      overall_comments_finalised: overallFinalised,
      overall_comments_total: overallTotal,
      subject_comments_finalised: subjectFinalised,
      subject_comments_total: subjectTotal,
    };
  }

  // ─── Class Comparison ─────────────────────────────────────────────────────

  async getClassComparison(tenantId: string, periodId: string): Promise<ClassComparisonEntry[]> {
    // Phase 1b — Option B: the `'full_year'` sentinel matches report cards
    // that scope across a whole academic year (academic_period_id IS NULL).
    // An empty string means "no period selected" — return an empty array
    // rather than hitting Prisma with an invalid UUID cast.
    if (!periodId) return [];
    const periodFilter: Prisma.ReportCardWhereInput =
      periodId === 'full_year' ? { academic_period_id: null } : { academic_period_id: periodId };
    // Get all classes that have report cards for this period
    const reportCards = await this.prisma.reportCard.findMany({
      where: {
        tenant_id: tenantId,
        ...periodFilter,
      },
      select: {
        id: true,
        status: true,
        snapshot_payload_json: true,
        student: {
          select: {
            id: true,
            homeroom_class: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    // Group by class
    const classMap = new Map<
      string,
      {
        class_id: string;
        class_name: string;
        grades: number[];
        student_ids: Set<string>;
        published_count: number;
      }
    >();

    for (const rc of reportCards) {
      const classId = rc.student.homeroom_class?.id;
      const className = rc.student.homeroom_class?.name;
      if (!classId || !className) continue;

      if (!classMap.has(classId)) {
        classMap.set(classId, {
          class_id: classId,
          class_name: className,
          grades: [],
          student_ids: new Set(),
          published_count: 0,
        });
      }

      const entry = classMap.get(classId)!;
      entry.student_ids.add(rc.student.id);

      if (rc.status === 'published') {
        entry.published_count += 1;

        // Extract average grade from snapshot
        const payload = rc.snapshot_payload_json as Record<string, unknown> | null;
        const subjects = payload?.subjects as Array<{ computed_value: number }> | undefined;
        if (subjects && subjects.length > 0) {
          const avg =
            subjects.reduce((sum, s) => sum + (s.computed_value ?? 0), 0) / subjects.length;
          entry.grades.push(avg);
        }
      }
    }

    const results: ClassComparisonEntry[] = [];

    for (const [, entry] of classMap.entries()) {
      const studentCount = entry.student_ids.size;
      const averageGrade =
        entry.grades.length > 0
          ? Math.round((entry.grades.reduce((s, v) => s + v, 0) / entry.grades.length) * 100) / 100
          : 0;
      const completionRate =
        studentCount > 0 ? Math.round((entry.published_count / studentCount) * 10000) / 100 : 0;

      results.push({
        class_id: entry.class_id,
        class_name: entry.class_name,
        student_count: studentCount,
        average_grade: averageGrade,
        published_count: entry.published_count,
        completion_rate: completionRate,
      });
    }

    // Sort by class name
    results.sort((a, b) => a.class_name.localeCompare(b.class_name));

    return results;
  }
}
