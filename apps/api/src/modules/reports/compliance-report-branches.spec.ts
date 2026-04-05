/**
 * Additional branch coverage for ComplianceReportService.
 * Targets: getTemplate (not found), createTemplate, updateTemplate (not found, partial fields),
 * deleteTemplate (not found), autoPopulate data type branches.
 */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { ComplianceReportService } from './compliance-report.service';
import { ReportsDataAccessService } from './reports-data-access.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEMPLATE_ID = 'tpl-1';

const mockTemplate = {
  id: TEMPLATE_ID,
  tenant_id: TENANT_ID,
  name: 'UAE Compliance',
  country_code: 'AE',
  fields_json: [
    { key: 'active_student_count', label: 'Active Students', data_type: 'number' },
    { key: 'active_staff_count', label: 'Active Staff', data_type: 'number' },
    { key: 'custom_field', label: 'Custom', data_type: 'text' },
  ],
  created_at: new Date(),
  updated_at: new Date(),
};

const mockTxDb = {
  complianceReportTemplate: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTxDb)),
  }),
}));

describe('ComplianceReportService — branch coverage', () => {
  let service: ComplianceReportService;
  let mockDataAccess: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockDataAccess = {
      countStudents: jest.fn().mockResolvedValue(100),
      countStaff: jest.fn().mockResolvedValue(20),
      countClasses: jest.fn().mockResolvedValue(10),
      countAttendanceRecords: jest.fn().mockResolvedValue(0),
      countClassEnrolments: jest.fn().mockResolvedValue(0),
      findInvoices: jest.fn().mockResolvedValue([]),
      aggregateInvoices: jest.fn().mockResolvedValue({ _sum: { total_amount: 0 } }),
      groupAttendanceRecordsBy: jest.fn().mockResolvedValue([]),
      countClassStaff: jest.fn().mockResolvedValue(0),
    };

    mockTxDb.complianceReportTemplate.findMany.mockResolvedValue([]);
    mockTxDb.complianceReportTemplate.findFirst.mockResolvedValue(null);
    mockTxDb.complianceReportTemplate.create.mockReset();
    mockTxDb.complianceReportTemplate.update.mockReset();
    mockTxDb.complianceReportTemplate.delete.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceReportService,
        { provide: PrismaService, useValue: {} },
        { provide: ReportsDataAccessService, useValue: mockDataAccess },
      ],
    }).compile();

    service = module.get<ComplianceReportService>(ComplianceReportService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listTemplates ────────────────────────────────────────────────────────

  describe('ComplianceReportService — listTemplates', () => {
    it('should return formatted templates', async () => {
      mockTxDb.complianceReportTemplate.findMany.mockResolvedValue([mockTemplate]);

      const result = await service.listTemplates(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('UAE Compliance');
    });
  });

  // ─── getTemplate ──────────────────────────────────────────────────────────

  describe('ComplianceReportService — getTemplate', () => {
    it('should throw NotFoundException when template not found', async () => {
      await expect(service.getTemplate(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return template when found', async () => {
      mockTxDb.complianceReportTemplate.findFirst.mockResolvedValue(mockTemplate);

      const result = await service.getTemplate(TENANT_ID, TEMPLATE_ID);

      expect(result.id).toBe(TEMPLATE_ID);
    });
  });

  // ─── createTemplate ───────────────────────────────────────────────────────

  describe('ComplianceReportService — createTemplate', () => {
    it('should create a template', async () => {
      mockTxDb.complianceReportTemplate.create.mockResolvedValue(mockTemplate);

      const result = await service.createTemplate(TENANT_ID, {
        name: 'UAE Compliance',
        country_code: 'AE',
        fields_json: [{ key: 'active_student_count', label: 'Students', data_type: 'number' }],
      });

      expect(result.name).toBe('UAE Compliance');
    });
  });

  // ─── updateTemplate ───────────────────────────────────────────────────────

  describe('ComplianceReportService — updateTemplate', () => {
    it('should throw NotFoundException when template not found', async () => {
      await expect(
        service.updateTemplate(TENANT_ID, 'nonexistent', { name: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update partial fields', async () => {
      mockTxDb.complianceReportTemplate.findFirst.mockResolvedValue(mockTemplate);
      mockTxDb.complianceReportTemplate.update.mockResolvedValue({
        ...mockTemplate,
        name: 'Updated',
      });

      const result = await service.updateTemplate(TENANT_ID, TEMPLATE_ID, {
        name: 'Updated',
      });

      expect(result.name).toBe('Updated');
    });
  });

  // ─── deleteTemplate ───────────────────────────────────────────────────────

  describe('ComplianceReportService — deleteTemplate', () => {
    it('should throw NotFoundException when template not found', async () => {
      await expect(service.deleteTemplate(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should delete when found', async () => {
      mockTxDb.complianceReportTemplate.findFirst.mockResolvedValue(mockTemplate);
      mockTxDb.complianceReportTemplate.delete.mockResolvedValue({});

      await expect(service.deleteTemplate(TENANT_ID, TEMPLATE_ID)).resolves.toBeUndefined();
    });
  });

  // ─── autoPopulate ─────────────────────────────────────────────────────────

  describe('ComplianceReportService — autoPopulate', () => {
    it('should populate auto-populatable fields and report gaps for unknown keys', async () => {
      mockTxDb.complianceReportTemplate.findFirst.mockResolvedValue(mockTemplate);

      const result = await service.autoPopulate(TENANT_ID, TEMPLATE_ID);

      expect(result.template.id).toBe(TEMPLATE_ID);
      expect(result.data.active_student_count).toBe(100);
      expect(result.data.active_staff_count).toBe(20);
      expect(result.gaps).toContain('custom_field');
    });

    it('should compute attendance rate from grouped records', async () => {
      mockTxDb.complianceReportTemplate.findFirst.mockResolvedValue({
        ...mockTemplate,
        fields_json: [
          { key: 'school_attendance_rate', label: 'Attendance Rate', data_type: 'number' },
        ],
      });
      mockDataAccess.groupAttendanceRecordsBy!.mockResolvedValue([
        { status: 'present', _count: 80 },
        { status: 'late', _count: 10 },
        { status: 'absent', _count: 10 },
      ]);

      const result = await service.autoPopulate(TENANT_ID, TEMPLATE_ID);

      expect(result.data.school_attendance_rate).toBe(90);
    });
  });
});
