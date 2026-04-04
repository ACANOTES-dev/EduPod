/* eslint-disable import/order -- jest.mock must precede mocked imports */

jest.mock('../../base/s3.helpers', () => ({
  downloadBufferFromS3: jest.fn(),
}));

import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { downloadBufferFromS3 } from '../../base/s3.helpers';
import type { ClamScanResult, ClamavScannerService } from '../../services/clamav-scanner.service';

import {
  ATTACHMENT_SCAN_JOB,
  AttachmentScanProcessor,
  type AttachmentScanPayload,
} from './attachment-scan.processor';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ATTACHMENT_ID = '22222222-2222-2222-2222-222222222222';
const FILE_KEY = 'behaviour/attachment.pdf';
const FILE_BUFFER = Buffer.from('fake-file-content');

// ─── Mock factories ─────────────────────────────────────────────────────────

function buildJob(
  name: string,
  data: Partial<AttachmentScanPayload> = {},
): Job<AttachmentScanPayload> {
  return {
    data: {
      attachment_id: ATTACHMENT_ID,
      file_key: FILE_KEY,
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

function buildMockClamavScanner(
  overrides: Partial<ClamavScannerService> = {},
): ClamavScannerService {
  return {
    isAvailable: jest.fn().mockReturnValue(true),
    scanBuffer: jest
      .fn()
      .mockResolvedValue({ clean: true, virus_name: null, error: null } as ClamScanResult),
    ...overrides,
  } as unknown as ClamavScannerService;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AttachmentScanProcessor', () => {
  const mockDownloadBufferFromS3 = jest.mocked(downloadBufferFromS3);

  beforeEach(() => {
    mockDownloadBufferFromS3.mockResolvedValue(FILE_BUFFER);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Job routing ────────────────────────────────────────────────────────

  it('should ignore jobs with a different name', async () => {
    const tx = buildMockTx();
    const scanner = buildMockClamavScanner();
    const processor = new AttachmentScanProcessor(buildMockPrisma(tx), scanner);

    await processor.process(buildJob('behaviour:other-job'));

    expect(tx.behaviourAttachment.findFirst).not.toHaveBeenCalled();
  });

  // ─── ClamAV unavailable — development fallback ─────────────────────────

  it('should mark pending attachments as clean when ClamAV is unavailable', async () => {
    const tx = buildMockTx();
    const scanner = buildMockClamavScanner({
      isAvailable: jest.fn().mockReturnValue(false),
    });
    const processor = new AttachmentScanProcessor(buildMockPrisma(tx), scanner);

    await processor.process(buildJob(ATTACHMENT_SCAN_JOB));

    expect(tx.behaviourAttachment.update).toHaveBeenCalledWith({
      data: {
        scan_status: 'clean',
        scanned_at: expect.any(Date),
      },
      where: { id: ATTACHMENT_ID },
    });
    // Should NOT download from S3 when ClamAV is unavailable
    expect(mockDownloadBufferFromS3).not.toHaveBeenCalled();
  });

  // ─── Idempotency ───────────────────────────────────────────────────────

  it('should skip attachments that are no longer pending scan', async () => {
    const tx = buildMockTx();
    tx.behaviourAttachment.findFirst.mockResolvedValue({
      id: ATTACHMENT_ID,
      scan_status: 'clean',
    });
    const scanner = buildMockClamavScanner();
    const processor = new AttachmentScanProcessor(buildMockPrisma(tx), scanner);

    await processor.process(buildJob(ATTACHMENT_SCAN_JOB));

    expect(tx.behaviourAttachment.update).not.toHaveBeenCalled();
    expect(mockDownloadBufferFromS3).not.toHaveBeenCalled();
  });

  it('should skip when attachment not found', async () => {
    const tx = buildMockTx();
    tx.behaviourAttachment.findFirst.mockResolvedValue(null);
    const scanner = buildMockClamavScanner();
    const processor = new AttachmentScanProcessor(buildMockPrisma(tx), scanner);

    await processor.process(buildJob(ATTACHMENT_SCAN_JOB));

    expect(tx.behaviourAttachment.update).not.toHaveBeenCalled();
  });

  // ─── Clean scan ─────────────────────────────────────────────────────────

  it('should mark attachment as clean when ClamAV returns clean result', async () => {
    const tx = buildMockTx();
    const scanner = buildMockClamavScanner({
      scanBuffer: jest.fn().mockResolvedValue({
        clean: true,
        virus_name: null,
        error: null,
      } as ClamScanResult),
    });
    const processor = new AttachmentScanProcessor(buildMockPrisma(tx), scanner);

    await processor.process(buildJob(ATTACHMENT_SCAN_JOB));

    expect(mockDownloadBufferFromS3).toHaveBeenCalledWith(FILE_KEY);
    expect(scanner.scanBuffer).toHaveBeenCalledWith(FILE_BUFFER);
    expect(tx.behaviourAttachment.update).toHaveBeenCalledWith({
      data: {
        scan_status: 'clean',
        scanned_at: expect.any(Date),
      },
      where: { id: ATTACHMENT_ID },
    });
  });

  // ─── Malware detected ──────────────────────────────────────────────────

  it('should mark attachment as infected when ClamAV detects malware', async () => {
    const tx = buildMockTx();
    const scanner = buildMockClamavScanner({
      scanBuffer: jest.fn().mockResolvedValue({
        clean: false,
        virus_name: 'Eicar-Test',
        error: null,
      } as ClamScanResult),
    });
    const processor = new AttachmentScanProcessor(buildMockPrisma(tx), scanner);

    await processor.process(buildJob(ATTACHMENT_SCAN_JOB));

    expect(mockDownloadBufferFromS3).toHaveBeenCalledWith(FILE_KEY);
    expect(tx.behaviourAttachment.update).toHaveBeenCalledWith({
      data: {
        scan_status: 'infected',
        scanned_at: expect.any(Date),
      },
      where: { id: ATTACHMENT_ID },
    });
  });

  // ─── Scanner error ─────────────────────────────────────────────────────

  it('should mark attachment as scan_failed when ClamAV returns an error', async () => {
    const tx = buildMockTx();
    const scanner = buildMockClamavScanner({
      scanBuffer: jest.fn().mockResolvedValue({
        clean: false,
        virus_name: null,
        error: 'Socket error: Connection refused',
      } as ClamScanResult),
    });
    const processor = new AttachmentScanProcessor(buildMockPrisma(tx), scanner);

    await processor.process(buildJob(ATTACHMENT_SCAN_JOB));

    expect(tx.behaviourAttachment.update).toHaveBeenCalledWith({
      data: {
        scan_status: 'scan_failed',
        scanned_at: expect.any(Date),
      },
      where: { id: ATTACHMENT_ID },
    });
  });

  // ─── S3 download failure ───────────────────────────────────────────────

  it('should mark attachment as scan_failed when S3 download fails', async () => {
    const tx = buildMockTx();
    mockDownloadBufferFromS3.mockRejectedValue(new Error('NoSuchKey'));
    const scanner = buildMockClamavScanner();
    const processor = new AttachmentScanProcessor(buildMockPrisma(tx), scanner);

    await processor.process(buildJob(ATTACHMENT_SCAN_JOB));

    expect(scanner.scanBuffer).not.toHaveBeenCalled();
    expect(tx.behaviourAttachment.update).toHaveBeenCalledWith({
      data: {
        scan_status: 'scan_failed',
        scanned_at: expect.any(Date),
      },
      where: { id: ATTACHMENT_ID },
    });
  });
});
