import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { ComplianceReportService } from './compliance-report.service';
import { ReportsDataAccessService } from './reports-data-access.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEMPLATE_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const MOCK_TEMPLATE_DB = {
  id: TEMPLATE_ID,
  tenant_id: TENANT_ID,
  name: 'Ireland DES Report',
  country_code: 'IE',
  fields_json: [
    { key: 'active_student_count', label: 'Active Students', data_type: 'number' },
    { key: 'active_staff_count', label: 'Active Staff', data_type: 'number' },
    { key: 'school_attendance_rate', label: 'Attendance Rate', data_type: 'percentage' },
    { key: 'special_needs_count', label: 'Special Needs', data_type: 'number' },
  ],
  created_at: new Date('2026-03-01'),
  updated_at: new Date('2026-03-01'),
};

const mockTx = {
  complianceReportTemplate: {
    findMany: jest.fn().mockResolvedValue([MOCK_TEMPLATE_DB]),
    findFirst: jest.fn().mockResolvedValue(MOCK_TEMPLATE_DB),
    create: jest.fn().mockResolvedValue(MOCK_TEMPLATE_DB),
    update: jest.fn().mockResolvedValue({ ...MOCK_TEMPLATE_DB, name: 'Updated Template' }),
    delete: jest.fn().mockResolvedValue(MOCK_TEMPLATE_DB),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

describe('ComplianceReportService', () => {
  let service: ComplianceReportService;
  let mockDataAccess: {
    countStudents: jest.Mock;
    countStaff: jest.Mock;
    groupAttendanceRecordsBy: jest.Mock;
  };

  beforeEach(async () => {
    mockTx.complianceReportTemplate.findMany.mockResolvedValue([MOCK_TEMPLATE_DB]);
    mockTx.complianceReportTemplate.findFirst.mockResolvedValue(MOCK_TEMPLATE_DB);
    mockTx.complianceReportTemplate.create.mockResolvedValue(MOCK_TEMPLATE_DB);
    mockTx.complianceReportTemplate.update.mockResolvedValue({
      ...MOCK_TEMPLATE_DB,
      name: 'Updated Template',
    });
    mockTx.complianceReportTemplate.delete.mockResolvedValue(MOCK_TEMPLATE_DB);

    mockDataAccess = {
      countStudents: jest.fn().mockResolvedValue(120),
      countStaff: jest.fn().mockResolvedValue(15),
      groupAttendanceRecordsBy: jest.fn().mockResolvedValue([
        { status: 'present', _count: 900 },
        { status: 'absent', _count: 100 },
      ]),
    };

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

  it('should return list of compliance templates', async () => {
    const result = await service.listTemplates(TENANT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(TEMPLATE_ID);
    expect(result[0]!.country_code).toBe('IE');
  });

  it('should map template DB record to ComplianceTemplateRow shape', async () => {
    const result = await service.listTemplates(TENANT_ID);
    const row = result[0]!;

    expect(typeof row.created_at).toBe('string');
    expect(typeof row.updated_at).toBe('string');
    expect(row.name).toBe('Ireland DES Report');
  });

  it('should return a specific template by id', async () => {
    const result = await service.getTemplate(TENANT_ID, TEMPLATE_ID);

    expect(result.id).toBe(TEMPLATE_ID);
  });

  it('should throw NotFoundException when template does not exist', async () => {
    mockTx.complianceReportTemplate.findFirst.mockResolvedValue(null);

    await expect(service.getTemplate(TENANT_ID, TEMPLATE_ID)).rejects.toThrow(NotFoundException);
  });

  it('should create a new compliance template', async () => {
    const dto = {
      name: 'Ireland DES Report',
      country_code: 'IE',
      fields_json: [{ key: 'active_student_count', label: 'Active Students', data_type: 'number' }],
    };

    const result = await service.createTemplate(TENANT_ID, dto);

    expect(result.id).toBe(TEMPLATE_ID);
    expect(mockTx.complianceReportTemplate.create).toHaveBeenCalled();
  });

  it('should throw NotFoundException when updating a non-existent template', async () => {
    mockTx.complianceReportTemplate.findFirst.mockResolvedValue(null);

    await expect(
      service.updateTemplate(TENANT_ID, TEMPLATE_ID, { name: 'New Name' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when deleting a non-existent template', async () => {
    mockTx.complianceReportTemplate.findFirst.mockResolvedValue(null);

    await expect(service.deleteTemplate(TENANT_ID, TEMPLATE_ID)).rejects.toThrow(NotFoundException);
  });

  it('should auto-populate known fields from live DB data', async () => {
    const result = await service.autoPopulate(TENANT_ID, TEMPLATE_ID);

    expect(result.template.id).toBe(TEMPLATE_ID);
    expect(result.data.active_student_count).toBe(120);
    expect(result.data.active_staff_count).toBe(15);
    expect(result.data.school_attendance_rate).toBeCloseTo(90, 0);
  });

  it('should list unknown fields as gaps in autoPopulate result', async () => {
    const result = await service.autoPopulate(TENANT_ID, TEMPLATE_ID);

    expect(result.gaps).toContain('special_needs_count');
  });

  it('should report 0% attendance rate when there are no attendance records', async () => {
    mockDataAccess.groupAttendanceRecordsBy.mockResolvedValue([]);

    const result = await service.autoPopulate(TENANT_ID, TEMPLATE_ID);

    expect(result.data.school_attendance_rate).toBe(0);
  });
});
