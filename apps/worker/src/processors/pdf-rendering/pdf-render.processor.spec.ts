/* eslint-disable import/order -- jest.mock must precede mocked imports */
import type { Job } from 'bullmq';

// Mock puppeteer before importing processor
const mockPdf = jest.fn().mockResolvedValue(Buffer.from('pdf-bytes'));
const mockClose = jest.fn().mockResolvedValue(undefined);
const mockSetContent = jest.fn().mockResolvedValue(undefined);
const mockNewPage = jest.fn().mockResolvedValue({
  setContent: mockSetContent,
  pdf: mockPdf,
  close: mockClose,
});

jest.mock('puppeteer', () => ({
  __esModule: true,
  default: {
    launch: jest.fn().mockResolvedValue({
      newPage: mockNewPage,
      close: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

// Mock S3 helpers
jest.mock('../../base/s3.helpers', () => ({
  createS3Client: jest.fn().mockReturnValue({
    send: jest.fn().mockResolvedValue({}),
  }),
  getS3Bucket: jest.fn().mockReturnValue('test-bucket'),
}));

// Mock @aws-sdk/client-s3
jest.mock('@aws-sdk/client-s3', () => ({
  PutObjectCommand: jest.fn().mockImplementation((params: Record<string, unknown>) => params),
  S3Client: jest.fn(),
}));

import type { PdfRenderJobPayload } from './pdf-render.processor';
import { PDF_RENDER_JOB, PdfRenderProcessor } from './pdf-render.processor';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

const mockTx = {
  $executeRaw: jest.fn().mockResolvedValue(0),
};

const mockPrisma = {
  $transaction: jest.fn().mockImplementation(async (fn: (tx: typeof mockTx) => Promise<void>) => {
    await fn(mockTx);
  }),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PdfRenderProcessor', () => {
  let processor: PdfRenderProcessor;

  beforeEach(() => {
    processor = new PdfRenderProcessor(mockPrisma as never);
  });

  afterEach(() => jest.clearAllMocks());

  it('should skip jobs with non-matching name', async () => {
    const job = {
      name: 'other:job',
      data: { tenant_id: TENANT_ID },
    } as Job<PdfRenderJobPayload>;

    await processor.process(job);

    expect(mockNewPage).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const job = {
      name: PDF_RENDER_JOB,
      data: { tenant_id: '', template_html: '<html></html>', output_key: 'test.pdf' },
    } as Job<PdfRenderJobPayload>;

    await expect(processor.process(job)).rejects.toThrow('missing tenant_id');
  });

  it('should render PDF and upload to S3', async () => {
    const job = {
      name: PDF_RENDER_JOB,
      data: {
        tenant_id: TENANT_ID,
        template_html: '<html><body>Test Report</body></html>',
        output_key: 'pdfs/tenant-1/report.pdf',
      },
    } as Job<PdfRenderJobPayload>;

    await processor.process(job);

    expect(mockNewPage).toHaveBeenCalled();
    expect(mockSetContent).toHaveBeenCalledWith(
      '<html><body>Test Report</body></html>',
      expect.objectContaining({ waitUntil: 'networkidle0' }),
    );
    expect(mockPdf).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'A4', printBackground: true }),
    );
    expect(mockClose).toHaveBeenCalled();
  });
});
