import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface InterventionReviewReminderPayload extends TenantJobPayload {
  intervention_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const INTERVENTION_REVIEW_REMINDER_JOB = 'pastoral:intervention-review-reminder';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.PASTORAL)
export class InterventionReviewReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(InterventionReviewReminderProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
  ) {
    super();
  }

  async process(job: Job<InterventionReviewReminderPayload>): Promise<void> {
    if (job.name !== INTERVENTION_REVIEW_REMINDER_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${INTERVENTION_REVIEW_REMINDER_JOB} — intervention ${job.data.intervention_id}`,
    );

    const tenantJob = new InterventionReviewReminderTenantJob(this.prisma);
    await tenantJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class InterventionReviewReminderTenantJob extends TenantAwareJob<InterventionReviewReminderPayload> {
  protected async processJob(
    _data: InterventionReviewReminderPayload,
    _tx: PrismaClient,
  ): Promise<void> {
    // Stub — implementation in SW-1E
  }
}
