import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import type { UpdateReportCardDto } from '../dto/gradebook.dto';

@Injectable()
export class ReportCardsService {
  private readonly logger = new Logger(ReportCardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Generate report cards for multiple students in a given period.
   * Builds snapshot_payload_json from period_grade_snapshots + attendance + metadata.
   */
  async generate(tenantId: string, studentIds: string[], periodId: string) {
    // 1. Validate period exists
    const period = await this.prisma.academicPeriod.findFirst({
      where: { id: periodId, tenant_id: tenantId },
      include: {
        academic_year: {
          select: { id: true, name: true },
        },
      },
    });

    if (!period) {
      throw new NotFoundException({
        code: 'PERIOD_NOT_FOUND',
        message: `Academic period with id "${periodId}" not found`,
      });
    }

    // 2. Validate all students exist
    const students = await this.prisma.student.findMany({
      where: {
        id: { in: studentIds },
        tenant_id: tenantId,
      },
      include: {
        year_group: {
          select: { id: true, name: true },
        },
        homeroom_class: {
          select: { id: true, name: true },
        },
        household: {
          select: {
            id: true,
            billing_parent: {
              select: {
                id: true,
                user: {
                  select: { preferred_locale: true },
                },
              },
            },
          },
        },
      },
    });

    if (students.length !== studentIds.length) {
      const foundIds = new Set(students.map((s) => s.id));
      const missing = studentIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException({
        code: 'STUDENTS_NOT_FOUND',
        message: `Students not found: ${missing.join(', ')}`,
      });
    }

    // 3. Load tenant for default locale
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { default_locale: true },
    });

    const tenantDefaultLocale = tenant?.default_locale ?? 'en';

    // 4. Generate report cards
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const reportCards = [];

    for (const student of students) {
      // Load period grade snapshots for this student+period
      const snapshots = await this.prisma.periodGradeSnapshot.findMany({
        where: {
          tenant_id: tenantId,
          student_id: student.id,
          academic_period_id: periodId,
        },
        include: {
          subject: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      // Load assessment details for each subject
      const subjectIds = snapshots.map((s) => s.subject_id);
      const assessments =
        subjectIds.length > 0
          ? await this.prisma.assessment.findMany({
              where: {
                tenant_id: tenantId,
                academic_period_id: periodId,
                subject_id: { in: subjectIds },
                class_id: { in: snapshots.map((s) => s.class_id) },
                status: { not: 'draft' },
              },
              include: {
                grades: {
                  where: { student_id: student.id },
                },
                category: {
                  select: { name: true },
                },
              },
            })
          : [];

      // Build subjects array for snapshot
      const subjects = snapshots.map((snapshot) => {
        const subjectAssessments = assessments.filter(
          (a) => a.subject_id === snapshot.subject_id && a.class_id === snapshot.class_id,
        );

        return {
          subject_name: snapshot.subject.name,
          subject_code: snapshot.subject.code ?? null,
          computed_value: Number(snapshot.computed_value),
          display_value: snapshot.overridden_value ?? snapshot.display_value,
          overridden_value: snapshot.overridden_value ?? null,
          assessments: subjectAssessments.map((a) => {
            const grade = a.grades[0];
            return {
              title: a.title,
              category: a.category.name,
              max_score: Number(a.max_score),
              raw_score:
                grade?.raw_score !== null && grade?.raw_score !== undefined
                  ? Number(grade.raw_score)
                  : null,
              is_missing: grade?.is_missing ?? true,
            };
          }),
        };
      });

      // Attendance summary: count daily_attendance_summaries within period date range
      const attendanceSummaries = await this.prisma.dailyAttendanceSummary.groupBy({
        by: ['derived_status'],
        where: {
          tenant_id: tenantId,
          student_id: student.id,
          summary_date: {
            gte: period.start_date,
            lte: period.end_date,
          },
        },
        _count: { id: true },
      });

      const statusCounts = new Map(attendanceSummaries.map((s) => [s.derived_status, s._count.id]));

      const totalDays = attendanceSummaries.reduce((sum, s) => sum + s._count.id, 0);
      const presentDays = (statusCounts.get('present') ?? 0) + (statusCounts.get('late') ?? 0);
      const absentDays =
        (statusCounts.get('absent') ?? 0) + (statusCounts.get('partially_absent') ?? 0);
      const lateDays = statusCounts.get('late') ?? 0;

      const attendanceSummary =
        totalDays > 0
          ? {
              total_days: totalDays,
              present_days: presentDays,
              absent_days: absentDays,
              late_days: lateDays,
            }
          : undefined;

      // Determine template locale
      const billingParentLocale = student.household?.billing_parent?.user?.preferred_locale;
      const templateLocale = billingParentLocale ?? tenantDefaultLocale;

      // Build snapshot payload
      const snapshotPayload = {
        student: {
          full_name: `${student.first_name} ${student.last_name}`,
          student_number: student.student_number ?? null,
          year_group: student.year_group?.name ?? '',
          class_homeroom: student.homeroom_class?.name ?? null,
        },
        period: {
          name: period.name,
          academic_year: period.academic_year.name,
          start_date: period.start_date.toISOString().slice(0, 10),
          end_date: period.end_date.toISOString().slice(0, 10),
        },
        subjects,
        attendance_summary: attendanceSummary,
        teacher_comment: null,
        principal_comment: null,
      };

      // Create draft report card
      const reportCard = await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;

        return db.reportCard.create({
          data: {
            tenant_id: tenantId,
            student_id: student.id,
            academic_period_id: periodId,
            status: 'draft',
            template_locale: templateLocale,
            snapshot_payload_json: snapshotPayload as unknown as Prisma.InputJsonValue,
          },
        });
      });

      reportCards.push(reportCard);
    }

    return { data: reportCards };
  }

  // findAll and findOne moved to ReportCardsQueriesService (M-16 CQRS-lite split)

  /**
   * Update a draft report card (comments and locale).
   * Updates both the record fields and the snapshot_payload_json.
   */
  async update(tenantId: string, id: string, dto: UpdateReportCardDto) {
    const reportCard = await this.prisma.reportCard.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true, updated_at: true, snapshot_payload_json: true },
    });

    if (!reportCard) {
      throw new NotFoundException({
        code: 'REPORT_CARD_NOT_FOUND',
        message: `Report card with id "${id}" not found`,
      });
    }

    if (reportCard.status !== 'draft') {
      throw new ConflictException({
        code: 'REPORT_CARD_NOT_DRAFT',
        message: 'Only draft report cards can be updated',
      });
    }

    // Optimistic concurrency check
    if (dto.expected_updated_at) {
      const expectedDate = new Date(dto.expected_updated_at);
      if (reportCard.updated_at.getTime() !== expectedDate.getTime()) {
        throw new ConflictException({
          code: 'CONCURRENT_MODIFICATION',
          message:
            'The report card has been modified by another user. Please refresh and try again.',
        });
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const updateData: Prisma.ReportCardUpdateInput = {};
      const snapshotPayload = reportCard.snapshot_payload_json as Record<string, unknown>;

      if (dto.teacher_comment !== undefined) {
        updateData.teacher_comment = dto.teacher_comment ?? null;
        snapshotPayload['teacher_comment'] = dto.teacher_comment ?? null;
      }

      if (dto.principal_comment !== undefined) {
        updateData.principal_comment = dto.principal_comment ?? null;
        snapshotPayload['principal_comment'] = dto.principal_comment ?? null;
      }

      if (dto.template_locale !== undefined) {
        updateData.template_locale = dto.template_locale;
      }

      updateData.snapshot_payload_json = snapshotPayload as unknown as Prisma.InputJsonValue;

      return db.reportCard.update({
        where: { id },
        data: updateData,
      });
    });
  }

  /**
   * Publish a report card. Sets status=published, published_at, published_by.
   * Invalidates transcript cache for the student.
   */
  async publish(tenantId: string, id: string, userId: string) {
    const reportCard = await this.prisma.reportCard.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true, student_id: true },
    });

    if (!reportCard) {
      throw new NotFoundException({
        code: 'REPORT_CARD_NOT_FOUND',
        message: `Report card with id "${id}" not found`,
      });
    }

    if (reportCard.status !== 'draft') {
      throw new ConflictException({
        code: 'REPORT_CARD_NOT_DRAFT',
        message: 'Only draft report cards can be published',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const published = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.reportCard.update({
        where: { id },
        data: {
          status: 'published',
          published_at: new Date(),
          published_by_user_id: userId,
        },
      });
    });

    // Invalidate transcript cache
    await this.invalidateTranscriptCache(tenantId, reportCard.student_id);

    return published;
  }

  /**
   * Revise a published report card.
   * Creates a new draft with revision_of_report_card_id, copies snapshot,
   * sets original to 'revised'.
   */
  async revise(tenantId: string, id: string) {
    const reportCard = await this.prisma.reportCard.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!reportCard) {
      throw new NotFoundException({
        code: 'REPORT_CARD_NOT_FOUND',
        message: `Report card with id "${id}" not found`,
      });
    }

    if (reportCard.status !== 'published') {
      throw new ConflictException({
        code: 'REPORT_CARD_NOT_PUBLISHED',
        message: 'Only published report cards can be revised',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // 1. Set original to revised FIRST to clear the partial unique constraint
      await db.reportCard.update({
        where: { id: reportCard.id },
        data: { status: 'revised' },
      });

      // 2. Create new draft with copied snapshot
      const newReportCard = await db.reportCard.create({
        data: {
          tenant_id: tenantId,
          student_id: reportCard.student_id,
          academic_period_id: reportCard.academic_period_id,
          status: 'draft',
          template_locale: reportCard.template_locale,
          teacher_comment: reportCard.teacher_comment,
          principal_comment: reportCard.principal_comment,
          revision_of_report_card_id: reportCard.id,
          snapshot_payload_json: reportCard.snapshot_payload_json as Prisma.InputJsonValue,
        },
      });

      return newReportCard;
    });
  }

  // buildBatchSnapshots and gradeOverview moved to ReportCardsQueriesService (M-16)

  /**
   * Invalidate transcript cache for a given tenant+student.
   */
  async invalidateTranscriptCache(tenantId: string, studentId: string) {
    try {
      const redis = this.redisService.getClient();
      await redis.del(`transcript:${tenantId}:${studentId}`);
    } catch (err) {
      this.logger.warn(`Failed to invalidate transcript cache for student ${studentId}`, err);
    }
  }

  /**
   * Generate draft report cards for all active students in a class for a period.
   * Skips students who already have a report card for this period.
   */
  async generateBulkDrafts(tenantId: string, classId: string, periodId: string) {
    // Get all active students in this class
    const enrolments = await this.prisma.classEnrolment.findMany({
      where: { tenant_id: tenantId, class_id: classId, status: 'active' },
      select: { student_id: true },
    });

    if (enrolments.length === 0) {
      return { data: [], skipped: 0, generated: 0 };
    }

    const studentIds = enrolments.map((e) => e.student_id);

    // Find which students already have a report card for this period
    const existing = await this.prisma.reportCard.findMany({
      where: {
        tenant_id: tenantId,
        student_id: { in: studentIds },
        academic_period_id: periodId,
        status: { not: 'revised' },
      },
      select: { student_id: true },
    });

    const existingStudentIds = new Set(existing.map((rc) => rc.student_id));
    const newStudentIds = studentIds.filter((id) => !existingStudentIds.has(id));

    if (newStudentIds.length === 0) {
      return { data: [], skipped: studentIds.length, generated: 0 };
    }

    const result = await this.generate(tenantId, newStudentIds, periodId);

    return {
      data: result.data,
      skipped: existingStudentIds.size,
      generated: result.data.length,
    };
  }

  /**
   * Bulk publish multiple report cards.
   */
  async publishBulk(tenantId: string, reportCardIds: string[], userId: string) {
    const results: Array<{ report_card_id: string; success: boolean; error?: string }> = [];

    for (const id of reportCardIds) {
      try {
        await this.publish(tenantId, id, userId);
        results.push({ report_card_id: id, success: true });
      } catch (err) {
        results.push({
          report_card_id: id,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return { results, succeeded, failed };
  }

  // generateTranscript moved to ReportCardsQueriesService (M-16)
}
