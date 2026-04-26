import type { JwtPayload, TenantContext } from '@school/shared';

import { LineItemsController } from './line-items.controller';
import { LineItemsService } from './line-items.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const MODEL_ID = '33333333-3333-4333-8333-333333333333';
const LINE_ID = '44444444-4444-4444-8444-444444444444';

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

describe('LineItemsController', () => {
  let controller: LineItemsController;
  let service: jest.Mocked<LineItemsService>;

  beforeEach(() => {
    service = {
      createCustom: jest.fn().mockResolvedValue({ id: LINE_ID, source: 'custom' }),
      update: jest.fn().mockResolvedValue({ id: LINE_ID, amount: 1000 }),
      delete: jest.fn().mockResolvedValue({ deleted: true }),
      resetToDerived: jest.fn().mockResolvedValue({ id: LINE_ID, source: 'driver_derived' }),
    } as unknown as jest.Mocked<LineItemsService>;
    controller = new LineItemsController(service);
  });

  it('POST / delegates to LineItemsService.createCustom', async () => {
    const dto = {
      category: 'income' as const,
      subcategory: 'donations',
      name: 'Capital campaign',
      fiscal_year: 1,
      amount: 5000,
    };
    await controller.createCustom(TENANT, USER, MODEL_ID, dto);
    expect(service.createCustom).toHaveBeenCalledWith(TENANT_ID, MODEL_ID, USER_ID, dto);
  });

  it('PATCH /:lineId delegates to LineItemsService.update', async () => {
    const dto = { amount: 1000 };
    await controller.update(TENANT, USER, MODEL_ID, LINE_ID, dto);
    expect(service.update).toHaveBeenCalledWith(TENANT_ID, MODEL_ID, LINE_ID, USER_ID, dto);
  });

  it('DELETE /:lineId delegates to LineItemsService.delete', async () => {
    await controller.delete(TENANT, USER, MODEL_ID, LINE_ID);
    expect(service.delete).toHaveBeenCalledWith(TENANT_ID, MODEL_ID, LINE_ID, USER_ID);
  });

  it('POST /:lineId/reset-to-derived delegates to LineItemsService.resetToDerived', async () => {
    const result = await controller.resetToDerived(TENANT, USER, MODEL_ID, LINE_ID);
    expect(service.resetToDerived).toHaveBeenCalledWith(TENANT_ID, MODEL_ID, LINE_ID, USER_ID);
    expect(result.source).toBe('driver_derived');
  });
});
