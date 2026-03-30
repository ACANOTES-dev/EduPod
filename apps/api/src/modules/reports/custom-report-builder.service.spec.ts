import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { CustomReportBuilderService } from './custom-report-builder.service';
import { ReportsDataAccessService } from './reports-data-access.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const REPORT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const MOCK_REPORT_DB = {
  id: REPORT_ID,
  tenant_id: TENANT_ID,
  name: 'My Students Report',
  data_source: 'students',
  dimensions_json: ['first_name', 'last_name'],
  measures_json: ['count'],
  filters_json: {},
  chart_type: 'bar',
  is_shared: false,
  created_by_user_id: USER_ID,
  created_at: new Date('2026-03-01'),
  updated_at: new Date('2026-03-01'),
};

const mockTx = {
  savedReport: {
    findMany: jest.fn().mockResolvedValue([MOCK_REPORT_DB]),
    count: jest.fn().mockResolvedValue(1),
    findFirst: jest.fn().mockResolvedValue(MOCK_REPORT_DB),
    create: jest.fn().mockResolvedValue(MOCK_REPORT_DB),
    update: jest.fn().mockResolvedValue({ ...MOCK_REPORT_DB, name: 'Updated Report' }),
    delete: jest.fn().mockResolvedValue(MOCK_REPORT_DB),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

describe('CustomReportBuilderService', () => {
  let service: CustomReportBuilderService;
  let mockDataAccess: {
    findStudents: jest.Mock;
    countStudents: jest.Mock;
    findStaffProfiles: jest.Mock;
    countStaff: jest.Mock;
    findApplications: jest.Mock;
    countApplications: jest.Mock;
  };

  beforeEach(async () => {
    // Reset transaction mocks
    mockTx.savedReport.findMany.mockResolvedValue([MOCK_REPORT_DB]);
    mockTx.savedReport.count.mockResolvedValue(1);
    mockTx.savedReport.findFirst.mockResolvedValue(MOCK_REPORT_DB);
    mockTx.savedReport.create.mockResolvedValue(MOCK_REPORT_DB);
    mockTx.savedReport.update.mockResolvedValue({ ...MOCK_REPORT_DB, name: 'Updated Report' });
    mockTx.savedReport.delete.mockResolvedValue(MOCK_REPORT_DB);

    mockDataAccess = {
      findStudents: jest.fn().mockResolvedValue([]),
      countStudents: jest.fn().mockResolvedValue(0),
      findStaffProfiles: jest.fn().mockResolvedValue([]),
      countStaff: jest.fn().mockResolvedValue(0),
      findApplications: jest.fn().mockResolvedValue([]),
      countApplications: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomReportBuilderService,
        { provide: PrismaService, useValue: {} },
        { provide: ReportsDataAccessService, useValue: mockDataAccess },
      ],
    }).compile();

    service = module.get<CustomReportBuilderService>(CustomReportBuilderService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated list of saved reports', async () => {
    const result = await service.listSavedReports(TENANT_ID, USER_ID, true, 1, 20);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.id).toBe(REPORT_ID);
    expect(result.meta.total).toBe(1);
  });

  it('should map saved report DB record to SavedReportRow shape', async () => {
    const result = await service.listSavedReports(TENANT_ID, USER_ID, true, 1, 20);
    const row = result.data[0]!;

    expect(row.name).toBe('My Students Report');
    expect(row.data_source).toBe('students');
    expect(row.chart_type).toBe('bar');
    expect(row.is_shared).toBe(false);
    expect(typeof row.created_at).toBe('string');
    expect(typeof row.updated_at).toBe('string');
  });

  it('should return a single saved report by id', async () => {
    const result = await service.getSavedReport(TENANT_ID, REPORT_ID);

    expect(result.id).toBe(REPORT_ID);
    expect(result.name).toBe('My Students Report');
  });

  it('should throw NotFoundException when getting a non-existent report', async () => {
    mockTx.savedReport.findFirst.mockResolvedValue(null);

    await expect(service.getSavedReport(TENANT_ID, REPORT_ID)).rejects.toThrow(NotFoundException);
  });

  it('should create a saved report when name is unique', async () => {
    mockTx.savedReport.findFirst.mockResolvedValue(null); // No existing name
    mockTx.savedReport.create.mockResolvedValue(MOCK_REPORT_DB);

    const dto = {
      name: 'My Students Report',
      data_source: 'students' as const,
      dimensions_json: ['first_name'],
      measures_json: [{ field: 'id', aggregation: 'count' as const }],
      filters_json: {},
      is_shared: false,
    };

    const result = await service.createSavedReport(TENANT_ID, USER_ID, dto);

    expect(result.id).toBe(REPORT_ID);
    expect(mockTx.savedReport.create).toHaveBeenCalled();
  });

  it('should throw BadRequestException when creating a report with a duplicate name', async () => {
    mockTx.savedReport.findFirst.mockResolvedValue(MOCK_REPORT_DB); // Name exists

    const dto = {
      name: 'My Students Report',
      data_source: 'students' as const,
      dimensions_json: ['first_name'],
      measures_json: [{ field: 'id', aggregation: 'count' as const }],
      filters_json: {},
      is_shared: false,
    };

    await expect(service.createSavedReport(TENANT_ID, USER_ID, dto)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw NotFoundException when updating a non-existent report', async () => {
    mockTx.savedReport.findFirst.mockResolvedValue(null);

    await expect(
      service.updateSavedReport(TENANT_ID, REPORT_ID, { name: 'New Name' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when deleting a non-existent report', async () => {
    mockTx.savedReport.findFirst.mockResolvedValue(null);

    await expect(service.deleteSavedReport(TENANT_ID, REPORT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should execute students data source report and return paginated data', async () => {
    mockDataAccess.findStudents.mockResolvedValue([
      {
        id: 'stu-1',
        first_name: 'Alice',
        last_name: 'Smith',
        status: 'active',
        gender: 'female',
        nationality: 'IE',
      },
    ]);
    mockDataAccess.countStudents.mockResolvedValue(1);

    const result = await service.executeReport(TENANT_ID, REPORT_ID, 1, 20);

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });

  it('should execute staff data source report and return paginated data', async () => {
    mockTx.savedReport.findFirst.mockResolvedValue({ ...MOCK_REPORT_DB, data_source: 'staff' });
    mockDataAccess.findStaffProfiles.mockResolvedValue([
      {
        id: 'staff-1',
        job_title: 'Teacher',
        department: 'Science',
        employment_status: 'active',
        employment_type: 'full_time',
      },
    ]);
    mockDataAccess.countStaff.mockResolvedValue(1);

    const result = await service.executeReport(TENANT_ID, REPORT_ID, 1, 20);

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });

  it('should return empty data for unknown data source', async () => {
    mockTx.savedReport.findFirst.mockResolvedValue({
      ...MOCK_REPORT_DB,
      data_source: 'unknown_source',
    });

    const result = await service.executeReport(TENANT_ID, REPORT_ID, 1, 20);

    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(0);
  });
});
