import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';

import { AdminTierOnlyGuard } from './admin-tier-only.guard';

function buildContext(user: unknown): ExecutionContext {
  const req = { currentUser: user };
  return {
    switchToHttp: () => ({
      getRequest: <T>() => req as unknown as T,
    }),
  } as unknown as ExecutionContext;
}

describe('AdminTierOnlyGuard', () => {
  let guard: AdminTierOnlyGuard;
  let permissionCache: { isOwner: jest.Mock };

  beforeEach(() => {
    permissionCache = { isOwner: jest.fn() };
    guard = new AdminTierOnlyGuard(
      permissionCache as unknown as import('../../../common/services/permission-cache.service').PermissionCacheService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('allows SchoolOwner / Principal / VicePrincipal', async () => {
    permissionCache.isOwner.mockResolvedValue(true);
    const ctx = buildContext({ sub: 'u-1', membership_id: 'm-1', tenant_id: 't-1' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(permissionCache.isOwner).toHaveBeenCalledWith('m-1');
  });

  it('rejects Teacher / Office / Parent / Student with 403', async () => {
    permissionCache.isOwner.mockResolvedValue(false);
    const ctx = buildContext({ sub: 'u-1', membership_id: 'm-1', tenant_id: 't-1' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects unauthenticated with 401', async () => {
    const ctx = buildContext(undefined);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(permissionCache.isOwner).not.toHaveBeenCalled();
  });

  it('rejects user with no active membership with 403', async () => {
    const ctx = buildContext({ sub: 'u-1', membership_id: null, tenant_id: 't-1' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(permissionCache.isOwner).not.toHaveBeenCalled();
  });
});
