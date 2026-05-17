import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

import type { JwtPayload } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { PlatformUsersService } from '../platform-users/platform-users.service';

import { MaintenanceService } from './maintenance.service';
import { PlatformCacheService } from './platform-cache.service';
import { PlatformSessionService } from './platform-session.service';
import { PlatformSupportService } from './platform-support.service';
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
const mockRequest = { headers: {} } as Request;

describe('TenantsController', () => {
  let controller: TenantsController;
  let mockService: {
    createTenant: jest.Mock;
    listTenants: jest.Mock;
    getTenant: jest.Mock;
    updateTenant: jest.Mock;
    updateSupportedLocales: jest.Mock;
    suspendTenant: jest.Mock;
    reactivateTenant: jest.Mock;
    archiveTenant: jest.Mock;
    getDashboard: jest.Mock;
    impersonate: jest.Mock;
    resetUserMfa: jest.Mock;
    toggleModule: jest.Mock;
  };
  let mockSupportService: {
    disableUser: jest.Mock;
    enableUser: jest.Mock;
    getUser: jest.Mock;
    listAuditActions: jest.Mock;
    listUsers: jest.Mock;
    resendInvite: jest.Mock;
    resetPassword: jest.Mock;
    transferOwnership: jest.Mock;
    unlockAccount: jest.Mock;
  };
  let mockSessionService: {
    forceLogoutTenant: jest.Mock;
    forceLogoutUser: jest.Mock;
    listSessions: jest.Mock;
  };
  let mockCacheService: {
    flushCache: jest.Mock;
    getCacheStats: jest.Mock;
  };
  let mockMaintenanceService: {
    createMaintenanceWindow: jest.Mock;
    deleteMaintenanceWindow: jest.Mock;
    listMaintenanceWindows: jest.Mock;
    toggleMaintenanceMode: jest.Mock;
  };
  let mockPlatformUsersService: {
    hasPermission: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      createTenant: jest.fn(),
      listTenants: jest.fn(),
      getTenant: jest.fn(),
      updateTenant: jest.fn(),
      updateSupportedLocales: jest.fn(),
      suspendTenant: jest.fn(),
      reactivateTenant: jest.fn(),
      archiveTenant: jest.fn(),
      getDashboard: jest.fn(),
      impersonate: jest.fn(),
      resetUserMfa: jest.fn(),
      toggleModule: jest.fn(),
    };
    mockSupportService = {
      disableUser: jest.fn(),
      enableUser: jest.fn(),
      getUser: jest.fn(),
      listAuditActions: jest.fn(),
      listUsers: jest.fn(),
      resendInvite: jest.fn(),
      resetPassword: jest.fn(),
      transferOwnership: jest.fn(),
      unlockAccount: jest.fn(),
    };
    mockSessionService = {
      forceLogoutTenant: jest.fn(),
      forceLogoutUser: jest.fn(),
      listSessions: jest.fn(),
    };
    mockCacheService = {
      flushCache: jest.fn(),
      getCacheStats: jest.fn(),
    };
    mockMaintenanceService = {
      createMaintenanceWindow: jest.fn(),
      deleteMaintenanceWindow: jest.fn(),
      listMaintenanceWindows: jest.fn(),
      toggleMaintenanceMode: jest.fn(),
    };
    mockPlatformUsersService = {
      hasPermission: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantsController],
      providers: [
        { provide: TenantsService, useValue: mockService },
        { provide: PlatformSessionService, useValue: mockSessionService },
        { provide: PlatformCacheService, useValue: mockCacheService },
        { provide: MaintenanceService, useValue: mockMaintenanceService },
        { provide: PlatformSupportService, useValue: mockSupportService },
        { provide: PlatformUsersService, useValue: mockPlatformUsersService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue(alwaysAllowGuard)
      .overrideGuard(PlatformRoleGuard)
      .useValue(alwaysAllowGuard)
      .compile();

    controller = module.get<TenantsController>(TenantsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should delegate createTenant to the service', async () => {
    const dto = { name: 'Test School', slug: 'test-school' };
    const created = { id: TENANT_ID, ...dto };
    mockService.createTenant.mockResolvedValueOnce(created);

    const result = await controller.createTenant(dto as never, mockUser, mockRequest);
    expect(result).toEqual(created);
    expect(mockService.createTenant).toHaveBeenCalledWith(dto, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });

  it('should delegate listTenants with pagination and filters', async () => {
    const query = {
      page: 1,
      pageSize: 20,
      order: 'asc' as const,
      status: 'active' as const,
      search: undefined,
    };
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

    const result = await controller.updateTenant(TENANT_ID, dto as never, mockUser, mockRequest);
    expect(result).toEqual(updated);
    expect(mockService.updateTenant).toHaveBeenCalledWith(TENANT_ID, dto, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });

  it('should delegate supported locale updates to the service', async () => {
    const updated = { id: TENANT_ID, supported_locales: ['en', 'ar'] };
    mockService.updateSupportedLocales.mockResolvedValueOnce(updated);

    const result = await controller.updateSupportedLocales(
      TENANT_ID,
      {
        supported_locales: ['en', 'ar'],
      },
      mockUser,
      mockRequest,
    );

    expect(result).toEqual(updated);
    expect(mockService.updateSupportedLocales).toHaveBeenCalledWith(TENANT_ID, ['en', 'ar'], {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });

  it('should delegate suspendTenant to the service with actor user ID', async () => {
    mockService.suspendTenant.mockResolvedValueOnce({ id: TENANT_ID, status: 'suspended' });

    const result = await controller.suspendTenant(TENANT_ID, mockUser, mockRequest);
    expect(result).toEqual({ id: TENANT_ID, status: 'suspended' });
    expect(mockService.suspendTenant).toHaveBeenCalledWith(TENANT_ID, USER_ID, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });

  it('should delegate reactivateTenant to the service with actor user ID', async () => {
    mockService.reactivateTenant.mockResolvedValueOnce({ id: TENANT_ID, status: 'active' });

    const result = await controller.reactivateTenant(TENANT_ID, mockUser, mockRequest);
    expect(result).toEqual({ id: TENANT_ID, status: 'active' });
    expect(mockService.reactivateTenant).toHaveBeenCalledWith(TENANT_ID, USER_ID, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });

  it('should delegate archiveTenant to the service with actor user ID', async () => {
    mockService.archiveTenant.mockResolvedValueOnce({ id: TENANT_ID, status: 'archived' });

    const result = await controller.archiveTenant(TENANT_ID, mockUser, mockRequest);
    expect(result).toEqual({ id: TENANT_ID, status: 'archived' });
    expect(mockService.archiveTenant).toHaveBeenCalledWith(TENANT_ID, USER_ID, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });

  it('should delegate getDashboard to the service', async () => {
    const dashboard = { totalTenants: 5, activeTenants: 3 };
    mockService.getDashboard.mockResolvedValueOnce(dashboard);

    const result = await controller.getDashboard();
    expect(result).toEqual(dashboard);
    expect(mockService.getDashboard).toHaveBeenCalled();
  });

  it('should delegate session listing to the session service', async () => {
    const sessions = [{ tenant_id: TENANT_ID, tenant_name: 'School', sessions: [] }];
    mockSessionService.listSessions.mockResolvedValueOnce(sessions);

    const result = await controller.listSessions();
    expect(result).toEqual(sessions);
    expect(mockSessionService.listSessions).toHaveBeenCalledTimes(1);
  });

  it('should delegate tenant force logout with audit context', async () => {
    mockSessionService.forceLogoutTenant.mockResolvedValueOnce({ logged_out: 2 });

    const result = await controller.forceLogoutTenant(TENANT_ID, mockUser, mockRequest);
    expect(result).toEqual({ logged_out: 2 });
    expect(mockSessionService.forceLogoutTenant).toHaveBeenCalledWith(TENANT_ID, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });

  it('should delegate user force logout with audit context', async () => {
    mockSessionService.forceLogoutUser.mockResolvedValueOnce({ logged_out: 1 });

    const result = await controller.forceLogoutUser(USER_ID, mockUser, mockRequest);
    expect(result).toEqual({ logged_out: 1 });
    expect(mockSessionService.forceLogoutUser).toHaveBeenCalledWith(USER_ID, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });

  it('should delegate cache stats and flush controls', async () => {
    const stats = [{ cache_type: 'permissions', key_count: 2 }];
    mockCacheService.getCacheStats.mockResolvedValueOnce(stats);
    mockCacheService.flushCache.mockResolvedValueOnce({ keys_deleted: 2 });

    await expect(controller.getCacheStats()).resolves.toEqual(stats);
    const result = await controller.flushCache(
      { cache_type: 'permissions', tenant_id: TENANT_ID },
      mockUser,
      mockRequest,
    );
    expect(result).toEqual({ keys_deleted: 2 });
    expect(mockCacheService.flushCache).toHaveBeenCalledWith(
      { cache_type: 'permissions', tenant_id: TENANT_ID },
      {
        actor_user_id: USER_ID,
        ip_address: undefined,
        user_agent: undefined,
      },
    );
    expect(mockPlatformUsersService.hasPermission).not.toHaveBeenCalled();
  });

  it('should require global cache permission for global flushes', async () => {
    mockPlatformUsersService.hasPermission.mockResolvedValueOnce(true);
    mockCacheService.flushCache.mockResolvedValueOnce({ keys_deleted: 4 });

    const result = await controller.flushCache({ cache_type: 'all' }, mockUser, mockRequest);

    expect(result).toEqual({ keys_deleted: 4 });
    expect(mockPlatformUsersService.hasPermission).toHaveBeenCalledWith(
      USER_ID,
      'platform.cache.flush_global',
    );
  });

  it('should deny global cache flushes without global permission', async () => {
    mockPlatformUsersService.hasPermission.mockResolvedValueOnce(false);

    await expect(
      controller.flushCache({ cache_type: 'all' }, mockUser, mockRequest),
    ).rejects.toMatchObject({
      response: {
        code: 'PLATFORM_PERMISSION_DENIED',
        permission: 'platform.cache.flush_global',
      },
    });
    expect(mockCacheService.flushCache).not.toHaveBeenCalled();
  });

  it('should delegate maintenance controls', async () => {
    const updatedTenant = { id: TENANT_ID, maintenance_mode: true };
    mockMaintenanceService.toggleMaintenanceMode.mockResolvedValueOnce(updatedTenant);
    mockMaintenanceService.listMaintenanceWindows.mockResolvedValueOnce([]);
    mockMaintenanceService.createMaintenanceWindow.mockResolvedValueOnce({ id: 'window-1' });
    mockMaintenanceService.deleteMaintenanceWindow.mockResolvedValueOnce({ deleted: true });

    await expect(
      controller.toggleMaintenance(
        TENANT_ID,
        { enabled: true, message: 'Brief maintenance' },
        mockUser,
        mockRequest,
      ),
    ).resolves.toEqual(updatedTenant);
    expect(mockMaintenanceService.toggleMaintenanceMode).toHaveBeenCalledWith(
      TENANT_ID,
      true,
      'Brief maintenance',
      {
        actor_user_id: USER_ID,
        ip_address: undefined,
        user_agent: undefined,
      },
    );

    await expect(controller.listMaintenanceWindows({ tenant_id: TENANT_ID })).resolves.toEqual([]);
    expect(mockMaintenanceService.listMaintenanceWindows).toHaveBeenCalledWith(TENANT_ID);

    const dto = {
      tenant_id: TENANT_ID,
      starts_at: new Date('2030-01-01T10:00:00.000Z'),
      ends_at: new Date('2030-01-01T11:00:00.000Z'),
      message: 'Scheduled work',
    };
    await expect(controller.createMaintenanceWindow(dto, mockUser, mockRequest)).resolves.toEqual({
      id: 'window-1',
    });
    expect(mockMaintenanceService.createMaintenanceWindow).toHaveBeenCalledWith(dto, USER_ID, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });

    await expect(
      controller.deleteMaintenanceWindow(TENANT_ID, mockUser, mockRequest),
    ).resolves.toEqual({
      deleted: true,
    });
  });

  it('should delegate impersonate with correct params', async () => {
    const dto = { tenant_id: TENANT_ID, user_id: USER_ID };
    const token = { access_token: 'mock-token' };
    mockService.impersonate.mockResolvedValueOnce(token);

    const result = await controller.impersonate(dto, mockUser, mockRequest);
    expect(result).toEqual(token);
    expect(mockService.impersonate).toHaveBeenCalledWith(TENANT_ID, USER_ID, mockUser.sub, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });

  it('should delegate resetUserMfa to the service', async () => {
    mockService.resetUserMfa.mockResolvedValueOnce({ success: true });

    const result = await controller.resetUserMfa(USER_ID, mockUser, mockRequest);
    expect(result).toEqual({ success: true });
    expect(mockService.resetUserMfa).toHaveBeenCalledWith(USER_ID, mockUser.sub, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });

  it('should delegate listUsers to the support service', async () => {
    const response = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    const query = { page: 1, pageSize: 20, order: 'desc' as const };
    mockSupportService.listUsers.mockResolvedValueOnce(response);

    const result = await controller.listUsers(query);
    expect(result).toEqual(response);
    expect(mockSupportService.listUsers).toHaveBeenCalledWith(query);
  });

  it('should delegate getUser to the support service', async () => {
    const response = { id: USER_ID, email: 'user@example.com' };
    mockSupportService.getUser.mockResolvedValueOnce(response);

    const result = await controller.getUser(USER_ID);
    expect(result).toEqual(response);
    expect(mockSupportService.getUser).toHaveBeenCalledWith(USER_ID);
  });

  it('should delegate resetUserPassword to the support service', async () => {
    mockSupportService.resetPassword.mockResolvedValueOnce({ message: 'ok' });

    const result = await controller.resetUserPassword(USER_ID, mockUser, mockRequest);
    expect(result).toEqual({ message: 'ok' });
    expect(mockSupportService.resetPassword).toHaveBeenCalledWith(USER_ID, USER_ID, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });

  it('should delegate resendUserInvite to the support service', async () => {
    mockSupportService.resendInvite.mockResolvedValueOnce({ message: 'ok' });

    const result = await controller.resendUserInvite(USER_ID, mockUser, mockRequest);
    expect(result).toEqual({ message: 'ok' });
    expect(mockSupportService.resendInvite).toHaveBeenCalledWith(USER_ID, USER_ID, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });

  it('should delegate unlockUser to the support service', async () => {
    mockSupportService.unlockAccount.mockResolvedValueOnce({ message: 'ok' });

    const result = await controller.unlockUser(USER_ID, mockUser, mockRequest);
    expect(result).toEqual({ message: 'ok' });
    expect(mockSupportService.unlockAccount).toHaveBeenCalledWith(USER_ID, USER_ID, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });

  it('should delegate disableUser to the support service', async () => {
    mockSupportService.disableUser.mockResolvedValueOnce({ message: 'ok' });

    const result = await controller.disableUser(USER_ID, mockUser, mockRequest);
    expect(result).toEqual({ message: 'ok' });
    expect(mockSupportService.disableUser).toHaveBeenCalledWith(USER_ID, USER_ID, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });

  it('should delegate enableUser to the support service', async () => {
    mockSupportService.enableUser.mockResolvedValueOnce({ message: 'ok' });

    const result = await controller.enableUser(USER_ID, mockUser, mockRequest);
    expect(result).toEqual({ message: 'ok' });
    expect(mockSupportService.enableUser).toHaveBeenCalledWith(USER_ID, USER_ID, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });

  it('should delegate transferOwnership to the support service', async () => {
    mockSupportService.transferOwnership.mockResolvedValueOnce({ message: 'ok' });

    const result = await controller.transferOwnership(
      TENANT_ID,
      { new_owner_user_id: USER_ID },
      mockUser,
      mockRequest,
    );
    expect(result).toEqual({ message: 'ok' });
    expect(mockSupportService.transferOwnership).toHaveBeenCalledWith(TENANT_ID, USER_ID, USER_ID, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });

  it('should delegate listAuditActions to the support service', async () => {
    const response = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    const query = { page: 1, pageSize: 20, order: 'desc' as const };
    mockSupportService.listAuditActions.mockResolvedValueOnce(response);

    const result = await controller.listAuditActions(query);
    expect(result).toEqual(response);
    expect(mockSupportService.listAuditActions).toHaveBeenCalledWith(query);
  });

  it('should delegate toggleModule to the service with actor user ID', async () => {
    const updated = { key: 'finance', is_enabled: false };
    mockService.toggleModule.mockResolvedValueOnce(updated);

    const result = await controller.toggleModule(TENANT_ID, 'finance', mockUser, mockRequest, {
      is_enabled: false,
    });
    expect(result).toEqual(updated);
    expect(mockService.toggleModule).toHaveBeenCalledWith(TENANT_ID, 'finance', false, USER_ID, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });
});
