import type { Job } from 'bullmq';

import { DOCUMENT_READY_JOB, DocumentReadyProcessor } from './document-ready.processor';
import type { DocumentReadyPayload } from './document-ready.processor';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const DOCUMENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER_ID = 'uuuuuuuu-uuuu-uuuu-uuuu-uuuuuuuuuuuu';

// ─── Mock Prisma ────────────────────────────────────────────────────────────

const mockTx = {
  behaviourDocument: {
    findFirst: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  notification: {
    create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
  },
  $executeRaw: jest.fn().mockResolvedValue(0),
};

const mockPrisma = {
  $transaction: jest.fn(async (fn: (tx: typeof mockTx) => Promise<void>) => {
    await fn(mockTx);
  }),
};

function buildJob(
  name: string,
  data: Partial<DocumentReadyPayload> = {},
): Job<DocumentReadyPayload> {
  return {
    name,
    data: {
      tenant_id: TENANT_ID,
      document_id: DOCUMENT_ID,
      output_key: `${TENANT_ID}/behaviour/documents/sanction_letter/${DOCUMENT_ID}.pdf`,
      pdf_size_bytes: 12345,
      sha256_hash: 'abc123',
      generated_by_id: USER_ID,
      ...data,
    },
  } as Job<DocumentReadyPayload>;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DocumentReadyProcessor', () => {
  let processor: DocumentReadyProcessor;

  beforeEach(() => {
    processor = new DocumentReadyProcessor(mockPrisma as never);
  });

  afterEach(() => jest.clearAllMocks());

  it('should skip jobs with non-matching name', async () => {
    await processor.process(buildJob('some:other-job'));

    expect(mockTx.behaviourDocument.findFirst).not.toHaveBeenCalled();
  });

  it('should update document from generating to draft_doc and create notification', async () => {
    mockTx.behaviourDocument.findFirst.mockResolvedValue({
      id: DOCUMENT_ID,
      status: 'generating',
      document_type: 'sanction_letter',
    });

    await processor.process(buildJob(DOCUMENT_READY_JOB));

    expect(mockTx.behaviourDocument.update).toHaveBeenCalledWith({
      where: { id: DOCUMENT_ID },
      data: {
        status: 'draft_doc',
        file_key: expect.stringContaining(DOCUMENT_ID),
        file_size_bytes: BigInt(12345),
        sha256_hash: 'abc123',
      },
    });

    expect(mockTx.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenant_id: TENANT_ID,
        recipient_user_id: USER_ID,
        channel: 'in_app',
        template_key: 'behaviour_document_review',
        status: 'delivered',
      }),
    });
  });

  it('should skip when document is not found', async () => {
    mockTx.behaviourDocument.findFirst.mockResolvedValue(null);

    await processor.process(buildJob(DOCUMENT_READY_JOB));

    expect(mockTx.behaviourDocument.update).not.toHaveBeenCalled();
    expect(mockTx.notification.create).not.toHaveBeenCalled();
  });

  it('should skip when document status is not generating', async () => {
    mockTx.behaviourDocument.findFirst.mockResolvedValue({
      id: DOCUMENT_ID,
      status: 'draft_doc',
      document_type: 'sanction_letter',
    });

    await processor.process(buildJob(DOCUMENT_READY_JOB));

    expect(mockTx.behaviourDocument.update).not.toHaveBeenCalled();
    expect(mockTx.notification.create).not.toHaveBeenCalled();
  });
});
