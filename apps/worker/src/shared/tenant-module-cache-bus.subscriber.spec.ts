import { TenantModuleCacheBusService } from '../../../api/src/common/services/tenant-module-cache-bus.service';

import { TenantModuleCacheBusSubscriber } from './tenant-module-cache-bus.subscriber';

jest.mock('../base/redis.helpers', () => ({
  getRedisClient: jest.fn(),
}));

const { getRedisClient } = jest.requireMock('../base/redis.helpers') as {
  getRedisClient: jest.Mock;
};

describe('TenantModuleCacheBusSubscriber', () => {
  const subscriber = {
    on: jest.fn(),
    quit: jest.fn().mockResolvedValue('OK'),
    subscribe: jest.fn().mockResolvedValue(1),
    unsubscribe: jest.fn().mockResolvedValue(1),
  };
  const publisher = {
    duplicate: jest.fn(() => subscriber),
  };
  const tenantModuleService = {
    invalidateCache: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getRedisClient.mockReturnValue(publisher);
  });

  it('subscribes to tenant module invalidation events at boot', async () => {
    const service = new TenantModuleCacheBusSubscriber(tenantModuleService as never);

    await service.onModuleInit();

    expect(publisher.duplicate).toHaveBeenCalled();
    expect(subscriber.subscribe).toHaveBeenCalledWith(TenantModuleCacheBusService.CHANNEL);
    expect(subscriber.on).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('invalidates worker cache for valid messages', async () => {
    const service = new TenantModuleCacheBusSubscriber(tenantModuleService as never);
    await service.onModuleInit();
    const onMessage = subscriber.on.mock.calls.find(([event]) => event === 'message')?.[1] as (
      channel: string,
      raw: string,
    ) => void;

    onMessage(
      TenantModuleCacheBusService.CHANNEL,
      JSON.stringify({
        tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        module_key: 'finance',
        is_enabled: false,
        timestamp: 123,
      }),
    );
    await Promise.resolve();

    expect(tenantModuleService.invalidateCache).toHaveBeenCalledWith(
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    );
  });
});
