import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';

import { PDF_RENDER_JOB, PdfJobService } from './pdf-job.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

// ─── Mock queue ──────────────────────────────────────────────────────────────

const mockQueue: { add: jest.Mock } = {
  add: jest.fn(),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PdfJobService', () => {
  let service: PdfJobService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PdfJobService, { provide: getQueueToken('pdf-rendering'), useValue: mockQueue }],
    }).compile();

    service = module.get(PdfJobService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── enqueueRender ─────────────────────────────────────────────────────────

  describe('PdfJobService — enqueueRender', () => {
    it('should enqueue a pdf:render job with correct payload', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-123' });

      const result = await service.enqueueRender(TENANT_ID, {
        template_html: '<html><body>Test</body></html>',
        output_key: 'pdfs/test-output.pdf',
      });

      expect(result).toEqual({ job_id: 'job-123' });
      expect(mockQueue.add).toHaveBeenCalledWith(
        PDF_RENDER_JOB,
        {
          tenant_id: TENANT_ID,
          template_html: '<html><body>Test</body></html>',
          output_key: 'pdfs/test-output.pdf',
        },
        expect.objectContaining({
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
        }),
      );
    });

    it('should include callback fields when provided', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-456' });

      await service.enqueueRender(TENANT_ID, {
        template_html: '<html>report</html>',
        output_key: 'pdfs/report.pdf',
        callback_job_name: 'notifications:dispatch',
        callback_queue_name: 'notifications',
        callback_payload: { report_id: 'abc' },
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        PDF_RENDER_JOB,
        expect.objectContaining({
          tenant_id: TENANT_ID,
          callback_job_name: 'notifications:dispatch',
          callback_queue_name: 'notifications',
          callback_payload: { report_id: 'abc' },
        }),
        expect.anything(),
      );
    });

    it('should return empty string job_id when queue returns undefined id', async () => {
      mockQueue.add.mockResolvedValue({ id: undefined });

      const result = await service.enqueueRender(TENANT_ID, {
        template_html: '<html>test</html>',
        output_key: 'pdfs/fallback.pdf',
      });

      expect(result).toEqual({ job_id: '' });
    });
  });
});
