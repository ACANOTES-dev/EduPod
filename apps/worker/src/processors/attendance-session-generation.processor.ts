import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { TenantAwareJob, TenantJobPayload } from '../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface AttendanceSessionGenerationPayload extends TenantJobPayload {
  date: string; // YYYY-MM-DD
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const ATTENDANCE_GENERATE_SESSIONS_JOB = 'attendance:generate-sessions';

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Plain @Injectable service — the `AttendanceQueueDispatcher` owns the
 * queue subscription and routes jobs to this class by name.
 */
@Injectable()
export class AttendanceSessionGenerationProcessor {
  private readonly logger = new Logger(AttendanceSessionGenerationProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async process(job: Job<AttendanceSessionGenerationPayload>): Promise<void> {
    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${ATTENDANCE_GENERATE_SESSIONS_JOB} — tenant ${tenant_id} on ${job.data.date}`,
    );

    const generationJob = new AttendanceSessionGenerationJob(this.prisma);
    await generationJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class AttendanceSessionGenerationJob extends TenantAwareJob<AttendanceSessionGenerationPayload> {
  private readonly logger = new Logger(AttendanceSessionGenerationJob.name);

  protected async processJob(
    data: AttendanceSessionGenerationPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id, date } = data;
    const targetDate = new Date(date);

    // ── Read tenant settings ONCE for default-present check ──────────────
    const tenantSettings = await tx.tenantSetting.findFirst({
      where: { tenant_id },
      select: { settings: true },
    });
    const settings = (tenantSettings?.settings as Record<string, unknown>) ?? {};
    const attendanceSettings = (settings.attendance as Record<string, unknown>) ?? {};
    const defaultPresentEnabled = attendanceSettings.defaultPresentEnabled === true;
    const captureMode = attendanceSettings.captureMode === 'daily' ? 'daily' : 'per_period';

    if (captureMode === 'daily') {
      const created = await this.generateDailySessions(
        tx,
        tenant_id,
        targetDate,
        defaultPresentEnabled,
      );
      this.logger.log(
        `Generated ${created} daily sessions${defaultPresentEnabled ? ' (with default present records)' : ''} for tenant ${tenant_id} on ${date}`,
      );
      return;
    }

    // Schedule.weekday uses the JS convention: 0=Sunday, 1=Monday, ..., 6=Saturday.
    // This matches substitution.service.ts, timetable-grid.tsx, and the seed data.
    const planWeekday = targetDate.getDay();

    // Get all active schedules for this weekday
    const schedules = await tx.schedule.findMany({
      where: {
        tenant_id,
        weekday: planWeekday,
        effective_start_date: { lte: targetDate },
        OR: [{ effective_end_date: null }, { effective_end_date: { gte: targetDate } }],
      },
      select: {
        id: true,
        class_id: true,
        teacher_staff_id: true,
        class_entity: {
          select: {
            id: true,
            status: true,
            academic_year: {
              select: { start_date: true, end_date: true },
            },
            year_group_id: true,
          },
        },
      },
    });

    let created = 0;

    for (const schedule of schedules) {
      // Skip if class is not active
      if (schedule.class_entity.status !== 'active') continue;

      // Skip if date outside academic year
      const ayStart = schedule.class_entity.academic_year.start_date;
      const ayEnd = schedule.class_entity.academic_year.end_date;
      if (targetDate < ayStart || targetDate > ayEnd) continue;

      // Check for school closure affecting this class
      const closureWhere: Record<string, unknown>[] = [{ affects_scope: 'all' }];

      if (schedule.class_entity.year_group_id) {
        closureWhere.push({
          affects_scope: 'year_group',
          scope_entity_id: schedule.class_entity.year_group_id,
        });
      }

      closureWhere.push({
        affects_scope: 'class',
        scope_entity_id: schedule.class_entity.id,
      });

      const closureCount = await tx.schoolClosure.count({
        where: {
          tenant_id,
          closure_date: targetDate,
          OR: closureWhere,
        },
      });

      if (closureCount > 0) continue; // Skip closure dates

      // Create session (skip if already exists via unique constraint)
      try {
        const session = await tx.attendanceSession.create({
          data: {
            tenant_id,
            class_id: schedule.class_id,
            schedule_id: schedule.id,
            teacher_staff_id: schedule.teacher_staff_id,
            session_date: targetDate,
            status: 'open',
          },
        });
        created++;

        // ── Default present: bulk-insert present records for all enrolled students ──
        if (defaultPresentEnabled) {
          await tx.attendanceSession.update({
            where: { id: session.id },
            data: { default_present: true },
          });

          const enrolments = await tx.classEnrolment.findMany({
            where: {
              class_id: schedule.class_id,
              tenant_id,
              status: 'active',
            },
            select: { student_id: true },
          });

          if (enrolments.length > 0) {
            const now = new Date();
            await tx.attendanceRecord.createMany({
              data: enrolments.map((e: { student_id: string }) => ({
                tenant_id,
                attendance_session_id: session.id,
                student_id: e.student_id,
                status: 'present' as const,
                marked_by_user_id: '00000000-0000-0000-0000-000000000000',
                marked_at: now,
              })),
              skipDuplicates: true,
            });
          }
        }
      } catch (err: unknown) {
        // Unique constraint violation = session already exists, skip
        if (
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: string }).code === 'P2002'
        ) {
          continue;
        }
        throw err;
      }
    }

    this.logger.log(
      `Generated ${created} sessions${defaultPresentEnabled ? ' (with default present records)' : ''} for tenant ${tenant_id} on ${date}`,
    );
  }

  // ─── Daily capture-mode generation ─────────────────────────────────────────
  // One session per active class per day, schedule_id=null. Iterates the Class
  // table directly so non-timetabled classes still get a register. Honours the
  // same academic-year + school-closure guards as the per-period branch.
  private async generateDailySessions(
    tx: PrismaClient,
    tenant_id: string,
    targetDate: Date,
    defaultPresentEnabled: boolean,
  ): Promise<number> {
    const classes = await tx.class.findMany({
      where: { tenant_id, status: 'active' },
      select: {
        id: true,
        year_group_id: true,
        homeroom_teacher_staff_id: true,
        academic_year: { select: { start_date: true, end_date: true } },
      },
    });

    let created = 0;

    for (const cls of classes) {
      if (targetDate < cls.academic_year.start_date || targetDate > cls.academic_year.end_date) {
        continue;
      }

      const closureWhere: Record<string, unknown>[] = [{ affects_scope: 'all' }];
      if (cls.year_group_id) {
        closureWhere.push({
          affects_scope: 'year_group',
          scope_entity_id: cls.year_group_id,
        });
      }
      closureWhere.push({ affects_scope: 'class', scope_entity_id: cls.id });

      const closureCount = await tx.schoolClosure.count({
        where: { tenant_id, closure_date: targetDate, OR: closureWhere },
      });

      if (closureCount > 0) continue;

      try {
        const session = await tx.attendanceSession.create({
          data: {
            tenant_id,
            class_id: cls.id,
            schedule_id: null,
            teacher_staff_id: cls.homeroom_teacher_staff_id,
            session_date: targetDate,
            status: 'open',
          },
        });
        created++;

        if (defaultPresentEnabled) {
          await tx.attendanceSession.update({
            where: { id: session.id },
            data: { default_present: true },
          });

          const enrolments = await tx.classEnrolment.findMany({
            where: { class_id: cls.id, tenant_id, status: 'active' },
            select: { student_id: true },
          });

          if (enrolments.length > 0) {
            const now = new Date();
            await tx.attendanceRecord.createMany({
              data: enrolments.map((e: { student_id: string }) => ({
                tenant_id,
                attendance_session_id: session.id,
                student_id: e.student_id,
                status: 'present' as const,
                marked_by_user_id: '00000000-0000-0000-0000-000000000000',
                marked_at: now,
              })),
              skipDuplicates: true,
            });
          }
        }
      } catch (err: unknown) {
        if (
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: string }).code === 'P2002'
        ) {
          continue;
        }
        throw err;
      }
    }

    return created;
  }
}
