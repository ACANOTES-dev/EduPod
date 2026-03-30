import { Test, TestingModule } from '@nestjs/testing';

import { RedisService } from '../redis/redis.service';

import { NotificationRateLimitService } from './notification-rate-limit.service';

const TENANT_ID = 'tenant-uuid-1';
const USER_ID = 'user-uuid-1';

describe('NotificationRateLimitService', () => {
  let service: NotificationRateLimitService;
  let mockRedisClient: {
    incr: jest.Mock;
    expire: jest.Mock;
  };
  let mockRedis: {
    getClient: jest.Mock;
  };

  beforeEach(async () => {
    mockRedisClient = {
      incr: jest.fn(),
      expire: jest.fn(),
    };

    mockRedis = {
      getClient: jest.fn().mockReturnValue(mockRedisClient),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationRateLimitService, { provide: RedisService, useValue: mockRedis }],
    }).compile();

    service = module.get<NotificationRateLimitService>(NotificationRateLimitService);

    jest.clearAllMocks();
    mockRedis.getClient.mockReturnValue(mockRedisClient);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── checkAndIncrement() — in_app exemption ──────────────────────────────

  describe('NotificationRateLimitService — checkAndIncrement — in_app exemption', () => {
    it('should always allow in_app notifications without touching Redis', async () => {
      const result = await service.checkAndIncrement(TENANT_ID, USER_ID, 'in_app');

      expect(result).toEqual({ allowed: true });
      expect(mockRedisClient.incr).not.toHaveBeenCalled();
    });
  });

  // ─── checkAndIncrement() — safeguarding exemption ────────────────────────

  describe('NotificationRateLimitService — checkAndIncrement — safeguarding exemption', () => {
    it('should bypass rate limits for safeguarding template keys', async () => {
      const result = await service.checkAndIncrement(
        TENANT_ID,
        USER_ID,
        'email',
        'safeguarding_alert',
      );

      expect(result).toEqual({ allowed: true });
      expect(mockRedisClient.incr).not.toHaveBeenCalled();
    });

    it('should bypass rate limits for safeguarding_incident template key', async () => {
      const result = await service.checkAndIncrement(
        TENANT_ID,
        USER_ID,
        'sms',
        'safeguarding_incident',
      );

      expect(result).toEqual({ allowed: true });
      expect(mockRedisClient.incr).not.toHaveBeenCalled();
    });

    it('should not bypass for non-safeguarding template keys', async () => {
      // Under limit, should still be allowed
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      const result = await service.checkAndIncrement(TENANT_ID, USER_ID, 'email', 'welcome_email');

      expect(result).toEqual({ allowed: true });
      expect(mockRedisClient.incr).toHaveBeenCalled();
    });
  });

  // ─── checkAndIncrement() — hourly limit ──────────────────────────────────

  describe('NotificationRateLimitService — checkAndIncrement — hourly channel limit', () => {
    it('should allow when under the per-channel hourly limit', async () => {
      // First call (channel hour) returns 5, second call (day) returns 10
      mockRedisClient.incr.mockResolvedValueOnce(5).mockResolvedValueOnce(10);
      mockRedisClient.expire.mockResolvedValue(1);

      const result = await service.checkAndIncrement(TENANT_ID, USER_ID, 'email');

      expect(result).toEqual({ allowed: true });
    });

    it('should allow when at exactly the per-channel hourly limit (10)', async () => {
      mockRedisClient.incr
        .mockResolvedValueOnce(10) // channel hour at limit
        .mockResolvedValueOnce(15); // day under limit
      mockRedisClient.expire.mockResolvedValue(1);

      const result = await service.checkAndIncrement(TENANT_ID, USER_ID, 'email');

      expect(result).toEqual({ allowed: true });
    });

    it('should deny when exceeding the per-channel hourly limit (>10)', async () => {
      mockRedisClient.incr.mockResolvedValueOnce(11); // over hourly limit
      mockRedisClient.expire.mockResolvedValue(1);

      const result = await service.checkAndIncrement(TENANT_ID, USER_ID, 'email');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Hourly');
      expect(result.reason).toContain('email');
      expect(result.reason).toContain('10');
    });

    it('should set TTL on first increment of hourly bucket', async () => {
      mockRedisClient.incr
        .mockResolvedValueOnce(1) // first increment
        .mockResolvedValueOnce(1);
      mockRedisClient.expire.mockResolvedValue(1);

      await service.checkAndIncrement(TENANT_ID, USER_ID, 'email');

      // First incr returns 1, so expire is called for hourly key
      expect(mockRedisClient.expire).toHaveBeenCalledWith(expect.stringContaining(':h:'), 3660);
    });

    it('should not reset TTL on subsequent increments of hourly bucket', async () => {
      mockRedisClient.incr
        .mockResolvedValueOnce(5) // not first increment
        .mockResolvedValueOnce(5);
      mockRedisClient.expire.mockResolvedValue(1);

      await service.checkAndIncrement(TENANT_ID, USER_ID, 'email');

      // expire should only be called for the day bucket (first increment)
      const hourlyExpireCalls = mockRedisClient.expire.mock.calls.filter((call: [string, number]) =>
        call[0].includes(':h:'),
      );
      expect(hourlyExpireCalls).toHaveLength(0);
    });
  });

  // ─── checkAndIncrement() — daily limit ───────────────────────────────────

  describe('NotificationRateLimitService — checkAndIncrement — daily all-channels limit', () => {
    it('should allow when under the daily all-channels limit', async () => {
      mockRedisClient.incr
        .mockResolvedValueOnce(3) // channel hour
        .mockResolvedValueOnce(20); // day under 30
      mockRedisClient.expire.mockResolvedValue(1);

      const result = await service.checkAndIncrement(TENANT_ID, USER_ID, 'sms');

      expect(result).toEqual({ allowed: true });
    });

    it('should allow when at exactly the daily limit (30)', async () => {
      mockRedisClient.incr
        .mockResolvedValueOnce(5) // channel hour
        .mockResolvedValueOnce(30); // day at limit
      mockRedisClient.expire.mockResolvedValue(1);

      const result = await service.checkAndIncrement(TENANT_ID, USER_ID, 'email');

      expect(result).toEqual({ allowed: true });
    });

    it('should deny when exceeding the daily all-channels limit (>30)', async () => {
      mockRedisClient.incr
        .mockResolvedValueOnce(5) // channel hour under limit
        .mockResolvedValueOnce(31); // day over limit
      mockRedisClient.expire.mockResolvedValue(1);

      const result = await service.checkAndIncrement(TENANT_ID, USER_ID, 'email');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily');
      expect(result.reason).toContain('30');
    });

    it('should set TTL on first increment of daily bucket', async () => {
      mockRedisClient.incr
        .mockResolvedValueOnce(5) // channel hour not first
        .mockResolvedValueOnce(1); // day first increment
      mockRedisClient.expire.mockResolvedValue(1);

      await service.checkAndIncrement(TENANT_ID, USER_ID, 'email');

      expect(mockRedisClient.expire).toHaveBeenCalledWith(expect.stringContaining(':d:'), 86_460);
    });
  });

  // ─── checkAndIncrement() — key format ────────────────────────────────────

  describe('NotificationRateLimitService — checkAndIncrement — Redis key format', () => {
    it('should use correct key format with tenant, user, channel, and bucket', async () => {
      mockRedisClient.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
      mockRedisClient.expire.mockResolvedValue(1);

      await service.checkAndIncrement(TENANT_ID, USER_ID, 'email');

      const channelHourKey = mockRedisClient.incr.mock.calls[0][0] as string;
      const dayKey = mockRedisClient.incr.mock.calls[1][0] as string;

      expect(channelHourKey).toMatch(
        new RegExp(`ratelimit:notif:${TENANT_ID}:${USER_ID}:email:h:\\d{10}`),
      );
      expect(dayKey).toMatch(new RegExp(`ratelimit:notif:${TENANT_ID}:${USER_ID}:d:\\d{8}`));
    });

    it('should use different keys for different channels', async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      await service.checkAndIncrement(TENANT_ID, USER_ID, 'email');
      const emailKey = mockRedisClient.incr.mock.calls[0][0] as string;

      jest.clearAllMocks();
      mockRedis.getClient.mockReturnValue(mockRedisClient);
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      await service.checkAndIncrement(TENANT_ID, USER_ID, 'sms');
      const smsKey = mockRedisClient.incr.mock.calls[0][0] as string;

      expect(emailKey).toContain(':email:');
      expect(smsKey).toContain(':sms:');
      expect(emailKey).not.toBe(smsKey);
    });

    it('should use different keys for different users', async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      await service.checkAndIncrement(TENANT_ID, 'user-A', 'email');
      const userAKey = mockRedisClient.incr.mock.calls[0][0] as string;

      jest.clearAllMocks();
      mockRedis.getClient.mockReturnValue(mockRedisClient);
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      await service.checkAndIncrement(TENANT_ID, 'user-B', 'email');
      const userBKey = mockRedisClient.incr.mock.calls[0][0] as string;

      expect(userAKey).toContain('user-A');
      expect(userBKey).toContain('user-B');
    });

    it('should use different keys for different tenants', async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      await service.checkAndIncrement('tenant-A', USER_ID, 'email');
      const tenantAKey = mockRedisClient.incr.mock.calls[0][0] as string;

      jest.clearAllMocks();
      mockRedis.getClient.mockReturnValue(mockRedisClient);
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      await service.checkAndIncrement('tenant-B', USER_ID, 'email');
      const tenantBKey = mockRedisClient.incr.mock.calls[0][0] as string;

      expect(tenantAKey).toContain('tenant-A');
      expect(tenantBKey).toContain('tenant-B');
    });
  });

  // ─── Edge cases ──────────────────────────────────────────────────────────

  describe('NotificationRateLimitService — edge cases', () => {
    it('edge: hourly limit is checked before daily limit — early exit on hourly breach', async () => {
      mockRedisClient.incr.mockResolvedValueOnce(11); // over hourly
      mockRedisClient.expire.mockResolvedValue(1);

      const result = await service.checkAndIncrement(TENANT_ID, USER_ID, 'email');

      expect(result.allowed).toBe(false);
      // incr was only called once (hourly check), daily not checked
      expect(mockRedisClient.incr).toHaveBeenCalledTimes(1);
    });

    it('edge: whatsapp channel respects rate limit (not exempted)', async () => {
      mockRedisClient.incr.mockResolvedValueOnce(11); // over hourly for whatsapp
      mockRedisClient.expire.mockResolvedValue(1);

      const result = await service.checkAndIncrement(TENANT_ID, USER_ID, 'whatsapp');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('whatsapp');
    });

    it('edge: templateKey undefined does not bypass rate limit', async () => {
      mockRedisClient.incr.mockResolvedValueOnce(11);
      mockRedisClient.expire.mockResolvedValue(1);

      const result = await service.checkAndIncrement(TENANT_ID, USER_ID, 'email', undefined);

      expect(result.allowed).toBe(false);
    });

    it('edge: templateKey that starts with "safe" but not "safeguarding_" is rate limited', async () => {
      mockRedisClient.incr.mockResolvedValueOnce(11);
      mockRedisClient.expire.mockResolvedValue(1);

      const result = await service.checkAndIncrement(
        TENANT_ID,
        USER_ID,
        'email',
        'safety_reminder',
      );

      expect(result.allowed).toBe(false);
    });
  });
});
