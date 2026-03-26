import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface BreakGlassExpiryPayload extends TenantJobPayload {
  tenant_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const BREAK_GLASS_EXPIRY_JOB = 'behaviour:break-glass-expiry';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.BEHAVIOUR)
export class BreakGlassExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(BreakGlassExpiryProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<BreakGlassExpiryPayload>): Promise<void> {
    if (job.name !== BREAK_GLASS_EXPIRY_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${BREAK_GLASS_EXPIRY_JOB} — tenant ${tenant_id}`,
    );

    const expiryJob = new BreakGlassExpiryJob(this.prisma);
    await expiryJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class BreakGlassExpiryJob extends TenantAwareJob<BreakGlassExpiryPayload> {
  private readonly logger = new Logger(BreakGlassExpiryJob.name);

  protected async processJob(
    data: BreakGlassExpiryPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id } = data;

    // 1. Find all expired, un-revoked grants
    const expiredGrants = await tx.safeguardingBreakGlassGrant.findMany({
      where: {
        tenant_id,
        revoked_at: null,
        expires_at: { lt: new Date() },
      },
    });

    if (expiredGrants.length === 0) {
      this.logger.log(
        `No expired break-glass grants found for tenant ${tenant_id}`,
      );
      return;
    }

    // 2. Process each expired grant
    for (const grant of expiredGrants) {
      const now = new Date();

      // 2a. Atomically revoke the grant (only if still un-revoked)
      await tx.safeguardingBreakGlassGrant.updateMany({
        where: { id: grant.id, revoked_at: null },
        data: { revoked_at: now },
      });

      // 2b. Create a review task
      await tx.behaviourTask.create({
        data: {
          tenant_id,
          task_type: 'break_glass_review',
          entity_type: 'break_glass_grant',
          entity_id: grant.id,
          title: 'Break-glass review required: access expired',
          description:
            'Emergency break-glass access has expired. Review the accessed records and complete the after-action review.',
          priority: 'high',
          status: 'pending',
          assigned_to_id: grant.granted_by_id,
          due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          created_by_id: grant.granted_by_id,
        },
      });

      this.logger.log(
        `Revoked expired break-glass grant ${grant.id} and created review task`,
      );
    }

    this.logger.log(
      `Processed ${expiredGrants.length} expired break-glass grant(s) for tenant ${tenant_id}`,
    );
  }
}
