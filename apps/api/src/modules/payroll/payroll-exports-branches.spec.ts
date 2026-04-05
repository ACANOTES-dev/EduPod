/**
 * Additional branch coverage for PayrollExportsService.
 * Targets: createTemplate invalid field, updateTemplate column validation,
 * generateExport with/without template, buildRow all column branches,
 * emailToAccountant settings resolution and error paths, getExportHistory not found.
 */
/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: (_prisma: unknown) => ({
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(_prisma),
  }),
}));

import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';

import { PayrollExportsService } from './payroll-exports.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEMPLATE_ID = 'tpl-1';
const RUN_ID = 'run-1';
const USER_ID = 'user-1';

const mockTemplate = {
  id: TEMPLATE_ID,
  tenant_id: TENANT_ID,
  name: 'Test CSV',
  columns_json: [{ field: 'staff_name', header: 'Staff Name' }],
  file_format: 'csv',
  created_by_user_id: USER_ID,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockRun = {
  id: RUN_ID,
  tenant_id: TENANT_ID,
  period_label: 'March 2026',
  period_month: 3,
  period_year: 2026,
  entries: [
    {
      id: 'entry-1',
      basic_pay: '5000.00',
      bonus_pay: '200.00',
      total_pay: '5200.00',
      override_total_pay: null,
      days_worked: 22,
      classes_taught: 15,
      compensation_type: 'salaried',
      notes: 'Good month',
      staff_profile: {
        id: 'sp-1',
        staff_number: 'S001',
        department: 'Science',
        job_title: 'Teacher',
        user: { first_name: 'Alice', last_name: 'Smith' },
      },
    },
  ],
};

describe('PayrollExportsService — branch coverage', () => {
  let service: PayrollExportsService;
  let mockPrisma: Record<string, Record<string, jest.Mock>>;
  let mockSettingsService: { getSettings: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      payrollExportTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      payrollRun: { findFirst: jest.fn().mockResolvedValue(null) },
      payrollExportLog: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
      },
    };
    mockSettingsService = {
      getSettings: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollExportsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    }).compile();

    service = module.get<PayrollExportsService>(PayrollExportsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createTemplate — invalid field ───────────────────────────────────────

  describe('PayrollExportsService — createTemplate', () => {
    it('should throw BadRequestException for invalid field', async () => {
      await expect(
        service.createTemplate(TENANT_ID, USER_ID, {
          name: 'Bad Template',
          columns_json: [{ field: 'invalid_field', header: 'Invalid' }],
          file_format: 'csv',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create template with valid fields', async () => {
      mockPrisma.payrollExportTemplate.create.mockResolvedValue(mockTemplate);

      const result = await service.createTemplate(TENANT_ID, USER_ID, {
        name: 'Test CSV',
        columns_json: [{ field: 'staff_name', header: 'Staff Name' }],
        file_format: 'csv',
      });

      expect(result.id).toBe(TEMPLATE_ID);
    });
  });

  // ─── updateTemplate — column validation ───────────────────────────────────

  describe('PayrollExportsService — updateTemplate', () => {
    it('should throw BadRequestException for invalid column in update', async () => {
      mockPrisma.payrollExportTemplate.findFirst.mockResolvedValue(mockTemplate);

      await expect(
        service.updateTemplate(TENANT_ID, TEMPLATE_ID, {
          columns_json: [{ field: 'bogus', header: 'Bogus' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update name without column validation', async () => {
      mockPrisma.payrollExportTemplate.findFirst.mockResolvedValue(mockTemplate);
      mockPrisma.payrollExportTemplate.update.mockResolvedValue({
        ...mockTemplate,
        name: 'Updated',
      });

      const result = await service.updateTemplate(TENANT_ID, TEMPLATE_ID, { name: 'Updated' });

      expect(result.name).toBe('Updated');
    });
  });

  // ─── getTemplate / deleteTemplate — not found ─────────────────────────────

  describe('PayrollExportsService — getTemplate not found', () => {
    it('should throw NotFoundException', async () => {
      await expect(service.getTemplate(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('PayrollExportsService — deleteTemplate', () => {
    it('should delete an existing template', async () => {
      mockPrisma.payrollExportTemplate.findFirst.mockResolvedValue(mockTemplate);
      mockPrisma.payrollExportTemplate.delete.mockResolvedValue({});

      const result = await service.deleteTemplate(TENANT_ID, TEMPLATE_ID);

      expect(result.deleted).toBe(true);
    });
  });

  // ─── generateExport — with and without template ───────────────────────────

  describe('PayrollExportsService — generateExport', () => {
    it('should throw NotFoundException when run not found', async () => {
      await expect(service.generateExport(TENANT_ID, 'nonexistent', USER_ID, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should use default columns when no template_id', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRun);
      mockPrisma.payrollExportLog.create.mockResolvedValue({});

      const result = await service.generateExport(TENANT_ID, RUN_ID, USER_ID, {});

      expect(result.row_count).toBe(1);
      expect(result.format).toBe('csv');
      expect(result.content).toContain('Staff Name');
    });

    it('should use template columns when template_id provided', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRun);
      mockPrisma.payrollExportTemplate.findFirst.mockResolvedValue({
        ...mockTemplate,
        columns_json: [
          { field: 'staff_name', header: 'Name' },
          { field: 'gross_total', header: 'Total' },
        ],
      });
      mockPrisma.payrollExportLog.create.mockResolvedValue({});

      const result = await service.generateExport(TENANT_ID, RUN_ID, USER_ID, {
        template_id: TEMPLATE_ID,
      });

      expect(result.content).toContain('Name');
      expect(result.content).toContain('Total');
    });

    it('should handle override_total_pay in buildRow', async () => {
      const runWithOverride = {
        ...mockRun,
        entries: [
          {
            ...mockRun.entries[0],
            override_total_pay: '6000.00',
          },
        ],
      };
      mockPrisma.payrollRun.findFirst.mockResolvedValue(runWithOverride);
      mockPrisma.payrollExportTemplate.findFirst.mockResolvedValue({
        ...mockTemplate,
        columns_json: [{ field: 'gross_total', header: 'Total' }],
      });
      mockPrisma.payrollExportLog.create.mockResolvedValue({});

      const result = await service.generateExport(TENANT_ID, RUN_ID, USER_ID, {
        template_id: TEMPLATE_ID,
      });

      expect(result.content).toContain('6000');
    });

    it('should handle all column types in buildRow', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRun);
      mockPrisma.payrollExportTemplate.findFirst.mockResolvedValue({
        ...mockTemplate,
        columns_json: [
          { field: 'staff_name', header: 'Name' },
          { field: 'staff_number', header: 'Number' },
          { field: 'department', header: 'Dept' },
          { field: 'compensation_type', header: 'Type' },
          { field: 'days_worked', header: 'Days' },
          { field: 'classes_taught', header: 'Classes' },
          { field: 'gross_basic', header: 'Basic' },
          { field: 'gross_bonus', header: 'Bonus' },
          { field: 'gross_total', header: 'Total' },
          { field: 'period', header: 'Period' },
          { field: 'notes', header: 'Notes' },
        ],
      });
      mockPrisma.payrollExportLog.create.mockResolvedValue({});

      const result = await service.generateExport(TENANT_ID, RUN_ID, USER_ID, {
        template_id: TEMPLATE_ID,
      });

      expect(result.content).toContain('Alice Smith');
      expect(result.content).toContain('S001');
      expect(result.content).toContain('Science');
      expect(result.content).toContain('salaried');
      expect(result.content).toContain('22');
      expect(result.content).toContain('15');
      expect(result.content).toContain('5000');
      expect(result.content).toContain('200');
      expect(result.content).toContain('March 2026');
      expect(result.content).toContain('Good month');
    });

    it('should handle entry without staff_profile', async () => {
      const runNoProfile = {
        ...mockRun,
        entries: [{ ...mockRun.entries[0], staff_profile: undefined }],
      };
      mockPrisma.payrollRun.findFirst.mockResolvedValue(runNoProfile);
      mockPrisma.payrollExportLog.create.mockResolvedValue({});

      const result = await service.generateExport(TENANT_ID, RUN_ID, USER_ID, {});

      expect(result.row_count).toBe(1);
    });
  });

  // ─── getExportHistory — not found ─────────────────────────────────────────

  describe('PayrollExportsService — getExportHistory', () => {
    it('should throw NotFoundException when run not found', async () => {
      await expect(service.getExportHistory(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return paginated history', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({ id: RUN_ID });
      mockPrisma.payrollExportLog.findMany.mockResolvedValue([{ id: 'log-1' }]);
      mockPrisma.payrollExportLog.count.mockResolvedValue(1);

      const result = await service.getExportHistory(TENANT_ID, RUN_ID);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  // ─── emailToAccountant — branches ─────────────────────────────────────────

  describe('PayrollExportsService — emailToAccountant', () => {
    it('should throw BadRequestException when no accountant email configured', async () => {
      mockSettingsService.getSettings.mockResolvedValue({});

      await expect(service.emailToAccountant(TENANT_ID, RUN_ID, USER_ID, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when payroll settings exist but email is not string', async () => {
      mockSettingsService.getSettings.mockResolvedValue({
        payroll: { payrollAccountantEmail: 123 },
      });

      await expect(service.emailToAccountant(TENANT_ID, RUN_ID, USER_ID, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should generate export and return confirmation when email configured', async () => {
      mockSettingsService.getSettings.mockResolvedValue({
        payroll: { payrollAccountantEmail: 'accountant@school.com' },
      });
      mockPrisma.payrollRun.findFirst.mockResolvedValue(mockRun);
      mockPrisma.payrollExportLog.create.mockResolvedValue({});

      const result = await service.emailToAccountant(TENANT_ID, RUN_ID, USER_ID, {});

      expect(result.sent_to).toBe('accountant@school.com');
      expect(result.row_count).toBe(1);
    });

    it('should handle settings service error gracefully', async () => {
      mockSettingsService.getSettings.mockRejectedValue(new Error('Settings unavailable'));

      await expect(service.emailToAccountant(TENANT_ID, RUN_ID, USER_ID, {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
