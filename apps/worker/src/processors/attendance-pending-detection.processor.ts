import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface AttendancePendingDetectionPayload extends TenantJobPayload {
  date: string; // YYYY-MM-DD
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const ATTENDANCE_DETECT_PENDING_JOB = 'attendance:detect-pending';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.ATTENDANCE, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class AttendancePendingDetectionProcessor extends WorkerHost {
  private readonly logger = new Logger(AttendancePendingDetectionProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<AttendancePendingDetectionPayload>): Promise<void> {
    if (job.name !== ATTENDANCE_DETECT_PENDING_JOB) {
      // This processor only handles attendance:detect-pending jobs.
      // Other job names on this queue are handled by other processors.
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${ATTENDANCE_DETECT_PENDING_JOB} — tenant ${tenant_id} on ${job.data.date}`,
    );

    const detectionJob = new AttendancePendingDetectionJob(this.prisma);
    await detectionJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class AttendancePendingDetectionJob extends TenantAwareJob<AttendancePendingDetectionPayload> {
  private readonly logger = new Logger(AttendancePendingDetectionJob.name);

  protected async processJob(
    data: AttendancePendingDetectionPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id, date } = data;

    const pendingCount = await tx.attendanceSession.count({
      where: {
        tenant_id,
        session_date: new Date(date),
        status: 'open',
      },
    });

    this.logger.log(`Tenant ${tenant_id}: ${pendingCount} pending attendance sessions for ${date}`);

    // Cache count in Redis for dashboard quick-display (future enhancement).
    // For now, just log — the exception dashboard endpoint handles real-time queries.
  }
}
