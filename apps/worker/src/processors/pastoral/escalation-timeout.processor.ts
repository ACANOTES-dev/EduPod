import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface EscalationTimeoutPayload extends TenantJobPayload {
  concern_id: string;
  escalation_step: number;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const ESCALATION_TIMEOUT_JOB = 'pastoral:escalation-timeout';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.PASTORAL)
export class EscalationTimeoutProcessor extends WorkerHost {
  private readonly logger = new Logger(EscalationTimeoutProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
  ) {
    super();
  }

  async process(job: Job<EscalationTimeoutPayload>): Promise<void> {
    if (job.name !== ESCALATION_TIMEOUT_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${ESCALATION_TIMEOUT_JOB} — concern ${job.data.concern_id}, step ${job.data.escalation_step}`,
    );

    const tenantJob = new EscalationTimeoutTenantJob(this.prisma);
    await tenantJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class EscalationTimeoutTenantJob extends TenantAwareJob<EscalationTimeoutPayload> {
  protected async processJob(
    _data: EscalationTimeoutPayload,
    _tx: PrismaClient,
  ): Promise<void> {
    // Stub — implementation in SW-1E
  }
}
