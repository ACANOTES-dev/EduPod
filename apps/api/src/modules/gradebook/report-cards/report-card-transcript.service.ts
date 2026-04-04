import { Logger, NotFoundException } from '@nestjs/common';

import { StudentReadFacade } from '../../students/student-read.facade';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

export class ReportCardTranscriptService {
  private readonly logger = new Logger(ReportCardTranscriptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly studentReadFacade: StudentReadFacade,
  ) {}

  async invalidateTranscriptCache(tenantId: string, studentId: string) {
    try {
      const redis = this.redisService.getClient();
      await redis.del(`transcript:${tenantId}:${studentId}`);
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to invalidate transcript cache for tenant ${tenantId} student ${studentId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

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

    const gpaSnapshots = await this.prisma.gpaSnapshot.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      select: { academic_period_id: true, gpa_value: true },
    });
    const gpaByPeriod = new Map(
      gpaSnapshots.map((snapshot) => [snapshot.academic_period_id, Number(snapshot.gpa_value)]),
    );

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
    const reportCardsByPeriod = new Map(
      reportCards.map((reportCard) => [reportCard.academic_period_id, reportCard]),
    );

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
        const reportCard = reportCardsByPeriod.get(periodId);
        year.periods.set(periodId, {
          period_id: periodId,
          period_name: snapshot.academic_period.name,
          start_date: snapshot.academic_period.start_date.toISOString().slice(0, 10),
          end_date: snapshot.academic_period.end_date.toISOString().slice(0, 10),
          gpa: gpaByPeriod.get(periodId) ?? null,
          teacher_comment: reportCard?.teacher_comment ?? null,
          principal_comment: reportCard?.principal_comment ?? null,
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
