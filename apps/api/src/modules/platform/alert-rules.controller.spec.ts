import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import type { CreateAlertRuleDto } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformOwnerGuard } from '../tenants/guards/platform-owner.guard';

import { AlertRulesController } from './alert-rules.controller';
import { AlertRulesService } from './alert-rules.service';

const RULE_ID = '11111111-1111-4111-8111-111111111111';
const RULE_BODY: CreateAlertRuleDto = {
  name: 'PostgreSQL latency',
  metric: 'component_latency',
  condition_config: { component: 'postgresql', operator: 'gt', threshold: 500 },
  severity: 'critical',
  cooldown_minutes: 15,
  is_enabled: true,
  notify_emails: ['ops@example.com'],
};

function buildMockService() {
  return {
    create: jest.fn().mockResolvedValue({ id: RULE_ID, ...RULE_BODY }),
    list: jest.fn().mockResolvedValue([]),
    remove: jest.fn().mockResolvedValue(undefined),
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
      .useValue({ canActivate: () => true })
      .overrideGuard(PlatformOwnerGuard)
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
    await controller.create(RULE_BODY);

    expect(mockService.create).toHaveBeenCalledWith(RULE_BODY);
  });

  it('delegates update to the service', async () => {
    await controller.update(RULE_ID, { is_enabled: false });

    expect(mockService.update).toHaveBeenCalledWith(RULE_ID, { is_enabled: false });
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
      .useValue({ canActivate: () => true })
      .overrideGuard(PlatformOwnerGuard)
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

    expect(mockService.create).toHaveBeenCalledWith(RULE_BODY);
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
