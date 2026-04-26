import type { JwtPayload, TenantContext } from '@school/shared';

import { FinancialModelsController } from './financial-models.controller';
import { FinancialModelsService } from './financial-models.service';

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

/**
 * Direct instantiation rather than Test.createTestingModule because the
 * controller's @UseGuards triggers DI resolution for AuthGuard's deps.
 */
describe('FinancialModelsController', () => {
  let controller: FinancialModelsController;
  let service: jest.Mocked<FinancialModelsService>;

  beforeEach(() => {
    service = {
      findAll: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }),
      findOne: jest
        .fn()
        .mockResolvedValue({ model: { id: MODEL_ID }, scenarios: [], line_items: [] }),
      create: jest.fn().mockResolvedValue({ model: { id: MODEL_ID } }),
      update: jest.fn().mockResolvedValue({ model: { id: MODEL_ID, name: 'updated' } }),
      archive: jest.fn().mockResolvedValue({ id: MODEL_ID, status: 'archived' }),
      restore: jest.fn().mockResolvedValue({ id: MODEL_ID, status: 'draft' }),
    } as unknown as jest.Mocked<FinancialModelsService>;

    controller = new FinancialModelsController(service);
  });

  describe('GET /v1/budgeting/financial-models', () => {
    it('delegates to FinancialModelsService.findAll with tenant + query', async () => {
      const query = { page: 1, pageSize: 20, order: 'desc' as const };
      await controller.findAll(TENANT, query);
      expect(service.findAll).toHaveBeenCalledWith(TENANT_ID, query);
    });

    it('forwards filter overrides through unchanged', async () => {
      const query = {
        page: 2,
        pageSize: 50,
        order: 'asc' as const,
        status: 'published' as const,
        search: 'budget',
      };
      await controller.findAll(TENANT, query);
      expect(service.findAll).toHaveBeenCalledWith(TENANT_ID, query);
    });
  });

  describe('GET /v1/budgeting/financial-models/:id', () => {
    it('delegates to FinancialModelsService.findOne with tenant + id', async () => {
      const result = await controller.findOne(TENANT, MODEL_ID);
      expect(service.findOne).toHaveBeenCalledWith(TENANT_ID, MODEL_ID);
      expect(result.model.id).toBe(MODEL_ID);
    });
  });

  describe('POST /v1/budgeting/financial-models', () => {
    it('delegates to FinancialModelsService.create with tenant + user + dto', async () => {
      const dto = {
        name: 'FY 2026/27',
        fiscal_year_start: '2026-09-01',
        horizon_years: 1 as const,
      };
      await controller.create(TENANT, USER, dto);
      expect(service.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    });
  });

  describe('PATCH /v1/budgeting/financial-models/:id', () => {
    it('delegates to FinancialModelsService.update with tenant + id + user + dto', async () => {
      const dto = { name: 'updated' };
      await controller.update(TENANT, USER, MODEL_ID, dto);
      // Note: service signature is (tenant, id, user, dto) — different argument
      // order than create. The controller honours that ordering.
      expect(service.update).toHaveBeenCalledWith(TENANT_ID, MODEL_ID, USER_ID, dto);
    });
  });

  describe('DELETE /v1/budgeting/financial-models/:id (archive)', () => {
    it('delegates to FinancialModelsService.archive with tenant + id + user', async () => {
      const result = await controller.archive(TENANT, USER, MODEL_ID);
      expect(service.archive).toHaveBeenCalledWith(TENANT_ID, MODEL_ID, USER_ID);
      expect(result.status).toBe('archived');
    });
  });

  describe('POST /v1/budgeting/financial-models/:id/restore', () => {
    it('delegates to FinancialModelsService.restore with tenant + id + user', async () => {
      const result = await controller.restore(TENANT, USER, MODEL_ID);
      expect(service.restore).toHaveBeenCalledWith(TENANT_ID, MODEL_ID, USER_ID);
      expect(result.status).toBe('draft');
    });
  });
});
