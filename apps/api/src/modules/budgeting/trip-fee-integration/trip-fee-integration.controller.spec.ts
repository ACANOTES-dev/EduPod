import type { JwtPayload, TenantContext } from '@school/shared';

import { TripFeeIntegrationController } from './trip-fee-integration.controller';
import { TripFeeIntegrationService } from './trip-fee-integration.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const MEMBERSHIP_ID = '33333333-3333-4333-8333-333333333333';
const EVENT_ID = '44444444-4444-4444-8444-444444444444';

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
  membership_id: MEMBERSHIP_ID,
} as unknown as JwtPayload;

describe('TripFeeIntegrationController', () => {
  let controller: TripFeeIntegrationController;
  let service: jest.Mocked<TripFeeIntegrationService>;

  beforeEach(() => {
    service = {
      previewGenerateFees: jest.fn().mockResolvedValue({
        totals: { student_count: 20, total_to_invoice: 5000, school_subsidy: 0 },
        households: [],
      }),
      generateFees: jest.fn().mockResolvedValue({
        fee_generation_run_id: 'run-1',
        invoice_count: 20,
      }),
      markSchoolFunded: jest.fn().mockResolvedValue({ id: EVENT_ID, status: 'fees_generated' }),
    } as unknown as jest.Mocked<TripFeeIntegrationService>;
    controller = new TripFeeIntegrationController(service);
  });

  it('GET …/generate-fees/preview delegates to TripFeeIntegrationService.previewGenerateFees', async () => {
    const result = await controller.preview(TENANT, EVENT_ID);
    expect(service.previewGenerateFees).toHaveBeenCalledWith(TENANT_ID, EVENT_ID);
    expect(result.totals.student_count).toBe(20);
  });

  it('POST …/generate-fees delegates with tenant + membership + user + id + body', async () => {
    const body = { confirm: true } as Parameters<TripFeeIntegrationController['generateFees']>[3];
    await controller.generateFees(TENANT, USER, EVENT_ID, body);
    expect(service.generateFees).toHaveBeenCalledWith(
      TENANT_ID,
      MEMBERSHIP_ID,
      USER_ID,
      EVENT_ID,
      body,
    );
  });

  it('POST …/mark-school-funded delegates with tenant + membership + user + id', async () => {
    const result = await controller.markSchoolFunded(TENANT, USER, EVENT_ID);
    expect(service.markSchoolFunded).toHaveBeenCalledWith(
      TENANT_ID,
      MEMBERSHIP_ID,
      USER_ID,
      EVENT_ID,
    );
    expect(result.status).toBe('fees_generated');
  });
});
