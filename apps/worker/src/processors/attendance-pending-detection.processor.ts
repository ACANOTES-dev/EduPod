import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { TenantAwareJob, TenantJobPayload } from '../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface AttendancePendingDetectionPayload extends TenantJobPayload {
  date: string; // YYYY-MM-DD
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const ATTENDANCE_DETECT_PENDING_JOB = 'attendance:detect-pending';

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Plain @Injectable service — the `AttendanceQueueDispatcher` owns the
 * queue subscription and routes jobs to this class by name.
 */
@Injectable()
export class AttendancePendingDetectionProcessor {
  private readonly logger = new Logger(AttendancePendingDetectionProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async process(job: Job<AttendancePendingDetectionPayload>): Promise<void> {
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
