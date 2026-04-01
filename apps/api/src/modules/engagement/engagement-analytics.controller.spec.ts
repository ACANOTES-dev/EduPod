import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AuthGuard } from '../../common/guards/auth.guard';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { EngagementAnalyticsController } from './engagement-analytics.controller';
import { EngagementAnalyticsService } from './engagement-analytics.service';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

const tenantCtx = {
  tenant_id: TENANT_ID,
  slug: 'test',
  name: 'Test School',
  status: 'active' as const,
  default_locale: 'en',
  timezone: 'UTC',
};

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockAnalyticsService = {
  getOverview: jest.fn(),
  getCompletionRates: jest.fn(),
  getCalendarEvents: jest.fn(),
};

describe('EngagementAnalyticsController', () => {
  let controller: EngagementAnalyticsController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [EngagementAnalyticsController],
      providers: [{ provide: EngagementAnalyticsService, useValue: mockAnalyticsService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<EngagementAnalyticsController>(EngagementAnalyticsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('getOverview — delegates to analytics service', async () => {
    const query = {
      academic_year_id: '00000000-0000-0000-0000-000000000010',
      event_type: 'school_trip' as const,
      date_from: '2026-01-01',
      date_to: '2026-01-31',
    };
    mockAnalyticsService.getOverview.mockResolvedValue({ summary: {} });

    await controller.getOverview(tenantCtx, query);

    expect(mockAnalyticsService.getOverview).toHaveBeenCalledWith(TENANT_ID, query);
  });

  it('getCompletionRates — delegates to analytics service', async () => {
    const query = {
      academic_year_id: '00000000-0000-0000-0000-000000000010',
    };
    mockAnalyticsService.getCompletionRates.mockResolvedValue({ event_type_completion: [] });

    await controller.getCompletionRates(tenantCtx, query);

    expect(mockAnalyticsService.getCompletionRates).toHaveBeenCalledWith(TENANT_ID, query);
  });

  it('getCalendarEvents — delegates to analytics service', async () => {
    const query = {
      date_from: '2026-02-01',
      date_to: '2026-02-28',
    };
    mockAnalyticsService.getCalendarEvents.mockResolvedValue({ data: [] });

    await controller.getCalendarEvents(tenantCtx, query);

    expect(mockAnalyticsService.getCalendarEvents).toHaveBeenCalledWith(TENANT_ID, query);
  });
});

// ─── Permission denied (guard rejection via HTTP) ──────────────────────────────

describe('EngagementAnalyticsController — permission denied', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [EngagementAnalyticsController],
      providers: [{ provide: EngagementAnalyticsService, useValue: mockAnalyticsService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({
        canActivate: () => {
          throw new ForbiddenException({
            error: { code: 'PERMISSION_DENIED', message: 'Missing required permission' },
          });
        },
      })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should return 403 when user lacks engagement.events.view_dashboard permission (GET /v1/engagement/analytics/overview)', async () => {
    await request(app.getHttpServer())
      .get('/v1/engagement/analytics/overview')
      .send({})
      .expect(403);
  });
});
