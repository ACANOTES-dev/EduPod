import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface OverdueDetectionPayload extends TenantJobPayload {
  /** Optional: run detection only for a specific date. Defaults to today. */
  as_of_date?: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const OVERDUE_DETECTION_JOB = 'finance:overdue-detection';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.FINANCE)
export class OverdueDetectionProcessor extends WorkerHost {
  private readonly logger = new Logger(OverdueDetectionProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<OverdueDetectionPayload>): Promise<void> {
    if (job.name !== OVERDUE_DETECTION_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${OVERDUE_DETECTION_JOB} — tenant ${tenant_id}`,
    );

    const overdueJob = new OverdueDetectionJob(this.prisma);
    await overdueJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class OverdueDetectionJob extends TenantAwareJob<OverdueDetectionPayload> {
  private readonly logger = new Logger(OverdueDetectionJob.name);

  protected async processJob(
    data: OverdueDetectionPayload,
    tx: PrismaClient,
  ): Promise<void> {
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

    this.logger.log(
      `Found ${overdueInvoices.length} overdue invoices for tenant ${tenant_id}`,
    );

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
