import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { NotificationsService } from '../../communications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AiProgressSummaryService } from '../ai/ai-progress-summary.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReadinessRow {
  assessment_id: string;
  assessment_title: string;
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  period_id: string;
  period_name: string;
  graded_count: number;
  enrolled_count: number;
  completion_percent: number;
  published_at: string | null;
  status: 'ready' | 'incomplete' | 'published';
}

interface ReadinessDashboardQuery {
  period_id?: string;
  class_id?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class GradePublishingService {
  private readonly logger = new Logger(GradePublishingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly aiProgressSummaryService: AiProgressSummaryService,
  ) {}

  // ─── D1: Readiness Dashboard ──────────────────────────────────────────────

  async getReadinessDashboard(
    tenantId: string,
    query: ReadinessDashboardQuery,
  ): Promise<{ data: ReadinessRow[] }> {
    const assessmentWhere: Record<string, unknown> = {
      tenant_id: tenantId,
    };
    if (query.period_id) assessmentWhere.academic_period_id = query.period_id;
    if (query.class_id) assessmentWhere.class_id = query.class_id;

    const assessments = await this.prisma.assessment.findMany({
      where: assessmentWhere,
      select: {
        id: true,
        title: true,
        class_id: true,
        subject_id: true,
        academic_period_id: true,
        grades_published_at: true,
        class_entity: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        academic_period: { select: { id: true, name: true } },
        grades: {
          select: { student_id: true, raw_score: true, is_missing: true },
        },
      },
      orderBy: [
        { academic_period: { start_date: 'asc' } },
        { class_entity: { name: 'asc' } },
        { subject: { name: 'asc' } },
      ],
    });

    // Get enrolled student counts per class
    const classIds = [...new Set(assessments.map((a) => a.class_id))];
    const enrolmentCounts = await this.prisma.classEnrolment.groupBy({
      by: ['class_id'],
      where: {
        tenant_id: tenantId,
        class_id: { in: classIds },
        status: 'active',
      },
      _count: { student_id: true },
    });

    const enrolmentMap = new Map<string, number>();
    for (const e of enrolmentCounts) {
      enrolmentMap.set(e.class_id, e._count.student_id);
    }

    const rows: ReadinessRow[] = assessments.map((a) => {
      const enrolledCount = enrolmentMap.get(a.class_id) ?? 0;
      const gradedCount = a.grades.filter(
        (g) => g.raw_score !== null || g.is_missing,
      ).length;

      const completionPercent =
        enrolledCount > 0
          ? Math.round((gradedCount / enrolledCount) * 100)
          : 0;

      let status: ReadinessRow['status'];
      if (a.grades_published_at) {
        status = 'published';
      } else if (completionPercent >= 100) {
        status = 'ready';
      } else {
        status = 'incomplete';
      }

      return {
        assessment_id: a.id,
        assessment_title: a.title,
        class_id: a.class_id,
        class_name: a.class_entity.name,
        subject_id: a.subject_id,
        subject_name: a.subject.name,
        period_id: a.academic_period_id,
        period_name: a.academic_period.name,
        graded_count: gradedCount,
        enrolled_count: enrolledCount,
        completion_percent: completionPercent,
        published_at: a.grades_published_at
          ? a.grades_published_at.toISOString()
          : null,
        status,
      };
    });

    return { data: rows };
  }

  // ─── D1: Publish Grades (per assessment) ─────────────────────────────────

  async publishGrades(
    tenantId: string,
    userId: string,
    assessmentIds: string[],
  ): Promise<{ published: number; assessment_ids: string[] }> {
    // Verify all assessments belong to tenant
    const assessments = await this.prisma.assessment.findMany({
      where: {
        id: { in: assessmentIds },
        tenant_id: tenantId,
        grades_published_at: null,
      },
      select: {
        id: true,
        title: true,
        subject: { select: { name: true } },
        grades: {
          where: { raw_score: { not: null } },
          select: {
            student_id: true,
            student: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                student_parents: {
                  select: {
                    parent: {
                      select: { user_id: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (assessments.length === 0) {
      return { published: 0, assessment_ids: [] };
    }

    const now = new Date();
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    // Update assessments in a transaction
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      for (const assessment of assessments) {
        await db.assessment.update({
          where: { id: assessment.id },
          data: {
            grades_published_at: now,
            grades_published_by_user_id: userId,
          },
        });
      }
    });

    // Collect unique parent user IDs and student IDs for notifications
    const parentUserIds = new Set<string>();
    const studentIds = new Set<string>();

    for (const assessment of assessments) {
      for (const grade of assessment.grades) {
        studentIds.add(grade.student_id);
        for (const sp of grade.student.student_parents) {
          if (sp.parent.user_id) {
            parentUserIds.add(sp.parent.user_id);
          }
        }
      }
    }

    // Send notifications to parents
    if (parentUserIds.size > 0) {
      const notifications = [...parentUserIds].map((parentUserId) => ({
        tenant_id: tenantId,
        recipient_user_id: parentUserId,
        channel: 'in_app' as const,
        template_key: 'gradebook.grades_published',
        locale: 'en',
        payload_json: {
          assessment_count: assessments.length,
          assessment_titles: assessments.map((a) => a.title).slice(0, 3),
        },
        source_entity_type: 'assessment',
        source_entity_id: assessments[0]?.id ?? '',
      }));

      await this.notificationsService.createBatch(tenantId, notifications);
    }

    // Invalidate AI progress summary caches for affected students
    for (const studentId of studentIds) {
      void this.aiProgressSummaryService
        .invalidateCache(tenantId, studentId)
        .catch((err) => {
          this.logger.warn(
            `Failed to invalidate progress summary cache: ${String(err)}`,
          );
        });
    }

    this.logger.log(
      `Published ${assessments.length} assessments for tenant ${tenantId}`,
    );

    return {
      published: assessments.length,
      assessment_ids: assessments.map((a) => a.id),
    };
  }

  // ─── D1: Publish Period Grades (bulk) ────────────────────────────────────

  async publishPeriodGrades(
    tenantId: string,
    userId: string,
    classId: string,
    periodId: string,
  ): Promise<{ published: number; assessment_ids: string[] }> {
    // Verify class and period exist
    const [classEntity, period] = await Promise.all([
      this.prisma.class.findFirst({
        where: { id: classId, tenant_id: tenantId },
        select: { id: true },
      }),
      this.prisma.academicPeriod.findFirst({
        where: { id: periodId, tenant_id: tenantId },
        select: { id: true },
      }),
    ]);

    if (!classEntity) {
      throw new NotFoundException({
        error: { code: 'CLASS_NOT_FOUND', message: `Class "${classId}" not found` },
      });
    }

    if (!period) {
      throw new NotFoundException({
        error: {
          code: 'PERIOD_NOT_FOUND',
          message: `Academic period "${periodId}" not found`,
        },
      });
    }

    // Find all unpublished assessments for this class/period
    const unpublishedIds = await this.prisma.assessment.findMany({
      where: {
        tenant_id: tenantId,
        class_id: classId,
        academic_period_id: periodId,
        grades_published_at: null,
      },
      select: { id: true },
    });

    if (unpublishedIds.length === 0) {
      return { published: 0, assessment_ids: [] };
    }

    return this.publishGrades(
      tenantId,
      userId,
      unpublishedIds.map((a) => a.id),
    );
  }
}
