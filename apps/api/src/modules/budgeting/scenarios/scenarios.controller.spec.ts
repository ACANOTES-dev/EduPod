import type { JwtPayload, TenantContext } from '@school/shared';

import { ScenariosController } from './scenarios.controller';
import { ScenariosService } from './scenarios.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const MODEL_ID = '33333333-3333-4333-8333-333333333333';
const SCENARIO_ID = '44444444-4444-4444-8444-444444444444';

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

describe('ScenariosController', () => {
  let controller: ScenariosController;
  let service: jest.Mocked<ScenariosService>;

  beforeEach(() => {
    service = {
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: SCENARIO_ID, name: 'Cautious' }),
      create: jest.fn().mockResolvedValue({ id: SCENARIO_ID, name: 'Cautious' }),
      update: jest.fn().mockResolvedValue({ id: SCENARIO_ID, name: 'Cautious v2' }),
      delete: jest.fn().mockResolvedValue({ deleted: true }),
    } as unknown as jest.Mocked<ScenariosService>;
    controller = new ScenariosController(service);
  });

  it('GET / delegates to ScenariosService.findAll', async () => {
    await controller.findAll(TENANT, MODEL_ID);
    expect(service.findAll).toHaveBeenCalledWith(TENANT_ID, MODEL_ID);
  });

  it('GET /:scenarioId delegates to ScenariosService.findOne', async () => {
    await controller.findOne(TENANT, MODEL_ID, SCENARIO_ID);
    expect(service.findOne).toHaveBeenCalledWith(TENANT_ID, MODEL_ID, SCENARIO_ID);
  });

  it('POST / delegates to ScenariosService.create with tenant + model + user + dto', async () => {
    const dto = { name: 'Cautious', driver_overrides: {} };
    await controller.create(TENANT, USER, MODEL_ID, dto);
    expect(service.create).toHaveBeenCalledWith(TENANT_ID, MODEL_ID, USER_ID, dto);
  });

  it('PATCH /:scenarioId delegates to ScenariosService.update', async () => {
    const dto = { name: 'Cautious v2' };
    await controller.update(TENANT, USER, MODEL_ID, SCENARIO_ID, dto);
    expect(service.update).toHaveBeenCalledWith(TENANT_ID, MODEL_ID, SCENARIO_ID, USER_ID, dto);
  });

  it('DELETE /:scenarioId delegates to ScenariosService.delete', async () => {
    await controller.delete(TENANT, USER, MODEL_ID, SCENARIO_ID);
    expect(service.delete).toHaveBeenCalledWith(TENANT_ID, MODEL_ID, SCENARIO_ID, USER_ID);
  });
});
