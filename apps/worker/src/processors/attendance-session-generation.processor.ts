import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface AttendanceSessionGenerationPayload extends TenantJobPayload {
  date: string; // YYYY-MM-DD
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const ATTENDANCE_GENERATE_SESSIONS_JOB = 'attendance:generate-sessions';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.ATTENDANCE, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class AttendanceSessionGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(AttendanceSessionGenerationProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<AttendanceSessionGenerationPayload>): Promise<void> {
    if (job.name !== ATTENDANCE_GENERATE_SESSIONS_JOB) {
      // This processor only handles attendance:generate-sessions jobs.
      // Other job names on this queue are handled by other processors.
      return;
    }

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

    // JavaScript getDay(): 0=Sunday, 1=Monday, ..., 6=Saturday
    // Schema uses 0=Monday, 1=Tuesday, ..., 6=Sunday
    const jsDay = targetDate.getDay();
    const planWeekday = jsDay === 0 ? 6 : jsDay - 1;

    // Get all active schedules for this weekday
    const schedules = await tx.schedule.findMany({
      where: {
        tenant_id,
        weekday: planWeekday,
        effective_start_date: { lte: targetDate },
        OR: [{ effective_end_date: null }, { effective_end_date: { gte: targetDate } }],
      },
      include: {
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
}
