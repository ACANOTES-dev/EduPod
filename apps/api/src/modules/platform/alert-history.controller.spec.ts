import { ExecutionContext, ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';

import { AlertHistoryController } from './alert-history.controller';
import { AlertHistoryService } from './alert-history.service';

const ALERT_ID = '22222222-2222-4222-8222-222222222222';
const RULE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '33333333-3333-4333-8333-333333333333';

function buildMockService() {
  return {
    acknowledge: jest.fn().mockResolvedValue({ id: ALERT_ID, status: 'acknowledged' }),
    list: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }),
  };
}

function buildAuthGuard() {
  return {
    canActivate: (context: ExecutionContext) => {
      const requestObject = context.switchToHttp().getRequest<{
        currentUser?: {
          sub: string;
          email: string;
          tenant_id: string | null;
          membership_id: string | null;
          type: 'access';
        };
      }>();
      requestObject.currentUser = {
        sub: USER_ID,
        email: 'owner@example.com',
        tenant_id: null,
        membership_id: null,
        type: 'access',
      };
      return true;
    },
  };
}

describe('AlertHistoryController', () => {
  let controller: AlertHistoryController;
  let mockService: ReturnType<typeof buildMockService>;

  beforeEach(async () => {
    mockService = buildMockService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertHistoryController],
      providers: [{ provide: AlertHistoryService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue(buildAuthGuard())
      .overrideGuard(PlatformRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AlertHistoryController>(AlertHistoryController);
  });

  afterEach(() => jest.clearAllMocks());

  it('delegates list to the service', async () => {
    await controller.list({ page: 1, pageSize: 20, rule_id: RULE_ID });

    expect(mockService.list).toHaveBeenCalledWith({ page: 1, pageSize: 20, rule_id: RULE_ID });
  });
});

describe('AlertHistoryController — HTTP guards and validation', () => {
  let app: INestApplication;
  let mockService: ReturnType<typeof buildMockService>;

  async function createApp(platformGuard: {
    canActivate: () => boolean;
  }): Promise<INestApplication> {
    mockService = buildMockService();

    const module = await Test.createTestingModule({
      controllers: [AlertHistoryController],
      providers: [{ provide: AlertHistoryService, useValue: mockService }],
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

  it('returns alert history for valid filters', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer())
      .get(`/v1/admin/alerts/history?status=fired&severity=critical&rule_id=${RULE_ID}`)
      .expect(200);

    expect(mockService.list).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      status: 'fired',
      severity: 'critical',
      rule_id: RULE_ID,
    });
  });

  it('acknowledges an alert as the current user', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer())
      .patch(`/v1/admin/alerts/history/${ALERT_ID}/acknowledge`)
      .expect(200);

    expect(mockService.acknowledge).toHaveBeenCalledWith(
      ALERT_ID,
      USER_ID,
      expect.objectContaining({ actor_user_id: USER_ID }),
    );
  });

  it('returns 400 for invalid filters', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer()).get('/v1/admin/alerts/history?status=open').expect(400);
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

    await request(app.getHttpServer()).get('/v1/admin/alerts/history').expect(403);
  });
});
