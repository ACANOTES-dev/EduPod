import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload } from '@school/shared';

import { RbacReadFacade } from '../../rbac/rbac-read.facade';
import { RedisService } from '../../redis/redis.service';

import { PlatformOwnerGuard } from './platform-owner.guard';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '11111111-2222-3333-4444-555555555555';

const mockUser: JwtPayload = {
  sub: USER_ID,
  email: 'owner@edupod.app',
  tenant_id: null,
  membership_id: null,
  type: 'access',
  iat: 0,
  exp: 0,
};

// ─── Mock factories ──────────────────────────────────────────────────────────

const mockRedisClient = {
  get: jest.fn(),
  setex: jest.fn().mockResolvedValue('OK'),
  sismember: jest.fn(),
  scard: jest.fn(),
};

const mockRedis = {
  getClient: jest.fn().mockReturnValue(mockRedisClient),
};

const mockRbacReadFacade = {
  findSystemRoleByKey: jest.fn(),
};

function createMockExecutionContext(user: JwtPayload | undefined): ExecutionContext {
  const mockRequest = { currentUser: user };
  return {
    switchToHttp: () => ({
      getRequest: () => mockRequest,
    }),
  } as unknown as ExecutionContext;
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('PlatformOwnerGuard', () => {
  let guard: PlatformOwnerGuard;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformOwnerGuard,
        { provide: RedisService, useValue: mockRedis },
        { provide: RbacReadFacade, useValue: mockRbacReadFacade },
      ],
    }).compile();

    guard = module.get<PlatformOwnerGuard>(PlatformOwnerGuard);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── PlatformOwnerGuard — canActivate ──────────────────────────────────────

  describe('PlatformOwnerGuard — canActivate', () => {
    it('should throw UnauthorizedException when no user is present', async () => {
      const ctx = createMockExecutionContext(undefined);

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);

      try {
        await guard.canActivate(ctx);
      } catch (err) {
        expect((err as UnauthorizedException).getResponse()).toMatchObject({
          code: 'AUTHENTICATION_REQUIRED',
        });
      }
    });

    it('should return true when per-user cache says true', async () => {
      mockRedisClient.get.mockResolvedValueOnce('true');
      const ctx = createMockExecutionContext(mockUser);

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      // Should not check the set or DB
      expect(mockRedisClient.sismember).not.toHaveBeenCalled();
      expect(mockRbacReadFacade.findSystemRoleByKey).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when per-user cache says false', async () => {
      mockRedisClient.get.mockResolvedValueOnce('false');
      const ctx = createMockExecutionContext(mockUser);

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);

      try {
        await guard.canActivate(ctx);
      } catch (err) {
        expect((err as ForbiddenException).getResponse()).toMatchObject({
          code: 'PLATFORM_ACCESS_DENIED',
        });
      }
    });

    it('should return true when user is in the Redis set (cache miss)', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null); // no per-user cache
      mockRedisClient.sismember.mockResolvedValueOnce(1); // user IS in the set

      const ctx = createMockExecutionContext(mockUser);

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        `is_platform_owner:${USER_ID}`,
        300,
        'true',
      );
    });

    it('should fall back to DB when user is not in Redis set — and deny if no platform role', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null); // no cache
      mockRedisClient.sismember.mockResolvedValueOnce(0); // not in set
      mockRbacReadFacade.findSystemRoleByKey.mockResolvedValueOnce(null); // no platform_owner role

      const ctx = createMockExecutionContext(mockUser);

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        `is_platform_owner:${USER_ID}`,
        300,
        'false',
      );
    });

    it('should deny when platform role exists but Redis set is empty (fresh Redis)', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null); // no cache
      mockRedisClient.sismember.mockResolvedValueOnce(0); // not in set
      mockRbacReadFacade.findSystemRoleByKey.mockResolvedValueOnce({
        id: 'role-id',
        role_key: 'school_owner',
      }); // role exists
      mockRedisClient.scard.mockResolvedValueOnce(0); // set is empty

      const ctx = createMockExecutionContext(mockUser);

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);

      // Short TTL for empty set scenario
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        `is_platform_owner:${USER_ID}`,
        60,
        'false',
      );
    });

    it('should deny when platform role exists and set is populated but user is not in it', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null); // no cache
      mockRedisClient.sismember.mockResolvedValueOnce(0); // not in set
      mockRbacReadFacade.findSystemRoleByKey.mockResolvedValueOnce({
        id: 'role-id',
        role_key: 'school_owner',
      }); // role exists
      mockRedisClient.scard.mockResolvedValueOnce(3); // set has 3 members

      const ctx = createMockExecutionContext(mockUser);

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        `is_platform_owner:${USER_ID}`,
        300,
        'false',
      );
    });

    it('should include re-seed message when set is empty', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.sismember.mockResolvedValueOnce(0);
      mockRbacReadFacade.findSystemRoleByKey.mockResolvedValueOnce({
        id: 'role-id',
        role_key: 'school_owner',
      });
      mockRedisClient.scard.mockResolvedValueOnce(0);

      const ctx = createMockExecutionContext(mockUser);

      try {
        await guard.canActivate(ctx);
        fail('Expected ForbiddenException');
      } catch (err) {
        const response = (err as ForbiddenException).getResponse() as Record<string, string>;
        expect(response.message).toContain('re-run the seed script');
      }
    });

    it('edge: should check sismember with correct key and user sub', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.sismember.mockResolvedValueOnce(1);

      const ctx = createMockExecutionContext(mockUser);

      await guard.canActivate(ctx);

      expect(mockRedisClient.sismember).toHaveBeenCalledWith('platform_owner_user_ids', USER_ID);
    });

    it('edge: should use correct per-user cache key format', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockRedisClient.sismember.mockResolvedValueOnce(1);

      const ctx = createMockExecutionContext(mockUser);

      await guard.canActivate(ctx);

      expect(mockRedisClient.get).toHaveBeenCalledWith(`is_platform_owner:${USER_ID}`);
    });
  });
});
