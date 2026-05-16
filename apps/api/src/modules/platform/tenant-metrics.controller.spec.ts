import { ExecutionContext, ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import type { JwtPayload } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { PlatformErrorLogService } from '../platform-error-log/platform-error-log.service';

import { TenantMetricsController } from './tenant-metrics.controller';
import { TenantMetricsService } from './tenant-metrics.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_TWO_ID = '22222222-2222-4222-8222-222222222222';
const ERROR_ID = '33333333-3333-4333-8333-333333333333';
const USER: JwtPayload = {
  sub: '44444444-4444-4444-8444-444444444444',
  email: 'owner@example.com',
  tenant_id: null,
  membership_id: null,
  type: 'access',
  iat: 0,
  exp: 0,
};

function buildAuthGuard() {
  return {
    canActivate: (context: ExecutionContext) => {
      const requestObject = context.switchToHttp().getRequest<{ currentUser?: JwtPayload }>();
      requestObject.currentUser = USER;
      return true;
    },
  };
}

function buildMetricsService() {
  return {
    compareMetrics: jest.fn().mockResolvedValue([]),
    getMetricsForTenant: jest.fn().mockResolvedValue({ latest: null, history: [] }),
  };
}

function buildErrorLogService() {
  return {
    getRedacted: jest.fn().mockResolvedValue({ id: ERROR_ID }),
    listRedacted: jest
      .fn()
      .mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }),
  };
}

describe('TenantMetricsController', () => {
  let controller: TenantMetricsController;
  let metricsService: ReturnType<typeof buildMetricsService>;
  let errorLogService: ReturnType<typeof buildErrorLogService>;

  beforeEach(async () => {
    metricsService = buildMetricsService();
    errorLogService = buildErrorLogService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantMetricsController],
      providers: [
        { provide: TenantMetricsService, useValue: metricsService },
        { provide: PlatformErrorLogService, useValue: errorLogService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue(buildAuthGuard())
      .overrideGuard(PlatformRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TenantMetricsController>(TenantMetricsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns tenant metrics with the requested range', async () => {
    await controller.getTenantMetrics(TENANT_ID, { days: 7 });

    expect(metricsService.getMetricsForTenant).toHaveBeenCalledWith(TENANT_ID, 7);
  });

  it('returns compared metrics for multiple tenants', async () => {
    await controller.compareMetrics({ tenant_ids: [TENANT_ID, TENANT_TWO_ID], days: 30 });

    expect(metricsService.compareMetrics).toHaveBeenCalledWith([TENANT_ID, TENANT_TWO_ID], 30);
  });

  it('returns tenant errors by forcing the tenant filter', async () => {
    await controller.getTenantErrors(TENANT_ID, {
      page: 1,
      pageSize: 20,
      tenant_id: TENANT_TWO_ID,
    });

    expect(errorLogService.listRedacted).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      tenant_id: TENANT_ID,
    });
  });

  it('returns platform-wide errors and single error details', async () => {
    await controller.listErrors({ page: 1, pageSize: 20 });
    await controller.getError(ERROR_ID);

    expect(errorLogService.listRedacted).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
    expect(errorLogService.getRedacted).toHaveBeenCalledWith(ERROR_ID);
  });
});

describe('TenantMetricsController — HTTP guards and validation', () => {
  let app: INestApplication;
  let metricsService: ReturnType<typeof buildMetricsService>;
  let errorLogService: ReturnType<typeof buildErrorLogService>;

  async function createApp(platformGuard: {
    canActivate: () => boolean;
  }): Promise<INestApplication> {
    metricsService = buildMetricsService();
    errorLogService = buildErrorLogService();

    const module = await Test.createTestingModule({
      controllers: [TenantMetricsController],
      providers: [
        { provide: TenantMetricsService, useValue: metricsService },
        { provide: PlatformErrorLogService, useValue: errorLogService },
      ],
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

  it('routes static tenant metrics compare before dynamic tenant id routes', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer())
      .get(`/v1/admin/tenants/metrics/compare?tenant_ids=${TENANT_ID},${TENANT_TWO_ID}`)
      .expect(200);

    expect(metricsService.compareMetrics).toHaveBeenCalledWith([TENANT_ID, TENANT_TWO_ID], 30);
    expect(metricsService.getMetricsForTenant).not.toHaveBeenCalled();
  });

  it('returns tenant metrics for platform users', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer()).get(`/v1/admin/tenants/${TENANT_ID}/metrics`).expect(200);

    expect(metricsService.getMetricsForTenant).toHaveBeenCalledWith(TENANT_ID, 30);
  });

  it('returns 403 when platform permission guard rejects access', async () => {
    app = await createApp({
      canActivate: () => {
        throw new ForbiddenException({
          code: 'PLATFORM_PERMISSION_DENIED',
          message: 'You do not have permission to perform this action.',
        });
      },
    });

    await request(app.getHttpServer()).get(`/v1/admin/tenants/${TENANT_ID}/metrics`).expect(403);
  });

  it('returns 400 for invalid comparison tenant count', async () => {
    app = await createApp({ canActivate: () => true });

    await request(app.getHttpServer())
      .get(`/v1/admin/tenants/metrics/compare?tenant_ids=${TENANT_ID}`)
      .expect(400);
  });
});
