import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import { EARLY_WARNING_COMPUTE_STUDENT_JOB } from '@school/shared/early-warning';

import { QUEUE_NAMES } from '../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export type AttendancePatternDetectionPayload = TenantJobPayload;

// ─── Job name ─────────────────────────────────────────────────────────────────

export const ATTENDANCE_DETECT_PATTERNS_JOB = 'attendance:detect-patterns';

// ─── Day name mapping ────────────────────────────────────────────────────────

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

// ─── Settings shape (parsed from tenant JSONB) ──────────────────────────────

interface PatternDetectionConfig {
  enabled: boolean;
  excessiveAbsenceThreshold: number;
  excessiveAbsenceWindowDays: number;
  recurringDayThreshold: number;
  recurringDayWindowDays: number;
  tardinessThreshold: number;
  tardinessWindowDays: number;
  parentNotificationMode: 'auto' | 'manual';
}

const DEFAULT_CONFIG: PatternDetectionConfig = {
  enabled: false,
  excessiveAbsenceThreshold: 5,
  excessiveAbsenceWindowDays: 14,
  recurringDayThreshold: 3,
  recurringDayWindowDays: 30,
  tardinessThreshold: 4,
  tardinessWindowDays: 14,
  parentNotificationMode: 'manual',
};

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.ATTENDANCE, { lockDuration: 180_000 })
export class AttendancePatternDetectionProcessor extends WorkerHost {
  private readonly logger = new Logger(AttendancePatternDetectionProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.EARLY_WARNING) private readonly earlyWarningQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<AttendancePatternDetectionPayload>): Promise<void> {
    if (job.name !== ATTENDANCE_DETECT_PATTERNS_JOB) {
      // This processor only handles attendance:detect-patterns jobs.
      // Other job names on this queue are handled by other processors.
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(`Processing ${ATTENDANCE_DETECT_PATTERNS_JOB} — tenant ${tenant_id}`);

    const innerJob = new AttendancePatternDetectionJob(this.prisma);
    await innerJob.execute(job.data);

    // ── Early warning intraday trigger for excessive absences ──────────────
    for (const studentId of innerJob.excessiveAbsenceStudentIds) {
      await this.earlyWarningQueue.add(
        EARLY_WARNING_COMPUTE_STUDENT_JOB,
        {
          tenant_id: job.data.tenant_id,
          student_id: studentId,
          trigger_event: 'third_consecutive_absence',
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
      this.logger.log(
        `Enqueued early warning recompute for student ${studentId} (trigger: third_consecutive_absence)`,
      );
    }
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class AttendancePatternDetectionJob extends TenantAwareJob<AttendancePatternDetectionPayload> {
  private readonly logger = new Logger(AttendancePatternDetectionJob.name);

  /** Student IDs that triggered excessive absence alerts. Read after execute(). */
  public excessiveAbsenceStudentIds: string[] = [];

  protected async processJob(
    data: AttendancePatternDetectionPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id } = data;

    // 1. Read tenant settings
    const config = await this.readPatternConfig(tx, tenant_id);

    if (!config.enabled) {
      this.logger.log(`Pattern detection disabled for tenant ${tenant_id}, skipping.`);
      return;
    }

    // 2. Get all active students
    const students = await tx.student.findMany({
      where: { tenant_id, status: 'active' },
      select: { id: true, first_name: true, last_name: true },
    });

    this.logger.log(
      `Tenant ${tenant_id}: checking patterns for ${students.length} active students`,
    );

    const today = new Date();
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    let alertsCreated = 0;

    // 3. For each student, check three pattern types
    for (const student of students) {
      // a) Excessive absences
      alertsCreated += await this.checkExcessiveAbsences(
        tx,
        tenant_id,
        student.id,
        todayDate,
        config,
      );

      // b) Recurring day pattern
      alertsCreated += await this.checkRecurringDayPattern(
        tx,
        tenant_id,
        student.id,
        todayDate,
        config,
      );

      // c) Chronic tardiness
      alertsCreated += await this.checkChronicTardiness(
        tx,
        tenant_id,
        student.id,
        todayDate,
        config,
      );
    }

    this.logger.log(
      `Tenant ${tenant_id}: pattern detection complete — ${alertsCreated} new alert(s) created`,
    );
  }

  /**
   * Read pattern detection config from tenant settings JSONB.
   */
  private async readPatternConfig(
    tx: PrismaClient,
    tenantId: string,
  ): Promise<PatternDetectionConfig> {
    const tenantSettings = await tx.tenantSetting.findFirst({
      where: { tenant_id: tenantId },
      select: { settings: true },
    });

    const settings = (tenantSettings?.settings as Record<string, unknown>) ?? {};
    const attendanceSettings = (settings.attendance as Record<string, unknown>) ?? {};
    const patternConfig = (attendanceSettings.patternDetection as Record<string, unknown>) ?? {};

    return {
      enabled:
        typeof patternConfig.enabled === 'boolean' ? patternConfig.enabled : DEFAULT_CONFIG.enabled,
      excessiveAbsenceThreshold:
        typeof patternConfig.excessiveAbsenceThreshold === 'number'
          ? patternConfig.excessiveAbsenceThreshold
          : DEFAULT_CONFIG.excessiveAbsenceThreshold,
      excessiveAbsenceWindowDays:
        typeof patternConfig.excessiveAbsenceWindowDays === 'number'
          ? patternConfig.excessiveAbsenceWindowDays
          : DEFAULT_CONFIG.excessiveAbsenceWindowDays,
      recurringDayThreshold:
        typeof patternConfig.recurringDayThreshold === 'number'
          ? patternConfig.recurringDayThreshold
          : DEFAULT_CONFIG.recurringDayThreshold,
      recurringDayWindowDays:
        typeof patternConfig.recurringDayWindowDays === 'number'
          ? patternConfig.recurringDayWindowDays
          : DEFAULT_CONFIG.recurringDayWindowDays,
      tardinessThreshold:
        typeof patternConfig.tardinessThreshold === 'number'
          ? patternConfig.tardinessThreshold
          : DEFAULT_CONFIG.tardinessThreshold,
      tardinessWindowDays:
        typeof patternConfig.tardinessWindowDays === 'number'
          ? patternConfig.tardinessWindowDays
          : DEFAULT_CONFIG.tardinessWindowDays,
      parentNotificationMode:
        patternConfig.parentNotificationMode === 'auto' ||
        patternConfig.parentNotificationMode === 'manual'
          ? patternConfig.parentNotificationMode
          : DEFAULT_CONFIG.parentNotificationMode,
    };
  }

  /**
   * Check for excessive absences in the rolling window.
   */
  private async checkExcessiveAbsences(
    tx: PrismaClient,
    tenantId: string,
    studentId: string,
    today: Date,
    config: PatternDetectionConfig,
  ): Promise<number> {
    const windowStart = new Date(today);
    windowStart.setDate(windowStart.getDate() - config.excessiveAbsenceWindowDays);

    const absenceCount = await tx.attendanceRecord.count({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: { in: ['absent_unexcused', 'absent_excused'] },
        session: {
          session_date: {
            gte: windowStart,
            lte: today,
          },
        },
      },
    });

    if (absenceCount >= config.excessiveAbsenceThreshold) {
      const created = await this.createAlertSafe(tx, {
        tenant_id: tenantId,
        student_id: studentId,
        alert_type: 'excessive_absences',
        detected_date: today,
        window_start: windowStart,
        window_end: today,
        details_json: {
          count: absenceCount,
          window_days: config.excessiveAbsenceWindowDays,
        },
      });
      if (created > 0) {
        this.excessiveAbsenceStudentIds.push(studentId);
      }
      return created;
    }

    return 0;
  }

  /**
   * Check for recurring day-of-week absence pattern in the rolling window.
   */
  private async checkRecurringDayPattern(
    tx: PrismaClient,
    tenantId: string,
    studentId: string,
    today: Date,
    config: PatternDetectionConfig,
  ): Promise<number> {
    const windowStart = new Date(today);
    windowStart.setDate(windowStart.getDate() - config.recurringDayWindowDays);

    const absenceRecords = await tx.attendanceRecord.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: { in: ['absent_unexcused', 'absent_excused'] },
        session: {
          session_date: {
            gte: windowStart,
            lte: today,
          },
        },
      },
      select: {
        session: {
          select: { session_date: true },
        },
      },
    });

    // Group by day of week
    const dayCounts = new Map<number, number>();
    for (const record of absenceRecords) {
      const dayOfWeek = new Date(record.session.session_date).getDay();
      dayCounts.set(dayOfWeek, (dayCounts.get(dayOfWeek) ?? 0) + 1);
    }

    let alertsCreated = 0;

    for (const [dayOfWeek, count] of dayCounts) {
      if (count >= config.recurringDayThreshold) {
        alertsCreated += await this.createAlertSafe(tx, {
          tenant_id: tenantId,
          student_id: studentId,
          alert_type: 'recurring_day',
          detected_date: today,
          window_start: windowStart,
          window_end: today,
          details_json: {
            count,
            window_days: config.recurringDayWindowDays,
            day_of_week: dayOfWeek,
            day_name: DAY_NAMES[dayOfWeek],
          },
        });
      }
    }

    return alertsCreated;
  }

  /**
   * Check for chronic tardiness in the rolling window.
   */
  private async checkChronicTardiness(
    tx: PrismaClient,
    tenantId: string,
    studentId: string,
    today: Date,
    config: PatternDetectionConfig,
  ): Promise<number> {
    const windowStart = new Date(today);
    windowStart.setDate(windowStart.getDate() - config.tardinessWindowDays);

    const lateCount = await tx.attendanceRecord.count({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: 'late',
        session: {
          session_date: {
            gte: windowStart,
            lte: today,
          },
        },
      },
    });

    if (lateCount >= config.tardinessThreshold) {
      return this.createAlertSafe(tx, {
        tenant_id: tenantId,
        student_id: studentId,
        alert_type: 'chronic_tardiness',
        detected_date: today,
        window_start: windowStart,
        window_end: today,
        details_json: {
          count: lateCount,
          window_days: config.tardinessWindowDays,
        },
      });
    }

    return 0;
  }

  /**
   * Create an alert, swallowing unique constraint violations (P2002).
   *
   * The unique index on (tenant_id, student_id, alert_type, detected_date) means
   * that if the same pattern is detected twice on the same day, the second attempt
   * will fail with P2002. This is expected behavior — we simply skip the duplicate
   * rather than treating it as an error.
   */
  private async createAlertSafe(
    tx: PrismaClient,
    data: {
      tenant_id: string;
      student_id: string;
      alert_type: 'excessive_absences' | 'recurring_day' | 'chronic_tardiness';
      detected_date: Date;
      window_start: Date;
      window_end: Date;
      details_json: Record<string, unknown>;
    },
  ): Promise<number> {
    try {
      await tx.attendancePatternAlert.create({
        data: {
          tenant_id: data.tenant_id,
          student_id: data.student_id,
          alert_type: data.alert_type,
          detected_date: data.detected_date,
          window_start: data.window_start,
          window_end: data.window_end,
          details_json: JSON.parse(JSON.stringify(data.details_json)),
        },
      });
      return 1;
    } catch (err: unknown) {
      // P2002 = unique constraint violation — alert already exists for this
      // student + type + date combination. This is expected when the job runs
      // more than once per day or when re-processing; silently skip.
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
