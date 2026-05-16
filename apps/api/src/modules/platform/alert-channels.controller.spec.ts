import { ExecutionContext, ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';

import type { CreateAlertChannelDto, JwtPayload } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';

import { AlertChannelsController } from './alert-channels.controller';
import { AlertChannelsService } from './alert-channels.service';

const CHANNEL_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const CHANNEL_BODY: CreateAlertChannelDto = {
  config: { recipients: ['ops@example.com'] },
  is_enabled: true,
  name: 'Ops email',
  type: 'email',
};
const mockUser: JwtPayload = {
  sub: USER_ID,
  email: 'owner@example.com',
  tenant_id: null,
  membership_id: null,
  type: 'access',
  iat: 0,
  exp: 0,
};
const mockRequest = { headers: {} } as Request;

function buildAuthGuard() {
  return {
    canActivate: (context: ExecutionContext) => {
      const requestObject = context.switchToHttp().getRequest<{ currentUser?: JwtPayload }>();
      requestObject.currentUser = mockUser;
      return true;
    },
  };
}

function buildMockService() {
  return {
    createChannel: jest.fn().mockResolvedValue({ id: CHANNEL_ID, ...CHANNEL_BODY }),
    deleteChannel: jest.fn().mockResolvedValue(undefined),
    listChannels: jest.fn().mockResolvedValue([]),
    testChannel: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
    updateChannel: jest.fn().mockResolvedValue({ id: CHANNEL_ID, ...CHANNEL_BODY }),
  };
}

describe('AlertChannelsController', () => {
  let controller: AlertChannelsController;
  let mockService: ReturnType<typeof buildMockService>;

  beforeEach(async () => {
    mockService = buildMockService();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertChannelsController],
      providers: [{ provide: AlertChannelsService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue(buildAuthGuard())
      .overrideGuard(PlatformRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AlertChannelsController>(AlertChannelsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('delegates list to the service', async () => {
    await controller.listChannels();

    expect(mockService.listChannels).toHaveBeenCalledWith();
  });

  it('delegates create to the service with audit context', async () => {
    await controller.createChannel(CHANNEL_BODY, mockUser, mockRequest);

    expect(mockService.createChannel).toHaveBeenCalledWith(CHANNEL_BODY, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });

  it('delegates test sends to the service with audit context', async () => {
    await controller.testChannel(CHANNEL_ID, mockUser, mockRequest);

    expect(mockService.testChannel).toHaveBeenCalledWith(CHANNEL_ID, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });
});

describe('AlertChannelsController — HTTP guards and validation', () => {
  let app: INestApplication;
  let mockService: ReturnType<typeof buildMockService>;

  async function createApp(platformGuard: {
    canActivate: () => boolean;
  }): Promise<INestApplication> {
    mockService = buildMockService();
    const module = await Test.createTestingModule({
      controllers: [AlertChannelsController],
      providers: [{ provide: AlertChannelsService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue(buildAuthGuard())
      .overrideGuard(PlatformRoleGuard)
      .useValue(platformGuard)
      .compile();

    const nestApp = module.createNestApplication();
    await nestApp.init();
    return nestApp;
  }

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    jest.clearAllMocks();
  });

  it('creates a channel for valid payloads', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer())
      .post('/v1/admin/alerts/channels')
      .send(CHANNEL_BODY)
      .expect(201);

    expect(mockService.createChannel).toHaveBeenCalledWith(
      CHANNEL_BODY,
      expect.objectContaining({ actor_user_id: USER_ID }),
    );
  });

  it('returns 400 for invalid whatsapp numbers', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer())
      .post('/v1/admin/alerts/channels')
      .send({
        config: { to_number: '123' },
        is_enabled: true,
        name: 'Bad WhatsApp',
        type: 'whatsapp',
      })
      .expect(400);
  });

  it('returns 403 when platform guard rejects access', async () => {
    app = await createApp({
      canActivate: () => {
        throw new ForbiddenException({
          code: 'PLATFORM_ACCESS_DENIED',
          message: 'Platform owner access required',
        });
      },
    });

    await request(app.getHttpServer()).get('/v1/admin/alerts/channels').expect(403);
  });
});
