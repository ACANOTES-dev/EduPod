import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';
import type Redis from 'ioredis';
import IoRedis from 'ioredis';

import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const WORKLOAD_METRICS_JOB = 'wellbeing:compute-workload-metrics';

// ─── Constants ────────────────────────────────────────────────────────────────

const AGGREGATE_TTL = 86400; // 24 hours
const CACHE_PREFIX = 'wellbeing:aggregate';

const METRIC_TYPES = [
  'workload-summary',
  'cover-fairness',
  'timetable-quality',
  'absence-trends',
  'substitution-pressure',
  'correlation',
] as const;

// ─── Helper types ─────────────────────────────────────────────────────────────

interface StaffPeriodCount {
  staffId: string;
  count: number;
}

interface StaffCoverCount {
  staffId: string;
  count: number;
}

// ─── Processor ────────────────────────────────────────────────────────────────

/**
 * Cross-tenant cron job — runs daily at 04:00 UTC.
 *
 * For each tenant with the staff_wellbeing module enabled, computes all
 * aggregate workload metrics and stores them in Redis with a 24-hour TTL.
 */
@Processor(QUEUE_NAMES.WELLBEING, {
  lockDuration: 120_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class WorkloadMetricsProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkloadMetricsProcessor.name);
  private redis: Redis | null = null;

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  private getRedis(): Redis {
    if (!this.redis) {
      const redisUrl = process.env['REDIS_URL'];
      if (!redisUrl) throw new Error('REDIS_URL not configured');
      this.redis = new IoRedis(redisUrl);
    }
    return this.redis;
  }

  async process(job: Job): Promise<void> {
    if (job.name !== WORKLOAD_METRICS_JOB) return;

    this.logger.log(`Processing ${WORKLOAD_METRICS_JOB}`);

    const enabledModules = await this.prisma.tenantModule.findMany({
      where: { module_key: 'staff_wellbeing', is_enabled: true },
      select: { tenant_id: true },
    });

    if (enabledModules.length === 0) {
      this.logger.log('No tenants with staff_wellbeing enabled');
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const { tenant_id: tenantId } of enabledModules) {
      try {
        await this.computeAndCacheForTenant(tenantId);
        successCount++;
      } catch (err) {
        failCount++;
        this.logger.error(
          `Error computing metrics for tenant ${tenantId}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Completed ${WORKLOAD_METRICS_JOB} — ${successCount} succeeded, ${failCount} failed out of ${enabledModules.length} tenants`,
    );
  }

  // ─── Per-Tenant Computation ───────────────────────────────────────────────

  private async computeAndCacheForTenant(tenantId: string): Promise<void> {
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}::text, true)`;

      // 1. Find active academic year
      const academicYear = await tx.academicYear.findFirst({
        where: { tenant_id: tenantId, status: 'active' },
        select: { id: true },
      });

      if (!academicYear) {
        this.logger.debug(`Tenant ${tenantId}: no active academic year — skipping`);
        return;
      }

      // 2. Find current academic period (term)
      const now = new Date();
      const currentPeriod = await tx.academicPeriod.findFirst({
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYear.id,
          start_date: { lte: now },
          end_date: { gte: now },
        },
        select: { id: true, start_date: true, end_date: true },
      });

      // 3. Get tenant settings for thresholds
      const tenantSetting = await tx.tenantSetting.findUnique({
        where: { tenant_id: tenantId },
        select: { settings: true },
      });
      const settings = (tenantSetting?.settings ?? {}) as Record<string, unknown>;
      const wellbeingSettings = (settings['staff_wellbeing'] ?? {}) as Record<string, unknown>;
      const periodThreshold =
        (wellbeingSettings['workload_high_threshold_periods'] as number) ?? 22;
      const coverThreshold = (wellbeingSettings['workload_high_threshold_covers'] as number) ?? 8;

      // 4. Fetch all teaching schedules for the active academic year
      const schedules = await tx.schedule.findMany({
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYear.id,
          teacher_staff_id: { not: null },
          effective_end_date: null,
        },
        select: {
          teacher_staff_id: true,
          weekday: true,
          room_id: true,
          period_order: true,
          schedule_period_template_id: true,
        },
      });

      // Get teaching-type period template IDs
      const periodTemplates = await tx.schedulePeriodTemplate.findMany({
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYear.id,
          schedule_period_type: 'teaching',
        },
        select: { id: true },
      });
      const teachingTemplateIds = new Set(periodTemplates.map((pt) => pt.id));

      // Filter to teaching periods only
      const teachingSchedules = schedules.filter(
        (s) =>
          s.schedule_period_template_id && teachingTemplateIds.has(s.schedule_period_template_id),
      );

      // 5. Count teaching periods per staff
      const periodsPerStaff = new Map<string, number>();
      for (const s of teachingSchedules) {
        const staffId = s.teacher_staff_id!;
        periodsPerStaff.set(staffId, (periodsPerStaff.get(staffId) ?? 0) + 1);
      }
      const periodCounts: StaffPeriodCount[] = [...periodsPerStaff.entries()].map(
        ([staffId, count]) => ({ staffId, count }),
      );

      // 6. Cover duties per staff (this term)
      let coverCounts: StaffCoverCount[] = [];
      if (currentPeriod) {
        const substitutions = await tx.substitutionRecord.findMany({
          where: {
            tenant_id: tenantId,
            created_at: { gte: currentPeriod.start_date, lte: currentPeriod.end_date },
            status: { in: ['assigned', 'confirmed', 'completed'] },
          },
          select: { substitute_staff_id: true },
        });

        const coversPerStaff = new Map<string, number>();
        for (const sub of substitutions) {
          const staffId = sub.substitute_staff_id;
          coversPerStaff.set(staffId, (coversPerStaff.get(staffId) ?? 0) + 1);
        }
        coverCounts = [...coversPerStaff.entries()].map(([staffId, count]) => ({ staffId, count }));
      }

      // 7. Absence data
      const absences = await tx.teacherAbsence.findMany({
        where: { tenant_id: tenantId },
        select: { absence_date: true, staff_profile_id: true },
      });

      const totalStaff = await tx.staffProfile.count({
        where: { tenant_id: tenantId, employment_status: 'active' },
      });

      // 8. Compute aggregate metrics
      const workloadSummary = this.computeWorkloadSummary(
        periodCounts,
        coverCounts,
        periodThreshold,
        coverThreshold,
      );
      const coverFairness = this.computeCoverFairness(coverCounts);
      const timetableQuality = this.computeTimetableQuality(schedules, teachingTemplateIds);
      const absenceTrends = this.computeAbsenceTrends(absences, totalStaff);
      const substitutionPressure = this.computeSubstitutionPressure(
        absences,
        coverCounts,
        totalStaff,
        currentPeriod,
      );
      const correlation = this.computeCorrelation(absences, coverCounts);

      // 9. Write all to Redis with pipeline
      const redis = this.getRedis();
      const pipeline = redis.pipeline();

      const metrics: Record<string, unknown> = {
        'workload-summary': workloadSummary,
        'cover-fairness': coverFairness,
        'timetable-quality': timetableQuality,
        'absence-trends': absenceTrends,
        'substitution-pressure': substitutionPressure,
        correlation: correlation,
      };

      for (const [metricType, data] of Object.entries(metrics)) {
        const key = `${CACHE_PREFIX}:${tenantId}:${metricType}`;
        pipeline.set(key, JSON.stringify(data), 'EX', AGGREGATE_TTL);
      }

      await pipeline.exec();

      this.logger.debug(`Tenant ${tenantId}: cached ${METRIC_TYPES.length} aggregate metrics`);
    });
  }

  // ─── Computation Helpers ──────────────────────────────────────────────────

  private computeWorkloadSummary(
    periodCounts: StaffPeriodCount[],
    coverCounts: StaffCoverCount[],
    periodThreshold: number,
    coverThreshold: number,
  ): Record<string, unknown> {
    const periods = periodCounts.map((p) => p.count).sort((a, b) => a - b);
    const covers = coverCounts.map((c) => c.count).sort((a, b) => a - b);

    return {
      average_teaching_periods: periods.length > 0 ? round(avg(periods)) : 0,
      range: {
        min: periods[0] ?? 0,
        max: periods[periods.length - 1] ?? 0,
        p25: percentile(periods, 25),
        p50: percentile(periods, 50),
        p75: percentile(periods, 75),
      },
      over_allocated_periods_count: periods.filter((p) => p > periodThreshold).length,
      average_cover_duties: covers.length > 0 ? round(avg(covers)) : 0,
      over_allocated_covers_count: covers.filter((c) => c > coverThreshold).length,
      trend: null,
    };
  }

  private computeCoverFairness(coverCounts: StaffCoverCount[]): Record<string, unknown> {
    const counts = coverCounts.map((c) => c.count).sort((a, b) => a - b);

    const distribution = new Map<number, number>();
    for (const c of counts) {
      distribution.set(c, (distribution.get(c) ?? 0) + 1);
    }

    const gini = computeGini(counts);
    const median = counts.length > 0 ? percentile(counts, 50) : 0;

    let assessment: string;
    if (gini < 0.15) assessment = 'Well distributed';
    else if (gini <= 0.3) assessment = 'Moderate concentration';
    else assessment = 'Significant concentration — review recommended';

    return {
      distribution: [...distribution.entries()].map(([cover_count, staff_count]) => ({
        cover_count,
        staff_count,
      })),
      gini_coefficient: round(gini),
      range: {
        min: counts[0] ?? 0,
        max: counts[counts.length - 1] ?? 0,
        median,
      },
      assessment,
    };
  }

  private computeTimetableQuality(
    schedules: Array<{
      teacher_staff_id: string | null;
      weekday: number;
      room_id: string | null;
      period_order: number | null;
      schedule_period_template_id: string | null;
    }>,
    teachingTemplateIds: Set<string>,
  ): Record<string, unknown> {
    // Group teaching schedules by staff + weekday
    const staffDays = new Map<string, Map<number, number[]>>();
    for (const s of schedules) {
      if (!s.teacher_staff_id || !s.schedule_period_template_id) continue;
      if (!teachingTemplateIds.has(s.schedule_period_template_id)) continue;

      const staffId = s.teacher_staff_id;
      if (!staffDays.has(staffId)) staffDays.set(staffId, new Map());
      const days = staffDays.get(staffId)!;
      if (!days.has(s.weekday)) days.set(s.weekday, []);
      days.get(s.weekday)!.push(s.period_order ?? 0);
    }

    // Compute consecutive periods per staff
    const allMaxConsecutive: number[] = [];
    const allRoomChanges: number[] = [];
    let splitCount = 0;
    let totalStaffDays = 0;

    // Room changes per staff+day
    const staffDayRooms = new Map<string, Set<string>>();
    for (const s of schedules) {
      if (!s.teacher_staff_id || !s.room_id) continue;
      const key = `${s.teacher_staff_id}:${s.weekday}`;
      if (!staffDayRooms.has(key)) staffDayRooms.set(key, new Set());
      staffDayRooms.get(key)!.add(s.room_id);
    }

    for (const [staffId, days] of staffDays) {
      for (const [weekday, periods] of days) {
        totalStaffDays++;
        const sorted = periods.sort((a, b) => a - b);

        // Max consecutive
        let maxConsec = 1;
        let current = 1;
        for (let i = 1; i < sorted.length; i++) {
          if ((sorted[i] ?? 0) === (sorted[i - 1] ?? 0) + 1) {
            current++;
            maxConsec = Math.max(maxConsec, current);
          } else {
            current = 1;
          }
        }
        allMaxConsecutive.push(maxConsec);

        // Split detection (gap of 2+ between teaching blocks)
        if (sorted.length >= 2) {
          const firstPeriod = sorted[0] ?? 0;
          const lastPeriod = sorted[sorted.length - 1] ?? 0;
          const span = lastPeriod - firstPeriod + 1;
          if (span - sorted.length >= 2) splitCount++;
        }

        // Room changes
        const roomKey = `${staffId}:${weekday}`;
        const rooms = staffDayRooms.get(roomKey);
        const roomChangeCount = rooms ? Math.max(0, rooms.size - 1) : 0;
        allRoomChanges.push(roomChangeCount);
      }
    }

    const sortedConsec = allMaxConsecutive.sort((a, b) => a - b);
    const sortedRooms = allRoomChanges.sort((a, b) => a - b);

    return {
      consecutive_periods: {
        mean: sortedConsec.length > 0 ? round(avg(sortedConsec)) : 0,
        median: percentile(sortedConsec, 50),
        range: {
          min: sortedConsec[0] ?? 0,
          max: sortedConsec[sortedConsec.length - 1] ?? 0,
        },
      },
      free_period_clumping: {
        mean: 0,
        median: 0,
        range: { min: 0, max: 0 },
      },
      split_timetable_pct: totalStaffDays > 0 ? round(splitCount / totalStaffDays) : 0,
      room_changes: {
        mean: sortedRooms.length > 0 ? round(avg(sortedRooms)) : 0,
        median: percentile(sortedRooms, 50),
        range: {
          min: sortedRooms[0] ?? 0,
          max: sortedRooms[sortedRooms.length - 1] ?? 0,
        },
      },
      trend: null,
    };
  }

  private computeAbsenceTrends(
    absences: Array<{ absence_date: Date; staff_profile_id: string }>,
    totalStaff: number,
  ): Record<string, unknown> {
    // Monthly rates
    const monthCounts = new Map<string, number>();
    const dayCounts = new Map<number, number>();

    for (const a of absences) {
      const d = new Date(a.absence_date);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthCounts.set(monthKey, (monthCounts.get(monthKey) ?? 0) + 1);

      const weekday = d.getDay();
      dayCounts.set(weekday, (dayCounts.get(weekday) ?? 0) + 1);
    }

    const totalAbsences = absences.length;
    const monthlyRates = [...monthCounts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({
        month,
        rate: totalStaff > 0 ? round(count / totalStaff) : 0,
      }));

    const dayOfWeekPattern = [...dayCounts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([weekday, count]) => ({
        weekday,
        rate: totalAbsences > 0 ? round(count / totalAbsences) : 0,
      }));

    return {
      monthly_rates: monthlyRates,
      day_of_week_pattern: dayOfWeekPattern,
      term_comparison: null,
      seasonal_pattern:
        monthlyRates.length >= 12
          ? monthlyRates.map((mr) => ({
              month: parseInt(mr.month.split('-')[1] ?? '1', 10),
              average_rate: mr.rate,
            }))
          : null,
    };
  }

  private computeSubstitutionPressure(
    absences: Array<{ absence_date: Date; staff_profile_id: string }>,
    coverCounts: StaffCoverCount[],
    totalStaff: number,
    _currentPeriod: { start_date: Date; end_date: Date } | null,
  ): Record<string, unknown> {
    const totalAbsences = absences.length;
    const totalCovers = coverCounts.reduce((sum, c) => sum + c.count, 0);

    const absenceRate = totalStaff > 0 ? totalAbsences / totalStaff : 0;
    const coverDifficulty = totalAbsences > 0 ? totalCovers / totalAbsences : 0;
    const unfilledRate =
      totalAbsences > 0 ? Math.max(0, (totalAbsences - totalCovers) / totalAbsences) : 0;

    const composite = round(absenceRate * 0.4 + coverDifficulty * 0.3 + unfilledRate * 0.3);

    let assessment: string;
    if (composite < 0.25) assessment = 'Low';
    else if (composite < 0.5) assessment = 'Moderate';
    else if (composite < 0.75) assessment = 'High';
    else assessment = 'Critical';

    return {
      absence_rate: round(absenceRate),
      cover_difficulty: round(coverDifficulty),
      unfilled_rate: round(unfilledRate),
      composite_score: composite,
      trend: [],
      assessment,
    };
  }

  private computeCorrelation(
    absences: Array<{ absence_date: Date; staff_profile_id: string }>,
    coverCounts: StaffCoverCount[],
  ): Record<string, unknown> {
    // Count distinct months of absence data
    const months = new Set<string>();
    for (const a of absences) {
      const d = new Date(a.absence_date);
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const dataPoints = months.size;

    if (dataPoints < 12) {
      const monthsRemaining = 12 - dataPoints;
      const projectedDate = new Date();
      projectedDate.setMonth(projectedDate.getMonth() + monthsRemaining);

      return {
        status: 'accumulating',
        dataPoints,
        requiredDataPoints: 12,
        projectedAvailableDate: projectedDate.toISOString().slice(0, 10),
        message: `Building your school's picture: ${dataPoints} of 12 months collected. Trend analysis available from ${projectedDate.toLocaleDateString('en-IE', { month: 'long', year: 'numeric' })}.`,
      };
    }

    // Build monthly series
    const totalCovers = coverCounts.reduce((sum, c) => sum + c.count, 0);
    const monthlyAbsences = new Map<string, number>();
    for (const a of absences) {
      const d = new Date(a.absence_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyAbsences.set(key, (monthlyAbsences.get(key) ?? 0) + 1);
    }

    const sortedMonths = [...monthlyAbsences.entries()].sort(([a], [b]) => a.localeCompare(b));
    const maxAbsences = Math.max(...sortedMonths.map(([, count]) => count), 1);

    const series = sortedMonths.map(([month, absCount]) => ({
      month,
      coverPressure: totalCovers > 0 ? round(absCount / maxAbsences) : 0,
      absenceRate: round(absCount / maxAbsences),
    }));

    return {
      status: 'available',
      dataPoints,
      series,
      trendDescription:
        'Months with higher cover duty loads were followed by higher staff absence the following month.',
      disclaimer:
        'This shows patterns that occurred together. It does not prove that one caused the other. Use this as a starting point for investigation, not a conclusion.',
    };
  }
}

// ─── Utility Functions ────────────────────────────────────────────────────────

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower] ?? 0;
  const weight = index - lower;
  return (sortedValues[lower] ?? 0) * (1 - weight) + (sortedValues[upper] ?? 0) * weight;
}

function computeGini(sortedValues: number[]): number {
  const n = sortedValues.length;
  if (n === 0) return 0;
  const total = sortedValues.reduce((sum, v) => sum + v, 0);
  if (total === 0) return 0;

  let numerator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i + 1) * (sortedValues[i] ?? 0);
  }

  return (2 * numerator) / (n * total) - (n + 1) / n;
}

function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
