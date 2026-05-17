import { ExecutionContext, ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';

import type { CreateAlertSilenceDto, JwtPayload, RemoveAlertSilenceDto } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';

import { AlertSilenceService } from './alert-silence.service';
import { AlertSilencesController } from './alert-silences.controller';

const SILENCE_ID = '11111111-1111-4111-8111-111111111111';
const RULE_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

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

const createBody: CreateAlertSilenceDto = {
  scope: 'single_rule',
  alert_rule_id: RULE_ID,
  reason: 'Pausing a noisy rule during planned remediation.',
  ends_at: new Date('2026-05-18T12:00:00.000Z'),
};
const removeBody: RemoveAlertSilenceDto = {
  reason: 'Remediation complete and alerts should resume.',
};

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
    create: jest.fn().mockResolvedValue({ id: SILENCE_ID, ...createBody }),
    list: jest.fn().mockResolvedValue([]),
    remove: jest.fn().mockResolvedValue({ id: SILENCE_ID, ...createBody, removed_at: new Date() }),
  };
}

describe('AlertSilencesController', () => {
  let controller: AlertSilencesController;
  let mockService: ReturnType<typeof buildMockService>;

  beforeEach(async () => {
    mockService = buildMockService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertSilencesController],
      providers: [{ provide: AlertSilenceService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue(buildAuthGuard())
      .overrideGuard(PlatformRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AlertSilencesController>(AlertSilencesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('delegates list to the service with parsed query values', async () => {
    await controller.list({ include_expired: true });

    expect(mockService.list).toHaveBeenCalledWith({ include_expired: true });
  });

  it('delegates create to the service with the actor and audit context', async () => {
    await controller.create(createBody, mockUser, mockRequest);

    expect(mockService.create).toHaveBeenCalledWith(createBody, USER_ID, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });

  it('delegates remove to the service with the actor and audit context', async () => {
    await controller.remove(SILENCE_ID, removeBody, mockUser, mockRequest);

    expect(mockService.remove).toHaveBeenCalledWith(SILENCE_ID, removeBody, USER_ID, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });
});

describe('AlertSilencesController — HTTP guards and validation', () => {
  let app: INestApplication;
  let mockService: ReturnType<typeof buildMockService>;

  async function createApp(platformGuard: {
    canActivate: () => boolean;
  }): Promise<INestApplication> {
    mockService = buildMockService();

    const module = await Test.createTestingModule({
      controllers: [AlertSilencesController],
      providers: [{ provide: AlertSilenceService, useValue: mockService }],
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

  it('creates a silence for valid payloads', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer())
      .post('/v1/admin/alert-silences')
      .send({
        ...createBody,
        ends_at: createBody.ends_at.toISOString(),
      })
      .expect(201);

    expect(mockService.create).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'single_rule', alert_rule_id: RULE_ID }),
      USER_ID,
      expect.objectContaining({ actor_user_id: USER_ID }),
    );
  });

  it('returns 400 for invalid global targets', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer())
      .post('/v1/admin/alert-silences')
      .send({
        scope: 'global',
        alert_rule_id: RULE_ID,
        reason: 'Invalid global target payload.',
        ends_at: '2026-05-17T12:00:00.000Z',
      })
      .expect(400);
  });

  it('returns 403 when platform owner guard rejects access', async () => {
    app = await createApp({
      canActivate: () => {
        throw new ForbiddenException({
          code: 'PLATFORM_ACCESS_DENIED',
          message: 'Platform owner access required',
        });
      },
    });

    await request(app.getHttpServer()).get('/v1/admin/alert-silences').expect(403);
  });
});
