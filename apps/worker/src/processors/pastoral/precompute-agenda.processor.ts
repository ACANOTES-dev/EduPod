import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export type PrecomputeAgendaPayload = TenantJobPayload;

// ─── Job name ─────────────────────────────────────────────────────────────────

export const PRECOMPUTE_AGENDA_JOB = 'pastoral:precompute-agenda';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.PASTORAL)
export class PrecomputeAgendaProcessor extends WorkerHost {
  private readonly logger = new Logger(PrecomputeAgendaProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
  ) {
    super();
  }

  async process(job: Job<PrecomputeAgendaPayload>): Promise<void> {
    if (job.name !== PRECOMPUTE_AGENDA_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${PRECOMPUTE_AGENDA_JOB} — tenant ${tenant_id}`,
    );

    const tenantJob = new PrecomputeAgendaTenantJob(this.prisma);
    await tenantJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class PrecomputeAgendaTenantJob extends TenantAwareJob<PrecomputeAgendaPayload> {
  protected async processJob(
    _data: PrecomputeAgendaPayload,
    _tx: PrismaClient,
  ): Promise<void> {
    // Stub — implementation in SW-1E
  }
}
