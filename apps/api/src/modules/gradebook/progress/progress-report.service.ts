import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { NotificationsService } from '../../communications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Types ────────────────────────────────────────────────────────────────────

type TrendDirection = 'improving' | 'declining' | 'stable';

interface ListProgressReportsQuery {
  page: number;
  pageSize: number;
  class_id?: string;
  academic_period_id?: string;
  status?: string;
}

interface GenerateProgressReportsDto {
  class_id: string;
  academic_period_id: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ProgressReportService {
  private readonly logger = new Logger(ProgressReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── D2: Generate Progress Reports ───────────────────────────────────────

  /**
   * Generate draft progress reports for all active students in a class.
   * Computes current average per subject from grades entered so far.
   */
  async generate(
    tenantId: string,
    userId: string,
    dto: GenerateProgressReportsDto,
  ) {
    // Validate class exists
    const classEntity = await this.prisma.class.findFirst({
      where: { id: dto.class_id, tenant_id: tenantId },
      select: {
        id: true,
        name: true,
        subject_id: true,
      },
    });

    if (!classEntity) {
      throw new NotFoundException({
        error: {
          code: 'CLASS_NOT_FOUND',
          message: `Class "${dto.class_id}" not found`,
        },
      });
    }

    // Validate period exists
    const period = await this.prisma.academicPeriod.findFirst({
      where: { id: dto.academic_period_id, tenant_id: tenantId },
      select: { id: true, name: true },
    });

    if (!period) {
      throw new NotFoundException({
        error: {
          code: 'PERIOD_NOT_FOUND',
          message: `Academic period "${dto.academic_period_id}" not found`,
        },
      });
    }

    // Get enrolled students
    const enrolments = await this.prisma.classEnrolment.findMany({
      where: {
        tenant_id: tenantId,
        class_id: dto.class_id,
        status: 'active',
      },
      select: { student_id: true },
    });

    if (enrolments.length === 0) {
      return { generated: 0, data: [] };
    }

    // Get all assessments for this class/period
    const assessments = await this.prisma.assessment.findMany({
      where: {
        tenant_id: tenantId,
        class_id: dto.class_id,
        academic_period_id: dto.academic_period_id,
      },
      select: {
        id: true,
        subject_id: true,
        max_score: true,
        grades: {
          where: { raw_score: { not: null }, is_missing: false },
          select: { student_id: true, raw_score: true },
        },
      },
    });

    // Group by student × subject
    const studentSubjectScores = new Map<
      string, // studentId
      Map<string, { scores: number[]; maxScores: number[] }>
    >();

    for (const student of enrolments) {
      studentSubjectScores.set(student.student_id, new Map());
    }

    for (const assessment of assessments) {
      for (const grade of assessment.grades) {
        const studentMap = studentSubjectScores.get(grade.student_id);
        if (!studentMap) continue;

        if (!studentMap.has(assessment.subject_id)) {
          studentMap.set(assessment.subject_id, { scores: [], maxScores: [] });
        }

        const entry = studentMap.get(assessment.subject_id);
        if (entry && grade.raw_score !== null) {
          entry.scores.push(Number(grade.raw_score));
          entry.maxScores.push(Number(assessment.max_score));
        }
      }
    }

    // Get subjects in this class
    const subjects = await this.prisma.subject.findMany({
      where: {
        tenant_id: tenantId,
        id: {
          in: [...new Set(assessments.map((a) => a.subject_id))],
        },
      },
      select: { id: true, name: true },
    });

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    type ReportResult = {
      id: string;
      student_id: string;
      entries: {
        id: string;
        subject_id: string;
        current_average: unknown;
        trend: string;
      }[];
    };

    const created = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const reports: ReportResult[] = [];

      for (const enrolment of enrolments) {
        const studentId = enrolment.student_id;
        const studentMap = studentSubjectScores.get(studentId) ?? new Map();

        // Create progress report
        const report = await db.progressReport.create({
          data: {
            tenant_id: tenantId,
            student_id: studentId,
            class_id: dto.class_id,
            academic_period_id: dto.academic_period_id,
            generated_by_user_id: userId,
            status: 'draft',
          },
          select: { id: true, student_id: true },
        });

        // Create entries per subject
        const entries = [];
        for (const subject of subjects) {
          const subjectData = studentMap.get(subject.id);
          let currentAverage = 0;

          if (subjectData && subjectData.scores.length > 0) {
            const totalMax = subjectData.maxScores.reduce(
              (s: number, v: number) => s + v,
              0,
            );
            const totalScore = subjectData.scores.reduce(
              (s: number, v: number) => s + v,
              0,
            );
            currentAverage =
              totalMax > 0 ? (totalScore / totalMax) * 100 : 0;
          }

          // Determine trend from existing period grade snapshots (optional)
          const trend = await this.computeTrend(
            tenantId,
            studentId,
            subject.id,
          );

          const entry = await db.progressReportEntry.create({
            data: {
              tenant_id: tenantId,
              progress_report_id: report.id,
              subject_id: subject.id,
              current_average: currentAverage,
              trend,
            },
            select: { id: true, subject_id: true, current_average: true, trend: true },
          });
          entries.push(entry);
        }

        reports.push({ ...report, entries });
      }

      return reports;
    })) as ReportResult[];

    return { generated: created.length, data: created };
  }

  // ─── Update Entry (teacher note) ─────────────────────────────────────────

  async updateEntry(
    tenantId: string,
    entryId: string,
    teacherNote: string | null,
  ) {
    const entry = await this.prisma.progressReportEntry.findFirst({
      where: { id: entryId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!entry) {
      throw new NotFoundException({
        error: {
          code: 'PROGRESS_REPORT_ENTRY_NOT_FOUND',
          message: `Progress report entry "${entryId}" not found`,
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      return tx.progressReportEntry.update({
        where: { id: entryId },
        data: { teacher_note: teacherNote },
      });
    });
  }

  // ─── Send Progress Reports ────────────────────────────────────────────────

  async send(
    tenantId: string,
    userId: string,
    reportIds: string[],
  ): Promise<{ sent: number }> {
    const reports = await this.prisma.progressReport.findMany({
      where: {
        id: { in: reportIds },
        tenant_id: tenantId,
        status: 'draft',
      },
      select: {
        id: true,
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            student_parents: {
              select: {
                parent: { select: { user_id: true } },
              },
            },
          },
        },
      },
    });

    if (reports.length === 0) {
      return { sent: 0 };
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const now = new Date();

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      for (const report of reports) {
        await db.progressReport.update({
          where: { id: report.id },
          data: { status: 'sent', sent_at: now },
        });
      }
    });

    // Notify parents
    const notifications = reports.flatMap((report) =>
      report.student.student_parents
        .filter((sp) => sp.parent.user_id !== null)
        .map((sp) => ({
          tenant_id: tenantId,
          recipient_user_id: sp.parent.user_id as string,
          channel: 'in_app' as const,
          template_key: 'gradebook.progress_report_available',
          locale: 'en',
          payload_json: {
            student_name: `${report.student.first_name} ${report.student.last_name}`,
            student_id: report.student.id,
            report_id: report.id,
          },
          source_entity_type: 'progress_report',
          source_entity_id: report.id,
        })),
    );

    if (notifications.length > 0) {
      await this.notificationsService.createBatch(tenantId, notifications);
    }

    this.logger.log(
      `Sent ${reports.length} progress reports for tenant ${tenantId} by user ${userId}`,
    );

    return { sent: reports.length };
  }

  // ─── List Progress Reports ────────────────────────────────────────────────

  async list(tenantId: string, query: ListProgressReportsQuery) {
    const { page, pageSize } = query;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (query.class_id) where.class_id = query.class_id;
    if (query.academic_period_id)
      where.academic_period_id = query.academic_period_id;
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      this.prisma.progressReport.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              student_number: true,
            },
          },
          class_entity: { select: { id: true, name: true } },
          academic_period: { select: { id: true, name: true } },
          entries: {
            include: {
              subject: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.progressReport.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Compute trend for a student/subject by comparing period grade snapshots.
   * Returns 'stable' if insufficient data.
   */
  private async computeTrend(
    tenantId: string,
    studentId: string,
    subjectId: string,
  ): Promise<TrendDirection> {
    const snapshots = await this.prisma.periodGradeSnapshot.findMany({
      where: { tenant_id: tenantId, student_id: studentId, subject_id: subjectId },
      select: { computed_value: true, snapshot_at: true },
      orderBy: { snapshot_at: 'asc' },
    });

    if (snapshots.length < 2) return 'stable';

    const first = Number(snapshots[0]?.computed_value ?? 0);
    const last = Number(snapshots[snapshots.length - 1]?.computed_value ?? 0);
    const diff = last - first;

    if (diff > 5) return 'improving';
    if (diff < -5) return 'declining';
    return 'stable';
  }
}
