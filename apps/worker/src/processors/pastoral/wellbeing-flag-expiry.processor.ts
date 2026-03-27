import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import {
  SYSTEM_USER_SENTINEL,
  TenantAwareJob,
  TenantJobPayload,
} from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export type WellbeingFlagExpiryPayload = TenantJobPayload;

// ─── Job name ─────────────────────────────────────────────────────────────────

export const WELLBEING_FLAG_EXPIRY_JOB = 'pastoral:wellbeing-flag-expiry';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.PASTORAL)
export class WellbeingFlagExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(WellbeingFlagExpiryProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
  ) {
    super();
  }

  async process(job: Job<WellbeingFlagExpiryPayload>): Promise<void> {
    if (job.name !== WELLBEING_FLAG_EXPIRY_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${WELLBEING_FLAG_EXPIRY_JOB} — tenant ${tenant_id}`,
    );

    const tenantJob = new WellbeingFlagExpiryTenantJob(this.prisma);
    await tenantJob.execute(job.data);

    this.logger.log(
      `Completed ${WELLBEING_FLAG_EXPIRY_JOB} — tenant ${tenant_id}: ` +
        `${tenantJob.expiredCount} wellbeing flag(s) expired`,
    );
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class WellbeingFlagExpiryTenantJob extends TenantAwareJob<WellbeingFlagExpiryPayload> {
  private readonly logger = new Logger(WellbeingFlagExpiryTenantJob.name);

  /** Count of flags expired (read after execute). */
  public expiredCount = 0;

  protected async processJob(
    data: WellbeingFlagExpiryPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id } = data;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // 1. Find all affected persons with active wellbeing flags that have expired
    const expiredFlags = await tx.criticalIncidentAffected.findMany({
      where: {
        tenant_id,
        wellbeing_flag_active: true,
        wellbeing_flag_expires_at: { lte: today },
      },
      select: {
        id: true,
        student_id: true,
        incident_id: true,
      },
    });

    if (expiredFlags.length === 0) {
      this.logger.log(
        `No expired wellbeing flags found for tenant ${tenant_id}`,
      );
      return;
    }

    // 2. Deactivate each expired flag and record audit event
    for (const flag of expiredFlags) {
      // Set wellbeing_flag_active = false
      await tx.criticalIncidentAffected.update({
        where: { id: flag.id },
        data: { wellbeing_flag_active: false },
      });

      // Record wellbeing_flag_expired pastoral event
      if (flag.student_id) {
        await tx.pastoralEvent.create({
          data: {
            tenant_id,
            event_type: 'wellbeing_flag_expired',
            entity_type: 'critical_incident',
            entity_id: flag.incident_id,
            student_id: flag.student_id,
            actor_user_id: SYSTEM_USER_SENTINEL,
            tier: 1,
            payload: {
              affected_person_id: flag.id,
              incident_id: flag.incident_id,
              expired_at: today.toISOString().slice(0, 10),
            } satisfies Prisma.InputJsonValue as Prisma.InputJsonValue,
          },
        });
      }
    }

    this.expiredCount = expiredFlags.length;

    this.logger.log(
      `Expired ${expiredFlags.length} wellbeing flag(s) for tenant ${tenant_id}`,
    );
  }
}
