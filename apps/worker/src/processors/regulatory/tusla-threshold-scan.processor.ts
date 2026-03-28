import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Job name ───────────────────────────────────────────────────────────────
export const REGULATORY_TUSLA_THRESHOLD_SCAN_JOB =
  'regulatory:scan-tusla-thresholds';

// ─── Constants ──────────────────────────────────────────────────────────────
const TUSLA_DEFAULT_THRESHOLD_DAYS = 20;
const APPROACHING_RATIO = 0.8; // 80% of threshold = "approaching"

// ─── Processor ──────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.REGULATORY)
export class RegulatoryTuslaThresholdScanProcessor extends WorkerHost {
  private readonly logger = new Logger(
    RegulatoryTuslaThresholdScanProcessor.name,
  );

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== REGULATORY_TUSLA_THRESHOLD_SCAN_JOB) return;

    this.logger.log('Starting TUSLA threshold scan');

    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true },
    });

    for (const tenant of tenants) {
      try {
        await this.scanTenantThresholds(tenant.id);
      } catch (error) {
        this.logger.error(
          `TUSLA threshold scan failed for tenant ${tenant.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(
      `TUSLA threshold scan complete — processed ${tenants.length} tenants`,
    );
  }

  // ─── Per-tenant threshold scan ──────────────────────────────────────────

  private async scanTenantThresholds(tenantId: string): Promise<void> {
    const today = new Date();
    const academicYearStart = this.getAcademicYearStart(today);
    const threshold = TUSLA_DEFAULT_THRESHOLD_DAYS;
    const approachingThreshold = Math.ceil(threshold * APPROACHING_RATIO);

    // Get all active students for this tenant
    const students = await this.prisma.student.findMany({
      where: { tenant_id: tenantId, status: 'active' },
      select: { id: true },
    });

    let alertsCreated = 0;

    for (const student of students) {
      const absentDays = await this.prisma.attendanceRecord.count({
        where: {
          tenant_id: tenantId,
          student_id: student.id,
          status: { in: ['absent_unexcused', 'absent_excused'] },
          session: {
            session_date: {
              gte: academicYearStart,
              lte: today,
            },
          },
        },
      });

      if (absentDays >= threshold) {
        // Threshold exceeded
        alertsCreated += await this.createAlertSafe(
          tenantId,
          student.id,
          today,
          absentDays,
          threshold,
          'exceeded',
        );
      } else if (absentDays >= approachingThreshold) {
        // Approaching threshold
        alertsCreated += await this.createAlertSafe(
          tenantId,
          student.id,
          today,
          absentDays,
          threshold,
          'approaching',
        );
      }
    }

    if (students.length > 0) {
      this.logger.log(
        `Tenant ${tenantId}: scanned ${students.length} students, ${alertsCreated} TUSLA alert(s) created`,
      );
    }
  }

  // ─── Academic year start calculation ────────────────────────────────────

  /**
   * Returns September 1st of the current academic year.
   * If today is before September, the academic year started last September.
   */
  private getAcademicYearStart(today: Date): Date {
    const year = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
    return new Date(year, 8, 1); // September 1st (month 8 = September, 0-indexed)
  }

  // ─── Safe alert creation with P2002 handling ────────────────────────────

  /**
   * Create an attendance pattern alert for TUSLA threshold, swallowing
   * unique constraint violations (P2002).
   *
   * The unique index on (tenant_id, student_id, alert_type, detected_date)
   * prevents duplicate alerts on the same day.
   */
  private async createAlertSafe(
    tenantId: string,
    studentId: string,
    today: Date,
    absentDays: number,
    threshold: number,
    status: 'approaching' | 'exceeded',
  ): Promise<number> {
    const detectedDate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const academicYearStart = this.getAcademicYearStart(today);

    try {
      await this.prisma.attendancePatternAlert.create({
        data: {
          tenant_id: tenantId,
          student_id: studentId,
          alert_type: 'excessive_absences',
          detected_date: detectedDate,
          window_start: academicYearStart,
          window_end: detectedDate,
          details_json: JSON.parse(
            JSON.stringify({
              source: 'tusla_threshold_scan',
              count: absentDays,
              threshold,
              status,
            }),
          ),
        },
      });
      return 1;
    } catch (err: unknown) {
      // P2002 = unique constraint violation — alert already exists for this
      // student + type + date combination. Expected when job runs more than
      // once per day; silently skip.
      if (
        err !== null &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        return 0;
      }
      throw err;
    }
  }
}
