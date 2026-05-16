import { TenantSelfController } from './tenant-self.controller';
import { TenantsService } from './tenants.service';

const TENANT_ID = '11111111-2222-4333-8444-555555555555';

describe('TenantSelfController', () => {
  let controller: TenantSelfController;
  let tenantsService: { getTenantLocaleConfig: jest.Mock };

  beforeEach(async () => {
    tenantsService = {
      getTenantLocaleConfig: jest.fn().mockResolvedValue({ default_locale: 'en' }),
    };

    controller = new TenantSelfController(tenantsService as unknown as TenantsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('TenantSelfController — getCurrentTenant', () => {
    it('returns locale configuration for the current tenant context', async () => {
      await expect(
        controller.getCurrentTenant({
          tenant_id: TENANT_ID,
          user_id: 'user-1',
        }),
      ).resolves.toEqual({ default_locale: 'en' });

      expect(tenantsService.getTenantLocaleConfig).toHaveBeenCalledWith(TENANT_ID);
    });
  });
});
