import { Test, TestingModule } from '@nestjs/testing';

import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const tenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active' as const,
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const ACADEMIC_YEAR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const HOUSEHOLD_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const mockReportsService = {
  promotionRollover: jest.fn(),
  feeGenerationRuns: jest.fn(),
  writeOffs: jest.fn(),
  notificationDelivery: jest.fn(),
  studentExportPack: jest.fn(),
  householdExportPack: jest.fn(),
};

describe('ReportsController', () => {
  let controller: ReportsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [{ provide: ReportsService, useValue: mockReportsService }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReportsController>(ReportsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call reportsService.promotionRollover with correct args', async () => {
    const expected = { promoted: 50, held_back: 5, graduated: 10, withdrawn: 2, details: [] };
    mockReportsService.promotionRollover.mockResolvedValue(expected);

    const result = await controller.promotionRollover(tenantContext, {
      academic_year_id: ACADEMIC_YEAR_ID,
    });

    expect(mockReportsService.promotionRollover).toHaveBeenCalledWith(
      TENANT_ID,
      ACADEMIC_YEAR_ID,
    );
    expect(result).toEqual(expected);
  });

  it('should call reportsService.feeGenerationRuns with pagination args', async () => {
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockReportsService.feeGenerationRuns.mockResolvedValue(expected);

    const result = await controller.feeGenerationRuns(tenantContext, {
      academic_year_id: ACADEMIC_YEAR_ID,
      page: 1,
      pageSize: 20,
    });

    expect(mockReportsService.feeGenerationRuns).toHaveBeenCalledWith(TENANT_ID, {
      academic_year_id: ACADEMIC_YEAR_ID,
      page: 1,
      pageSize: 20,
    });
    expect(result).toEqual(expected);
  });

  it('should call reportsService.writeOffs with date filter args', async () => {
    const expected = {
      data: { entries: [], totals: { total_written_off: 0, total_discounts: 0 } },
      meta: { page: 1, pageSize: 20, total: 0 },
    };
    mockReportsService.writeOffs.mockResolvedValue(expected);

    const result = await controller.writeOffs(tenantContext, {
      start_date: '2026-01-01',
      end_date: '2026-03-31',
      page: 1,
      pageSize: 20,
    });

    expect(mockReportsService.writeOffs).toHaveBeenCalledWith(TENANT_ID, {
      start_date: '2026-01-01',
      end_date: '2026-03-31',
      page: 1,
      pageSize: 20,
    });
    expect(result).toEqual(expected);
  });

  it('should call reportsService.notificationDelivery and return summary', async () => {
    const expected = {
      total_sent: 100,
      total_delivered: 95,
      total_failed: 5,
      by_channel: [],
      by_template: [],
      failure_reasons: [],
    };
    mockReportsService.notificationDelivery.mockResolvedValue(expected);

    const result = await controller.notificationDelivery(tenantContext, {
      start_date: '2026-01-01',
      end_date: '2026-03-31',
      page: 1,
      pageSize: 20,
    });

    expect(mockReportsService.notificationDelivery).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ start_date: '2026-01-01' }),
    );
    expect(result).toEqual(expected);
  });

  it('should call reportsService.studentExportPack with student id', async () => {
    const expected = {
      subject_type: 'student',
      subject_id: STUDENT_ID,
      exported_at: '2026-03-24T00:00:00.000Z',
      sections: [],
    };
    mockReportsService.studentExportPack.mockResolvedValue(expected);

    const result = await controller.studentExportPack(tenantContext, STUDENT_ID);

    expect(mockReportsService.studentExportPack).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID);
    expect(result).toEqual(expected);
  });

  it('should call reportsService.householdExportPack with household id', async () => {
    const expected = {
      subject_type: 'household',
      subject_id: HOUSEHOLD_ID,
      exported_at: '2026-03-24T00:00:00.000Z',
      sections: [],
    };
    mockReportsService.householdExportPack.mockResolvedValue(expected);

    const result = await controller.householdExportPack(tenantContext, HOUSEHOLD_ID);

    expect(mockReportsService.householdExportPack).toHaveBeenCalledWith(TENANT_ID, HOUSEHOLD_ID);
    expect(result).toEqual(expected);
  });
});
