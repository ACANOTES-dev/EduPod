import { Test, TestingModule } from '@nestjs/testing';

import { RedisService } from '../redis/redis.service';

import { AdmissionsRateLimitService } from './admissions-rate-limit.service';

describe('AdmissionsRateLimitService', () => {
  let service: AdmissionsRateLimitService;
  let mockRedisClient: {
    incr: jest.Mock;
    expire: jest.Mock;
  };
  let mockRedisService: {
    getClient: jest.Mock;
  };

  beforeEach(async () => {
    mockRedisClient = {
      incr: jest.fn(),
      expire: jest.fn(),
    };

    mockRedisService = {
      getClient: jest.fn().mockReturnValue(mockRedisClient),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdmissionsRateLimitService,
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<AdmissionsRateLimitService>(
      AdmissionsRateLimitService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const IP = '192.168.1.1';

  it('should allow first 3 requests', async () => {
    mockRedisClient.incr.mockResolvedValueOnce(1);
    const r1 = await service.checkAndIncrement(TENANT_ID, IP);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    mockRedisClient.incr.mockResolvedValueOnce(2);
    const r2 = await service.checkAndIncrement(TENANT_ID, IP);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    mockRedisClient.incr.mockResolvedValueOnce(3);
    const r3 = await service.checkAndIncrement(TENANT_ID, IP);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it('should block 4th request', async () => {
    mockRedisClient.incr.mockResolvedValue(4);

    const result = await service.checkAndIncrement(TENANT_ID, IP);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should set TTL on first request only', async () => {
    mockRedisClient.incr.mockResolvedValueOnce(1);
    await service.checkAndIncrement(TENANT_ID, IP);
    expect(mockRedisClient.expire).toHaveBeenCalledWith(
      `ratelimit:admissions:${TENANT_ID}:${IP}`,
      3600,
    );

    mockRedisClient.expire.mockClear();
    mockRedisClient.incr.mockResolvedValueOnce(2);
    await service.checkAndIncrement(TENANT_ID, IP);
    // expire should NOT be called for count > 1
    expect(mockRedisClient.expire).not.toHaveBeenCalled();
  });

  it('should track per tenant+IP — different tenant same IP = separate counters', async () => {
    const TENANT_A = '11111111-1111-1111-1111-111111111111';
    const TENANT_B = '22222222-2222-2222-2222-222222222222';

    mockRedisClient.incr.mockResolvedValueOnce(1);
    await service.checkAndIncrement(TENANT_A, IP);

    mockRedisClient.incr.mockResolvedValueOnce(1);
    await service.checkAndIncrement(TENANT_B, IP);

    // Should have been called with two different keys
    const calls = mockRedisClient.incr.mock.calls;
    expect(calls[0][0]).toBe(`ratelimit:admissions:${TENANT_A}:${IP}`);
    expect(calls[1][0]).toBe(`ratelimit:admissions:${TENANT_B}:${IP}`);
  });

  it('should track per IP per tenant — different IP same tenant = separate counters', async () => {
    const IP_A = '10.0.0.1';
    const IP_B = '10.0.0.2';

    mockRedisClient.incr.mockResolvedValueOnce(1);
    await service.checkAndIncrement(TENANT_ID, IP_A);

    mockRedisClient.incr.mockResolvedValueOnce(1);
    await service.checkAndIncrement(TENANT_ID, IP_B);

    const calls = mockRedisClient.incr.mock.calls;
    expect(calls[0][0]).toBe(`ratelimit:admissions:${TENANT_ID}:${IP_A}`);
    expect(calls[1][0]).toBe(`ratelimit:admissions:${TENANT_ID}:${IP_B}`);
  });
});
