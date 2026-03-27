import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface CheckinAlertPayload extends TenantJobPayload {
  student_id: string;
  checkin_id: string;
  flag_reason: string;
  monitoring_owner_user_ids: string[];
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const CHECKIN_ALERT_JOB = 'pastoral:checkin-alert';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.PASTORAL)
export class CheckinAlertProcessor extends WorkerHost {
  private readonly logger = new Logger(CheckinAlertProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
  ) {
    super();
  }

  async process(job: Job<CheckinAlertPayload>): Promise<void> {
    if (job.name !== CHECKIN_ALERT_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${CHECKIN_ALERT_JOB} — student ${job.data.student_id}, checkin ${job.data.checkin_id}`,
    );

    const tenantJob = new CheckinAlertTenantJob(this.prisma);
    await tenantJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class CheckinAlertTenantJob extends TenantAwareJob<CheckinAlertPayload> {
  private readonly logger = new Logger(CheckinAlertTenantJob.name);

  protected async processJob(
    data: CheckinAlertPayload,
    tx: PrismaClient,
  ): Promise<void> {
    // 1. Load the check-in record
    const checkin = await tx.studentCheckin.findFirst({
      where: { id: data.checkin_id },
      select: {
        id: true,
        mood_score: true,
        flagged: true,
        flag_reason: true,
        checkin_date: true,
      },
    });

    if (!checkin) {
      this.logger.warn(
        `Check-in ${data.checkin_id} not found — skipping alert`,
      );
      return;
    }

    // 2. Load student name
    const student = await tx.student.findFirst({
      where: { id: data.student_id },
      select: {
        id: true,
        first_name: true,
        last_name: true,
      },
    });

    const studentName = student
      ? `${student.first_name} ${student.last_name}`
      : `Unknown (${data.student_id})`;

    // 3. Notify each monitoring owner
    for (const ownerId of data.monitoring_owner_user_ids) {
      this.logger.log(
        `[ALERT] Flagged check-in for ${studentName} — reason: ${data.flag_reason}, ` +
          `mood: ${checkin.mood_score}, date: ${checkin.checkin_date.toISOString().slice(0, 10)} → notify owner ${ownerId}`,
      );
    }

    // 4. Log completion
    this.logger.log(
      `Check-in alert processed — checkin ${data.checkin_id}, student ${studentName}, ` +
        `notified ${data.monitoring_owner_user_ids.length} owner(s)`,
    );
  }
}
