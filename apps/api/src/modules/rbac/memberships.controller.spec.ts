/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext, UpdateMembershipRolesDto, UserListQuery } from '@school/shared';

import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const mockTenant: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

function buildMockMembershipsService() {
  return {
    listUsers: jest.fn(),
    getUser: jest.fn(),
    updateMembershipRoles: jest.fn(),
    suspendMembership: jest.fn(),
    reactivateMembership: jest.fn(),
  };
}

describe('MembershipsController', () => {
  let controller: MembershipsController;
  let service: ReturnType<typeof buildMockMembershipsService>;

  beforeEach(async () => {
    service = buildMockMembershipsService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MembershipsController],
      providers: [{ provide: MembershipsService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MembershipsController>(MembershipsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call listUsers with tenant_id and query', async () => {
    const query: UserListQuery = { page: 1, pageSize: 20 };
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    service.listUsers.mockResolvedValue(expected);

    const result = await controller.listUsers(mockTenant, query);

    expect(service.listUsers).toHaveBeenCalledWith(TENANT_ID, query);
    expect(result).toBe(expected);
  });

  it('should call getUser with tenant_id and user id', async () => {
    const expected = {
      id: 'mem-1',
      user_id: USER_ID,
      membership_status: 'active',
    };
    service.getUser.mockResolvedValue(expected);

    const result = await controller.getUser(mockTenant, USER_ID);

    expect(service.getUser).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    expect(result).toBe(expected);
  });

  it('should call updateMembershipRoles with tenant_id, user id, and role_ids', async () => {
    const roleIds = ['role-1', 'role-2'];
    const dto: UpdateMembershipRolesDto = { role_ids: roleIds };
    const expected = { id: 'mem-1', membership_roles: [] };
    service.updateMembershipRoles.mockResolvedValue(expected);

    const result = await controller.updateMembershipRoles(mockTenant, USER_ID, dto);

    expect(service.updateMembershipRoles).toHaveBeenCalledWith(TENANT_ID, USER_ID, roleIds);
    expect(result).toBe(expected);
  });

  it('should call suspendMembership with tenant_id and user id', async () => {
    const expected = {
      id: 'mem-1',
      membership_status: 'suspended',
    };
    service.suspendMembership.mockResolvedValue(expected);

    const result = await controller.suspendMembership(mockTenant, USER_ID);

    expect(service.suspendMembership).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    expect(result).toBe(expected);
  });

  it('should call reactivateMembership with tenant_id and user id', async () => {
    const expected = {
      id: 'mem-1',
      membership_status: 'active',
    };
    service.reactivateMembership.mockResolvedValue(expected);

    const result = await controller.reactivateMembership(mockTenant, USER_ID);

    expect(service.reactivateMembership).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    expect(result).toBe(expected);
  });

  it('should return service result unchanged for listUsers', async () => {
    const expected = {
      data: [
        {
          id: 'mem-1',
          user: { id: USER_ID, email: 'a@b.com', first_name: 'A', last_name: 'B' },
        },
      ],
      meta: { page: 1, pageSize: 10, total: 1 },
    };
    service.listUsers.mockResolvedValue(expected);

    const result = await controller.listUsers(mockTenant, {
      page: 1,
      pageSize: 10,
    });

    expect(result).toBe(expected);
  });
});
