import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('ioredis', () => {
  const mockQuit = jest.fn().mockResolvedValue('OK');
  const mockPing = jest.fn().mockResolvedValue('PONG');

  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      quit: mockQuit,
      ping: mockPing,
    })),
  };
});

import { RedisService } from './redis.service';

describe('RedisService', () => {
  let service: RedisService;
  let mockConfigService: { get: jest.Mock };

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'REDIS_URL') return 'redis://localhost:6379';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw if REDIS_URL is not configured on init', async () => {
    mockConfigService.get.mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    const svc = module.get<RedisService>(RedisService);
    await expect(svc.onModuleInit()).rejects.toThrow('REDIS_URL is not configured');
  });

  it('should initialise the client when REDIS_URL is provided', async () => {
    await service.onModuleInit();
    const client = service.getClient();
    expect(client).toBeDefined();
  });

  it('should throw when getClient is called before init', () => {
    expect(() => service.getClient()).toThrow('Redis client not initialized');
  });

  it('should quit the client on module destroy', async () => {
    await service.onModuleInit();
    const client = service.getClient();
    await service.onModuleDestroy();
    expect(client.quit).toHaveBeenCalledTimes(1);
  });

  it('should not throw on destroy if client is null', async () => {
    // Client was never initialised
    await expect(service.onModuleDestroy()).resolves.not.toThrow();
  });

  it('should return true when ping succeeds', async () => {
    await service.onModuleInit();
    const result = await service.ping();
    expect(result).toBe(true);
  });

  it('should return false when ping fails', async () => {
    await service.onModuleInit();
    const client = service.getClient();
    (client.ping as jest.Mock).mockRejectedValueOnce(new Error('Connection lost'));
    const result = await service.ping();
    expect(result).toBe(false);
  });
});
