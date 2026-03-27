import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface NotifyConcernPayload extends TenantJobPayload {
  concern_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const NOTIFY_CONCERN_JOB = 'pastoral:notify-concern';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.PASTORAL)
export class NotifyConcernProcessor extends WorkerHost {
  private readonly logger = new Logger(NotifyConcernProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
  ) {
    super();
  }

  async process(job: Job<NotifyConcernPayload>): Promise<void> {
    if (job.name !== NOTIFY_CONCERN_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${NOTIFY_CONCERN_JOB} — concern ${job.data.concern_id}`,
    );

    const tenantJob = new NotifyConcernTenantJob(this.prisma);
    await tenantJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class NotifyConcernTenantJob extends TenantAwareJob<NotifyConcernPayload> {
  protected async processJob(
    _data: NotifyConcernPayload,
    _tx: PrismaClient,
  ): Promise<void> {
    // Stub — implementation in SW-1E
  }
}
