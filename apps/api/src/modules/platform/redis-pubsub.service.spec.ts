import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

interface MockRedisClient {
  connect: jest.Mock<Promise<string>, []>;
  handlers: Map<string, (channel: string, message: string) => void>;
  on: jest.Mock<MockRedisClient, [string, (channel: string, message: string) => void]>;
  publish: jest.Mock<Promise<number>, [string, string]>;
  quit: jest.Mock<Promise<string>, []>;
  subscribe: jest.Mock<Promise<number>, [string]>;
  unsubscribe: jest.Mock<Promise<number>, [string]>;
}

const mockRedisState: { clients: MockRedisClient[] } = { clients: [] };

function mockCreateRedisClient(): MockRedisClient {
  const client: MockRedisClient = {
    connect: jest.fn<Promise<string>, []>().mockResolvedValue('OK'),
    handlers: new Map(),
    on: jest.fn<MockRedisClient, [string, (channel: string, message: string) => void]>(),
    publish: jest.fn<Promise<number>, [string, string]>().mockResolvedValue(1),
    quit: jest.fn<Promise<string>, []>().mockResolvedValue('OK'),
    subscribe: jest.fn<Promise<number>, [string]>().mockResolvedValue(1),
    unsubscribe: jest.fn<Promise<number>, [string]>().mockResolvedValue(1),
  };
  client.on.mockImplementation((event, handler) => {
    client.handlers.set(event, handler);
    return client;
  });
  return client;
}

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => {
    const client = mockCreateRedisClient();
    mockRedisState.clients.push(client);
    return client;
  }),
}));

import { RedisPubSubService } from './redis-pubsub.service';

describe('RedisPubSubService', () => {
  let service: RedisPubSubService;
  let mockConfigService: { get: jest.Mock<string | undefined, [string]> };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedisState.clients = [];
    mockConfigService = {
      get: jest.fn<string | undefined, [string]>((key) =>
        key === 'REDIS_URL' ? 'redis://localhost:6379' : undefined,
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RedisPubSubService, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    service = module.get<RedisPubSubService>(RedisPubSubService);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.clearAllMocks();
  });

  it('should publish serialized payloads to Redis', async () => {
    const publisher = mockRedisState.clients[0];
    if (!publisher) {
      throw new Error('Publisher mock was not created');
    }

    await service.publish('platform:health', { status: 'healthy' });

    expect(publisher.publish).toHaveBeenCalledWith(
      'platform:health',
      JSON.stringify({ status: 'healthy' }),
    );
  });

  it('should invoke subscribed callbacks with parsed JSON messages', () => {
    const subscriber = mockRedisState.clients[1];
    if (!subscriber) {
      throw new Error('Subscriber mock was not created');
    }
    const messageHandler = subscriber.handlers.get('message');
    if (!messageHandler) {
      throw new Error('Redis message handler was not registered');
    }
    const callback = jest.fn<void, [Record<string, unknown>]>();

    service.subscribe('platform:health', callback);
    messageHandler('platform:health', JSON.stringify({ status: 'healthy' }));

    expect(subscriber.subscribe).toHaveBeenCalledWith('platform:health');
    expect(callback).toHaveBeenCalledWith({ status: 'healthy' });
  });

  it('should stop invoking callbacks after unsubscribe', () => {
    const subscriber = mockRedisState.clients[1];
    if (!subscriber) {
      throw new Error('Subscriber mock was not created');
    }
    const messageHandler = subscriber.handlers.get('message');
    if (!messageHandler) {
      throw new Error('Redis message handler was not registered');
    }
    const callback = jest.fn<void, [Record<string, unknown>]>();

    service.subscribe('platform:health', callback);
    service.unsubscribe('platform:health', callback);
    messageHandler('platform:health', JSON.stringify({ status: 'healthy' }));

    expect(subscriber.unsubscribe).toHaveBeenCalledWith('platform:health');
    expect(callback).not.toHaveBeenCalled();
  });
});
