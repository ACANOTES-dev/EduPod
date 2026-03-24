import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';

import { PlatformOwnerGuard } from './guards/platform-owner.guard';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID = '11111111-2222-3333-4444-555555555555';

const alwaysAllowGuard = { canActivate: () => true };

const mockUser: JwtPayload = {
  sub: USER_ID,
  email: 'admin@example.com',
  tenant_id: null,
  membership_id: null,
  type: 'access',
  iat: 0,
  exp: 0,
};

describe('TenantsController', () => {
  let controller: TenantsController;
  let mockService: {
    createTenant: jest.Mock;
    listTenants: jest.Mock;
    getTenant: jest.Mock;
    updateTenant: jest.Mock;
    suspendTenant: jest.Mock;
    reactivateTenant: jest.Mock;
    archiveTenant: jest.Mock;
    getDashboard: jest.Mock;
    impersonate: jest.Mock;
    resetUserMfa: jest.Mock;
    listModules: jest.Mock;
    toggleModule: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      createTenant: jest.fn(),
      listTenants: jest.fn(),
      getTenant: jest.fn(),
      updateTenant: jest.fn(),
      suspendTenant: jest.fn(),
      reactivateTenant: jest.fn(),
      archiveTenant: jest.fn(),
      getDashboard: jest.fn(),
      impersonate: jest.fn(),
      resetUserMfa: jest.fn(),
      listModules: jest.fn(),
      toggleModule: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantsController],
      providers: [{ provide: TenantsService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue(alwaysAllowGuard)
      .overrideGuard(PlatformOwnerGuard)
      .useValue(alwaysAllowGuard)
      .compile();

    controller = module.get<TenantsController>(TenantsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should delegate createTenant to the service', async () => {
    const dto = { name: 'Test School', slug: 'test-school' };
    const created = { id: TENANT_ID, ...dto };
    mockService.createTenant.mockResolvedValueOnce(created);

    const result = await controller.createTenant(dto as never);
    expect(result).toEqual(created);
    expect(mockService.createTenant).toHaveBeenCalledWith(dto);
  });

  it('should delegate listTenants with pagination and filters', async () => {
    const query = { page: 1, pageSize: 20, order: 'asc' as const, status: 'active' as const, search: undefined };
    const response = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockService.listTenants.mockResolvedValueOnce(response);

    const result = await controller.listTenants(query);
    expect(result).toEqual(response);
    expect(mockService.listTenants).toHaveBeenCalledWith(
      { page: 1, pageSize: 20, sort: undefined, order: 'asc' },
      { status: 'active', search: undefined },
    );
  });

  it('should delegate getTenant to the service', async () => {
    const tenant = { id: TENANT_ID, name: 'School' };
    mockService.getTenant.mockResolvedValueOnce(tenant);

    const result = await controller.getTenant(TENANT_ID);
    expect(result).toEqual(tenant);
    expect(mockService.getTenant).toHaveBeenCalledWith(TENANT_ID);
  });

  it('should delegate updateTenant to the service', async () => {
    const dto = { name: 'Updated School' };
    const updated = { id: TENANT_ID, name: 'Updated School' };
    mockService.updateTenant.mockResolvedValueOnce(updated);

    const result = await controller.updateTenant(TENANT_ID, dto as never);
    expect(result).toEqual(updated);
    expect(mockService.updateTenant).toHaveBeenCalledWith(TENANT_ID, dto);
  });

  it('should delegate suspendTenant to the service', async () => {
    mockService.suspendTenant.mockResolvedValueOnce({ id: TENANT_ID, status: 'suspended' });

    const result = await controller.suspendTenant(TENANT_ID);
    expect(result).toEqual({ id: TENANT_ID, status: 'suspended' });
    expect(mockService.suspendTenant).toHaveBeenCalledWith(TENANT_ID);
  });

  it('should delegate reactivateTenant to the service', async () => {
    mockService.reactivateTenant.mockResolvedValueOnce({ id: TENANT_ID, status: 'active' });

    const result = await controller.reactivateTenant(TENANT_ID);
    expect(result).toEqual({ id: TENANT_ID, status: 'active' });
    expect(mockService.reactivateTenant).toHaveBeenCalledWith(TENANT_ID);
  });

  it('should delegate archiveTenant to the service', async () => {
    mockService.archiveTenant.mockResolvedValueOnce({ id: TENANT_ID, status: 'archived' });

    const result = await controller.archiveTenant(TENANT_ID);
    expect(result).toEqual({ id: TENANT_ID, status: 'archived' });
    expect(mockService.archiveTenant).toHaveBeenCalledWith(TENANT_ID);
  });

  it('should delegate getDashboard to the service', async () => {
    const dashboard = { totalTenants: 5, activeTenants: 3 };
    mockService.getDashboard.mockResolvedValueOnce(dashboard);

    const result = await controller.getDashboard();
    expect(result).toEqual(dashboard);
    expect(mockService.getDashboard).toHaveBeenCalled();
  });

  it('should delegate impersonate with correct params', async () => {
    const dto = { tenant_id: TENANT_ID, user_id: USER_ID };
    const token = { access_token: 'mock-token' };
    mockService.impersonate.mockResolvedValueOnce(token);

    const result = await controller.impersonate(dto, mockUser);
    expect(result).toEqual(token);
    expect(mockService.impersonate).toHaveBeenCalledWith(TENANT_ID, USER_ID, mockUser.sub);
  });

  it('should delegate resetUserMfa to the service', async () => {
    mockService.resetUserMfa.mockResolvedValueOnce({ success: true });

    const result = await controller.resetUserMfa(USER_ID);
    expect(result).toEqual({ success: true });
    expect(mockService.resetUserMfa).toHaveBeenCalledWith(USER_ID);
  });

  it('should delegate listModules to the service', async () => {
    const modules = [{ key: 'finance', is_enabled: true }];
    mockService.listModules.mockResolvedValueOnce(modules);

    const result = await controller.listModules(TENANT_ID);
    expect(result).toEqual(modules);
    expect(mockService.listModules).toHaveBeenCalledWith(TENANT_ID);
  });

  it('should delegate toggleModule to the service', async () => {
    const updated = { key: 'finance', is_enabled: false };
    mockService.toggleModule.mockResolvedValueOnce(updated);

    const result = await controller.toggleModule(TENANT_ID, 'finance', { is_enabled: false });
    expect(result).toEqual(updated);
    expect(mockService.toggleModule).toHaveBeenCalledWith(TENANT_ID, 'finance', false);
  });
});
