import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export type AdmissionsAutoExpiryPayload = TenantJobPayload;

// ─── Job name ─────────────────────────────────────────────────────────────────

export const ADMISSIONS_AUTO_EXPIRY_JOB = 'admissions:auto-expiry';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.ADMISSIONS)
export class AdmissionsAutoExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(AdmissionsAutoExpiryProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<AdmissionsAutoExpiryPayload>): Promise<void> {
    if (job.name !== ADMISSIONS_AUTO_EXPIRY_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${ADMISSIONS_AUTO_EXPIRY_JOB} — tenant ${tenant_id}`,
    );

    const expiryJob = new AdmissionsAutoExpiryJob(this.prisma);
    await expiryJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class AdmissionsAutoExpiryJob extends TenantAwareJob<AdmissionsAutoExpiryPayload> {
  private readonly logger = new Logger(AdmissionsAutoExpiryJob.name);

  protected async processJob(
    data: AdmissionsAutoExpiryPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const now = new Date();

    // Find all draft applications with expired payment deadline
    const expiredApplications = await tx.application.findMany({
      where: {
        tenant_id: data.tenant_id,
        status: 'draft',
        payment_deadline: { lt: now },
        payment_status: 'pending',
      },
      select: { id: true, application_number: true },
    });

    if (expiredApplications.length === 0) {
      this.logger.log(`No expired applications found for tenant ${data.tenant_id}`);
      return;
    }

    this.logger.log(
      `Found ${expiredApplications.length} expired applications for tenant ${data.tenant_id}`,
    );

    for (const app of expiredApplications) {
      await tx.application.update({
        where: { id: app.id },
        data: {
          status: 'withdrawn',
          reviewed_at: now,
        },
      });

      await tx.applicationNote.create({
        data: {
          tenant_id: data.tenant_id,
          application_id: app.id,
          // System-generated note — use a nil UUID for system author
          author_user_id: '00000000-0000-0000-0000-000000000000',
          note: 'Application expired — payment not received within 14 days. Automatically withdrawn.',
          is_internal: true,
        },
      });

      this.logger.log(`Expired application ${app.application_number} (${app.id})`);
    }
  }
}
