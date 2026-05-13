import { Logger } from '@nestjs/common';

import { TenantModuleCacheBusService } from './tenant-module-cache-bus.service';

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('TenantModuleCacheBusService', () => {
  const publish = jest.fn();
  const redis = {
    getClient: jest.fn(() => ({ publish })),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(123_456);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('publishes tenant module invalidation payloads to Redis pub/sub', async () => {
    publish.mockResolvedValueOnce(1);
    const service = new TenantModuleCacheBusService(redis as never);

    await service.publishInvalidation(TENANT_ID, 'finance', false);

    expect(publish).toHaveBeenCalledWith(
      TenantModuleCacheBusService.CHANNEL,
      JSON.stringify({
        tenantId: TENANT_ID,
        module_key: 'finance',
        is_enabled: false,
        timestamp: 123_456,
      }),
    );
  });

  it('logs publish failures without throwing', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    publish.mockRejectedValueOnce(new Error('redis unavailable'));
    const service = new TenantModuleCacheBusService(redis as never);

    await expect(service.publishInvalidation(TENANT_ID, 'finance', true)).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to publish tenant module invalidation'),
    );
  });
});
