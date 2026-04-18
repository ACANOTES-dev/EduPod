import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { TenantAwareJob, TenantJobPayload } from '../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export type AttendanceAutoLockPayload = TenantJobPayload;

// ─── Job name ─────────────────────────────────────────────────────────────────

export const ATTENDANCE_AUTO_LOCK_JOB = 'attendance:auto-lock';

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Plain @Injectable service — the `AttendanceQueueDispatcher` owns the
 * queue subscription and routes jobs to this class by name.
 */
@Injectable()
export class AttendanceAutoLockProcessor {
  private readonly logger = new Logger(AttendanceAutoLockProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async process(job: Job<AttendanceAutoLockPayload>): Promise<void> {
    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(`Processing ${ATTENDANCE_AUTO_LOCK_JOB} — tenant ${tenant_id}`);

    const lockJob = new AttendanceAutoLockJob(this.prisma);
    await lockJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class AttendanceAutoLockJob extends TenantAwareJob<AttendanceAutoLockPayload> {
  private readonly logger = new Logger(AttendanceAutoLockJob.name);

  protected async processJob(data: AttendanceAutoLockPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id } = data;

    // Read tenant settings for autoLockAfterDays
    const tenantSettings = await tx.tenantSetting.findFirst({
      where: { tenant_id },
      select: { settings: true },
    });

    const settings = (tenantSettings?.settings as Record<string, unknown>) ?? {};
    const attendanceSettings = settings?.attendance as Record<string, unknown> | undefined;
    const autoLockAfterDays = attendanceSettings?.autoLockAfterDays as number | undefined;

    if (autoLockAfterDays === undefined || autoLockAfterDays === null) {
      this.logger.log(`Auto-lock disabled for tenant ${tenant_id} (no autoLockAfterDays setting)`);
      return;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - autoLockAfterDays);

    const result = await tx.attendanceSession.updateMany({
      where: {
        tenant_id,
        status: 'submitted',
        session_date: { lte: cutoffDate },
      },
      data: { status: 'locked' },
    });

    this.logger.log(
      `Auto-locked ${result.count} sessions for tenant ${tenant_id} (cutoff: ${autoLockAfterDays} days)`,
    );
  }
}
