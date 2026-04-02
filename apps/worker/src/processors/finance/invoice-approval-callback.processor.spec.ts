import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  INVOICE_APPROVAL_CALLBACK_JOB,
  InvoiceApprovalCallbackProcessor,
  type InvoiceApprovalCallbackPayload,
} from './invoice-approval-callback.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const APPROVAL_REQUEST_ID = '22222222-2222-2222-2222-222222222222';
const INVOICE_ID = '33333333-3333-3333-3333-333333333333';

function buildJob(
  name: string,
  data: Partial<InvoiceApprovalCallbackPayload> = {},
): Job<InvoiceApprovalCallbackPayload> {
  return {
    data: {
      approval_request_id: APPROVAL_REQUEST_ID,
      approver_user_id: '44444444-4444-4444-4444-444444444444',
      target_entity_id: INVOICE_ID,
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<InvoiceApprovalCallbackPayload>;
}

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    approvalRequest: {
      update: jest.fn().mockResolvedValue({ id: APPROVAL_REQUEST_ID }),
    },
    invoice: {
      findFirst: jest.fn().mockResolvedValue({
        id: INVOICE_ID,
        invoice_number: 'INV-001',
        status: 'pending_approval',
      }),
      update: jest.fn().mockResolvedValue({ id: INVOICE_ID }),
    },
  };
}

function buildMockPrisma(tx: ReturnType<typeof buildMockTx>) {
  return {
    $transaction: jest.fn(async (callback: (transactionClient: typeof tx) => Promise<void>) =>
      callback(tx),
    ),
  } as unknown as PrismaClient;
}

describe('InvoiceApprovalCallbackProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const tx = buildMockTx();
    const processor = new InvoiceApprovalCallbackProcessor(buildMockPrisma(tx));

    await processor.process(buildJob('finance:other-job'));

    expect(tx.invoice.findFirst).not.toHaveBeenCalled();
  });

  it('should issue pending invoices and mark the approval callback executed', async () => {
    const tx = buildMockTx();
    const processor = new InvoiceApprovalCallbackProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(INVOICE_APPROVAL_CALLBACK_JOB));

    expect(tx.invoice.update).toHaveBeenCalledWith({
      data: {
        issue_date: expect.any(Date),
        status: 'issued',
      },
      where: { id: INVOICE_ID },
    });
    expect(tx.approvalRequest.update).toHaveBeenCalledWith({
      data: {
        callback_error: null,
        callback_status: 'executed',
        executed_at: expect.any(Date),
        status: 'executed',
      },
      where: { id: APPROVAL_REQUEST_ID },
    });
  });

  it('should self-heal when invoice is already issued', async () => {
    const tx = buildMockTx();
    tx.invoice.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      invoice_number: 'INV-001',
      status: 'issued',
    });
    const processor = new InvoiceApprovalCallbackProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(INVOICE_APPROVAL_CALLBACK_JOB));

    expect(tx.invoice.update).not.toHaveBeenCalled();
    expect(tx.approvalRequest.update).toHaveBeenCalledWith({
      where: { id: APPROVAL_REQUEST_ID },
      data: {
        status: 'executed',
        executed_at: expect.any(Date),
        callback_status: 'already_completed',
        callback_error: 'Self-healed: invoice was in status "issued"',
      },
    });
  });

  it('should mark unexpected state when invoice is in draft', async () => {
    const tx = buildMockTx();
    tx.invoice.findFirst.mockResolvedValue({
      id: INVOICE_ID,
      invoice_number: 'INV-001',
      status: 'draft',
    });
    const processor = new InvoiceApprovalCallbackProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(INVOICE_APPROVAL_CALLBACK_JOB));

    expect(tx.invoice.update).not.toHaveBeenCalled();
    expect(tx.approvalRequest.update).toHaveBeenCalledWith({
      where: { id: APPROVAL_REQUEST_ID },
      data: {
        callback_status: 'skipped_unexpected_state',
        callback_error: 'Self-healed: invoice was in status "draft"',
      },
    });
  });
});
