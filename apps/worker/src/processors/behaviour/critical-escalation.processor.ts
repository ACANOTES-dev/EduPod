import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface CriticalEscalationPayload extends TenantJobPayload {
  concern_id: string;
  escalation_step: number;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const CRITICAL_ESCALATION_JOB = 'safeguarding:critical-escalation';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.BEHAVIOUR)
export class CriticalEscalationProcessor extends WorkerHost {
  private readonly logger = new Logger(CriticalEscalationProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<CriticalEscalationPayload>): Promise<void> {
    if (job.name !== CRITICAL_ESCALATION_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${CRITICAL_ESCALATION_JOB} — concern ${job.data.concern_id}, step ${job.data.escalation_step}`,
    );

    const escalationJob = new CriticalEscalationJob(this.prisma);
    await escalationJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class CriticalEscalationJob extends TenantAwareJob<CriticalEscalationPayload> {
  private readonly logger = new Logger(CriticalEscalationJob.name);

  protected async processJob(
    data: CriticalEscalationPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id, concern_id, escalation_step } = data;

    // 1. Load the concern
    const concern = await tx.safeguardingConcern.findFirst({
      where: { id: concern_id, tenant_id },
    });

    if (!concern) {
      this.logger.warn(
        `Concern ${concern_id} not found for tenant ${tenant_id} — skipping`,
      );
      return;
    }

    // 2. If already acknowledged, terminate escalation
    if (concern.status !== 'reported') {
      this.logger.log(
        `Concern ${concern_id} status is "${concern.status}" (not reported) — escalation terminated`,
      );
      return;
    }

    // 3. Load tenant settings
    const tenantSettings = await tx.tenantSetting.findFirst({
      where: { tenant_id },
      select: { settings: true },
    });

    const settings =
      (tenantSettings?.settings as Record<string, unknown>) ?? {};
    const behaviourSettings =
      (settings?.behaviour as Record<string, unknown>) ?? {};

    const designatedLiaisonUserId =
      (behaviourSettings?.designated_liaison_user_id as string | undefined) ??
      null;
    const deputyDesignatedLiaisonUserId =
      (behaviourSettings?.deputy_designated_liaison_user_id as
        | string
        | undefined) ?? null;
    const dlpFallbackChain =
      (behaviourSettings?.dlp_fallback_chain as string[] | undefined) ?? [];

    // 4. Build escalation chain
    const escalationChain = [
      designatedLiaisonUserId,
      deputyDesignatedLiaisonUserId,
      ...dlpFallbackChain,
    ].filter((id): id is string => Boolean(id));

    // 5. Check if chain is exhausted
    if (escalation_step >= escalationChain.length) {
      this.logger.warn(
        `Escalation chain exhausted for concern ${concern_id} at step ${escalation_step} (chain length: ${escalationChain.length})`,
      );

      await tx.safeguardingAction.create({
        data: {
          tenant_id,
          concern_id,
          action_type: 'note_added',
          description: `Critical escalation chain exhausted at step ${escalation_step}. No further contacts available. Manual intervention required.`,
          performed_by_id: escalationChain[0] ?? concern.reported_by_id,
        },
      });

      return;
    }

    // 6. Record escalation action
    const targetUserId = escalationChain[escalation_step];

    await tx.safeguardingAction.create({
      data: {
        tenant_id,
        concern_id,
        action_type: 'note_added',
        description: `Critical escalation step ${escalation_step} — notified user ${targetUserId}`,
        performed_by_id: targetUserId,
      },
    });

    this.logger.log(
      `Critical escalation step ${escalation_step} recorded for concern ${concern_id} — target user ${targetUserId}. Notification would be sent.`,
    );
  }
}
