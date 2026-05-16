import { ExecutionContext, ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';

import type { CreateAlertRuleDto, JwtPayload } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';

import { AlertRulesController } from './alert-rules.controller';
import { AlertRulesService } from './alert-rules.service';

const RULE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const RULE_BODY: CreateAlertRuleDto = {
  name: 'PostgreSQL latency',
  metric: 'component_latency',
  condition_config: { component: 'postgresql', operator: 'gt', threshold: 500 },
  severity: 'critical',
  cooldown_minutes: 15,
  is_enabled: true,
  is_security_critical: false,
  notify_emails: ['ops@example.com'],
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
    create: jest.fn().mockResolvedValue({ id: RULE_ID, ...RULE_BODY }),
    list: jest.fn().mockResolvedValue([]),
    remove: jest.fn().mockResolvedValue(undefined),
    toggle: jest.fn().mockResolvedValue({ id: RULE_ID, ...RULE_BODY, is_enabled: false }),
    update: jest.fn().mockResolvedValue({ id: RULE_ID, ...RULE_BODY, is_enabled: false }),
  };
}

describe('AlertRulesController', () => {
  let controller: AlertRulesController;
  let mockService: ReturnType<typeof buildMockService>;

  beforeEach(async () => {
    mockService = buildMockService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertRulesController],
      providers: [{ provide: AlertRulesService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue(buildAuthGuard())
      .overrideGuard(PlatformRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AlertRulesController>(AlertRulesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('delegates list to the service', async () => {
    await controller.list();

    expect(mockService.list).toHaveBeenCalledWith();
  });

  it('delegates create to the service', async () => {
    await controller.create(RULE_BODY, mockUser, mockRequest);

    expect(mockService.create).toHaveBeenCalledWith(RULE_BODY, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });

  it('delegates update to the service', async () => {
    await controller.update(RULE_ID, { is_enabled: false }, mockUser, mockRequest);

    expect(mockService.update).toHaveBeenCalledWith(
      RULE_ID,
      { is_enabled: false },
      {
        actor_user_id: USER_ID,
        ip_address: undefined,
        user_agent: undefined,
      },
    );
  });

  it('delegates toggle to the service', async () => {
    await controller.toggle(RULE_ID, { is_enabled: false }, mockUser, mockRequest);

    expect(mockService.toggle).toHaveBeenCalledWith(RULE_ID, false, {
      actor_user_id: USER_ID,
      ip_address: undefined,
      user_agent: undefined,
    });
  });
});

describe('AlertRulesController — HTTP guards and validation', () => {
  let app: INestApplication;
  let mockService: ReturnType<typeof buildMockService>;

  async function createApp(platformGuard: {
    canActivate: () => boolean;
  }): Promise<INestApplication> {
    mockService = buildMockService();

    const module = await Test.createTestingModule({
      controllers: [AlertRulesController],
      providers: [{ provide: AlertRulesService, useValue: mockService }],
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

  it('creates a rule for valid payloads', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer()).post('/v1/admin/alerts/rules').send(RULE_BODY).expect(201);

    expect(mockService.create).toHaveBeenCalledWith(
      { ...RULE_BODY, channel_ids: [] },
      expect.objectContaining({ actor_user_id: USER_ID }),
    );
  });

  it('returns 400 for invalid component metric payloads', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer())
      .post('/v1/admin/alerts/rules')
      .send({
        ...RULE_BODY,
        condition_config: { operator: 'gt', threshold: 500 },
      })
      .expect(400);
  });

  it('returns 400 for queue metrics without a queue', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer())
      .post('/v1/admin/alerts/rules')
      .send({
        ...RULE_BODY,
        metric: 'queue_depth',
        condition_config: { operator: 'gt', threshold: 100 },
      })
      .expect(400);
  });

  it('toggles a rule through the dedicated endpoint', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer())
      .patch(`/v1/admin/alerts/rules/${RULE_ID}/toggle`)
      .send({ is_enabled: false })
      .expect(200);

    expect(mockService.toggle).toHaveBeenCalledWith(
      RULE_ID,
      false,
      expect.objectContaining({ actor_user_id: USER_ID }),
    );
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

    await request(app.getHttpServer()).get('/v1/admin/alerts/rules').expect(403);
  });
});
