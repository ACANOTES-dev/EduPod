import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, $Enums } from '@prisma/client';

import { AcademicReadFacade } from '../../academics/academic-read.facade';
import { AttendanceReadFacade } from '../../attendance/attendance-read.facade';
import { ClassesReadFacade } from '../../classes/classes-read.facade';
import { StudentReadFacade } from '../../students/student-read.facade';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ListReportCardsParams {
  page: number;
  pageSize: number;
  student_id?: string;
  academic_period_id?: string;
  status?: string;
  include_revisions?: boolean;
}

/**
 * Read-only query operations for report cards.
 * Extracted from ReportCardsService as part of CQRS-lite split (M-16).
 *
 * All methods are side-effect-free — no writes, no cache invalidation, no state transitions.
 */
@Injectable()
export class ReportCardsQueriesService {
  constructor(private readonly prisma: PrismaService) {}
  // ─── LIST ───────────────────────────────────────────────────────────────────

  /**
   * List report cards with filters and pagination.
   * Excludes revised by default unless include_revisions=true.
   */
  async findAll(tenantId: string, params: ListReportCardsParams) {
    const { page, pageSize, student_id, academic_period_id, status, include_revisions } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ReportCardWhereInput = { tenant_id: tenantId };

    if (student_id) {
      where.student_id = student_id;
    }

    if (academic_period_id) {
      where.academic_period_id = academic_period_id;
    }

    if (status) {
      where.status = status as $Enums.ReportCardStatus;
    }

    // Exclude revised report cards by default
    if (!include_revisions) {
      where.status = where.status ? where.status : { not: 'revised' };
    }

    const [data, total] = await Promise.all([
      this.prisma.reportCard.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ created_at: 'desc' }],
        include: {
          student: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              student_number: true,
            },
          },
          academic_period: {
            select: { id: true, name: true },
          },
          published_by: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.reportCard.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  // ─── FIND ONE ───────────────────────────────────────────────────────────────

  /**
   * Get a single report card with its revision chain.
   */
  async findOne(tenantId: string, id: string) {
    const reportCard = await this.prisma.reportCard.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            student_number: true,
          },
        },
        academic_period: {
          select: { id: true, name: true },
        },
        published_by: {
          select: { id: true, first_name: true, last_name: true },
        },
        revision_of: {
          select: {
            id: true,
            status: true,
            published_at: true,
            created_at: true,
          },
        },
        revisions: {
          select: {
            id: true,
            status: true,
            published_at: true,
            created_at: true,
          },
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!reportCard) {
      throw new NotFoundException({
        code: 'REPORT_CARD_NOT_FOUND',
        message: `Report card with id "${id}" not found`,
      });
    }

    return reportCard;
  }

  // ─── GRADE OVERVIEW ─────────────────────────────────────────────────────────

  /**
   * Overview: paginated list of period grade snapshots showing Student | Period | Final Grade | Status.
   */
  async gradeOverview(
    tenantId: string,
    params: {
      page: number;
      pageSize: number;
      class_id?: string;
      academic_period_id?: string;
    },
  ) {
    const { page, pageSize, class_id, academic_period_id } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.PeriodGradeSnapshotWhereInput = {
      tenant_id: tenantId,
    };

    if (class_id) {
      where.class_id = class_id;
    }
    if (academic_period_id) {
      where.academic_period_id = academic_period_id;
    }

    const [data, total] = await Promise.all([
      this.prisma.periodGradeSnapshot.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ student: { last_name: 'asc' } }, { subject: { name: 'asc' } }],
        include: {
          student: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              student_number: true,
            },
          },
          subject: {
            select: { id: true, name: true },
          },
          academic_period: {
            select: { id: true, name: true },
          },
          class_entity: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.periodGradeSnapshot.count({ where }),
    ]);

    return {
      data: data.map((row) => ({
        id: row.id,
        student_name: `${row.student.first_name} ${row.student.last_name}`,
        student_number: row.student.student_number,
        subject_name: row.subject.name,
        class_name: row.class_entity.name,
        period_name: row.academic_period.name,
        academic_period_id: row.academic_period.id,
        final_grade: row.overridden_value ?? row.display_value,
        computed_value: Number(row.computed_value),
        has_override: row.overridden_value !== null,
      })),
      meta: { page, pageSize, total },
    };
  }

  // ─── BUILD BATCH SNAPSHOTS ──────────────────────────────────────────────────

  /**
   * Build snapshot payloads for all active students in a class for the given period.
   * Returns an array of { student, snapshotPayload } objects, one per student.
   */
  async buildBatchSnapshots(tenantId: string, classId: string, periodId: string) {
    // 1. Validate period
    const period = await this.prisma.academicPeriod.findFirst({
      where: { id: periodId, tenant_id: tenantId },
      include: {
        academic_year: { select: { id: true, name: true } },
      },
    });

    if (!period) {
      throw new NotFoundException({
        code: 'PERIOD_NOT_FOUND',
        message: `Academic period with id "${periodId}" not found`,
      });
    }

    // 2. Get active students enrolled in this class
    const enrolments = await this.prisma.classEnrolment.findMany({
      where: {
        tenant_id: tenantId,
        class_id: classId,
        status: 'active',
      },
      include: {
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            student_number: true,
            year_group: { select: { name: true } },
            homeroom_class: { select: { name: true } },
          },
        },
      },
    });

    if (enrolments.length === 0) {
      return [];
    }

    const students = enrolments.map((e) => e.student);
    const studentIds = students.map((s) => s.id);

    // 3. Load all period grade snapshots for these students + period
    const allSnapshots = await this.prisma.periodGradeSnapshot.findMany({
      where: {
        tenant_id: tenantId,
        student_id: { in: studentIds },
        academic_period_id: periodId,
      },
      include: {
        subject: { select: { id: true, name: true, code: true } },
      },
    });

    // Group snapshots by student_id
    const snapshotsByStudent = new Map<string, typeof allSnapshots>();
    for (const snap of allSnapshots) {
      const existing = snapshotsByStudent.get(snap.student_id) ?? [];
      existing.push(snap);
      snapshotsByStudent.set(snap.student_id, existing);
    }

    // 4. Build payloads
    const results: Array<{
      studentId: string;
      studentName: string;
      payload: Record<string, unknown>;
    }> = [];

    for (const student of students) {
      const snapshots = snapshotsByStudent.get(student.id) ?? [];

      const subjects = snapshots.map((snapshot) => ({
        subject_name: snapshot.subject.name,
        subject_code: snapshot.subject.code ?? null,
        computed_value: Number(snapshot.computed_value),
        display_value: snapshot.overridden_value ?? snapshot.display_value,
        overridden_value: snapshot.overridden_value ?? null,
      }));

      // Attendance summary
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

      const payload = {
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

      results.push({
        studentId: student.id,
        studentName: `${student.first_name} ${student.last_name}`,
        payload,
      });
    }

    return results;
  }

  // ─── GENERATE TRANSCRIPT ────────────────────────────────────────────────────

  /**
   * Generate full academic transcript for a student across all periods and years.
   * Aggregates period_grade_snapshots and gpa_snapshots, grouped by year -> period.
   */
  async generateTranscript(tenantId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        student_number: true,
        year_group: { select: { id: true, name: true } },
      },
    });

    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: `Student "${studentId}" not found`,
      });
    }

    // Load all period grade snapshots
    const snapshots = await this.prisma.periodGradeSnapshot.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        academic_period: {
          select: {
            id: true,
            name: true,
            start_date: true,
            end_date: true,
            academic_year: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [
        { academic_period: { academic_year: { start_date: 'asc' } } },
        { academic_period: { start_date: 'asc' } },
        { subject: { name: 'asc' } },
      ],
    });

    // Load all GPA snapshots
    const gpaSnapshots = await this.prisma.gpaSnapshot.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      select: { academic_period_id: true, gpa_value: true },
    });
    const gpaByPeriod = new Map(
      gpaSnapshots.map((g) => [g.academic_period_id, Number(g.gpa_value)]),
    );

    // Load published report cards to get comment data
    const reportCards = await this.prisma.reportCard.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: 'published',
      },
      select: {
        academic_period_id: true,
        teacher_comment: true,
        principal_comment: true,
        published_at: true,
      },
    });
    const rcByPeriod = new Map(reportCards.map((rc) => [rc.academic_period_id, rc]));

    // Group by year -> period -> subject
    const yearMap = new Map<
      string,
      {
        academic_year_id: string;
        academic_year_name: string;
        periods: Map<
          string,
          {
            period_id: string;
            period_name: string;
            start_date: string;
            end_date: string;
            gpa: number | null;
            teacher_comment: string | null;
            principal_comment: string | null;
            subjects: Array<{
              subject_id: string;
              subject_name: string;
              subject_code: string | null;
              computed_value: number;
              display_value: string;
              overridden_value: string | null;
            }>;
          }
        >;
      }
    >();

    for (const snapshot of snapshots) {
      const yearId = snapshot.academic_period.academic_year.id;
      const yearName = snapshot.academic_period.academic_year.name;
      const periodId = snapshot.academic_period.id;

      if (!yearMap.has(yearId)) {
        yearMap.set(yearId, {
          academic_year_id: yearId,
          academic_year_name: yearName,
          periods: new Map(),
        });
      }

      const year = yearMap.get(yearId)!;

      if (!year.periods.has(periodId)) {
        const rc = rcByPeriod.get(periodId);
        year.periods.set(periodId, {
          period_id: periodId,
          period_name: snapshot.academic_period.name,
          start_date: snapshot.academic_period.start_date.toISOString().slice(0, 10),
          end_date: snapshot.academic_period.end_date.toISOString().slice(0, 10),
          gpa: gpaByPeriod.get(periodId) ?? null,
          teacher_comment: rc?.teacher_comment ?? null,
          principal_comment: rc?.principal_comment ?? null,
          subjects: [],
        });
      }

      const period = year.periods.get(periodId)!;

      period.subjects.push({
        subject_id: snapshot.subject.id,
        subject_name: snapshot.subject.name,
        subject_code: snapshot.subject.code ?? null,
        computed_value: Number(snapshot.computed_value),
        display_value: snapshot.display_value,
        overridden_value: snapshot.overridden_value ?? null,
      });
    }

    const academicYears = [...yearMap.values()].map((year) => ({
      academic_year_id: year.academic_year_id,
      academic_year_name: year.academic_year_name,
      periods: [...year.periods.values()],
    }));

    return {
      student: {
        id: student.id,
        first_name: student.first_name,
        last_name: student.last_name,
        student_number: student.student_number ?? null,
        year_group: student.year_group?.name ?? null,
      },
      academic_years: academicYears,
    };
  }
}
