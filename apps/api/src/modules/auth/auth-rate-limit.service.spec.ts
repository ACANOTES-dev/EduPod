import { Test, TestingModule } from '@nestjs/testing';

import { SecurityAuditService } from '../audit-log/security-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { RateLimitService } from './auth-rate-limit.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const mockPrisma = {
  user: { findUnique: jest.fn(), update: jest.fn() },
};

const mockSecurityAuditService = {
  logBruteForceLockout: jest.fn(),
};

describe('RateLimitService', () => {
  let service: RateLimitService;
  let redisClient: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
    expire: jest.Mock;
    incr: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    redisClient = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      incr: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitService,
        {
          provide: RedisService,
          useValue: {
            getClient: jest.fn().mockReturnValue(redisClient),
          },
        },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecurityAuditService, useValue: mockSecurityAuditService },
      ],
    }).compile();

    service = module.get<RateLimitService>(RateLimitService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── checkBruteForce ──────────────────────────────────────────────────────

  describe('RateLimitService -- checkBruteForce', () => {
    it('should not be blocked below first threshold (4 attempts)', async () => {
      redisClient.get.mockResolvedValue('4');
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(false);
      expect(result.retryAfterSeconds).toBe(0);
    });

    it('should not be blocked at 0 attempts', async () => {
      redisClient.get.mockResolvedValue('0');
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(false);
    });

    it('should not be blocked when key does not exist (null)', async () => {
      redisClient.get.mockResolvedValue(null);
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(false);
    });

    it('should lock at first threshold (5 attempts) for 30 seconds', async () => {
      redisClient.get.mockResolvedValue('5');
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(true);
      expect(result.retryAfterSeconds).toBe(30);
    });

    it('should lock at second threshold (8 attempts) for 120 seconds', async () => {
      redisClient.get.mockResolvedValue('8');
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(true);
      expect(result.retryAfterSeconds).toBe(120);
    });

    it('should lock at third threshold (10 attempts) for 1800 seconds', async () => {
      redisClient.get.mockResolvedValue('10');
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(true);
      expect(result.retryAfterSeconds).toBe(1800);
    });

    it('should apply highest matching threshold (15 attempts still 1800s)', async () => {
      redisClient.get.mockResolvedValue('15');
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(true);
      expect(result.retryAfterSeconds).toBe(1800);
    });
  });

  // ─── recordFailedLogin ────────────────────────────────────────────────────

  describe('RateLimitService -- recordFailedLogin', () => {
    it('should increment brute force counter and set expiry window', async () => {
      await service.recordFailedLogin('test@school.com');
      expect(redisClient.incr).toHaveBeenCalledWith('brute_force:test@school.com');
      expect(redisClient.expire).toHaveBeenCalledWith('brute_force:test@school.com', 3600);
    });

    it('should log lockout when a threshold is reached', async () => {
      redisClient.incr.mockResolvedValue(5);

      await service.recordFailedLogin('test@school.com', '1.2.3.4', 'jest-agent');

      expect(mockSecurityAuditService.logBruteForceLockout).toHaveBeenCalledWith(
        'test@school.com',
        '1.2.3.4',
        0.5,
        null,
        'jest-agent',
      );
    });

    it('should not log lockout when no threshold is reached', async () => {
      redisClient.incr.mockResolvedValue(3); // Not a threshold

      await service.recordFailedLogin('test@school.com', '1.2.3.4', 'jest-agent');

      expect(mockSecurityAuditService.logBruteForceLockout).not.toHaveBeenCalled();
    });

    it('should not log lockout when no ipAddress is provided', async () => {
      redisClient.incr.mockResolvedValue(5);

      await service.recordFailedLogin('test@school.com');

      expect(mockSecurityAuditService.logBruteForceLockout).not.toHaveBeenCalled();
    });
  });

  // ─── clearBruteForce ──────────────────────────────────────────────────────

  describe('RateLimitService -- clearBruteForce', () => {
    it('should delete the brute force counter from Redis', async () => {
      await service.clearBruteForce('test@school.com');
      expect(redisClient.del).toHaveBeenCalledWith('brute_force:test@school.com');
    });
  });

  // ─── checkIpThrottle ─────────────────────────────────────────────────────

  describe('RateLimitService -- checkIpThrottle', () => {
    it('should not be blocked below threshold (9 attempts)', async () => {
      redisClient.get.mockResolvedValue('9');
      const result = await service.checkIpThrottle('1.2.3.4');
      expect(result.blocked).toBe(false);
    });

    it('should be blocked at threshold (10 attempts)', async () => {
      redisClient.get.mockResolvedValue('10');
      const result = await service.checkIpThrottle('1.2.3.4');
      expect(result.blocked).toBe(true);
    });

    it('should be blocked above threshold (20 attempts)', async () => {
      redisClient.get.mockResolvedValue('20');
      const result = await service.checkIpThrottle('1.2.3.4');
      expect(result.blocked).toBe(true);
    });

    it('should not be blocked when key does not exist (null)', async () => {
      redisClient.get.mockResolvedValue(null);
      const result = await service.checkIpThrottle('1.2.3.4');
      expect(result.blocked).toBe(false);
    });
  });

  // ─── recordIpFailedLogin ─────────────────────────────────────────────────

  describe('RateLimitService -- recordIpFailedLogin', () => {
    it('should increment IP throttle counter and set expiry window', async () => {
      await service.recordIpFailedLogin('1.2.3.4');
      expect(redisClient.incr).toHaveBeenCalledWith('ip_login_throttle:1.2.3.4');
      expect(redisClient.expire).toHaveBeenCalledWith('ip_login_throttle:1.2.3.4', 900);
    });
  });

  // ─── clearIpThrottle ─────────────────────────────────────────────────────

  describe('RateLimitService -- clearIpThrottle', () => {
    it('should delete the IP throttle counter from Redis', async () => {
      await service.clearIpThrottle('1.2.3.4');
      expect(redisClient.del).toHaveBeenCalledWith('ip_login_throttle:1.2.3.4');
    });
  });

  // ─── isAccountLocked ─────────────────────────────────────────────────────

  describe('RateLimitService -- isAccountLocked', () => {
    it('should return false when locked_until is null', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ locked_until: null });
      const result = await service.isAccountLocked(USER_ID);
      expect(result).toBe(false);
    });

    it('should return false when locked_until is in the past', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        locked_until: new Date(Date.now() - 1000),
      });
      const result = await service.isAccountLocked(USER_ID);
      expect(result).toBe(false);
    });

    it('should return true when locked_until is in the future', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        locked_until: new Date(Date.now() + 15 * 60 * 1000),
      });
      const result = await service.isAccountLocked(USER_ID);
      expect(result).toBe(true);
    });

    it('should return false when user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const result = await service.isAccountLocked('nonexistent');
      expect(result).toBe(false);
    });
  });

  // ─── recordAccountFailedLogin ────────────────────────────────────────────

  describe('RateLimitService -- recordAccountFailedLogin', () => {
    it('should increment failed_login_attempts without locking below threshold', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ failed_login_attempts: 2 });
      mockPrisma.user.update.mockResolvedValue({});

      await service.recordAccountFailedLogin(USER_ID);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { failed_login_attempts: 3 },
      });
    });

    it('should lock account when reaching threshold (5th failure)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ failed_login_attempts: 4 });
      mockPrisma.user.update.mockResolvedValue({});

      await service.recordAccountFailedLogin(USER_ID);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: {
          failed_login_attempts: 5,
          locked_until: expect.any(Date),
        },
      });

      // Verify the lockout duration is approximately 15 minutes
      const updateCall = mockPrisma.user.update.mock.calls[0][0] as {
        data: { locked_until: Date };
      };
      const lockedUntil = updateCall.data.locked_until.getTime();
      const expectedEnd = Date.now() + 15 * 60 * 1000;
      expect(Math.abs(lockedUntil - expectedEnd)).toBeLessThan(2000); // within 2s tolerance
    });
  });

  // ─── clearAccountLockout ─────────────────────────────────────────────────

  describe('RateLimitService -- clearAccountLockout', () => {
    it('should reset failed_login_attempts and clear locked_until', async () => {
      mockPrisma.user.update.mockResolvedValue({});

      await service.clearAccountLockout(USER_ID);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { failed_login_attempts: 0, locked_until: null },
      });
    });
  });
});
