import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';

import { PlatformUsersService } from '../platform-users/platform-users.service';

import { PlatformGateway } from './platform.gateway';
import { RedisPubSubCallback, RedisPubSubService } from './redis-pubsub.service';

const JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long!!';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const PLATFORM_ADMINS_ROOM = 'platform-admins';

interface MockSocketHarness {
  data: { userId?: string };
  disconnect: jest.Mock<void, [boolean?]>;
  emit: jest.Mock<boolean, [string, Record<string, unknown>]>;
  join: jest.Mock<void, [string]>;
  socket: {
    data: { userId?: string };
    disconnect: jest.Mock<void, [boolean?]>;
    emit: jest.Mock<boolean, [string, Record<string, unknown>]>;
    handshake: { auth: Record<string, unknown> };
    join: jest.Mock<void, [string]>;
  };
}

function signToken(userId = USER_ID): string {
  return jwt.sign(
    {
      sub: userId,
      email: 'owner@edupod.app',
      tenant_id: null,
      membership_id: null,
      type: 'access',
    },
    JWT_SECRET,
    { expiresIn: '15m' },
  );
}

function buildSocket(token: string | null): MockSocketHarness {
  const data: { userId?: string } = {};
  const disconnect = jest.fn<void, [boolean?]>();
  const emit = jest.fn<boolean, [string, Record<string, unknown>]>().mockReturnValue(true);
  const join = jest.fn<void, [string]>();
  const socket = {
    data,
    disconnect,
    emit,
    handshake: {
      auth: token ? { token } : {},
    },
    join,
  };
  return { data, disconnect, emit, join, socket };
}

describe('PlatformGateway', () => {
  let gateway: PlatformGateway;
  let redisCallbacks: Map<string, RedisPubSubCallback>;
  let platformUsersService: { isMember: jest.Mock<Promise<boolean>, [string]> };

  beforeEach(async () => {
    jest.clearAllMocks();
    redisCallbacks = new Map();
    platformUsersService = {
      isMember: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformGateway,
        {
          provide: RedisPubSubService,
          useValue: {
            subscribe: jest.fn<void, [string, RedisPubSubCallback]>((channel, callback) => {
              redisCallbacks.set(channel, callback);
            }),
            unsubscribe: jest.fn<void, [string, RedisPubSubCallback]>(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn<string | undefined, [string]>((key) =>
              key === 'JWT_SECRET' ? JWT_SECRET : undefined,
            ),
          },
        },
        {
          provide: PlatformUsersService,
          useValue: platformUsersService,
        },
      ],
    }).compile();

    gateway = module.get<PlatformGateway>(PlatformGateway);
  });

  it('should accept a valid platform-owner JWT and join the platform room', async () => {
    const client = buildSocket(signToken());

    await gateway.handleConnection(client.socket);

    expect(client.disconnect).not.toHaveBeenCalled();
    expect(client.join).toHaveBeenCalledWith(PLATFORM_ADMINS_ROOM);
    expect(client.data.userId).toBe(USER_ID);
    expect(platformUsersService.isMember).toHaveBeenCalledWith(USER_ID);
  });

  it('should reject invalid JWTs', async () => {
    const client = buildSocket('not-a-valid-token');

    await gateway.handleConnection(client.socket);

    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('should reject valid JWTs from non-platform-owner users', async () => {
    platformUsersService.isMember.mockResolvedValueOnce(false);
    const client = buildSocket(signToken());

    await gateway.handleConnection(client.socket);

    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('should reject connections without a token', async () => {
    const client = buildSocket(null);

    await gateway.handleConnection(client.socket);

    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('should broadcast Redis platform health messages to Socket.IO clients', () => {
    const emit = jest.fn<void, [string, Record<string, unknown>]>();
    const to = jest.fn<{ emit: typeof emit }, [string]>().mockReturnValue({ emit });
    const server = { to };

    gateway.afterInit(server);
    const callback = redisCallbacks.get('platform:health');
    if (!callback) {
      throw new Error('platform:health callback was not registered');
    }

    callback({ status: 'healthy' });

    expect(to).toHaveBeenCalledWith(PLATFORM_ADMINS_ROOM);
    expect(emit).toHaveBeenCalledWith('health:update', { status: 'healthy' });
  });

  it('should broadcast Redis queue metrics to Socket.IO clients', () => {
    const emit = jest.fn<void, [string, Record<string, unknown>]>();
    const to = jest.fn<{ emit: typeof emit }, [string]>().mockReturnValue({ emit });
    const server = { to };

    gateway.afterInit(server);
    const callback = redisCallbacks.get('platform:queues');
    if (!callback) {
      throw new Error('platform:queues callback was not registered');
    }

    callback({ type: 'queue_metrics', queues: [] });

    expect(to).toHaveBeenCalledWith(PLATFORM_ADMINS_ROOM);
    expect(emit).toHaveBeenCalledWith('queue_metrics', { type: 'queue_metrics', queues: [] });
  });
});
