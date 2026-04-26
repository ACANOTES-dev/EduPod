import type { JwtPayload, TenantContext } from '@school/shared';
import { BUDGETING_TENANT_PREFERENCES_DEFAULTS } from '@school/shared/budgeting';

import { TenantPreferencesController } from './tenant-preferences.controller';
import { TenantPreferencesService } from './tenant-preferences.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

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
 * controller's class-level @UseGuards(AuthGuard, PermissionGuard) decorators
 * trigger DI resolution for AuthGuard's ConfigService + RequestContextService
 * deps when Nest's testing module compiles. We test the controller method
 * implementations in isolation here; guard behaviour is covered by the
 * common/guards/*.spec.ts files.
 */
describe('TenantPreferencesController', () => {
  let controller: TenantPreferencesController;
  let service: jest.Mocked<TenantPreferencesService>;

  beforeEach(() => {
    service = {
      getOrCreate: jest.fn().mockResolvedValue(BUDGETING_TENANT_PREFERENCES_DEFAULTS),
      update: jest.fn().mockResolvedValue({
        ...BUDGETING_TENANT_PREFERENCES_DEFAULTS,
        default_household_share_pct: 75,
      }),
    } as unknown as jest.Mocked<TenantPreferencesService>;

    controller = new TenantPreferencesController(service);
  });

  describe('GET /v1/budgeting/tenant-preferences', () => {
    it('delegates to TenantPreferencesService.getOrCreate with the tenant + user from the request', async () => {
      const result = await controller.get(TENANT, USER);
      expect(service.getOrCreate).toHaveBeenCalledWith(TENANT_ID, USER_ID);
      expect(result).toEqual(BUDGETING_TENANT_PREFERENCES_DEFAULTS);
    });
  });

  describe('PATCH /v1/budgeting/tenant-preferences', () => {
    it('delegates to TenantPreferencesService.update with the tenant + user + body', async () => {
      const body = { default_household_share_pct: 75 } as const;
      const result = await controller.update(TENANT, USER, body);
      expect(service.update).toHaveBeenCalledWith(TENANT_ID, USER_ID, body);
      expect(result.default_household_share_pct).toBe(75);
    });

    it('passes through full payload mutations including the hidden_kpi_keys array', async () => {
      const body = {
        hidden_kpi_keys: ['breakeven_students' as const],
        default_export_format: 'both' as const,
      };
      service.update.mockResolvedValue({
        ...BUDGETING_TENANT_PREFERENCES_DEFAULTS,
        ...body,
      });
      const result = await controller.update(TENANT, USER, body);
      expect(service.update).toHaveBeenCalledWith(TENANT_ID, USER_ID, body);
      expect(result.hidden_kpi_keys).toEqual(['breakeven_students']);
      expect(result.default_export_format).toBe('both');
    });
  });
});
