const mockExistsSync = jest.fn();

jest.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
}));

import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  ATTACHMENT_SCAN_JOB,
  AttachmentScanProcessor,
  type AttachmentScanPayload,
} from './attachment-scan.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ATTACHMENT_ID = '22222222-2222-2222-2222-222222222222';

function buildJob(
  name: string,
  data: Partial<AttachmentScanPayload> = {},
): Job<AttachmentScanPayload> {
  return {
    data: {
      attachment_id: ATTACHMENT_ID,
      file_key: 'behaviour/attachment.pdf',
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<AttachmentScanPayload>;
}

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    behaviourAttachment: {
      findFirst: jest.fn().mockResolvedValue({
        id: ATTACHMENT_ID,
        scan_status: 'pending_scan',
      }),
      update: jest.fn().mockResolvedValue({ id: ATTACHMENT_ID }),
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

describe('AttachmentScanProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const tx = buildMockTx();
    const processor = new AttachmentScanProcessor(buildMockPrisma(tx));

    await processor.process(buildJob('behaviour:other-job'));

    expect(tx.behaviourAttachment.findFirst).not.toHaveBeenCalled();
  });

  it('should mark pending attachments as clean when ClamAV is unavailable', async () => {
    const tx = buildMockTx();
    const processor = new AttachmentScanProcessor(buildMockPrisma(tx));
    mockExistsSync.mockReturnValue(false);

    await processor.process(buildJob(ATTACHMENT_SCAN_JOB));

    expect(tx.behaviourAttachment.update).toHaveBeenCalledWith({
      data: {
        scan_status: 'clean',
        scanned_at: expect.any(Date),
      },
      where: { id: ATTACHMENT_ID },
    });
  });

  it('should skip attachments that are no longer pending scan', async () => {
    const tx = buildMockTx();
    tx.behaviourAttachment.findFirst.mockResolvedValue({
      id: ATTACHMENT_ID,
      scan_status: 'clean',
    });
    const processor = new AttachmentScanProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(ATTACHMENT_SCAN_JOB));

    expect(tx.behaviourAttachment.update).not.toHaveBeenCalled();
  });
});
