import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface InvoiceApprovalCallbackPayload extends TenantJobPayload {
  approval_request_id: string;
  target_entity_id: string; // invoice.id
  approver_user_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const INVOICE_APPROVAL_CALLBACK_JOB = 'finance:on-approval';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.FINANCE)
export class InvoiceApprovalCallbackProcessor extends WorkerHost {
  private readonly logger = new Logger(InvoiceApprovalCallbackProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<InvoiceApprovalCallbackPayload>): Promise<void> {
    if (job.name !== INVOICE_APPROVAL_CALLBACK_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${INVOICE_APPROVAL_CALLBACK_JOB} — tenant ${tenant_id}, invoice ${job.data.target_entity_id}`,
    );

    const callbackJob = new InvoiceApprovalCallbackJob(this.prisma);
    await callbackJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class InvoiceApprovalCallbackJob extends TenantAwareJob<InvoiceApprovalCallbackPayload> {
  private readonly logger = new Logger(InvoiceApprovalCallbackJob.name);

  protected async processJob(
    data: InvoiceApprovalCallbackPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id, approval_request_id, target_entity_id } = data;

    // 1. Fetch the invoice and verify it is pending_approval
    const invoice = await tx.invoice.findFirst({
      where: {
        id: target_entity_id,
        tenant_id,
      },
      select: {
        id: true,
        status: true,
        invoice_number: true,
      },
    });

    if (!invoice) {
      throw new Error(`Invoice ${target_entity_id} not found for tenant ${tenant_id}`);
    }

    if (invoice.status !== 'pending_approval') {
      this.logger.warn(
        `Invoice ${target_entity_id} is in status "${invoice.status}", expected "pending_approval". Skipping.`,
      );
      return;
    }

    // 2. Update invoice: status → issued, set issue_date
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'issued',
        issue_date: new Date(),
      },
    });

    // 3. Update the approval request to executed
    await tx.approvalRequest.update({
      where: { id: approval_request_id },
      data: {
        status: 'executed',
        executed_at: new Date(),
      },
    });

    this.logger.log(
      `Invoice ${invoice.invoice_number} (${target_entity_id}) issued via approval, tenant ${tenant_id}`,
    );
  }
}
