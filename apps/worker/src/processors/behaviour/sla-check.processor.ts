import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface SlaCheckPayload extends TenantJobPayload {
  tenant_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const SLA_CHECK_JOB = 'safeguarding:sla-check';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.BEHAVIOUR)
export class SlaCheckProcessor extends WorkerHost {
  private readonly logger = new Logger(SlaCheckProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<SlaCheckPayload>): Promise<void> {
    if (job.name !== SLA_CHECK_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(`Processing ${SLA_CHECK_JOB} — tenant ${tenant_id}`);

    const slaJob = new SlaCheckJob(this.prisma);
    await slaJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class SlaCheckJob extends TenantAwareJob<SlaCheckPayload> {
  private readonly logger = new Logger(SlaCheckJob.name);

  protected async processJob(
    data: SlaCheckPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id } = data;

    // 1. Find all concerns with breached SLA (first response overdue)
    const breached = await tx.safeguardingConcern.findMany({
      where: {
        tenant_id,
        sla_first_response_met_at: null,
        sla_first_response_due: { lt: new Date() },
        status: { notIn: ['sg_resolved', 'sealed'] },
      },
    });

    if (breached.length === 0) {
      this.logger.log(`No SLA breaches found for tenant ${tenant_id}`);
      return;
    }

    let createdCount = 0;

    // 2. Process each breached concern
    for (const concern of breached) {
      // 2a. Check if a breach task already exists (idempotency)
      const existingTask = await tx.behaviourTask.findFirst({
        where: {
          tenant_id,
          entity_type: 'safeguarding_concern',
          entity_id: concern.id,
          title: { startsWith: 'SLA BREACH' },
          status: { in: ['pending', 'in_progress'] },
        },
      });

      if (existingTask) {
        this.logger.log(
          `SLA breach task already exists for concern ${concern.id} — skipping`,
        );
        continue;
      }

      // 2b. Create breach task
      await tx.behaviourTask.create({
        data: {
          tenant_id,
          task_type: 'safeguarding_action',
          entity_type: 'safeguarding_concern',
          entity_id: concern.id,
          title: `SLA BREACH: ${concern.concern_number} — acknowledgement overdue`,
          description:
            'The first response SLA for this safeguarding concern has been breached. Immediate action is required.',
          priority: 'urgent',
          status: 'pending',
        },
      });

      createdCount++;

      this.logger.log(
        `Created SLA breach task for concern ${concern.id} (${concern.concern_number})`,
      );
    }

    this.logger.log(
      `SLA check complete for tenant ${tenant_id}: ${breached.length} breach(es) detected, ${createdCount} new task(s) created`,
    );
  }
}
