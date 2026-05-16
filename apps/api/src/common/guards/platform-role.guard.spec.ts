import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';

import { PlatformUsersService } from '../../modules/platform-users/platform-users.service';
import { REQUIRES_PLATFORM_PERMISSION_KEY } from '../decorators/requires-platform-permission.decorator';

import { PlatformRoleGuard } from './platform-role.guard';

const USER_ID = '11111111-2222-3333-4444-555555555555';
const REQUIRED_PERMISSION = 'platform.tenants.view';

function buildContext(userId: string | null, handler: () => void = () => undefined) {
  class TestController {}
  const request = {
    currentUser: userId
      ? {
          sub: userId,
          email: 'owner@edupod.app',
          tenant_id: null,
          membership_id: null,
          type: 'access' as const,
          iat: 0,
          exp: 0,
        }
      : undefined,
  };

  const context = new ExecutionContextHost([request], TestController, handler);
  context.setType('http');
  return context;
}

describe('PlatformRoleGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock<string | undefined, [string, unknown[]]> };
  let platformUsers: { hasPermission: jest.Mock<Promise<boolean>, [string, string]> };
  let guard: PlatformRoleGuard;

  beforeEach(async () => {
    reflector = {
      getAllAndOverride: jest.fn<string | undefined, [string, unknown[]]>(),
    };
    platformUsers = {
      hasPermission: jest.fn<Promise<boolean>, [string, string]>(),
    };
    const module = await Test.createTestingModule({
      providers: [
        PlatformRoleGuard,
        { provide: Reflector, useValue: reflector },
        { provide: PlatformUsersService, useValue: platformUsers },
      ],
    }).compile();
    guard = module.get<PlatformRoleGuard>(PlatformRoleGuard);
  });

  it('allows the request when no platform permission metadata is required', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(undefined);

    await expect(guard.canActivate(buildContext(USER_ID))).resolves.toBe(true);
    expect(platformUsers.hasPermission).not.toHaveBeenCalled();
  });

  it('allows the request when the user has the required platform permission', async () => {
    reflector.getAllAndOverride.mockImplementation((key) =>
      key === REQUIRES_PLATFORM_PERMISSION_KEY ? REQUIRED_PERMISSION : undefined,
    );
    platformUsers.hasPermission.mockResolvedValueOnce(true);

    await expect(guard.canActivate(buildContext(USER_ID))).resolves.toBe(true);
    expect(platformUsers.hasPermission).toHaveBeenCalledWith(USER_ID, REQUIRED_PERMISSION);
  });

  it('throws 401 when the JWT user is missing', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(REQUIRED_PERMISSION);

    await expect(guard.canActivate(buildContext(null))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws 404 when the user lacks the required platform permission', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(REQUIRED_PERMISSION);
    platformUsers.hasPermission.mockResolvedValueOnce(false);

    const promise = guard.canActivate(buildContext(USER_ID));
    await expect(promise).rejects.toBeInstanceOf(NotFoundException);
    await expect(promise).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PLATFORM_PERMISSION_DENIED',
        permission: REQUIRED_PERMISSION,
      }),
    });
  });
});
