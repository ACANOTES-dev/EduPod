import { Test, TestingModule } from '@nestjs/testing';
import type { TenantContext } from '@school/shared';

import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { PeriodGridController } from './period-grid.controller';
import { PeriodGridService } from './period-grid.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACADEMIC_YEAR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const YEAR_GROUP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PERIOD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const mockTenant: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

describe('PeriodGridController', () => {
  let controller: PeriodGridController;
  let mockService: {
    findAll: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    getTeachingCount: jest.Mock;
    copyDay: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: PERIOD_ID }),
      update: jest.fn().mockResolvedValue({ id: PERIOD_ID }),
      delete: jest.fn().mockResolvedValue(undefined),
      getTeachingCount: jest.fn().mockResolvedValue(25),
      copyDay: jest.fn().mockResolvedValue({ created: [], skipped: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PeriodGridController],
      providers: [
        { provide: PeriodGridService, useValue: mockService },
        { provide: PermissionCacheService, useValue: { getPermissions: jest.fn() } },
      ],
    }).compile();

    controller = module.get<PeriodGridController>(PeriodGridController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call findAll with tenant and academic year id', async () => {
    const tenant = mockTenant;
    const query = { academic_year_id: ACADEMIC_YEAR_ID };

    await controller.findAll(tenant, query);

    expect(mockService.findAll).toHaveBeenCalledWith(TENANT_ID, ACADEMIC_YEAR_ID);
  });

  it('should call create with tenant and dto', async () => {
    const tenant = mockTenant;
    const dto = {
      academic_year_id: ACADEMIC_YEAR_ID,
      year_group_id: YEAR_GROUP_ID,
      weekday: 1,
      period_name: 'Period 1',
      period_order: 1,
      start_time: '08:00',
      end_time: '08:45',
      schedule_period_type: 'teaching' as const,
    };

    await controller.create(tenant, dto);

    expect(mockService.create).toHaveBeenCalledWith(TENANT_ID, dto);
  });

  it('should call update with tenant, id, and dto', async () => {
    const tenant = mockTenant;
    const dto = { period_name: 'Updated Period' };

    await controller.update(tenant, PERIOD_ID, dto);

    expect(mockService.update).toHaveBeenCalledWith(TENANT_ID, PERIOD_ID, dto);
  });

  it('should call remove with tenant and id', async () => {
    const tenant = mockTenant;

    await controller.remove(tenant, PERIOD_ID);

    expect(mockService.delete).toHaveBeenCalledWith(TENANT_ID, PERIOD_ID);
  });

  it('should return teaching count wrapped in object', async () => {
    const tenant = mockTenant;
    const query = { academic_year_id: ACADEMIC_YEAR_ID };

    const result = await controller.getTeachingCount(tenant, query);

    expect(result).toEqual({ total_teaching_periods: 25 });
    expect(mockService.getTeachingCount).toHaveBeenCalledWith(TENANT_ID, ACADEMIC_YEAR_ID, undefined);
  });

  it('should call copyDay with tenant and dto', async () => {
    const tenant = mockTenant;
    const dto = {
      academic_year_id: ACADEMIC_YEAR_ID,
      year_group_id: YEAR_GROUP_ID,
      source_weekday: 1,
      target_weekdays: [2, 3],
    };

    await controller.copyDay(tenant, dto);

    expect(mockService.copyDay).toHaveBeenCalledWith(TENANT_ID, dto);
  });
});
