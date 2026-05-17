import { Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import * as jwt from 'jsonwebtoken';

import type { JwtPayload } from '@school/shared';

import { recordCorrelationEvent } from '../../common/services/correlation-event-sink';
import { PlatformUsersService } from '../platform-users/platform-users.service';

import { RedisPubSubCallback, RedisPubSubService } from './redis-pubsub.service';

const PLATFORM_ADMINS_ROOM = 'platform-admins';

const CHANNEL_EVENT_MAP: Record<string, string> = {
  'platform:alerts': 'alert:new',
  'platform:health': 'health:update',
  'platform:onboarding': 'onboarding:update',
  'platform:queues': 'queue_metrics',
};

interface PlatformGatewayClient {
  data: Record<string, unknown>;
  disconnect: (close?: boolean) => unknown;
  emit: (event: string, payload: Record<string, unknown>) => unknown;
  handshake: {
    auth: Record<string, unknown>;
  };
  join: (room: string) => unknown;
}

interface PlatformGatewayServer {
  to: (room: string) => {
    emit: (event: string, payload: Record<string, unknown>) => unknown;
  };
}

function isJwtPayload(value: unknown): value is JwtPayload {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.sub === 'string' &&
    typeof record.email === 'string' &&
    (typeof record.tenant_id === 'string' || record.tenant_id === null) &&
    (typeof record.membership_id === 'string' || record.membership_id === null) &&
    record.type === 'access'
  );
}

@WebSocketGateway({
  namespace: '/platform',
  path: '/api/socket.io',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class PlatformGateway
  implements
    OnGatewayInit<PlatformGatewayServer>,
    OnGatewayConnection<PlatformGatewayClient>,
    OnGatewayDisconnect<PlatformGatewayClient>,
    OnModuleDestroy
{
  @WebSocketServer()
  private server!: PlatformGatewayServer;

  private readonly logger = new Logger(PlatformGateway.name);
  private readonly redisSubscriptions = new Map<string, RedisPubSubCallback>();

  constructor(
    private readonly redisPubSub: RedisPubSubService,
    private readonly configService: ConfigService,
    private readonly platformUsers: PlatformUsersService,
  ) {}

  afterInit(server: PlatformGatewayServer): void {
    this.server = server;

    for (const [channel, eventName] of Object.entries(CHANNEL_EVENT_MAP)) {
      if (this.redisSubscriptions.has(channel)) {
        continue;
      }

      const callback: RedisPubSubCallback = (message) => {
        this.server.to(PLATFORM_ADMINS_ROOM).emit(eventName, message);
        const correlationId =
          typeof message.correlation_id === 'string' ? message.correlation_id : undefined;
        if (correlationId) {
          recordCorrelationEvent({
            correlation_id: correlationId,
            source: 'api',
            event_type: 'ws_event',
            payload: { channel, event_name: eventName },
          });
        }
      };
      this.redisSubscriptions.set(channel, callback);
      this.redisPubSub.subscribe(channel, callback);
    }
  }

  onModuleDestroy(): void {
    for (const [channel, callback] of this.redisSubscriptions.entries()) {
      this.redisPubSub.unsubscribe(channel, callback);
    }
    this.redisSubscriptions.clear();
  }

  async handleConnection(client: PlatformGatewayClient): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.rejectClient(client, 'Missing platform WebSocket token');
        return;
      }

      const payload = this.verifyToken(token);
      const isPlatformUser = await this.platformUsers.isMember(payload.sub);
      if (!isPlatformUser) {
        this.rejectClient(client, 'Platform access required');
        return;
      }

      client.data.userId = payload.sub;
      client.join(PLATFORM_ADMINS_ROOM);
      this.logger.debug(`Platform WebSocket client connected for user ${payload.sub}`);
    } catch (err: unknown) {
      this.logger.warn('Rejected platform WebSocket connection', err);
      this.rejectClient(client, 'AUTH_FAILED');
    }
  }

  handleDisconnect(client: PlatformGatewayClient): void {
    const userId = typeof client.data.userId === 'string' ? client.data.userId : 'unknown';
    this.logger.debug(`Platform WebSocket client disconnected for user ${userId}`);
  }

  private extractToken(client: PlatformGatewayClient): string | null {
    const token = client.handshake.auth.token;
    return typeof token === 'string' && token.trim().length > 0 ? token : null;
  }

  private verifyToken(token: string): JwtPayload {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET not configured');
    }

    const decoded = jwt.verify(token, secret);
    if (!isJwtPayload(decoded)) {
      throw new Error('Invalid access token payload');
    }

    return decoded;
  }

  private rejectClient(client: PlatformGatewayClient, reason: string): void {
    client.emit('platform:error', { message: reason });
    client.disconnect(true);
  }
}
