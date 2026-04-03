import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { $Enums, Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import {
  SYSTEM_USER_SENTINEL,
  TenantAwareJob,
  TenantJobPayload,
} from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface SyncBehaviourSafeguardingPayload extends TenantJobPayload {
  safeguarding_concern_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const SYNC_BEHAVIOUR_SAFEGUARDING_JOB = 'pastoral:sync-behaviour-safeguarding';

// ─── Severity mapping: behaviour safeguarding (Prisma enum) -> pastoral ──────

const SEVERITY_MAP: Record<string, $Enums.PastoralConcernSeverity> = {
  // Prisma SafeguardingSeverity enum values (mapped from DB via @map)
  low_sev: 'routine',
  medium_sev: 'elevated',
  high_sev: 'urgent',
  critical_sev: 'critical',
  // Raw DB values (in case Prisma returns the @map'd value)
  low: 'routine',
  medium: 'elevated',
  high: 'urgent',
  critical: 'critical',
};

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.PASTORAL, {
  lockDuration: 30_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class SyncBehaviourSafeguardingProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncBehaviourSafeguardingProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<SyncBehaviourSafeguardingPayload>): Promise<void> {
    if (job.name !== SYNC_BEHAVIOUR_SAFEGUARDING_JOB) {
      return;
    }

    const { tenant_id, safeguarding_concern_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${SYNC_BEHAVIOUR_SAFEGUARDING_JOB} — safeguarding concern ${safeguarding_concern_id}`,
    );

    const tenantJob = new SyncBehaviourSafeguardingTenantJob(this.prisma);
    await tenantJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class SyncBehaviourSafeguardingTenantJob extends TenantAwareJob<SyncBehaviourSafeguardingPayload> {
  private readonly logger = new Logger(SyncBehaviourSafeguardingTenantJob.name);

  protected async processJob(
    data: SyncBehaviourSafeguardingPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id, safeguarding_concern_id } = data;

    // 1. Load the behaviour safeguarding concern
    const concern = await tx.safeguardingConcern.findFirst({
      where: { id: safeguarding_concern_id, tenant_id },
      select: {
        id: true,
        tenant_id: true,
        student_id: true,
        reported_by_id: true,
        severity: true,
        description: true,
        immediate_actions_taken: true,
        pastoral_concern_id: true,
        concern_incidents: {
          select: { incident_id: true },
          take: 1,
        },
      },
    });

    if (!concern) {
      this.logger.warn(
        `Safeguarding concern ${safeguarding_concern_id} not found for tenant ${tenant_id} — skipping`,
      );
      return;
    }

    // 2. If already synced (pastoral_concern_id is set), skip
    if (concern.pastoral_concern_id) {
      this.logger.log(
        `Safeguarding concern ${safeguarding_concern_id} already synced to pastoral concern ${concern.pastoral_concern_id} — skipping`,
      );
      return;
    }

    // 3. Map behaviour severity to pastoral severity
    const pastoralSeverity: $Enums.PastoralConcernSeverity =
      SEVERITY_MAP[concern.severity] ?? 'routine';

    // 4. Determine behaviour_incident_id if linked
    const firstIncident = concern.concern_incidents[0];
    const behaviourIncidentId = firstIncident?.incident_id ?? null;

    // 5. Create pastoral_concern
    const pastoralConcern = await tx.pastoralConcern.create({
      data: {
        tenant_id,
        student_id: concern.student_id,
        logged_by_user_id: concern.reported_by_id,
        category: 'child_protection',
        severity: pastoralSeverity,
        tier: 3,
        occurred_at: new Date(),
        actions_taken: concern.immediate_actions_taken,
        behaviour_incident_id: behaviourIncidentId,
      },
    });

    // 6. Create pastoral_concern_version (version 1)
    await tx.pastoralConcernVersion.create({
      data: {
        tenant_id,
        concern_id: pastoralConcern.id,
        version_number: 1,
        narrative: concern.description,
        amended_by_user_id: concern.reported_by_id,
        amendment_reason: 'Initial creation via behaviour safeguarding sync',
      },
    });

    // 7. Create cp_record linked to the pastoral concern
    await tx.cpRecord.create({
      data: {
        tenant_id,
        student_id: concern.student_id,
        concern_id: pastoralConcern.id,
        record_type: 'concern',
        logged_by_user_id: concern.reported_by_id,
        narrative: concern.description,
      },
    });

    // 8. Store pastoral_concern_id back on the safeguarding concern
    await tx.safeguardingConcern.update({
      where: { id: safeguarding_concern_id },
      data: { pastoral_concern_id: pastoralConcern.id },
    });

    // 9. Write concern_created pastoral event with behaviour source
    await tx.pastoralEvent.create({
      data: {
        tenant_id,
        event_type: 'concern_created',
        entity_type: 'concern',
        entity_id: pastoralConcern.id,
        student_id: concern.student_id,
        actor_user_id: SYSTEM_USER_SENTINEL,
        tier: 3,
        payload: {
          source: 'behaviour_safeguarding',
          behaviour_incident_id: behaviourIncidentId,
          safeguarding_concern_id,
        } satisfies Prisma.InputJsonValue as Prisma.InputJsonValue,
      },
    });

    // 10. Write sync_completed audit event
    await tx.pastoralEvent.create({
      data: {
        tenant_id,
        event_type: 'sync_completed',
        entity_type: 'concern',
        entity_id: pastoralConcern.id,
        student_id: concern.student_id,
        actor_user_id: SYSTEM_USER_SENTINEL,
        tier: 3,
        payload: {
          safeguarding_concern_id,
          pastoral_concern_id: pastoralConcern.id,
          source: 'behaviour_safeguarding_retry',
        } satisfies Prisma.InputJsonValue as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `Synced safeguarding concern ${safeguarding_concern_id} -> pastoral concern ${pastoralConcern.id}`,
    );
  }
}
