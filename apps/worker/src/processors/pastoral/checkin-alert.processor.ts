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
  protected async processJob(
    _data: CheckinAlertPayload,
    _tx: PrismaClient,
  ): Promise<void> {
    // Stub — implementation in SW-1E
  }
}
