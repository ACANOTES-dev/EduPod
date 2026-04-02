import Redis from 'ioredis';

import { getRedisClient } from './redis.helpers';

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  }));
});

describe('redis.helpers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    // Reset the module cache to allow fresh imports
    jest.resetModules();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getRedisClient', () => {
    it('should throw error when REDIS_URL is not configured', () => {
      delete process.env['REDIS_URL'];

      expect(() => {
        // Re-require to get fresh instance with no cached client
        const { getRedisClient: freshGetRedisClient } = require('./redis.helpers');
        freshGetRedisClient();
      }).toThrow('REDIS_URL is not configured');
    });

    it('should create Redis client with correct configuration', () => {
      process.env['REDIS_URL'] = 'redis://localhost:6379';

      const { getRedisClient: freshGetRedisClient } = require('./redis.helpers');
      const client = freshGetRedisClient();

      expect(Redis).toHaveBeenCalledWith(
        'redis://localhost:6379',
        expect.objectContaining({
          maxRetriesPerRequest: 3,
          retryStrategy: expect.any(Function),
        }),
      );
      expect(client).toBeDefined();
    });

    it('should use exponential backoff for retry strategy', () => {
      process.env['REDIS_URL'] = 'redis://localhost:6379';

      const { getRedisClient: freshGetRedisClient } = require('./redis.helpers');
      freshGetRedisClient();

      // Get the retryStrategy from the Redis mock call
      const redisMock = Redis as unknown as jest.Mock;
      const [, options] = redisMock.mock.calls[0];
      const { retryStrategy } = options;

      expect(retryStrategy(1)).toBe(50);
      expect(retryStrategy(2)).toBe(100);
      expect(retryStrategy(10)).toBe(500);
      expect(retryStrategy(100)).toBe(2000);
    });

    it('should return cached client on subsequent calls', () => {
      process.env['REDIS_URL'] = 'redis://localhost:6379';

      const { getRedisClient: freshGetRedisClient } = require('./redis.helpers');

      const client1 = freshGetRedisClient();
      const client2 = freshGetRedisClient();

      expect(client1).toBe(client2);
      expect(Redis).toHaveBeenCalledTimes(1);
    });

    it('should create client with Redis cluster URL', () => {
      process.env['REDIS_URL'] = 'redis://redis-cluster.example.com:6379';

      const { getRedisClient: freshGetRedisClient } = require('./redis.helpers');
      freshGetRedisClient();

      expect(Redis).toHaveBeenCalledWith(
        'redis://redis-cluster.example.com:6379',
        expect.any(Object),
      );
    });

    it('should create client with Redis Sentinel URL', () => {
      process.env['REDIS_URL'] = 'redis://sentinel-host:26379';

      const { getRedisClient: freshGetRedisClient } = require('./redis.helpers');
      freshGetRedisClient();

      expect(Redis).toHaveBeenCalledWith('redis://sentinel-host:26379', expect.any(Object));
    });

    it('should create client with Redis over TLS', () => {
      process.env['REDIS_URL'] = 'rediss://secure-redis.example.com:6380';

      const { getRedisClient: freshGetRedisClient } = require('./redis.helpers');
      freshGetRedisClient();

      expect(Redis).toHaveBeenCalledWith(
        'rediss://secure-redis.example.com:6380',
        expect.any(Object),
      );
    });

    it('should handle localhost Redis URL', () => {
      process.env['REDIS_URL'] = 'redis://localhost:6379/0';

      const { getRedisClient: freshGetRedisClient } = require('./redis.helpers');
      freshGetRedisClient();

      expect(Redis).toHaveBeenCalledWith('redis://localhost:6379/0', expect.any(Object));
    });

    it('should handle Redis URL with password', () => {
      process.env['REDIS_URL'] = 'redis://user:password@redis.example.com:6379';

      const { getRedisClient: freshGetRedisClient } = require('./redis.helpers');
      freshGetRedisClient();

      expect(Redis).toHaveBeenCalledWith(
        'redis://user:password@redis.example.com:6379',
        expect.any(Object),
      );
    });

    it('should handle retryStrategy at boundary values', () => {
      process.env['REDIS_URL'] = 'redis://localhost:6379';

      const { getRedisClient: freshGetRedisClient } = require('./redis.helpers');
      freshGetRedisClient();

      // Get the retryStrategy from the Redis mock call
      const redisMock = Redis as unknown as jest.Mock;
      const [, options] = redisMock.mock.calls[0];
      const { retryStrategy } = options;

      expect(retryStrategy(0)).toBe(0);
      expect(retryStrategy(39)).toBe(1950);
      expect(retryStrategy(40)).toBe(2000);
      expect(retryStrategy(41)).toBe(2000);
    });

    it('should have maxRetriesPerRequest set to 3', () => {
      process.env['REDIS_URL'] = 'redis://localhost:6379';

      const { getRedisClient: freshGetRedisClient } = require('./redis.helpers');
      freshGetRedisClient();

      // Get the config from the Redis mock call
      const redisMock = Redis as unknown as jest.Mock;
      const [, options] = redisMock.mock.calls[0];

      expect(options.maxRetriesPerRequest).toBe(3);
    });
  });
});
