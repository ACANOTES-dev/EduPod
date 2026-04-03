import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Job Name ─────────────────────────────────────────────────────────────────

export const GENERATE_EVENT_INVOICES_JOB = 'engagement:generate-event-invoices';

// ─── Payload ──────────────────────────────────────────────────────────────────

export interface GenerateEventInvoicesPayload extends TenantJobPayload {
  event_id: string;
}

// ─── Processor ────────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.ENGAGEMENT, {
  lockDuration: 30_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class GenerateEventInvoicesProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerateEventInvoicesProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<GenerateEventInvoicesPayload>): Promise<void> {
    if (job.name !== GENERATE_EVENT_INVOICES_JOB) return;

    const { tenant_id } = job.data;
    if (!tenant_id) throw new Error('Job rejected: missing tenant_id');

    this.logger.log(
      `Processing ${GENERATE_EVENT_INVOICES_JOB} — tenant=${tenant_id}, event=${job.data.event_id}`,
    );

    const invoiceJob = new GenerateEventInvoicesJob(this.prisma);
    await invoiceJob.execute(job.data);
  }
}

// ─── TenantAwareJob Implementation ───────────────────────────────────────────

class GenerateEventInvoicesJob extends TenantAwareJob<GenerateEventInvoicesPayload> {
  private readonly logger = new Logger(GenerateEventInvoicesJob.name);

  protected async processJob(data: GenerateEventInvoicesPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, event_id } = data;

    // ─── 1. Fetch event with participants ───────────────────────────────────────

    const event = await tx.engagementEvent.findFirst({
      where: { tenant_id, id: event_id },
      select: {
        id: true,
        title: true,
        fee_amount: true,
        fee_description: true,
        payment_deadline: true,
        created_by_user_id: true,
        participants: {
          where: { payment_status: 'not_required' },
          select: {
            id: true,
            student_id: true,
            student: {
              select: { id: true, household_id: true },
            },
          },
        },
      },
    });

    if (!event) {
      throw new Error(`Event "${event_id}" not found for tenant ${tenant_id}`);
    }

    if (!event.fee_amount || event.fee_amount.toNumber() <= 0) {
      this.logger.log(`Event ${event_id} has no fee — skipping invoice generation`);
      return;
    }

    if (event.participants.length === 0) {
      this.logger.log(`Event ${event_id} has no participants requiring invoices — skipping`);
      return;
    }

    // ─── 2. Resolve tenant currency ─────────────────────────────────────────────

    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: tenant_id },
      select: { currency_code: true },
    });

    // ─── 3. Generate invoices per participant ───────────────────────────────────

    const feeAmount = event.fee_amount;
    const description = event.fee_description ?? event.title;
    const dueDate = event.payment_deadline
      ? new Date(event.payment_deadline)
      : new Date(Date.now() + 30 * 86_400_000);
    let invoiceCount = 0;

    for (const participant of event.participants) {
      const { student } = participant;

      if (!student.household_id) {
        this.logger.warn(
          `Student ${student.id} has no household — skipping invoice for event ${event_id}`,
        );
        continue;
      }

      // ─── Generate sequence number ─────────────────────────────────────────────

      const invoiceNumber = await this.generateInvoiceNumber(tx, tenant_id);

      // ─── Create invoice with line item ────────────────────────────────────────

      const invoice = await tx.invoice.create({
        data: {
          tenant_id,
          household_id: student.household_id,
          invoice_number: invoiceNumber,
          status: 'issued',
          issue_date: new Date(),
          due_date: dueDate,
          subtotal_amount: feeAmount,
          discount_amount: 0,
          total_amount: feeAmount,
          balance_amount: feeAmount,
          currency_code: tenant.currency_code,
          created_by_user_id: event.created_by_user_id,
          lines: {
            create: [
              {
                tenant_id,
                description,
                quantity: 1,
                unit_amount: feeAmount,
                line_total: feeAmount,
                student_id: student.id,
              },
            ],
          },
        },
      });

      // ─── Link invoice to participant and update payment status ────────────────

      await tx.engagementEventParticipant.update({
        where: { id: participant.id },
        data: {
          invoice_id: invoice.id,
          payment_status: 'pending',
        },
      });

      invoiceCount++;
    }

    this.logger.log(`Generated ${invoiceCount} invoices for event ${event_id}`);
  }

  // ─── Sequence Number Helper ─────────────────────────────────────────────────

  /**
   * Generates a unique invoice number using tenant_sequences with row-level
   * locking (SELECT ... FOR UPDATE via atomic UPDATE RETURNING).
   * Format: EVI-YYYYMM-00001
   */
  private async generateInvoiceNumber(tx: PrismaClient, tenantId: string): Promise<string> {
    const prefix = 'EVI';
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Attempt atomic increment with RETURNING
    const seqRows = await (tx as unknown as Prisma.TransactionClient).$queryRaw<
      { current_value: bigint }[]
    >`
      UPDATE tenant_sequences
      SET current_value = current_value + 1
      WHERE tenant_id = ${tenantId}::uuid AND sequence_type = ${prefix}
      RETURNING current_value
    `;

    let nextValue: bigint;

    const firstRow = seqRows[0];

    if (!firstRow) {
      // Sequence row does not exist yet — create it
      await tx.tenantSequence.create({
        data: {
          tenant_id: tenantId,
          sequence_type: prefix,
          current_value: 1,
        },
      });
      nextValue = 1n;
    } else {
      nextValue = firstRow.current_value;
    }

    const paddedSeq = String(nextValue).padStart(5, '0');
    return `${prefix}-${yearMonth}-${paddedSeq}`;
  }
}
