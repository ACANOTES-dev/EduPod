/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import { PermissionsController } from './permissions.controller';
import { RolesService } from './roles.service';

function buildMockRolesService() {
  return {
    listPermissions: jest.fn(),
  };
}

describe('PermissionsController', () => {
  let controller: PermissionsController;
  let service: ReturnType<typeof buildMockRolesService>;

  beforeEach(async () => {
    service = buildMockRolesService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermissionsController],
      providers: [{ provide: RolesService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(
        require('../../common/guards/permission.guard').PermissionGuard,
      )
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PermissionsController>(PermissionsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call listPermissions without tier when no query param', async () => {
    const expected = { data: [], grouped: {} };
    service.listPermissions.mockResolvedValue(expected);

    const result = await controller.listPermissions();

    expect(service.listPermissions).toHaveBeenCalledWith(undefined);
    expect(result).toBe(expected);
  });

  it('should call listPermissions with valid tier', async () => {
    const expected = {
      data: [
        { id: 'p1', key: 'users.view', description: 'View users', tier: 'staff' },
      ],
      grouped: { users: [{ id: 'p1', key: 'users.view', description: 'View users', tier: 'staff' }] },
    };
    service.listPermissions.mockResolvedValue(expected);

    const result = await controller.listPermissions('staff');

    expect(service.listPermissions).toHaveBeenCalledWith('staff');
    expect(result).toBe(expected);
  });

  it('should pass undefined for invalid tier value', async () => {
    const expected = { data: [], grouped: {} };
    service.listPermissions.mockResolvedValue(expected);

    const result = await controller.listPermissions('invalid_tier');

    expect(service.listPermissions).toHaveBeenCalledWith(undefined);
    expect(result).toBe(expected);
  });

  it('should accept all valid tier values', async () => {
    service.listPermissions.mockResolvedValue({ data: [], grouped: {} });

    for (const tier of ['platform', 'admin', 'staff', 'parent']) {
      await controller.listPermissions(tier);
      expect(service.listPermissions).toHaveBeenCalledWith(tier);
    }

    expect(service.listPermissions).toHaveBeenCalledTimes(4);
  });
});
