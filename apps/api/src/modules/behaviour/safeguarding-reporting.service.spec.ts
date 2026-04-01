import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { SafeguardingReportingService } from './safeguarding-reporting.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CONCERN_ID = 'concern-1';
const STUDENT_ID = 'student-1';

const mockRlsTx = {
  safeguardingConcern: {
    findFirst: jest.fn(),
  },
  tenantSetting: {
    findFirst: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

const makeCaseFileConcern = () => ({
  id: CONCERN_ID,
  concern_number: 'CP-202603-001',
  concern_type: 'physical_abuse',
  severity: 'high_sev',
  status: 'reported',
  description: 'Incident report detail',
  immediate_actions_taken: null,
  is_tusla_referral: false,
  tusla_reference_number: null,
  tusla_referred_at: null,
  tusla_outcome: null,
  is_garda_referral: false,
  garda_reference_number: null,
  garda_referred_at: null,
  resolution_notes: null,
  resolved_at: null,
  sealed_at: null,
  sealed_reason: null,
  retention_until: new Date('2050-01-01'),
  created_at: new Date(),
  updated_at: new Date(),
  student: {
    id: STUDENT_ID,
    first_name: 'John',
    last_name: 'Doe',
    date_of_birth: new Date('2010-01-01'),
  },
  reported_by: { id: 'user-1', first_name: 'Staff', last_name: 'Reporter' },
  designated_liaison: null,
  assigned_to: null,
  sealed_by: null,
  seal_approved_by: null,
  actions: [],
  concern_incidents: [],
});

describe('SafeguardingReportingService', () => {
  let service: SafeguardingReportingService;
  let mockPrisma!: {
    safeguardingConcern: Record<string, jest.Mock>;
    tenantSetting: Record<string, jest.Mock>;
    behaviourTask: Record<string, jest.Mock>;
    safeguardingAction: Record<string, jest.Mock>;
  };
  let mockPdfRenderingService!: { renderFromHtml: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      safeguardingConcern: {
        groupBy: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      behaviourTask: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      safeguardingAction: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockPdfRenderingService = {
      renderFromHtml: jest.fn().mockResolvedValue(Buffer.from('mock-pdf-buffer')),
    };

    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model as Record<string, jest.Mock>)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SafeguardingReportingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PdfRenderingService, useValue: mockPdfRenderingService },
      ],
    }).compile();

    service = module.get<SafeguardingReportingService>(SafeguardingReportingService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getDashboard', () => {
    it('should aggregate dashboard metrics correctly', async () => {
      mockPrisma.safeguardingConcern.groupBy
        .mockResolvedValueOnce([{ severity: 'critical_sev', _count: 2 }]) // bySeverity
        .mockResolvedValueOnce([{ status: 'reported', _count: 3 }]); // byStatus

      // Mocks for SLAs (slaOverdue, slaDueSoon, slaOnTrack)
      mockPrisma.safeguardingConcern.count
        .mockResolvedValueOnce(1) // overdue
        .mockResolvedValueOnce(0) // due soon
        .mockResolvedValueOnce(2); // on track

      mockPrisma.behaviourTask.findMany.mockResolvedValue([]);
      mockPrisma.safeguardingAction.findMany.mockResolvedValue([]);

      const result = await service.getDashboard(TENANT_ID);

      expect(result.data.open_by_severity.critical).toBe(2);
      expect(result.data.by_status.reported).toBe(3);
      expect(result.data.sla_compliance.overdue).toBe(1);
      expect(result.data.sla_compliance.compliance_rate).toBe(67); // (2 / 3) * 100
    });
  });

  describe('generateCaseFile', () => {
    it('should generate unredacted PDF successfully', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(makeCaseFileConcern());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({
        settings: { school_name: 'Test School' },
      });

      const pdfBuffer = await service.generateCaseFile(TENANT_ID, CONCERN_ID, false);

      expect(pdfBuffer).toBeDefined();
      expect(mockRlsTx.safeguardingConcern.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: CONCERN_ID, tenant_id: TENANT_ID } }),
      );
      expect(mockPdfRenderingService.renderFromHtml).toHaveBeenCalled();

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).toContain('John Doe');
      expect(htmlArg).not.toContain('Student A');
    });

    it('should generate redacted PDF with hidden names', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(makeCaseFileConcern());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({
        settings: { school_name: 'Test School' },
      });

      const pdfBuffer = await service.generateCaseFile(TENANT_ID, CONCERN_ID, true);

      expect(pdfBuffer).toBeDefined();
      expect(mockPdfRenderingService.renderFromHtml).toHaveBeenCalled();

      const htmlArg = mockPdfRenderingService.renderFromHtml.mock.calls[0][0];
      expect(htmlArg).not.toContain('John Doe');
      expect(htmlArg).toContain('Student A');
      expect(htmlArg).toContain('[Reporter]');
      expect(htmlArg).toContain('REDACTED COPY');
    });

    it('should throw NotFoundException if concern does not exist', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(null);

      await expect(service.generateCaseFile(TENANT_ID, CONCERN_ID, false)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
