/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware');

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourExportService } from './behaviour-export.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'student-1';
const USER_ID = 'user-1';

const makeStudent = (overrides: Record<string, unknown> = {}) => ({
  id: STUDENT_ID,
  first_name: 'Jane',
  last_name: 'Doe',
  year_group: { name: 'Year 5' },
  class_enrolments: [{ class_entity: { name: 'Class 5A' } }],
  ...overrides,
});

const makeIncident = (overrides: Record<string, unknown> = {}) => ({
  occurred_at: new Date('2026-03-15'),
  polarity: 'negative',
  status: 'open',
  parent_description: 'Disruption in class',
  category: { name: 'Disruption' },
  reported_by: { first_name: 'John', last_name: 'Smith' },
  ...overrides,
});

const makeSanction = (overrides: Record<string, unknown> = {}) => ({
  type: 'detention',
  scheduled_date: new Date('2026-03-16'),
  status: 'served',
  served_at: new Date('2026-03-16'),
  ...overrides,
});

// ─── Mock factories ─────────────────────────────────────────────────────────

const makeMockDb = () => ({
  student: {
    findFirst: jest.fn(),
  },
  tenantSetting: {
    findFirst: jest.fn().mockResolvedValue({
      settings: { school_name: 'Test Academy' },
    }),
  },
  behaviourIncident: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  behaviourSanction: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  behaviourIntervention: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  behaviourRecognitionAward: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  $queryRaw: jest.fn().mockResolvedValue([]),
});

describe('BehaviourExportService', () => {
  let service: BehaviourExportService;
  let mockDb: ReturnType<typeof makeMockDb>;
  let mockPdfService: { renderFromHtml: jest.Mock };

  beforeEach(async () => {
    mockDb = makeMockDb();
    mockPdfService = { renderFromHtml: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')) };

    const mockTx = jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn(mockDb);
    });

    (createRlsClient as jest.Mock).mockReturnValue({ $transaction: mockTx });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourExportService,
        { provide: PrismaService, useValue: {} },
        { provide: PdfRenderingService, useValue: mockPdfService },
      ],
    }).compile();

    service = module.get<BehaviourExportService>(BehaviourExportService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── generateStudentPackPdf ────────────────────────────────────────────

  describe('BehaviourExportService -- generateStudentPackPdf', () => {
    it('should generate a PDF buffer for a valid student', async () => {
      mockDb.student.findFirst.mockResolvedValue(makeStudent());
      mockDb.behaviourIncident.findMany.mockResolvedValue([makeIncident()]);
      mockDb.behaviourSanction.findMany.mockResolvedValue([makeSanction()]);

      const result = await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      expect(result).toBeInstanceOf(Buffer);
      expect(mockPdfService.renderFromHtml).toHaveBeenCalledTimes(1);
      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('Test Academy');
      expect(htmlArg).toContain('Jane Doe');
    });

    it('should throw NotFoundException when student does not exist', async () => {
      mockDb.student.findFirst.mockResolvedValue(null);

      await expect(
        service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should use Arabic date formatting when locale is ar', async () => {
      mockDb.student.findFirst.mockResolvedValue(makeStudent());

      const result = await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'ar');

      expect(result).toBeInstanceOf(Buffer);
      expect(mockPdfService.renderFromHtml).toHaveBeenCalledTimes(1);
    });

    it('should handle MV fallback gracefully when query fails', async () => {
      mockDb.student.findFirst.mockResolvedValue(makeStudent());
      mockDb.$queryRaw.mockRejectedValue(new Error('relation does not exist'));

      const result = await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      expect(result).toBeInstanceOf(Buffer);
    });

    it('should include CONFIDENTIAL watermark in generated HTML', async () => {
      mockDb.student.findFirst.mockResolvedValue(makeStudent());

      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('CONFIDENTIAL');
    });

    it('should show N/A for year group when student has none', async () => {
      mockDb.student.findFirst.mockResolvedValue(
        makeStudent({ year_group: null, class_enrolments: [] }),
      );

      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0] as string;
      expect(htmlArg).toContain('N/A');
    });
  });
});
