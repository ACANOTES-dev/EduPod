import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload } from '@school/shared';

import { RoomClosuresController } from './room-closures.controller';
import { RoomClosuresService } from './room-closures.service';

import type { TenantContext } from '@school/shared';

const TENANT: TenantContext = {
  tenant_id: 'tenant-uuid',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const USER: JwtPayload = {
  sub: 'user-uuid',
  email: 'admin@example.com',
  tenant_id: 'tenant-uuid',
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};
const CLOSURE_ID = 'closure-uuid';

const mockService = {
  list: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
};

describe('RoomClosuresController', () => {
  let controller: RoomClosuresController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoomClosuresController],
      providers: [{ provide: RoomClosuresService, useValue: mockService }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<RoomClosuresController>(RoomClosuresController);
    jest.clearAllMocks();
  });

  it('should call service.list with tenant_id and query params', async () => {
    const mockResult = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockService.list.mockResolvedValue(mockResult);

    const query = { page: 1, pageSize: 20 };
    const result = await controller.list(TENANT, query);

    expect(mockService.list).toHaveBeenCalledWith('tenant-uuid', {
      page: 1,
      pageSize: 20,
      room_id: undefined,
      date_from: undefined,
      date_to: undefined,
    });
    expect(result).toEqual(mockResult);
  });

  it('should call service.create with tenant_id, user.sub, and dto', async () => {
    const dto = {
      room_id: 'room-uuid',
      date_from: '2025-01-15',
      date_to: '2025-01-20',
      reason: 'Renovation',
    };
    const created = { id: CLOSURE_ID, ...dto };
    mockService.create.mockResolvedValue(created);

    const result = await controller.create(TENANT, USER, dto);

    expect(mockService.create).toHaveBeenCalledWith(
      'tenant-uuid',
      'user-uuid',
      dto,
    );
    expect(result).toEqual(created);
  });

  it('should call service.delete with tenant_id and id', async () => {
    mockService.delete.mockResolvedValue({ success: true });

    const result = await controller.delete(TENANT, CLOSURE_ID);

    expect(mockService.delete).toHaveBeenCalledWith('tenant-uuid', CLOSURE_ID);
    expect(result).toEqual({ success: true });
  });
});
