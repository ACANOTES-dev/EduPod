import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';

import { PayrollExportsService } from './payroll-exports.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const TEMPLATE_ID = '22222222-2222-2222-2222-222222222222';
const RUN_ID = '33333333-3333-3333-3333-333333333333';
const USER_ID = '44444444-4444-4444-4444-444444444444';

const mockTemplate = {
  id: TEMPLATE_ID,
  tenant_id: TENANT_ID,
  name: 'Generic CSV',
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
      id: '55555555-5555-5555-5555-555555555555',
      basic_pay: '5000.00',
      bonus_pay: '200.00',
      total_pay: '5200.00',
      override_total_pay: null,
      days_worked: 22,
      classes_taught: null,
      compensation_type: 'salaried',
      notes: 'Some note',
      staff_profile: {
        id: '66666666-6666-6666-6666-666666666666',
        staff_number: 'S001',
        department: 'Science',
        job_title: 'Teacher',
        user: { first_name: 'Alice', last_name: 'Smith' },
      },
    },
  ],
};

function buildPrisma() {
  return {
    payrollExportTemplate: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(mockTemplate),
      findMany: jest.fn().mockResolvedValue([mockTemplate]),
      create: jest.fn().mockResolvedValue(mockTemplate),
      update: jest.fn().mockResolvedValue(mockTemplate),
      delete: jest.fn().mockResolvedValue(mockTemplate),
    },
    payrollRun: {
      findFirst: jest.fn().mockResolvedValue(mockRun),
    },
    payrollExportLog: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    $extends: jest.fn().mockReturnThis(),
    $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        payrollExportTemplate: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(mockTemplate),
        },
        payrollExportLog: {
          create: jest.fn().mockResolvedValue({}),
        },
      }),
    ),
  };
}

describe('PayrollExportsService', () => {
  let service: PayrollExportsService;
  let prisma: ReturnType<typeof buildPrisma>;
  let settingsService: { getSettings: jest.Mock };

  beforeEach(async () => {
    prisma = buildPrisma();
    settingsService = {
      getSettings: jest.fn().mockResolvedValue({
        payroll: { payrollAccountantEmail: 'accountant@school.ie' },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollExportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settingsService },
      ],
    }).compile();

    service = module.get<PayrollExportsService>(PayrollExportsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should list templates', async () => {
    const result = await service.listTemplates(TENANT_ID);
    expect(result.data).toHaveLength(1);
  });

  it('should throw NotFoundException for non-existent template', async () => {
    prisma.payrollExportTemplate.findFirst = jest.fn().mockResolvedValue(null);
    await expect(service.getTemplate(TENANT_ID, TEMPLATE_ID)).rejects.toThrow(NotFoundException);
  });

  it('should generate export and return CSV content', async () => {
    const result = await service.generateExport(TENANT_ID, RUN_ID, USER_ID, {});

    expect(result.content).toContain('Staff Name');
    expect(result.row_count).toBe(1);
    expect(result.file_name).toContain('.csv');
  });

  it('should throw BadRequestException when no accountant email configured', async () => {
    settingsService.getSettings.mockResolvedValue({ payroll: {} });

    await expect(service.emailToAccountant(TENANT_ID, RUN_ID, USER_ID, {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should return export history', async () => {
    const result = await service.getExportHistory(TENANT_ID, RUN_ID);
    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(0);
  });

  it('should delete template', async () => {
    const result = await service.deleteTemplate(TENANT_ID, TEMPLATE_ID);
    expect(result).toMatchObject({ id: TEMPLATE_ID, deleted: true });
  });

  // ─── Additional branch coverage ──────────────────────────────────────────

  describe('createTemplate', () => {
    it('should throw BadRequestException for invalid field', async () => {
      await expect(
        service.createTemplate(TENANT_ID, USER_ID, {
          name: 'Bad template',
          columns_json: [{ field: 'invalid_field_name', header: 'Invalid' }],
          file_format: 'csv',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createTemplate(TENANT_ID, USER_ID, {
          name: 'Bad template',
          columns_json: [{ field: 'invalid_field_name', header: 'Invalid' }],
          file_format: 'csv',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_EXPORT_FIELD' }),
      });
    });

    it('should accept valid fields', async () => {
      const result = await service.createTemplate(TENANT_ID, USER_ID, {
        name: 'Good template',
        columns_json: [
          { field: 'staff_name', header: 'Name' },
          { field: 'gross_total', header: 'Total' },
        ],
        file_format: 'csv',
      });

      expect(result).toBeDefined();
    });
  });

  describe('updateTemplate', () => {
    it('should throw BadRequestException for invalid field in columns_json', async () => {
      await expect(
        service.updateTemplate(TENANT_ID, TEMPLATE_ID, {
          columns_json: [{ field: 'nonexistent', header: 'Bad' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update template name without validating columns_json', async () => {
      const result = await service.updateTemplate(TENANT_ID, TEMPLATE_ID, {
        name: 'Updated Name',
      });
      expect(result).toBeDefined();
    });

    it('should update template with valid columns_json', async () => {
      await service.updateTemplate(TENANT_ID, TEMPLATE_ID, {
        columns_json: [{ field: 'staff_name', header: 'Name' }],
      });

      expect(prisma.payrollExportTemplate.update).toHaveBeenCalledWith({
        where: { id: TEMPLATE_ID },
        data: expect.objectContaining({
          columns_json: [{ field: 'staff_name', header: 'Name' }],
        }),
      });
    });

    it('should update file_format', async () => {
      await service.updateTemplate(TENANT_ID, TEMPLATE_ID, {
        file_format: 'xlsx',
      });

      expect(prisma.payrollExportTemplate.update).toHaveBeenCalledWith({
        where: { id: TEMPLATE_ID },
        data: expect.objectContaining({
          file_format: 'xlsx',
        }),
      });
    });
  });

  describe('generateExport', () => {
    it('should use template columns when template_id is provided', async () => {
      const customTemplate = {
        ...mockTemplate,
        columns_json: [
          { field: 'staff_name', header: 'Employee' },
          { field: 'department', header: 'Dept' },
          { field: 'gross_total', header: 'Total' },
        ],
        file_format: 'xlsx',
      };
      prisma.payrollExportTemplate.findFirst.mockResolvedValue(customTemplate);

      const result = await service.generateExport(TENANT_ID, RUN_ID, USER_ID, {
        template_id: TEMPLATE_ID,
      });

      expect(result.content).toContain('"Employee"');
      expect(result.content).toContain('"Dept"');
      expect(result.content).toContain('"Total"');
      expect(result.file_name).toContain('.xlsx');
    });

    it('should throw NotFoundException when run not found', async () => {
      prisma.payrollRun.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.generateExport(TENANT_ID, 'nonexistent', USER_ID, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should build all row fields correctly in CSV', async () => {
      // Run with all fields populated
      const fullRun = {
        ...mockRun,
        entries: [
          {
            id: 'entry-1',
            basic_pay: '5000.00',
            bonus_pay: '200.00',
            total_pay: '5200.00',
            override_total_pay: '5100.00',
            days_worked: 22,
            classes_taught: 15,
            compensation_type: 'per_class',
            notes: 'Test notes',
            staff_profile: {
              id: 'sp-1',
              staff_number: 'STF-100',
              department: 'Math',
              job_title: 'Teacher',
              user: { first_name: 'Alice', last_name: 'Smith' },
            },
          },
        ],
      };
      prisma.payrollRun.findFirst = jest.fn().mockResolvedValue(fullRun);

      // Use a template with all available fields
      const allFieldsTemplate = {
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
      };
      prisma.payrollExportTemplate.findFirst.mockResolvedValue(allFieldsTemplate);

      const result = await service.generateExport(TENANT_ID, RUN_ID, USER_ID, {
        template_id: TEMPLATE_ID,
      });

      expect(result.content).toContain('Alice Smith');
      expect(result.content).toContain('STF-100');
      expect(result.content).toContain('Math');
      expect(result.content).toContain('per_class');
      expect(result.content).toContain('22');
      expect(result.content).toContain('15');
      // gross_total uses override when set
      expect(result.content).toContain('5100');
      expect(result.content).toContain('March 2026');
      expect(result.content).toContain('Test notes');
    });

    it('should use total_pay when override_total_pay is null for gross_total', async () => {
      const result = await service.generateExport(TENANT_ID, RUN_ID, USER_ID, {});

      // Default columns include gross_total, which should use total_pay (5200) when override is null
      expect(result.content).toContain('5200');
    });

    it('should handle unknown field in buildRow with empty string', async () => {
      const templateWithBadField = {
        ...mockTemplate,
        columns_json: [
          { field: 'allowances_total', header: 'Allowances' },
          { field: 'adjustments_total', header: 'Adjustments' },
          { field: 'deductions_total', header: 'Deductions' },
          { field: 'one_off_total', header: 'One-offs' },
        ],
      };
      prisma.payrollExportTemplate.findFirst.mockResolvedValue(templateWithBadField);

      const result = await service.generateExport(TENANT_ID, RUN_ID, USER_ID, {
        template_id: TEMPLATE_ID,
      });

      // These fields fall through to default case in buildRow -> empty string
      expect(result.row_count).toBe(1);
    });

    it('should handle entry with no staff_profile user', async () => {
      const runWithNoUser = {
        ...mockRun,
        entries: [
          {
            ...mockRun.entries[0],
            staff_profile: undefined,
          },
        ],
      };
      prisma.payrollRun.findFirst = jest.fn().mockResolvedValue(runWithNoUser);

      const result = await service.generateExport(TENANT_ID, RUN_ID, USER_ID, {});

      // Should not throw; staff_name should be empty
      expect(result.row_count).toBe(1);
    });

    it('should handle CSV escaping of quotes in values', async () => {
      const runWithQuotes = {
        ...mockRun,
        entries: [
          {
            ...mockRun.entries[0],
            notes: 'Note with "quotes" inside',
            staff_profile: {
              ...mockRun.entries[0]?.staff_profile,
              user: { first_name: 'O"Brien', last_name: 'Test' },
            },
          },
        ],
      };
      prisma.payrollRun.findFirst = jest.fn().mockResolvedValue(runWithQuotes);

      const templateWithNotes = {
        ...mockTemplate,
        columns_json: [
          { field: 'staff_name', header: 'Name' },
          { field: 'notes', header: 'Notes' },
        ],
      };
      prisma.payrollExportTemplate.findFirst.mockResolvedValue(templateWithNotes);

      const result = await service.generateExport(TENANT_ID, RUN_ID, USER_ID, {
        template_id: TEMPLATE_ID,
      });

      // CSV should escape double quotes as ""
      expect(result.content).toContain('""quotes""');
    });
  });

  describe('getExportHistory', () => {
    it('should throw NotFoundException when run not found', async () => {
      prisma.payrollRun.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.getExportHistory(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should paginate export history', async () => {
      await service.getExportHistory(TENANT_ID, RUN_ID, 2, 10);

      expect(prisma.payrollExportLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  describe('emailToAccountant', () => {
    it('should succeed when accountant email is configured', async () => {
      const result = await service.emailToAccountant(TENANT_ID, RUN_ID, USER_ID, {});

      expect(result.sent_to).toBe('accountant@school.ie');
      expect(result.file_name).toContain('.csv');
      expect(result.row_count).toBe(1);
    });

    it('should throw when payroll settings has no email', async () => {
      settingsService.getSettings.mockResolvedValue({ payroll: {} });

      await expect(service.emailToAccountant(TENANT_ID, RUN_ID, USER_ID, {})).rejects.toThrow(
        BadRequestException,
      );

      await expect(service.emailToAccountant(TENANT_ID, RUN_ID, USER_ID, {})).rejects.toMatchObject(
        {
          response: expect.objectContaining({ code: 'NO_ACCOUNTANT_EMAIL' }),
        },
      );
    });

    it('should throw when email is not a string', async () => {
      settingsService.getSettings.mockResolvedValue({
        payroll: { payrollAccountantEmail: 123 },
      });

      await expect(service.emailToAccountant(TENANT_ID, RUN_ID, USER_ID, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle settings service throwing an error gracefully', async () => {
      settingsService.getSettings.mockRejectedValue(new Error('DB error'));

      await expect(service.emailToAccountant(TENANT_ID, RUN_ID, USER_ID, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle when payroll key is missing from settings', async () => {
      settingsService.getSettings.mockResolvedValue({});

      await expect(service.emailToAccountant(TENANT_ID, RUN_ID, USER_ID, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should pass template_id to generateExport when provided', async () => {
      const result = await service.emailToAccountant(TENANT_ID, RUN_ID, USER_ID, {
        template_id: TEMPLATE_ID,
      });

      expect(result.sent_to).toBe('accountant@school.ie');
    });
  });
});
