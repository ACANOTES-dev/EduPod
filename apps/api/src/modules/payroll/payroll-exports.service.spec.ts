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
      notes: null,
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

  beforeEach(async () => {
    prisma = buildPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollExportsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: SettingsService,
          useValue: {
            getSettings: jest.fn().mockResolvedValue({
              payroll: { payrollAccountantEmail: 'accountant@school.ie' },
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PayrollExportsService>(PayrollExportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should list templates', async () => {
    const result = await service.listTemplates(TENANT_ID);
    expect(result.data).toHaveLength(1);
  });

  it('should throw NotFoundException for non-existent template', async () => {
    prisma.payrollExportTemplate.findFirst = jest.fn().mockResolvedValue(null);
    await expect(
      service.getTemplate(TENANT_ID, TEMPLATE_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should generate export and return CSV content', async () => {
    const result = await service.generateExport(TENANT_ID, RUN_ID, USER_ID, {});

    expect(result.content).toContain('Staff Name');
    expect(result.row_count).toBe(1);
    expect(result.file_name).toContain('.csv');
  });

  it('should throw BadRequestException when no accountant email configured', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollExportsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: SettingsService,
          useValue: {
            getSettings: jest.fn().mockResolvedValue({ payroll: {} }),
          },
        },
      ],
    }).compile();

    const svc = module.get<PayrollExportsService>(PayrollExportsService);

    await expect(
      svc.emailToAccountant(TENANT_ID, RUN_ID, USER_ID, {}),
    ).rejects.toThrow(BadRequestException);
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
});
