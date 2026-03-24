import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReportCardDashboard {
  period_id: string | null;
  total: number;
  published: number;
  draft: number;
  revised: number;
  pending_approval: number;
  completion_rate: number;
  comment_fill_rate: number;
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
  constructor(private readonly prisma: PrismaService) {}

  // ─── Dashboard ────────────────────────────────────────────────────────────

  async getDashboard(tenantId: string, periodId?: string): Promise<ReportCardDashboard> {
    const where = {
      tenant_id: tenantId,
      ...(periodId ? { academic_period_id: periodId } : {}),
    };

    const [total, published, draft, revised] = await Promise.all([
      this.prisma.reportCard.count({ where }),
      this.prisma.reportCard.count({ where: { ...where, status: 'published' } }),
      this.prisma.reportCard.count({ where: { ...where, status: 'draft' } }),
      this.prisma.reportCard.count({ where: { ...where, status: 'revised' } }),
    ]);

    // Count report cards with pending approval steps
    const pendingApproval = await this.prisma.reportCardApproval.count({
      where: {
        tenant_id: tenantId,
        status: 'pending',
        ...(periodId
          ? { report_card: { academic_period_id: periodId } }
          : {}),
      },
    });

    // Comment fill rate: % of published report cards that have a teacher comment
    const publishedWithComment = await this.prisma.reportCard.count({
      where: {
        ...where,
        status: 'published',
        teacher_comment: { not: null },
      },
    });

    // Count students who have published report cards for this period
    const activeStudents = periodId
      ? await this.prisma.classEnrolment.count({
          where: { tenant_id: tenantId, status: 'active' },
        })
      : 0;

    const completionRate =
      activeStudents > 0 ? Math.round((published / activeStudents) * 10000) / 100 : 0;

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
    };
  }

  // ─── Class Comparison ─────────────────────────────────────────────────────

  async getClassComparison(tenantId: string, periodId: string): Promise<ClassComparisonEntry[]> {
    // Get all classes that have report cards for this period
    const reportCards = await this.prisma.reportCard.findMany({
      where: {
        tenant_id: tenantId,
        academic_period_id: periodId,
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
    const classMap = new Map<string, {
      class_id: string;
      class_name: string;
      grades: number[];
      student_ids: Set<string>;
      published_count: number;
    }>();

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
          const avg = subjects.reduce((sum, s) => sum + (s.computed_value ?? 0), 0) / subjects.length;
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
        studentCount > 0
          ? Math.round((entry.published_count / studentCount) * 10000) / 100
          : 0;

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
