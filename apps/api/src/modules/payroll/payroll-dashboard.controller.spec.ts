import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { PayrollDashboardController } from './payroll-dashboard.controller';
import { PayrollDashboardService } from './payroll-dashboard.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const tenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active' as const,
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const mockService = {
  getDashboard: jest.fn(),
};

describe('PayrollDashboardController', () => {
  let controller: PayrollDashboardController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [PayrollDashboardController],
      providers: [{ provide: PayrollDashboardService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PayrollDashboardController>(PayrollDashboardController);
  });

  describe('getDashboard', () => {
    it('should delegate to service with tenant_id', async () => {
      const dashboardData = {
        latest_run: null,
        latest_finalised: null,
        cost_trend: [],
        incomplete_entries: [],
        current_draft_id: null,
      };
      mockService.getDashboard.mockResolvedValue(dashboardData);

      const result = await controller.getDashboard(tenantContext);

      expect(mockService.getDashboard).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toEqual(dashboardData);
    });

    it('should return service result directly', async () => {
      const dashboardData = {
        latest_run: { id: 'run-1', period_label: 'March 2026', total_pay: 5000 },
        latest_finalised: null,
        cost_trend: [{ period_month: 3, period_year: 2026, total_pay: 5000 }],
        incomplete_entries: [],
        current_draft_id: 'run-1',
      };
      mockService.getDashboard.mockResolvedValue(dashboardData);

      const result = await controller.getDashboard(tenantContext);

      expect(result).toEqual(dashboardData);
    });

    it('should call service exactly once per request', async () => {
      mockService.getDashboard.mockResolvedValue({
        latest_run: null,
        latest_finalised: null,
        cost_trend: [],
        incomplete_entries: [],
        current_draft_id: null,
      });

      await controller.getDashboard(tenantContext);

      expect(mockService.getDashboard).toHaveBeenCalledTimes(1);
    });
  });
});

// ─── Permission denied (guard rejection via HTTP) ──────────────────────────────

describe('PayrollDashboardController — permission denied', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [PayrollDashboardController],
      providers: [{ provide: PayrollDashboardService, useValue: mockService }],
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

  it('should return 403 when user lacks payroll.view permission (GET /v1/payroll/dashboard)', async () => {
    await request(app.getHttpServer()).get('/v1/payroll/dashboard').send({}).expect(403);
  });
});
