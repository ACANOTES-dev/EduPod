import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';

const TENANT_ID = 'tenant-uuid-1';
const USER_ID = 'user-uuid-1';
const SCHEDULE_ID = 'schedule-uuid-1';
const MEMBERSHIP_ID = 'membership-uuid-1';

const mockTenant: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const mockUser: JwtPayload = {
  sub: USER_ID,
  email: 'user@school.test',
  tenant_id: TENANT_ID,
  membership_id: MEMBERSHIP_ID,
  type: 'access',
  iat: 0,
  exp: 0,
};

describe('SchedulesController', () => {
  let controller: SchedulesController;
  let mockService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    pin: jest.Mock;
    unpin: jest.Mock;
    bulkPin: jest.Mock;
  };
  let mockPermissionCache: { getPermissions: jest.Mock };

  beforeEach(async () => {
    mockService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      pin: jest.fn(),
      unpin: jest.fn(),
      bulkPin: jest.fn(),
    };
    mockPermissionCache = {
      getPermissions: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchedulesController],
      providers: [
        { provide: SchedulesService, useValue: mockService },
        { provide: PermissionCacheService, useValue: mockPermissionCache },
      ],
    }).compile();

    controller = module.get<SchedulesController>(SchedulesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a schedule and return schedule directly when no conflicts', async () => {
    mockService.create.mockResolvedValue({
      schedule: { id: SCHEDULE_ID },
      conflicts: [],
    });

    const dto = {
      class_id: 'class-uuid-1',
      weekday: 1,
      start_time: '08:00',
      end_time: '09:00',
      effective_start_date: '2025-09-01',
    };

    const result = await controller.create(mockTenant, mockUser, dto);

    expect(result).toEqual({ id: SCHEDULE_ID });
    expect(mockPermissionCache.getPermissions).toHaveBeenCalledWith(MEMBERSHIP_ID);
  });

  it('should return schedule with conflict meta when conflicts exist', async () => {
    const conflicts = [{ type: 'soft', message: 'Gap warning' }];
    mockService.create.mockResolvedValue({
      schedule: { id: SCHEDULE_ID },
      conflicts,
    });

    const dto = {
      class_id: 'class-uuid-1',
      weekday: 1,
      start_time: '08:00',
      end_time: '09:00',
      effective_start_date: '2025-09-01',
    };

    const result = await controller.create(mockTenant, mockUser, dto);

    expect(result).toEqual({
      data: { id: SCHEDULE_ID },
      meta: { conflicts },
    });
  });

  it('should list schedules', async () => {
    const expected = {
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    };
    mockService.findAll.mockResolvedValue(expected);

    const result = await controller.findAll(mockTenant, {
      page: 1,
      pageSize: 20,
    });

    expect(result).toEqual(expected);
  });

  it('should get a single schedule', async () => {
    const expected = { id: SCHEDULE_ID };
    mockService.findOne.mockResolvedValue(expected);

    const result = await controller.findOne(mockTenant, SCHEDULE_ID);

    expect(result).toEqual(expected);
  });

  it('should delete a schedule', async () => {
    const expected = { action: 'deleted', message: 'Schedule deleted.' };
    mockService.remove.mockResolvedValue(expected);

    const result = await controller.remove(mockTenant, SCHEDULE_ID);

    expect(result).toEqual(expected);
  });

  it('should pin a schedule', async () => {
    const expected = { id: SCHEDULE_ID, is_pinned: true };
    mockService.pin.mockResolvedValue(expected);

    const result = await controller.pin(mockTenant, SCHEDULE_ID, {});

    expect(result).toEqual(expected);
  });

  it('should unpin a schedule', async () => {
    const expected = { id: SCHEDULE_ID, is_pinned: false };
    mockService.unpin.mockResolvedValue(expected);

    const result = await controller.unpin(mockTenant, SCHEDULE_ID);

    expect(result).toEqual(expected);
  });

  it('should return empty permissions when membership_id is missing', async () => {
    const userNoMembership = { ...mockUser, membership_id: undefined } as unknown as JwtPayload;
    mockService.create.mockResolvedValue({
      schedule: { id: SCHEDULE_ID },
      conflicts: [],
    });

    await controller.create(mockTenant, userNoMembership, {
      class_id: 'class-uuid-1',
      weekday: 1,
      start_time: '08:00',
      end_time: '09:00',
      effective_start_date: '2025-09-01',
    });

    expect(mockPermissionCache.getPermissions).not.toHaveBeenCalled();
  });
});
