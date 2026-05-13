import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { MODULE_ENABLED_KEY } from '../decorators/module-enabled.decorator';
import { ModuleDisabledException } from '../exceptions/module-disabled.exception';

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
  let mockRedisClient: { get: jest.Mock; setex: jest.Mock };
  let mockPrisma: { tenantModule: { findMany: jest.Mock } };

  beforeEach(() => {
    reflector = new Reflector();
    getAllAndOverrideSpy = jest.spyOn(reflector, 'getAllAndOverride');
    mockRedisClient = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
    };
    mockPrisma = {
      tenantModule: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const mockRedis = {
      getClient: jest.fn(() => mockRedisClient),
    };

    guard = new ModuleEnabledGuard(reflector, mockPrisma as never, mockRedis as never);
  });

  afterEach(() => jest.clearAllMocks());

  it('allows access when no module metadata is present', async () => {
    getAllAndOverrideSpy.mockReturnValue(undefined);

    const allowed = await guard.canActivate(createExecutionContext());

    expect(allowed).toBe(true);
    expect(mockPrisma.tenantModule.findMany).not.toHaveBeenCalled();
  });

  it('allows access when the required module is enabled', async () => {
    getAllAndOverrideSpy.mockImplementation((key: string) =>
      key === MODULE_ENABLED_KEY ? 'pastoral' : undefined,
    );
    mockPrisma.tenantModule.findMany.mockResolvedValue([{ module_key: 'pastoral' }]);

    const allowed = await guard.canActivate(
      createExecutionContext({ tenantContext: { tenant_id: TENANT_ID } }),
    );

    expect(allowed).toBe(true);
    expect(mockRedisClient.setex).toHaveBeenCalledWith(
      `tenant_modules:${TENANT_ID}`,
      300,
      JSON.stringify(['pastoral']),
    );
  });

  it('throws MODULE_DISABLED as a 404 when the module row exists disabled', async () => {
    getAllAndOverrideSpy.mockReturnValue('pastoral');
    mockPrisma.tenantModule.findMany.mockResolvedValue([{ module_key: 'behaviour' }]);

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
    mockPrisma.tenantModule.findMany.mockResolvedValue([]);

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
