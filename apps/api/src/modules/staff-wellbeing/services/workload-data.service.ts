import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

// ─── Internal types ──────────────────────────────────────────────────────────

export interface ScheduleRow {
  id: string;
  weekday: number;
  period_order: number | null;
  room_id: string | null;
  schedule_period_template: {
    schedule_period_type: string;
    period_name: string;
    period_order: number;
  } | null;
  class_entity: { name: string } | null;
}

export interface AcademicPeriodRow {
  id: string;
  start_date: Date;
  end_date: Date;
}

export interface WellbeingSettings {
  workload_high_threshold_periods: number;
  workload_high_threshold_covers: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_THRESHOLD_PERIODS = 22;
const DEFAULT_THRESHOLD_COVERS = 8;

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Data collection and aggregation layer for workload computation.
 * Responsible for fetching academic context, schedules, covers, and thresholds.
 */
@Injectable()
export class WorkloadDataService {
  // ─── Academic context ─────────────────────────────────────────────────────

  async getActiveAcademicYear(
    db: PrismaService,
    tenantId: string,
  ): Promise<{ id: string; start_date: Date; end_date: Date } | null> {
    return db.academicYear.findFirst({
      where: { tenant_id: tenantId, status: 'active' },
      select: { id: true, start_date: true, end_date: true },
    });
  }

  async getCurrentPeriod(
    db: PrismaService,
    tenantId: string,
    academicYearId: string,
  ): Promise<AcademicPeriodRow | null> {
    const now = new Date();
    return db.academicPeriod.findFirst({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        start_date: { lte: now },
        end_date: { gte: now },
      },
      select: { id: true, start_date: true, end_date: true },
    });
  }

  async getPreviousPeriod(
    db: PrismaService,
    tenantId: string,
    academicYearId: string,
    currentPeriod: AcademicPeriodRow,
  ): Promise<AcademicPeriodRow | null> {
    return db.academicPeriod.findFirst({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        end_date: { lt: currentPeriod.start_date },
      },
      orderBy: { end_date: 'desc' },
      select: { id: true, start_date: true, end_date: true },
    });
  }

  // ─── Covers ───────────────────────────────────────────────────────────────

  async countCoversInRange(
    db: PrismaService,
    tenantId: string,
    staffProfileId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    return db.substitutionRecord.count({
      where: {
        tenant_id: tenantId,
        substitute_staff_id: staffProfileId,
        status: { in: ['assigned', 'confirmed', 'completed'] },
        created_at: { gte: startDate, lte: endDate },
      },
    });
  }

  async computeSchoolAverageCovers(
    db: PrismaService,
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const allStaff = await db.staffProfile.findMany({
      where: { tenant_id: tenantId },
      select: { id: true },
    });

    if (allStaff.length === 0) return 0;

    let total = 0;
    for (const staff of allStaff) {
      total += await this.countCoversInRange(db, tenantId, staff.id, startDate, endDate);
    }

    return WorkloadDataService.round2(total / allStaff.length);
  }

  // ─── Schedules ────────────────────────────────────────────────────────────

  async getTeacherSchedules(
    db: PrismaService,
    tenantId: string,
    staffProfileId: string,
    academicYearId: string,
  ): Promise<ScheduleRow[]> {
    return db.schedule.findMany({
      where: {
        tenant_id: tenantId,
        teacher_staff_id: staffProfileId,
        academic_year_id: academicYearId,
      },
      select: {
        id: true,
        weekday: true,
        period_order: true,
        room_id: true,
        schedule_period_template: {
          select: {
            schedule_period_type: true,
            period_name: true,
            period_order: true,
          },
        },
        class_entity: {
          select: { name: true },
        },
      },
    });
  }

  // ─── Thresholds ───────────────────────────────────────────────────────────

  async getWellbeingThresholds(db: PrismaService, tenantId: string): Promise<WellbeingSettings> {
    const setting = await db.tenantSetting.findFirst({
      where: { tenant_id: tenantId },
      select: { settings: true },
    });

    const raw = setting?.settings as Record<string, unknown> | null;
    const wellbeing = raw?.staff_wellbeing as Record<string, unknown> | undefined;

    return {
      workload_high_threshold_periods:
        (wellbeing?.workload_high_threshold_periods as number) ?? DEFAULT_THRESHOLD_PERIODS,
      workload_high_threshold_covers:
        (wellbeing?.workload_high_threshold_covers as number) ?? DEFAULT_THRESHOLD_COVERS,
    };
  }

  // ─── Status computation ───────────────────────────────────────────────────

  computeStatus(
    teachingPeriods: number,
    coverDuties: number,
    thresholds: WellbeingSettings,
  ): 'normal' | 'elevated' | 'high' {
    const periodsHigh = teachingPeriods > thresholds.workload_high_threshold_periods;
    const coversHigh = coverDuties > thresholds.workload_high_threshold_covers;

    if (periodsHigh && coversHigh) return 'high';
    if (periodsHigh || coversHigh) return 'elevated';
    return 'normal';
  }

  // ─── Utility ──────────────────────────────────────────────────────────────

  /** Round to 2 decimal places */
  static round2(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
