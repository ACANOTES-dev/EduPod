import type { JwtPayload, TenantContext } from '@school/shared';

import { VarianceController } from './variance.controller';
import { VarianceService } from './variance.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const MODEL_ID = '33333333-3333-4333-8333-333333333333';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'nhqs',
  name: 'NHQS',
  status: 'active',
  default_locale: 'en',
  timezone: 'UTC',
};

const USER: JwtPayload = {
  sub: USER_ID,
  email: 'owner@nhqs.test',
  type: 'access',
  tenant_id: TENANT_ID,
} as unknown as JwtPayload;

describe('VarianceController', () => {
  let controller: VarianceController;
  let service: jest.Mocked<VarianceService>;

  beforeEach(() => {
    service = {
      getVariance: jest.fn().mockResolvedValue({ data: [], meta: {} }),
      enqueueRefresh: jest.fn().mockResolvedValue({ job_id: 'job-1' }),
      upsertManualActual: jest.fn().mockResolvedValue({ id: 'actual-1' }),
    } as unknown as jest.Mocked<VarianceService>;
    controller = new VarianceController(service);
  });

  it('GET / delegates to VarianceService.getVariance with period_type + period_label from query', async () => {
    const query = {
      period_type: 'month' as const,
      period_label: 'Sep 2026',
    };
    await controller.getVariance(TENANT, MODEL_ID, query);
    expect(service.getVariance).toHaveBeenCalledWith(TENANT_ID, MODEL_ID, 'month', 'Sep 2026');
  });

  it('GET / forwards undefined period_label when omitted', async () => {
    const query = { period_type: 'year' as const };
    await controller.getVariance(TENANT, MODEL_ID, query);
    expect(service.getVariance).toHaveBeenCalledWith(TENANT_ID, MODEL_ID, 'year', undefined);
  });

  it('POST /refresh enqueues a refresh job via VarianceService.enqueueRefresh', async () => {
    const result = await controller.refresh(TENANT, MODEL_ID);
    expect(service.enqueueRefresh).toHaveBeenCalledWith(TENANT_ID, MODEL_ID);
    expect(result.job_id).toBe('job-1');
  });

  it('POST /manual-actuals delegates to VarianceService.upsertManualActual with tenant + model + user + dto', async () => {
    const dto = {
      line_item_key: 'staff_costs:operations',
      period_type: 'month' as const,
      period_label: 'Sep 2026',
      actual_amount: 1000,
    };
    await controller.upsertManual(TENANT, USER, MODEL_ID, dto);
    expect(service.upsertManualActual).toHaveBeenCalledWith(TENANT_ID, MODEL_ID, USER_ID, dto);
  });
});
