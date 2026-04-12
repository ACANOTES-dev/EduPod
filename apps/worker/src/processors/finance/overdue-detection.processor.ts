import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

/**
 * Payload accepted by the processor at the queue boundary. `tenant_id` is
 * optional because the cron-mode run omits it — the processor iterates all
 * active tenants internally in that case. Inside the TenantAwareJob subclass
 * `tenant_id` is always present (`ScopedOverdueDetectionPayload`).
 */
export interface OverdueDetectionPayload {
  tenant_id?: string;
  as_of_date?: string;
}

interface ScopedOverdueDetectionPayload extends TenantJobPayload {
  as_of_date?: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const OVERDUE_DETECTION_JOB = 'finance:overdue-detection';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.FINANCE, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class OverdueDetectionProcessor extends WorkerHost {
  private readonly logger = new Logger(OverdueDetectionProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<OverdueDetectionPayload>): Promise<void> {
    if (job.name !== OVERDUE_DETECTION_JOB) {
      return;
    }

    const { tenant_id, as_of_date } = job.data;

    // Cron-mode: no tenant_id → iterate all active tenants. Per-tenant errors
    // must not abort the whole run (spec §4.19).
    if (!tenant_id) {
      const tenants = await this.prisma.tenant.findMany({
        where: { status: 'active' },
        select: { id: true },
      });
      this.logger.log(
        `Processing ${OVERDUE_DETECTION_JOB} — cross-tenant run across ${tenants.length} active tenants`,
      );
      const overdueJob = new OverdueDetectionJob(this.prisma);
      for (const { id } of tenants) {
        try {
          await overdueJob.execute({ tenant_id: id, as_of_date });
        } catch (err) {
          this.logger.error(`${OVERDUE_DETECTION_JOB} failed for tenant ${id}: ${String(err)}`);
        }
      }
      return;
    }

    this.logger.log(`Processing ${OVERDUE_DETECTION_JOB} — tenant ${tenant_id}`);

    const overdueJob = new OverdueDetectionJob(this.prisma);
    await overdueJob.execute({ tenant_id, as_of_date });
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class OverdueDetectionJob extends TenantAwareJob<ScopedOverdueDetectionPayload> {
  private readonly logger = new Logger(OverdueDetectionJob.name);

  protected async processJob(data: ScopedOverdueDetectionPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, as_of_date } = data;
    const cutoffDate = as_of_date ? new Date(as_of_date) : new Date();

    // 1. Find invoices that are past due but not yet marked overdue
    const overdueInvoices = await tx.invoice.findMany({
      where: {
        tenant_id,
        status: { in: ['issued', 'partially_paid'] },
        due_date: { lt: cutoffDate },
        last_overdue_notified_at: null,
      },
      select: {
        id: true,
        invoice_number: true,
        status: true,
      },
    });

    this.logger.log(`Found ${overdueInvoices.length} overdue invoices for tenant ${tenant_id}`);

    // 2. Update each invoice to overdue status
    for (const invoice of overdueInvoices) {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'overdue',
          last_overdue_notified_at: new Date(),
        },
      });

      this.logger.log(
        `Marked invoice ${invoice.invoice_number} as overdue (was ${invoice.status})`,
      );
    }

    // 3. Update installments past due_date to overdue
    const overdueInstallments = await tx.installment.updateMany({
      where: {
        tenant_id,
        status: 'pending',
        due_date: { lt: cutoffDate },
      },
      data: {
        status: 'overdue',
      },
    });

    this.logger.log(
      `Marked ${overdueInstallments.count} installments as overdue for tenant ${tenant_id}`,
    );
  }
}
