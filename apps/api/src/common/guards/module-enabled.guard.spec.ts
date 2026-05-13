import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { MODULE_ENABLED_KEY } from '../decorators/module-enabled.decorator';
import { ModuleDisabledException } from '../exceptions/module-disabled.exception';
import { TenantModuleService } from '../services/tenant-module.service';

import { ModuleEnabledGuard } from './module-enabled.guard';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';

function createExecutionContext(request: Record<string, unknown> = {}): ExecutionContext {
  return {
    getArgs: () => [],
    getArgByIndex: () => undefined,
    getClass: () => class TestController {},
    getHandler: () => jest.fn(),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    switchToRpc: () => ({}) as never,
    switchToWs: () => ({}) as never,
    getType: () => 'http',
  } as never;
}

describe('ModuleEnabledGuard', () => {
  let guard: ModuleEnabledGuard;
  let reflector: Reflector;
  let getAllAndOverrideSpy: jest.SpyInstance;
  let mockTenantModuleService: { isEnabled: jest.Mock };

  beforeEach(() => {
    reflector = new Reflector();
    getAllAndOverrideSpy = jest.spyOn(reflector, 'getAllAndOverride');
    mockTenantModuleService = {
      isEnabled: jest.fn().mockResolvedValue(false),
    };

    guard = new ModuleEnabledGuard(
      reflector,
      mockTenantModuleService as unknown as TenantModuleService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('allows access when no module metadata is present', async () => {
    getAllAndOverrideSpy.mockReturnValue(undefined);

    const allowed = await guard.canActivate(createExecutionContext());

    expect(allowed).toBe(true);
    expect(mockTenantModuleService.isEnabled).not.toHaveBeenCalled();
  });

  it('allows access when the required module is enabled', async () => {
    getAllAndOverrideSpy.mockImplementation((key: string) =>
      key === MODULE_ENABLED_KEY ? 'pastoral' : undefined,
    );
    mockTenantModuleService.isEnabled.mockResolvedValue(true);

    const allowed = await guard.canActivate(
      createExecutionContext({ tenantContext: { tenant_id: TENANT_ID } }),
    );

    expect(allowed).toBe(true);
    expect(mockTenantModuleService.isEnabled).toHaveBeenCalledWith(TENANT_ID, 'pastoral');
  });

  it('throws MODULE_DISABLED as a 404 when the module row exists disabled', async () => {
    getAllAndOverrideSpy.mockReturnValue('pastoral');
    mockTenantModuleService.isEnabled.mockResolvedValue(false);

    await expect(
      guard.canActivate(createExecutionContext({ tenantContext: { tenant_id: TENANT_ID } })),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'MODULE_DISABLED',
          module: 'pastoral',
          message: 'This feature is disabled by your administrator.',
        },
      },
      status: 404,
    });
  });

  it('throws MODULE_DISABLED as a 404 when the module row is missing', async () => {
    getAllAndOverrideSpy.mockReturnValue('early_warning');
    mockTenantModuleService.isEnabled.mockResolvedValue(false);

    await expect(
      guard.canActivate(createExecutionContext({ tenantContext: { tenant_id: TENANT_ID } })),
    ).rejects.toBeInstanceOf(ModuleDisabledException);
  });

  it('keeps missing tenant context as a forbidden auth setup error', async () => {
    getAllAndOverrideSpy.mockReturnValue('pastoral');

    await expect(guard.canActivate(createExecutionContext())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
