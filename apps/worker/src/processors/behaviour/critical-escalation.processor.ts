import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';

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

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.BEHAVIOUR) private readonly behaviourQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<CriticalEscalationPayload>): Promise<void> {
    if (job.name !== CRITICAL_ESCALATION_JOB) {
      return;
    }

    const { tenant_id, concern_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${CRITICAL_ESCALATION_JOB} — concern ${concern_id}, step ${job.data.escalation_step}`,
    );

    const escalationJob = new CriticalEscalationJob(this.prisma);
    await escalationJob.execute(job.data);

    // Re-enqueue for next escalation step OUTSIDE the Prisma transaction.
    // This prevents orphaned delayed jobs if the transaction were to roll back.
    const nextStep = escalationJob.nextEscalationStep;
    if (nextStep !== null) {
      const THIRTY_MINUTES_MS = 30 * 60 * 1000;
      await this.behaviourQueue.add(
        CRITICAL_ESCALATION_JOB,
        { tenant_id, concern_id, escalation_step: nextStep },
        {
          delay: THIRTY_MINUTES_MS,
          jobId: `critical-esc-${concern_id}-step-${nextStep}`,
        },
      );
      this.logger.log(
        `Enqueued next escalation step ${nextStep} for concern ${concern_id} with 30-minute delay`,
      );
    }
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class CriticalEscalationJob extends TenantAwareJob<CriticalEscalationPayload> {
  private readonly logger = new Logger(CriticalEscalationJob.name);

  /**
   * Set by processJob when a subsequent escalation step should be enqueued.
   * The outer processor reads this AFTER execute() commits the transaction,
   * ensuring the re-enqueue happens outside the Prisma transaction boundary.
   */
  public nextEscalationStep: number | null = null;

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
          action_by_id: escalationChain[0] ?? concern.reported_by_id,
        },
      });

      return;
    }

    // 6. Record escalation action
    const targetUserId = escalationChain[escalation_step];
    if (!targetUserId) {
      this.logger.warn(`No target user at escalation step ${escalation_step} — skipping`);
      return;
    }

    await tx.safeguardingAction.create({
      data: {
        tenant_id,
        concern_id,
        action_type: 'note_added',
        description: `Critical escalation step ${escalation_step} — notified user ${targetUserId}`,
        action_by_id: targetUserId,
      },
    });

    // 7. Create multi-channel notifications (in_app + email)
    // Critical escalations are staff-facing — always send both channels
    const now = new Date();
    const notificationPayload: Prisma.InputJsonValue = {
      concern_id,
      escalation_step,
      severity: 'critical',
      concern_type: concern.concern_type,
      reported_at: concern.created_at.toISOString(),
    };

    // in_app — delivered immediately
    await tx.notification.create({
      data: {
        tenant_id,
        recipient_user_id: targetUserId,
        channel: 'in_app',
        template_key: 'safeguarding.critical_escalation',
        locale: 'en',
        status: 'delivered',
        payload_json: notificationPayload,
        source_entity_type: 'safeguarding_concern',
        source_entity_id: concern_id,
        delivered_at: now,
      },
    });

    // email — queued for dispatch
    await tx.notification.create({
      data: {
        tenant_id,
        recipient_user_id: targetUserId,
        channel: 'email',
        template_key: 'safeguarding.critical_escalation',
        locale: 'en',
        status: 'queued',
        payload_json: notificationPayload,
        source_entity_type: 'safeguarding_concern',
        source_entity_id: concern_id,
      },
    });

    this.logger.log(
      `Critical escalation step ${escalation_step} recorded for concern ${concern_id} — notified user ${targetUserId} (in_app + email)`,
    );

    // 8. Signal next step for re-enqueue (if chain continues)
    const nextStep = escalation_step + 1;
    if (nextStep < escalationChain.length) {
      this.nextEscalationStep = nextStep;
    }
  }
}
