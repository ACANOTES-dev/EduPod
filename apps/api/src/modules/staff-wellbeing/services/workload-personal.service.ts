import { Injectable } from '@nestjs/common';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import type {
  CoverHistoryItem,
  PersonalTimetableQuality,
  PersonalWorkloadSummary,
} from './workload-compute.service';
import { WorkloadDataService } from './workload-data.service';
import { WorkloadEmptyStateService } from './workload-empty-state.service';
import { WorkloadMetricsService } from './workload-metrics.service';

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Personal workload operations focused on a single staff member:
 * workload summary, cover history, and timetable quality.
 */
@Injectable()
export class WorkloadPersonalService {
  private readonly emptyStateService = new WorkloadEmptyStateService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataService: WorkloadDataService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // Personal workload summary
  // ═══════════════════════════════════════════════════════════════════════════

  async getPersonalWorkloadSummary(
    tenantId: string,
    staffProfileId: string,
  ): Promise<PersonalWorkloadSummary> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx): Promise<PersonalWorkloadSummary> => {
      const db = tx as unknown as PrismaService;

      const academicYear = await this.dataService.getActiveAcademicYear(db, tenantId);
      if (!academicYear) {
        return this.emptyStateService.emptyPersonalSummary();
      }

      const currentPeriod = await this.dataService.getCurrentPeriod(db, tenantId, academicYear.id);
      const previousPeriod = currentPeriod
        ? await this.dataService.getPreviousPeriod(db, tenantId, academicYear.id, currentPeriod)
        : null;

      // Teaching periods per week
      const teachingSchedules = await db.schedule.findMany({
        where: {
          tenant_id: tenantId,
          teacher_staff_id: staffProfileId,
          academic_year_id: academicYear.id,
          schedule_period_template: {
            schedule_period_type: 'teaching',
          },
        },
        select: { id: true },
      });
      const teachingPeriodsPerWeek = teachingSchedules.length;

      // Cover duties this term
      const coverDutiesThisTerm = currentPeriod
        ? await this.dataService.countCoversInRange(
            db,
            tenantId,
            staffProfileId,
            currentPeriod.start_date,
            currentPeriod.end_date,
          )
        : 0;

      // School average covers
      const schoolAverageCovers = currentPeriod
        ? await this.dataService.computeSchoolAverageCovers(
            db,
            tenantId,
            currentPeriod.start_date,
            currentPeriod.end_date,
          )
        : 0;

      // Timetable quality
      const allSchedules = await this.dataService.getTeacherSchedules(
        db,
        tenantId,
        staffProfileId,
        academicYear.id,
      );
      const compositeScore = WorkloadMetricsService.computeTimetableCompositeScore(allSchedules);
      const compositeLabel = WorkloadMetricsService.qualityLabel(compositeScore);

      // Trend (previous term)
      let trend: PersonalWorkloadSummary['trend'] = null;
      if (previousPeriod) {
        const previousCovers = await this.dataService.countCoversInRange(
          db,
          tenantId,
          staffProfileId,
          previousPeriod.start_date,
          previousPeriod.end_date,
        );
        trend = {
          previous_term_periods: teachingPeriodsPerWeek,
          previous_term_covers: previousCovers,
        };
      }

      // Status from thresholds
      const thresholds = await this.dataService.getWellbeingThresholds(db, tenantId);
      const status = this.dataService.computeStatus(
        teachingPeriodsPerWeek,
        coverDutiesThisTerm,
        thresholds,
      );

      return {
        teaching_periods_per_week: teachingPeriodsPerWeek,
        cover_duties_this_term: coverDutiesThisTerm,
        school_average_covers: WorkloadMetricsService.round2(schoolAverageCovers),
        timetable_quality_score: compositeScore,
        timetable_quality_label: compositeLabel,
        trend,
        status,
      };
    }) as Promise<PersonalWorkloadSummary>;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Personal cover history
  // ═══════════════════════════════════════════════════════════════════════════

  async getPersonalCoverHistory(
    tenantId: string,
    staffProfileId: string,
    page: number,
    pageSize: number,
  ): Promise<{
    data: CoverHistoryItem[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(
      async (
        tx,
      ): Promise<{
        data: CoverHistoryItem[];
        meta: { page: number; pageSize: number; total: number };
      }> => {
        const db = tx as unknown as PrismaService;

        const coverStatuses: ('assigned' | 'confirmed' | 'completed')[] = [
          'assigned',
          'confirmed',
          'completed',
        ];

        const [records, total] = await Promise.all([
          db.substitutionRecord.findMany({
            where: {
              tenant_id: tenantId,
              substitute_staff_id: staffProfileId,
              status: { in: coverStatuses },
            },
            orderBy: { created_at: 'desc' as const },
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: {
              created_at: true,
              schedule: {
                select: {
                  period_order: true,
                  class_entity: { select: { name: true } },
                  schedule_period_template: {
                    select: { period_name: true, period_order: true },
                  },
                },
              },
            },
          }),
          db.substitutionRecord.count({
            where: {
              tenant_id: tenantId,
              substitute_staff_id: staffProfileId,
              status: { in: coverStatuses },
            },
          }),
        ]);

        const data: CoverHistoryItem[] = records.map((r) => ({
          date: r.created_at.toISOString().slice(0, 10),
          period:
            r.schedule.schedule_period_template?.period_name ??
            `Period ${r.schedule.period_order ?? 0}`,
          subject: r.schedule.class_entity?.name ?? null,
          original_teacher: 'Colleague' as const,
        }));

        return { data, meta: { page, pageSize, total } };
      },
    ) as Promise<{
      data: CoverHistoryItem[];
      meta: { page: number; pageSize: number; total: number };
    }>;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Personal timetable quality
  // ═══════════════════════════════════════════════════════════════════════════

  async getPersonalTimetableQuality(
    tenantId: string,
    staffProfileId: string,
  ): Promise<PersonalTimetableQuality> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx): Promise<PersonalTimetableQuality> => {
      const db = tx as unknown as PrismaService;

      const academicYear = await this.dataService.getActiveAcademicYear(db, tenantId);
      if (!academicYear) {
        return this.emptyStateService.emptyTimetableQuality();
      }

      const schedules = await this.dataService.getTeacherSchedules(
        db,
        tenantId,
        staffProfileId,
        academicYear.id,
      );

      const allTemplates = await db.schedulePeriodTemplate.findMany({
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYear.id,
          schedule_period_type: 'teaching',
        },
        select: { weekday: true, period_order: true },
      });

      // Free period distribution per weekday
      const freeDistribution = WorkloadMetricsService.computeFreeDistribution(
        schedules,
        allTemplates,
      );

      // Consecutive periods
      const consecutive = WorkloadMetricsService.computeConsecutivePeriods(schedules);

      // Split days
      const splitDaysCount = WorkloadMetricsService.computeSplitDays(schedules, allTemplates);

      // Room changes
      const roomChanges = WorkloadMetricsService.computeRoomChanges(schedules);

      // School averages — compute for all teachers
      const allStaff = await db.staffProfile.findMany({
        where: { tenant_id: tenantId },
        select: { id: true },
      });

      const schoolConsecutiveMaxes: number[] = [];
      const schoolFreeScores: number[] = [];
      const schoolSplitCounts: number[] = [];
      const schoolRoomAvgs: number[] = [];

      for (const staff of allStaff) {
        const staffSchedules = await this.dataService.getTeacherSchedules(
          db,
          tenantId,
          staff.id,
          academicYear.id,
        );
        if (staffSchedules.length === 0) continue;

        const sc = WorkloadMetricsService.computeConsecutivePeriods(staffSchedules);
        schoolConsecutiveMaxes.push(sc.max);

        const sf = WorkloadMetricsService.computeFreeDistribution(staffSchedules, allTemplates);
        schoolFreeScores.push(WorkloadMetricsService.scoreFreeDistribution(sf));

        schoolSplitCounts.push(
          WorkloadMetricsService.computeSplitDays(staffSchedules, allTemplates),
        );

        const sr = WorkloadMetricsService.computeRoomChanges(staffSchedules);
        schoolRoomAvgs.push(sr.average);
      }

      const compositeScore = WorkloadMetricsService.computeTimetableCompositeScore(schedules);

      return {
        free_period_distribution: freeDistribution,
        consecutive_periods: consecutive,
        split_days_count: splitDaysCount,
        room_changes: roomChanges,
        school_averages: {
          consecutive_max: WorkloadMetricsService.round2(
            WorkloadMetricsService.mean(schoolConsecutiveMaxes),
          ),
          free_distribution_score: WorkloadMetricsService.round2(
            WorkloadMetricsService.mean(schoolFreeScores),
          ),
          split_days_pct: WorkloadMetricsService.round2(
            allStaff.length > 0
              ? (schoolSplitCounts.filter((c) => c > 0).length / allStaff.length) * 100
              : 0,
          ),
          room_changes_avg: WorkloadMetricsService.round2(
            WorkloadMetricsService.mean(schoolRoomAvgs),
          ),
        },
        composite_score: compositeScore,
        composite_label: WorkloadMetricsService.qualityLabel(compositeScore),
      };
    }) as Promise<PersonalTimetableQuality>;
  }
}
