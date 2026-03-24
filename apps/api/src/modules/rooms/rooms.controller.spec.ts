import { Test, TestingModule } from '@nestjs/testing';
import type { TenantContext } from '@school/shared';

import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ROOM_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const mockTenant: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

describe('RoomsController', () => {
  let controller: RoomsController;
  let mockService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      create: jest.fn().mockResolvedValue({ id: ROOM_ID, name: 'Room A' }),
      findAll: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }),
      findOne: jest.fn().mockResolvedValue({ id: ROOM_ID, name: 'Room A' }),
      update: jest.fn().mockResolvedValue({ id: ROOM_ID }),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoomsController],
      providers: [
        { provide: RoomsService, useValue: mockService },
        { provide: PermissionCacheService, useValue: { getPermissions: jest.fn() } },
      ],
    }).compile();

    controller = module.get<RoomsController>(RoomsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call create with tenant and dto', async () => {
    const tenant = mockTenant;
    const dto = { name: 'Room A', room_type: 'classroom' as const, is_exclusive: true };

    await controller.create(tenant, dto);

    expect(mockService.create).toHaveBeenCalledWith(TENANT_ID, dto);
  });

  it('should call findAll with tenant and query parameters', async () => {
    const tenant = mockTenant;
    const query = { page: 1, pageSize: 20, active: true, room_type: 'lab' };

    await controller.findAll(tenant, query);

    expect(mockService.findAll).toHaveBeenCalledWith(TENANT_ID, {
      page: 1,
      pageSize: 20,
      active: true,
      room_type: 'lab',
    });
  });

  it('should call findOne with tenant and room id', async () => {
    const tenant = mockTenant;

    await controller.findOne(tenant, ROOM_ID);

    expect(mockService.findOne).toHaveBeenCalledWith(TENANT_ID, ROOM_ID);
  });

  it('should call update with tenant, room id, and dto', async () => {
    const tenant = mockTenant;
    const dto = { name: 'Updated Room' };

    await controller.update(tenant, ROOM_ID, dto);

    expect(mockService.update).toHaveBeenCalledWith(TENANT_ID, ROOM_ID, dto);
  });

  it('should call remove with tenant and room id', async () => {
    const tenant = mockTenant;

    await controller.remove(tenant, ROOM_ID);

    expect(mockService.remove).toHaveBeenCalledWith(TENANT_ID, ROOM_ID);
  });
});
