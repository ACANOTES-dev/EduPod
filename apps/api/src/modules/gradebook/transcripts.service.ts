import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { StudentReadFacade } from '../students/student-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const TRANSCRIPT_CACHE_TTL_SECONDS = 300; // 5 minutes

@Injectable()
export class TranscriptsService {
  private readonly logger = new Logger(TranscriptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly studentReadFacade: StudentReadFacade,
  ) {}

  /**
   * Get aggregated transcript data for a student.
   * Checks Redis cache first (key: transcript:{tenant_id}:{student_id}, TTL 5 min).
   * Aggregates all period_grade_snapshots grouped by academic_year -> period -> subject.
   */
  async getTranscriptData(tenantId: string, studentId: string) {
    const cacheKey = `transcript:${tenantId}:${studentId}`;

    // 1. Check Redis cache
    try {
      const redis = this.redisService.getClient();
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as TranscriptData;
      }
    } catch (err) {
      // Cache miss or connection error — proceed to compute
      this.logger.warn(
        '[getTranscriptData] cache read failed',
        err instanceof Error ? err.stack : String(err),
      );
    }

    // 2. Verify student exists
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        student_number: true,
        year_group: {
          select: { id: true, name: true },
        },
      },
    });

    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: `Student with id "${studentId}" not found`,
      });
    }

    // 3. Load all period grade snapshots
    const snapshots = await this.prisma.periodGradeSnapshot.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
      },
      include: {
        subject: {
          select: { id: true, name: true, code: true },
        },
        academic_period: {
          select: {
            id: true,
            name: true,
            start_date: true,
            end_date: true,
            academic_year: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: [
        { academic_period: { academic_year: { start_date: 'asc' } } },
        { academic_period: { start_date: 'asc' } },
        { subject: { name: 'asc' } },
      ],
    });

    // 4. Group by academic_year -> period -> subject
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
        year.periods.set(periodId, {
          period_id: periodId,
          period_name: snapshot.academic_period.name,
          start_date: snapshot.academic_period.start_date.toISOString().slice(0, 10),
          end_date: snapshot.academic_period.end_date.toISOString().slice(0, 10),
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

    // Convert maps to arrays
    const academicYears = [...yearMap.values()].map((year) => ({
      academic_year_id: year.academic_year_id,
      academic_year_name: year.academic_year_name,
      periods: [...year.periods.values()],
    }));

    const transcriptData: TranscriptData = {
      student: {
        id: student.id,
        first_name: student.first_name,
        last_name: student.last_name,
        student_number: student.student_number ?? null,
        year_group: student.year_group?.name ?? null,
      },
      academic_years: academicYears,
    };

    // 5. Cache the result
    try {
      const redis = this.redisService.getClient();
      await redis.set(cacheKey, JSON.stringify(transcriptData), 'EX', TRANSCRIPT_CACHE_TTL_SECONDS);
    } catch (err) {
      // Cache write failure should not break the flow
      this.logger.warn(
        '[getTranscriptData] cache write failed',
        err instanceof Error ? err.stack : String(err),
      );
    }

    return transcriptData;
  }

  /**
   * Invalidate transcript cache for a student.
   */
  async invalidateCache(tenantId: string, studentId: string) {
    try {
      const redis = this.redisService.getClient();
      await redis.del(`transcript:${tenantId}:${studentId}`);
    } catch (err) {
      // Cache invalidation failure should not break the flow
      this.logger.warn(
        '[invalidateCache] cache invalidation failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}

export interface TranscriptData {
  student: {
    id: string;
    first_name: string;
    last_name: string;
    student_number: string | null;
    year_group: string | null;
  };
  academic_years: Array<{
    academic_year_id: string;
    academic_year_name: string;
    periods: Array<{
      period_id: string;
      period_name: string;
      start_date: string;
      end_date: string;
      subjects: Array<{
        subject_id: string;
        subject_name: string;
        subject_code: string | null;
        computed_value: number;
        display_value: string;
        overridden_value: string | null;
      }>;
    }>;
  }>;
}
