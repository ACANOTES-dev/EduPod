import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { JwtPayload } from '@school/shared';

import { SecurityAuditService } from '../../modules/audit-log/security-audit.service';
import { PermissionCacheService } from '../services/permission-cache.service';

import { PermissionGuard } from './permission.guard';

const mockUser: JwtPayload = {
  sub: 'user-123',
  email: 'user@example.com',
  tenant_id: 'tenant-123',
  membership_id: 'membership-123',
  type: 'access',
  iat: 0,
  exp: 0,
};

function createExecutionContext(request: Record<string, unknown>) {
  return {
    getClass: () => class TestController {},
    getHandler: () => jest.fn(),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  };
}

describe('PermissionGuard', () => {
  let guard: PermissionGuard;
  let mockReflector: { getAllAndOverride: jest.Mock };
  let mockPermissionCacheService: { getPermissions: jest.Mock; isOwner: jest.Mock };
  let mockSecurityAuditService: { logPermissionDenied: jest.Mock };

  beforeEach(() => {
    mockReflector = {
      getAllAndOverride: jest.fn(),
    };
    mockPermissionCacheService = {
      getPermissions: jest.fn(),
      isOwner: jest.fn().mockResolvedValue(false),
    };
    mockSecurityAuditService = {
      logPermissionDenied: jest.fn().mockResolvedValue(undefined),
    };

    guard = new PermissionGuard(
      mockReflector as unknown as Reflector,
      mockPermissionCacheService as unknown as PermissionCacheService,
      mockSecurityAuditService as unknown as SecurityAuditService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('allows access when no permission metadata is present', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);

    const allowed = await guard.canActivate(createExecutionContext({}) as never);

    expect(allowed).toBe(true);
    expect(mockPermissionCacheService.getPermissions).not.toHaveBeenCalled();
  });

  it('logs and denies access when required permission is missing', async () => {
    mockReflector.getAllAndOverride.mockReturnValue('students.manage');
    mockPermissionCacheService.getPermissions.mockResolvedValue(['students.view']);

    const context = createExecutionContext({
      currentUser: mockUser,
      headers: { 'user-agent': 'jest-agent' },
      ip: '127.0.0.1',
      originalUrl: '/api/v1/students/123',
      tenantContext: { tenant_id: 'tenant-123' },
    });

    await expect(guard.canActivate(context as never)).rejects.toThrow(ForbiddenException);

    expect(mockSecurityAuditService.logPermissionDenied).toHaveBeenCalledWith(
      mockUser.sub,
      ['students.manage'],
      '/api/v1/students/123',
      '127.0.0.1',
      mockUser.tenant_id,
      'jest-agent',
      undefined,
    );
  });

  it('allows access when the user is an owner, regardless of permissions', async () => {
    mockReflector.getAllAndOverride.mockReturnValue('students.manage');
    mockPermissionCacheService.isOwner.mockResolvedValue(true);

    const context = createExecutionContext({
      currentUser: mockUser,
      headers: { 'user-agent': 'jest-agent' },
      ip: '127.0.0.1',
      originalUrl: '/api/v1/students/123',
      tenantContext: { tenant_id: 'tenant-123' },
    });

    const allowed = await guard.canActivate(context as never);

    expect(allowed).toBe(true);
    // getPermissions should NOT be called — owner bypass short-circuits before it
    expect(mockPermissionCacheService.getPermissions).not.toHaveBeenCalled();
    // No permission denied audit event should be emitted
    expect(mockSecurityAuditService.logPermissionDenied).not.toHaveBeenCalled();
  });
});
