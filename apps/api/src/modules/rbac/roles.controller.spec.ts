/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type {
  AssignPermissionsDto,
  CreateRoleDto,
  JwtPayload,
  TenantContext,
  UpdateRoleDto,
} from '@school/shared';

import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ROLE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const mockUser: JwtPayload = {
  sub: USER_ID,
  email: 'admin@school.com',
  tenant_id: TENANT_ID,
  membership_id: 'mem-1',
  type: 'access',
  iat: 1000000,
  exp: 2000000,
};

const mockTenant: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

function buildMockRolesService() {
  return {
    listRoles: jest.fn(),
    createRole: jest.fn(),
    getRole: jest.fn(),
    updateRole: jest.fn(),
    deleteRole: jest.fn(),
    assignPermissions: jest.fn(),
    listPermissions: jest.fn(),
  };
}

describe('RolesController', () => {
  let controller: RolesController;
  let service: ReturnType<typeof buildMockRolesService>;

  beforeEach(async () => {
    service = buildMockRolesService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesController],
      providers: [{ provide: RolesService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RolesController>(RolesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call listRoles with tenant_id and return service result', async () => {
    const expected = { data: [{ id: ROLE_ID, display_name: 'Teacher' }] };
    service.listRoles.mockResolvedValue(expected);

    const result = await controller.listRoles(mockTenant);

    expect(service.listRoles).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toBe(expected);
  });

  it('should call createRole with tenant_id, dto, and actor user ID', async () => {
    const dto: CreateRoleDto = {
      role_key: 'custom_teacher',
      display_name: 'Custom Teacher',
      role_tier: 'staff',
      permission_ids: [],
    };
    const expected = { id: ROLE_ID, ...dto };
    service.createRole.mockResolvedValue(expected);

    const result = await controller.createRole(mockTenant, mockUser, dto);

    expect(service.createRole).toHaveBeenCalledWith(TENANT_ID, dto, USER_ID);
    expect(result).toBe(expected);
  });

  it('should call getRole with tenant_id and id', async () => {
    const expected = { id: ROLE_ID, display_name: 'Admin' };
    service.getRole.mockResolvedValue(expected);

    const result = await controller.getRole(mockTenant, ROLE_ID);

    expect(service.getRole).toHaveBeenCalledWith(TENANT_ID, ROLE_ID);
    expect(result).toBe(expected);
  });

  it('should call updateRole with tenant_id, id, dto, and actor user ID', async () => {
    const dto: UpdateRoleDto = { display_name: 'Updated Name' };
    const expected = { id: ROLE_ID, display_name: 'Updated Name' };
    service.updateRole.mockResolvedValue(expected);

    const result = await controller.updateRole(mockTenant, mockUser, ROLE_ID, dto);

    expect(service.updateRole).toHaveBeenCalledWith(TENANT_ID, ROLE_ID, dto, USER_ID);
    expect(result).toBe(expected);
  });

  it('should call deleteRole with tenant_id, id, and actor user ID', async () => {
    const expected = { deleted: true };
    service.deleteRole.mockResolvedValue(expected);

    const result = await controller.deleteRole(mockTenant, mockUser, ROLE_ID);

    expect(service.deleteRole).toHaveBeenCalledWith(TENANT_ID, ROLE_ID, USER_ID);
    expect(result).toBe(expected);
  });

  it('should call assignPermissions with tenant_id, id, permission_ids, and actor user ID', async () => {
    const permIds = ['perm-1', 'perm-2'];
    const dto: AssignPermissionsDto = { permission_ids: permIds };
    const expected = { id: ROLE_ID, role_permissions: [] };
    service.assignPermissions.mockResolvedValue(expected);

    const result = await controller.assignPermissions(mockTenant, mockUser, ROLE_ID, dto);

    expect(service.assignPermissions).toHaveBeenCalledWith(TENANT_ID, ROLE_ID, permIds, USER_ID);
    expect(result).toBe(expected);
  });
});
