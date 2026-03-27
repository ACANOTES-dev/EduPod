import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export type OverdueActionsPayload = TenantJobPayload;

// ─── Job name ─────────────────────────────────────────────────────────────────

export const OVERDUE_ACTIONS_JOB = 'pastoral:overdue-actions';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.PASTORAL)
export class OverdueActionsProcessor extends WorkerHost {
  private readonly logger = new Logger(OverdueActionsProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
  ) {
    super();
  }

  async process(job: Job<OverdueActionsPayload>): Promise<void> {
    if (job.name !== OVERDUE_ACTIONS_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${OVERDUE_ACTIONS_JOB} — tenant ${tenant_id}`,
    );

    const tenantJob = new OverdueActionsTenantJob(this.prisma);
    await tenantJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class OverdueActionsTenantJob extends TenantAwareJob<OverdueActionsPayload> {
  protected async processJob(
    _data: OverdueActionsPayload,
    _tx: PrismaClient,
  ): Promise<void> {
    // Stub — implementation in SW-1E
  }
}
