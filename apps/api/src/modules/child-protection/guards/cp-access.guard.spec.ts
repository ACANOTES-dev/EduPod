import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { CpAccessService } from '../services/cp-access.service';

import { CpAccessGuard } from './cp-access.guard';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DLP_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const REGULAR_USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockExecutionContext(
  currentUser: Record<string, unknown> | undefined,
): ExecutionContext {
  const request: Record<string, unknown> = {};
  if (currentUser !== undefined) {
    request['currentUser'] = currentUser;
  }

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => jest.fn(),
    }),
    getHandler: () => jest.fn(),
    getClass: () => Object,
    getType: () => 'http' as const,
    getArgs: () => [request],
    getArgByIndex: (index: number) => [request][index],
    switchToRpc: () => ({ getContext: jest.fn(), getData: jest.fn() }),
    switchToWs: () => ({ getClient: jest.fn(), getData: jest.fn(), getPattern: jest.fn() }),
  } as unknown as ExecutionContext;
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('CpAccessGuard', () => {
  let guard: CpAccessGuard;
  let mockCpAccessService: { hasAccess: jest.Mock };

  beforeEach(async () => {
    mockCpAccessService = {
      hasAccess: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CpAccessGuard,
        { provide: CpAccessService, useValue: mockCpAccessService },
      ],
    }).compile();

    guard = module.get<CpAccessGuard>(CpAccessGuard);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Access granted ───────────────────────────────────────────────────

  it('should allow access when user has an active CP grant', async () => {
    mockCpAccessService.hasAccess.mockResolvedValue(true);

    const context = createMockExecutionContext({
      sub: DLP_USER_ID,
      tenant_id: TENANT_ID,
      membership_id: 'mem-1',
      email: 'dlp@school.test',
      type: 'access',
      iat: 0,
      exp: 0,
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockCpAccessService.hasAccess).toHaveBeenCalledWith(
      TENANT_ID,
      DLP_USER_ID,
    );
  });

  // ─── Access denied — returns 403 with generic shape ───────────────────

  it('should throw ForbiddenException (not 404) for unauthorized user', async () => {
    mockCpAccessService.hasAccess.mockResolvedValue(false);

    const context = createMockExecutionContext({
      sub: REGULAR_USER_ID,
      tenant_id: TENANT_ID,
      membership_id: 'mem-2',
      email: 'teacher@school.test',
      type: 'access',
      iat: 0,
      exp: 0,
    });

    try {
      await guard.canActivate(context);
      fail('Expected ForbiddenException to be thrown');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ForbiddenException);
      const forbiddenError = error as ForbiddenException;
      const response = forbiddenError.getResponse() as Record<string, unknown>;
      const errorBody = response['error'] as Record<string, unknown>;

      // CRITICAL: error shape is identical to PermissionGuard
      expect(errorBody['code']).toBe('PERMISSION_DENIED');
      expect(errorBody['message']).toBe('Forbidden');
    }
  });

  it('should not include CP-specific terminology in rejection response', async () => {
    mockCpAccessService.hasAccess.mockResolvedValue(false);

    const context = createMockExecutionContext({
      sub: REGULAR_USER_ID,
      tenant_id: TENANT_ID,
      membership_id: 'mem-2',
      email: 'teacher@school.test',
      type: 'access',
      iat: 0,
      exp: 0,
    });

    try {
      await guard.canActivate(context);
      fail('Expected ForbiddenException to be thrown');
    } catch (error: unknown) {
      const forbiddenError = error as ForbiddenException;
      const response = JSON.stringify(forbiddenError.getResponse());

      // Zero-discoverability: no CP-related terms leak in the response
      expect(response.toLowerCase()).not.toContain('cp');
      expect(response.toLowerCase()).not.toContain('child protection');
      expect(response.toLowerCase()).not.toContain('access grant');
      expect(response.toLowerCase()).not.toContain('designated');
    }
  });

  // ─── No user (should not happen if AuthGuard runs first) ──────────────

  it('should throw ForbiddenException when no currentUser on request', async () => {
    const context = createMockExecutionContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  // ─── No tenant_id on user ─────────────────────────────────────────────

  it('should throw ForbiddenException when user has no tenant_id', async () => {
    const context = createMockExecutionContext({
      sub: REGULAR_USER_ID,
      tenant_id: null,
      membership_id: null,
      email: 'platform@admin.test',
      type: 'access',
      iat: 0,
      exp: 0,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  // ─── DLP bypass (DLP has active grant, so hasAccess returns true) ─────

  it('should allow DLP user (user with active grant) to pass', async () => {
    mockCpAccessService.hasAccess.mockResolvedValue(true);

    const context = createMockExecutionContext({
      sub: DLP_USER_ID,
      tenant_id: TENANT_ID,
      membership_id: 'mem-1',
      email: 'dlp@school.test',
      type: 'access',
      iat: 0,
      exp: 0,
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  // ─── Expired grant (service returns false for expired) ────────────────

  it('should deny access when grant has been revoked (service returns false)', async () => {
    mockCpAccessService.hasAccess.mockResolvedValue(false);

    const context = createMockExecutionContext({
      sub: REGULAR_USER_ID,
      tenant_id: TENANT_ID,
      membership_id: 'mem-2',
      email: 'teacher@school.test',
      type: 'access',
      iat: 0,
      exp: 0,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
