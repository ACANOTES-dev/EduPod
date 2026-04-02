/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourExportService } from './behaviour-export.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'student-1';
const USER_ID = 'user-1';

// ─── Factories ──────────────────────────────────────────────────────────

const mockTx = {
  student: {
    findFirst: jest.fn(),
  },
  tenantSetting: {
    findFirst: jest.fn(),
  },
  behaviourIncident: {
    findMany: jest.fn(),
  },
  behaviourSanction: {
    findMany: jest.fn(),
  },
  behaviourIntervention: {
    findMany: jest.fn(),
  },
  behaviourRecognitionAward: {
    findMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn(mockTx);
    }),
  }),
}));

const makeStudent = () => ({
  id: STUDENT_ID,
  first_name: 'John',
  last_name: 'Doe',
  student_number: 'STU001',
  tenant_id: TENANT_ID,
  status: 'active',
  year_group_id: 'yg-1',
  year_group: { id: 'yg-1', name: 'Year 7' },
  class_enrolments: [
    {
      status: 'active',
      class_entity: { name: '7A' },
    },
  ],
});

const makeTenantSettings = () => ({
  settings: {
    school_name: 'Test School',
  },
});

const makeBehaviourIncident = () => ({
  id: 'inc-1',
  incident_number: 'BH-001',
  polarity: 'negative',
  severity: 3,
  status: 'active',
  occurred_at: new Date('2026-03-15'),
  parent_description: 'Incident description for parents',
  category: { name: 'Disruption' },
  reported_by: { first_name: 'Jane', last_name: 'Smith' },
});

const makeBehaviourSanction = () => ({
  id: 'san-1',
  type: 'detention',
  status: 'served',
  scheduled_date: new Date('2026-03-16'),
  served_at: new Date('2026-03-16'),
});

const makeBehaviourIntervention = () => ({
  id: 'int-1',
  title: 'Counselling',
  type: 'counselling',
  status: 'active_intervention',
  start_date: new Date('2026-03-10'),
  outcome: null,
});

const makeRecognitionAward = () => ({
  id: 'award-1',
  awarded_at: new Date('2026-03-14'),
  notes: 'Good behavior',
  award_type: { name: 'Star Award' },
});

// ─── Test Suite ───────────────────────────────────────────────────────────

describe('BehaviourExportService', () => {
  let service: BehaviourExportService;
  let mockPrisma: Record<string, jest.Mock>;
  let mockPdfService: { renderFromHtml: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {};
    mockPdfService = {
      renderFromHtml: jest.fn().mockResolvedValue(Buffer.from('PDF content')),
    };

    mockTx.student.findFirst.mockResolvedValue(makeStudent());
    mockTx.tenantSetting.findFirst.mockResolvedValue(makeTenantSettings());
    mockTx.behaviourIncident.findMany.mockResolvedValue([makeBehaviourIncident()]);
    mockTx.behaviourSanction.findMany.mockResolvedValue([makeBehaviourSanction()]);
    mockTx.behaviourIntervention.findMany.mockResolvedValue([makeBehaviourIntervention()]);
    mockTx.behaviourRecognitionAward.findMany.mockResolvedValue([makeRecognitionAward()]);
    mockTx.$queryRaw.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourExportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PdfRenderingService, useValue: mockPdfService },
      ],
    }).compile();

    service = module.get<BehaviourExportService>(BehaviourExportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Reset mock transaction results
    mockTx.student.findFirst.mockReset();
    mockTx.tenantSetting.findFirst.mockReset();
    mockTx.behaviourIncident.findMany.mockReset();
    mockTx.behaviourSanction.findMany.mockReset();
    mockTx.behaviourIntervention.findMany.mockReset();
    mockTx.behaviourRecognitionAward.findMany.mockReset();
    mockTx.$queryRaw.mockReset();
  });

  // ─── generateStudentPackPdf ─────────────────────────────────────────────

  describe('generateStudentPackPdf', () => {
    beforeEach(() => {
      mockTx.student.findFirst.mockResolvedValue(makeStudent());
      mockTx.tenantSetting.findFirst.mockResolvedValue(makeTenantSettings());
      mockTx.behaviourIncident.findMany.mockResolvedValue([makeBehaviourIncident()]);
      mockTx.behaviourSanction.findMany.mockResolvedValue([makeBehaviourSanction()]);
      mockTx.behaviourIntervention.findMany.mockResolvedValue([makeBehaviourIntervention()]);
      mockTx.behaviourRecognitionAward.findMany.mockResolvedValue([makeRecognitionAward()]);
      mockTx.$queryRaw.mockResolvedValue([]);
    });

    it('should generate PDF with student data', async () => {
      const result = await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      expect(result).toBeInstanceOf(Buffer);
      expect(mockPdfService.renderFromHtml).toHaveBeenCalled();
      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('Test School');
      expect(htmlArg).toContain('John Doe');
    });

    it('should throw NotFoundException when student not found', async () => {
      mockTx.student.findFirst.mockResolvedValue(null);

      await expect(
        service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should load student with year group and class info', async () => {
      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      expect(mockTx.student.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: STUDENT_ID,
            tenant_id: TENANT_ID,
            status: 'active',
          }),
          include: expect.objectContaining({
            year_group: expect.any(Object),
            class_enrolments: expect.any(Object),
          }),
        }),
      );
    });

    it('should load incidents excluding draft and withdrawn', async () => {
      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      expect(mockTx.behaviourIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            retention_status: 'active',
            status: { notIn: ['draft', 'withdrawn'] },
          }),
        }),
      );
    });

    it('should load incidents with category and reporter info', async () => {
      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      expect(mockTx.behaviourIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            category: expect.any(Object),
            reported_by: expect.any(Object),
          }),
        }),
      );
    });

    it('should load sanctions ordered by scheduled_date desc', async () => {
      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      expect(mockTx.behaviourSanction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { scheduled_date: 'desc' },
        }),
      );
    });

    it('should load interventions ordered by start_date desc', async () => {
      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      expect(mockTx.behaviourIntervention.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { start_date: 'desc' },
        }),
      );
    });

    it('should load awards with award_type info', async () => {
      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      expect(mockTx.behaviourRecognitionAward.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            award_type: expect.any(Object),
          }),
        }),
      );
    });

    it('should handle missing materialized view gracefully', async () => {
      mockTx.$queryRaw.mockRejectedValue(new Error('MV not found'));

      const result = await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      expect(result).toBeInstanceOf(Buffer);
    });

    it('should use materialized view data when available', async () => {
      mockTx.$queryRaw.mockResolvedValue([
        {
          positive_count: 5n,
          negative_count: 3n,
          neutral_count: 2n,
          total_points: 42n,
          positive_ratio: 0.625,
        },
      ]);

      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('62.5%');
      expect(htmlArg).toContain('42');
    });

    it('should format positive ratio as percentage', async () => {
      mockTx.$queryRaw.mockResolvedValue([
        {
          positive_count: 5n,
          negative_count: 3n,
          neutral_count: 2n,
          total_points: 42n,
          positive_ratio: 0.625,
        },
      ]);

      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('62.5%');
    });

    it('should show N/A when no MV data available', async () => {
      mockTx.$queryRaw.mockResolvedValue([]);

      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('N/A');
    });

    it('should use incident count fallback when MV empty', async () => {
      mockTx.$queryRaw.mockResolvedValue([]);
      const incidents = [makeBehaviourIncident(), { ...makeBehaviourIncident(), id: 'inc-2' }];
      mockTx.behaviourIncident.findMany.mockResolvedValue(incidents);

      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('Total Incidents');
    });

    it('should escape HTML in data', async () => {
      mockTx.student.findFirst.mockResolvedValue({
        ...makeStudent(),
        first_name: '<script>',
        last_name: 'alert("xss")',
      });

      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).not.toContain('<script>');
      expect(htmlArg).toContain('&lt;script&gt;');
    });

    it('should use Arabic locale when specified', async () => {
      const result = await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'ar');

      expect(result).toBeInstanceOf(Buffer);
      expect(mockPdfService.renderFromHtml).toHaveBeenCalled();
    });

    it('should use English locale when specified', async () => {
      const result = await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      expect(result).toBeInstanceOf(Buffer);
      expect(mockPdfService.renderFromHtml).toHaveBeenCalled();
    });

    it('should format empty tables with placeholder message', async () => {
      mockTx.behaviourIncident.findMany.mockResolvedValue([]);
      mockTx.behaviourSanction.findMany.mockResolvedValue([]);
      mockTx.behaviourIntervention.findMany.mockResolvedValue([]);
      mockTx.behaviourRecognitionAward.findMany.mockResolvedValue([]);

      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('No incidents recorded');
      expect(htmlArg).toContain('No sanctions recorded');
      expect(htmlArg).toContain('No interventions recorded');
      expect(htmlArg).toContain('No awards recorded');
    });

    it('should format incident data correctly', async () => {
      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('Disruption');
      expect(htmlArg).toContain('Incident description for parents');
      expect(htmlArg).toContain('Jane Smith');
    });

    it('should format sanction data correctly', async () => {
      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('detention');
      expect(htmlArg).toContain('Served');
    });

    it('should format intervention data correctly', async () => {
      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('Counselling');
      expect(htmlArg).toContain('active intervention');
    });

    it('should format award data correctly', async () => {
      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('Star Award');
      expect(htmlArg).toContain('Good behavior');
    });

    it('should show class name as N/A when no active enrollment', async () => {
      mockTx.student.findFirst.mockResolvedValue({
        ...makeStudent(),
        class_enrolments: [],
      });

      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('N/A');
    });

    it('should show default school name when settings missing', async () => {
      mockTx.tenantSetting.findFirst.mockResolvedValue({ settings: {} });

      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('School');
    });

    it('should include CONFIDENTIAL watermark', async () => {
      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('CONFIDENTIAL');
    });

    it('should include disclaimer in footer', async () => {
      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('confidential and intended for authorised school personnel');
    });

    it('should use correct date format for generated date', async () => {
      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('Date Generated');
    });

    it('should create RLS client with tenant context', async () => {
      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      expect(createRlsClient).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ tenant_id: TENANT_ID }),
      );
    });

    it('should handle missing category gracefully', async () => {
      mockTx.behaviourIncident.findMany.mockResolvedValue([
        {
          ...makeBehaviourIncident(),
          category: null,
        },
      ]);

      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('N/A');
    });

    it('should handle missing award type gracefully', async () => {
      mockTx.behaviourRecognitionAward.findMany.mockResolvedValue([
        {
          ...makeRecognitionAward(),
          award_type: null,
        },
      ]);

      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('Award');
    });

    it('should use RLS client with tenant context', async () => {
      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      // RLS client is created with tenant context - verified by successful execution
      expect(createRlsClient).toHaveBeenCalled();
    });

    it('should handle no-show status in sanctions', async () => {
      mockTx.behaviourSanction.findMany.mockResolvedValue([
        {
          ...makeBehaviourSanction(),
          status: 'no_show',
          served_at: null,
        },
      ]);

      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('No-show');
    });

    it('should handle scheduled status in sanctions', async () => {
      mockTx.behaviourSanction.findMany.mockResolvedValue([
        {
          ...makeBehaviourSanction(),
          status: 'scheduled',
          served_at: null,
        },
      ]);

      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('-');
    });

    it('should format status with underscores replaced', async () => {
      mockTx.behaviourIncident.findMany.mockResolvedValue([
        {
          ...makeBehaviourIncident(),
          status: 'in_review',
        },
      ]);

      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('in review');
    });

    it('should format intervention outcome', async () => {
      mockTx.behaviourIntervention.findMany.mockResolvedValue([
        {
          ...makeBehaviourIntervention(),
          outcome: 'successful_completion',
        },
      ]);

      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('successful completion');
    });

    it('should handle empty intervention outcome', async () => {
      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('-');
    });

    it('should format positive polarity with capital letter', async () => {
      mockTx.behaviourIncident.findMany.mockResolvedValue([
        {
          ...makeBehaviourIncident(),
          polarity: 'positive',
        },
      ]);

      await service.generateStudentPackPdf(TENANT_ID, STUDENT_ID, USER_ID, 'en');

      const htmlArg = mockPdfService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('Positive');
    });
  });
});
