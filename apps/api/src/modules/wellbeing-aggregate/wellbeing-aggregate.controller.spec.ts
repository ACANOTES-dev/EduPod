/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext } from '@school/shared';
import type { WellbeingDashboardSummary } from '@school/shared/wellbeing';

import { WellbeingAggregateController } from './wellbeing-aggregate.controller';
import { WellbeingAggregateService } from './wellbeing-aggregate.service';

const TENANT: TenantContext = {
  tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  slug: 'test',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const SAMPLE: WellbeingDashboardSummary = {
  kpis: {
    students_at_risk: { amber: 0, red: 0, total: 0 },
    open_incidents: { total: 0, positive: 0, negative: 0 },
    open_pastoral_cases: 0,
    overdue_actions: { sanctions: 0, tasks: 0, sla_breaches: 0, total: 0 },
  },
  pending_attention: [],
  hub_counts: { behaviour: 0, pastoral: 0, safeguarding: 0, early_warnings: 0, staff_wellbeing: 0 },
  recent_activity: [],
};

describe('WellbeingAggregateController', () => {
  let controller: WellbeingAggregateController;
  let service: { getDashboardSummary: jest.Mock };

  beforeEach(async () => {
    service = { getDashboardSummary: jest.fn().mockResolvedValue(SAMPLE) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WellbeingAggregateController],
      providers: [{ provide: WellbeingAggregateService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WellbeingAggregateController>(WellbeingAggregateController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('GET /v1/wellbeing/dashboard-summary', () => {
    it('wraps the service result in a `data` envelope', async () => {
      const result = await controller.getDashboardSummary(TENANT);
      expect(result).toEqual({ data: SAMPLE });
    });

    it("forwards the current tenant's tenant_id to the service", async () => {
      await controller.getDashboardSummary(TENANT);
      expect(service.getDashboardSummary).toHaveBeenCalledWith(TENANT.tenant_id);
    });
  });
});
