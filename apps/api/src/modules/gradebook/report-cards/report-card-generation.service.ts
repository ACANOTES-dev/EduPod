import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../../academics/academic-read.facade';
import { AttendanceReadFacade } from '../../attendance/attendance-read.facade';
import { ClassesReadFacade } from '../../classes/classes-read.facade';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentReadFacade } from '../../students/student-read.facade';
import { TenantReadFacade } from '../../tenants/tenant-read.facade';

export class ReportCardGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly tenantReadFacade: TenantReadFacade,
    private readonly attendanceReadFacade: AttendanceReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
  ) {}

  async generate(tenantId: string, studentIds: string[], periodId: string) {
    const period = await this.academicReadFacade.findPeriodById(tenantId, periodId);

    if (!period) {
      throw new NotFoundException({
        code: 'PERIOD_NOT_FOUND',
        message: `Academic period with id "${periodId}" not found`,
      });
    }

    // Need the academic year info — findPeriodById includes it
    const periodWithYear = period as typeof period & { academic_year: { name: string } };

    const students = (await this.studentReadFacade.findManyGeneric(tenantId, {
      where: { id: { in: studentIds } },
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
    })) as Array<{
      id: string;
      first_name: string;
      last_name: string;
      student_number: string | null;
      year_group: { id: string; name: string } | null;
      homeroom_class: { id: string; name: true } | null;
      household: {
        id: string;
        billing_parent: {
          id: string;
          user: { preferred_locale: string | null } | null;
        } | null;
      } | null;
    }>;

    if (students.length !== studentIds.length) {
      const foundIds = new Set(students.map((student) => student.id));
      const missing = studentIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException({
        code: 'STUDENTS_NOT_FOUND',
        message: `Students not found: ${missing.join(', ')}`,
      });
    }

    const tenantDefaultLocale = await this.tenantReadFacade.findDefaultLocale(tenantId);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const reportCards = [];

    for (const student of students) {
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

      const subjectIds = snapshots.map((snapshot) => snapshot.subject_id);
      const assessments =
        subjectIds.length > 0
          ? await this.prisma.assessment.findMany({
              where: {
                tenant_id: tenantId,
                academic_period_id: periodId,
                subject_id: { in: subjectIds },
                class_id: { in: snapshots.map((snapshot) => snapshot.class_id) },
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

      const subjects = snapshots.map((snapshot) => {
        const subjectAssessments = assessments.filter((assessment) => {
          return (
            assessment.subject_id === snapshot.subject_id &&
            assessment.class_id === snapshot.class_id
          );
        });

        return {
          subject_name: snapshot.subject.name,
          subject_code: snapshot.subject.code ?? null,
          computed_value: Number(snapshot.computed_value),
          display_value: snapshot.overridden_value ?? snapshot.display_value,
          overridden_value: snapshot.overridden_value ?? null,
          assessments: subjectAssessments.map((assessment) => {
            const grade = assessment.grades[0];
            return {
              title: assessment.title,
              category: assessment.category.name,
              max_score: Number(assessment.max_score),
              raw_score:
                grade?.raw_score !== null && grade?.raw_score !== undefined
                  ? Number(grade.raw_score)
                  : null,
              is_missing: grade?.is_missing ?? true,
            };
          }),
        };
      });

      const attendanceSummaries = await this.attendanceReadFacade.groupSummariesByStatus(
        tenantId,
        student.id,
        { from: period.start_date, to: period.end_date },
      );

      const statusCounts = new Map(
        attendanceSummaries.map((summary) => [summary.derived_status, summary._count._all]),
      );

      const totalDays = attendanceSummaries.reduce((sum, summary) => sum + summary._count._all, 0);
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

      const billingParentLocale = student.household?.billing_parent?.user?.preferred_locale;
      const templateLocale = billingParentLocale ?? tenantDefaultLocale;

      const snapshotPayload = {
        student: {
          full_name: `${student.first_name} ${student.last_name}`,
          student_number: student.student_number ?? null,
          year_group: student.year_group?.name ?? '',
          class_homeroom: student.homeroom_class?.name ?? null,
        },
        period: {
          name: period.name,
          academic_year: periodWithYear.academic_year.name,
          start_date: period.start_date.toISOString().slice(0, 10),
          end_date: period.end_date.toISOString().slice(0, 10),
        },
        subjects,
        attendance_summary: attendanceSummary,
        teacher_comment: null,
        principal_comment: null,
      };

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

  async buildBatchSnapshots(tenantId: string, classId: string, periodId: string) {
    const period = await this.academicReadFacade.findPeriodById(tenantId, periodId);

    if (!period) {
      throw new NotFoundException({
        code: 'PERIOD_NOT_FOUND',
        message: `Academic period with id "${periodId}" not found`,
      });
    }

    const periodWithYear = period as typeof period & { academic_year: { name: string } };

    const enrolments = (await this.classesReadFacade.findEnrolmentsGeneric(
      tenantId,
      { class_id: classId, status: 'active' },
      {
        id: true,
        class_id: true,
        student_id: true,
        status: true,
        start_date: true,
        end_date: true,
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
    )) as Array<{
      student_id: string;
      student: {
        id: string;
        first_name: string;
        last_name: string;
        student_number: string | null;
        year_group: { name: string } | null;
        homeroom_class: { name: string } | null;
      };
    }>;

    if (enrolments.length === 0) {
      return [];
    }

    const students = enrolments.map((enrolment) => enrolment.student);
    const studentIds = students.map((student) => student.id);

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

    const snapshotsByStudent = new Map<string, typeof allSnapshots>();
    for (const snapshot of allSnapshots) {
      const existing = snapshotsByStudent.get(snapshot.student_id) ?? [];
      existing.push(snapshot);
      snapshotsByStudent.set(snapshot.student_id, existing);
    }

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

      const attendanceSummaries = await this.attendanceReadFacade.groupSummariesByStatus(
        tenantId,
        student.id,
        { from: period.start_date, to: period.end_date },
      );

      const statusCounts = new Map(
        attendanceSummaries.map((summary) => [summary.derived_status, summary._count._all]),
      );

      const totalDays = attendanceSummaries.reduce((sum, summary) => sum + summary._count._all, 0);
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
          academic_year: periodWithYear.academic_year.name,
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

  async generateBulkDrafts(tenantId: string, classId: string, periodId: string) {
    const enrolments = (await this.classesReadFacade.findEnrolmentsGeneric(
      tenantId,
      { class_id: classId, status: 'active' },
      { student_id: true },
    )) as Array<{ student_id: string }>;

    if (enrolments.length === 0) {
      return { data: [], skipped: 0, generated: 0 };
    }

    const studentIds = enrolments.map((enrolment) => enrolment.student_id);

    const existing = await this.prisma.reportCard.findMany({
      where: {
        tenant_id: tenantId,
        student_id: { in: studentIds },
        academic_period_id: periodId,
        status: { not: 'revised' },
      },
      select: { student_id: true },
    });

    const existingStudentIds = new Set(existing.map((reportCard) => reportCard.student_id));
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
}
