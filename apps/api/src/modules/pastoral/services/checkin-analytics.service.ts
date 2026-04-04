import { Injectable, Logger } from '@nestjs/common';

import { pastoralTenantSettingsSchema } from '@school/shared/pastoral';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { ConfigurationReadFacade } from '../../configuration/configuration-read.facade';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MoodTrendDataPoint {
  period: string;
  average_mood: number;
  response_count: number;
}

export interface DayOfWeekPattern {
  day: number; // 0-6 (Monday=0 per spec, but grouping by SQL day)
  average_mood: number;
  response_count: number;
}

export interface ExamComparisonResult {
  before_period: { average_mood: number; response_count: number };
  during_period: { average_mood: number; response_count: number };
  after_period: { average_mood: number; response_count: number };
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class CheckinAnalyticsService {
  private readonly logger = new Logger(CheckinAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationReadFacade: ConfigurationReadFacade,
  ) {}

  // ─── Year Group Mood Trends ─────────────────────────────────────────────

  async getYearGroupMoodTrends(
    tenantId: string,
    yearGroupId: string,
    dateRange: { from: string; to: string },
    granularity: 'weekly' | 'monthly',
  ): Promise<MoodTrendDataPoint[]> {
    const minCohort = await this.getMinCohortSize(tenantId);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const results = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Get all check-ins for the date range with year group filter
      const checkins = await db.studentCheckin.findMany({
        where: {
          tenant_id: tenantId,
          checkin_date: {
            gte: new Date(dateRange.from),
            lte: new Date(dateRange.to),
          },
          student: {
            year_group_id: yearGroupId,
          },
        },
        select: {
          checkin_date: true,
          mood_score: true,
          student_id: true,
        },
      });

      return checkins;
    })) as Array<{ checkin_date: Date; mood_score: number; student_id: string }>;

    return this.aggregateByPeriod(results, granularity, minCohort);
  }

  // ─── School-Wide Mood Trends ────────────────────────────────────────────

  async getSchoolMoodTrends(
    tenantId: string,
    dateRange: { from: string; to: string },
    granularity: 'weekly' | 'monthly',
  ): Promise<MoodTrendDataPoint[]> {
    const minCohort = await this.getMinCohortSize(tenantId);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const results = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const checkins = await db.studentCheckin.findMany({
        where: {
          tenant_id: tenantId,
          checkin_date: {
            gte: new Date(dateRange.from),
            lte: new Date(dateRange.to),
          },
        },
        select: {
          checkin_date: true,
          mood_score: true,
          student_id: true,
        },
      });

      return checkins;
    })) as Array<{ checkin_date: Date; mood_score: number; student_id: string }>;

    return this.aggregateByPeriod(results, granularity, minCohort);
  }

  // ─── Day-of-Week Patterns ──────────────────────────────────────────────

  async getDayOfWeekPatterns(
    tenantId: string,
    yearGroupId: string | null,
    dateRange: { from: string; to: string },
  ): Promise<DayOfWeekPattern[]> {
    const minCohort = await this.getMinCohortSize(tenantId);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const results = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const where: Record<string, unknown> = {
        tenant_id: tenantId,
        checkin_date: {
          gte: new Date(dateRange.from),
          lte: new Date(dateRange.to),
        },
      };

      if (yearGroupId) {
        where.student = { year_group_id: yearGroupId };
      }

      const checkins = await db.studentCheckin.findMany({
        where,
        select: {
          checkin_date: true,
          mood_score: true,
          student_id: true,
        },
      });

      return checkins;
    })) as Array<{ checkin_date: Date; mood_score: number; student_id: string }>;

    return this.aggregateByDayOfWeek(results, minCohort);
  }

  // ─── Exam Period Comparison ────────────────────────────────────────────

  async getExamPeriodComparison(
    tenantId: string,
    yearGroupId: string | null,
    examPeriod: { start: string; end: string },
  ): Promise<ExamComparisonResult | null> {
    const minCohort = await this.getMinCohortSize(tenantId);

    // Calculate period durations
    const examStart = new Date(examPeriod.start);
    const examEnd = new Date(examPeriod.end);
    const durationMs = examEnd.getTime() - examStart.getTime();

    // Before period = same duration preceding exam
    const beforeStart = new Date(examStart.getTime() - durationMs);
    const beforeEnd = new Date(examStart.getTime() - 86400000); // day before exam

    // After period = same duration following exam
    const afterStart = new Date(examEnd.getTime() + 86400000); // day after exam
    const afterEnd = new Date(examEnd.getTime() + durationMs);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const [beforeData, duringData, afterData] = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const buildWhere = (from: Date, to: Date) => {
        const where: Record<string, unknown> = {
          tenant_id: tenantId,
          checkin_date: { gte: from, lte: to },
        };
        if (yearGroupId) {
          where.student = { year_group_id: yearGroupId };
        }
        return where;
      };

      const [before, during, after] = await Promise.all([
        db.studentCheckin.findMany({
          where: buildWhere(beforeStart, beforeEnd),
          select: { mood_score: true, student_id: true },
        }),
        db.studentCheckin.findMany({
          where: buildWhere(examStart, examEnd),
          select: { mood_score: true, student_id: true },
        }),
        db.studentCheckin.findMany({
          where: buildWhere(afterStart, afterEnd),
          select: { mood_score: true, student_id: true },
        }),
      ]);

      return [before, during, after];
    })) as [
      Array<{ mood_score: number; student_id: string }>,
      Array<{ mood_score: number; student_id: string }>,
      Array<{ mood_score: number; student_id: string }>,
    ];

    // Check cohort size for each sub-period
    const beforeStudents = new Set(beforeData.map((c) => c.student_id));
    const duringStudents = new Set(duringData.map((c) => c.student_id));
    const afterStudents = new Set(afterData.map((c) => c.student_id));

    if (
      beforeStudents.size < minCohort ||
      duringStudents.size < minCohort ||
      afterStudents.size < minCohort
    ) {
      return null;
    }

    return {
      before_period: {
        average_mood: this.computeAverage(beforeData.map((c) => c.mood_score)),
        response_count: beforeData.length,
      },
      during_period: {
        average_mood: this.computeAverage(duringData.map((c) => c.mood_score)),
        response_count: duringData.length,
      },
      after_period: {
        average_mood: this.computeAverage(afterData.map((c) => c.mood_score)),
        response_count: afterData.length,
      },
    };
  }

  // ─── Private: Enforce Min Cohort ──────────────────────────────────────

  async enforceMinCohort(
    tenantId: string,
    yearGroupId: string | null,
    dateRange: { from: string; to: string },
    minCohortSize: number,
  ): Promise<boolean> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const distinctCount = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const where: Record<string, unknown> = {
        tenant_id: tenantId,
        checkin_date: {
          gte: new Date(dateRange.from),
          lte: new Date(dateRange.to),
        },
      };

      if (yearGroupId) {
        where.student = { year_group_id: yearGroupId };
      }

      // Use groupBy to count distinct students
      const grouped = await db.studentCheckin.groupBy({
        by: ['student_id'],
        where,
      });

      return grouped.length;
    })) as number;

    return distinctCount >= minCohortSize;
  }

  // ─── Private: Aggregation Helpers ─────────────────────────────────────

  private aggregateByPeriod(
    checkins: Array<{ checkin_date: Date; mood_score: number; student_id: string }>,
    granularity: 'weekly' | 'monthly',
    minCohort: number,
  ): MoodTrendDataPoint[] {
    // Group check-ins by period
    const groups = new Map<string, { scores: number[]; students: Set<string> }>();

    for (const checkin of checkins) {
      const period = this.getPeriodKey(checkin.checkin_date, granularity);
      const group = groups.get(period) ?? { scores: [], students: new Set<string>() };
      group.scores.push(checkin.mood_score);
      group.students.add(checkin.student_id);
      groups.set(period, group);
    }

    // Filter by min cohort and compute averages
    const results: MoodTrendDataPoint[] = [];
    for (const [period, group] of groups) {
      if (group.students.size >= minCohort) {
        results.push({
          period,
          average_mood: this.computeAverage(group.scores),
          response_count: group.scores.length,
        });
      }
    }

    // Sort by period
    results.sort((a, b) => a.period.localeCompare(b.period));

    return results;
  }

  private aggregateByDayOfWeek(
    checkins: Array<{ checkin_date: Date; mood_score: number; student_id: string }>,
    minCohort: number,
  ): DayOfWeekPattern[] {
    // Group by day of week (0=Sunday per JS Date, but spec says 0=Monday)
    const groups = new Map<number, { scores: number[]; students: Set<string> }>();

    for (const checkin of checkins) {
      const jsDay = checkin.checkin_date.getDay(); // 0=Sunday
      // Convert to spec format: 0=Monday, 1=Tuesday, ..., 6=Sunday
      const specDay = jsDay === 0 ? 6 : jsDay - 1;
      const group = groups.get(specDay) ?? { scores: [], students: new Set<string>() };
      group.scores.push(checkin.mood_score);
      group.students.add(checkin.student_id);
      groups.set(specDay, group);
    }

    const results: DayOfWeekPattern[] = [];
    for (const [day, group] of groups) {
      if (group.students.size >= minCohort) {
        results.push({
          day,
          average_mood: this.computeAverage(group.scores),
          response_count: group.scores.length,
        });
      }
    }

    // Sort by day
    results.sort((a, b) => a.day - b.day);

    return results;
  }

  private getPeriodKey(date: Date, granularity: 'weekly' | 'monthly'): string {
    if (granularity === 'monthly') {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return `${year}-${month}`;
    }

    // Weekly: ISO week number
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7; // Sunday=7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Thursday of this week
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }

  private computeAverage(scores: number[]): number {
    if (scores.length === 0) return 0;
    const sum = scores.reduce((acc, s) => acc + s, 0);
    return Math.round((sum / scores.length) * 100) / 100;
  }

  // ─── Private: Tenant Settings ─────────────────────────────────────────

  private async getMinCohortSize(tenantId: string): Promise<number> {
    const record = await this.configurationReadFacade.findSettings(tenantId);

    const settingsJson = (record?.settings as Record<string, unknown>) ?? {};
    const pastoralRaw = (settingsJson.pastoral as Record<string, unknown>) ?? {};
    const parsed = pastoralTenantSettingsSchema.parse(pastoralRaw);

    return parsed.checkins.min_cohort_for_aggregate;
  }
}
