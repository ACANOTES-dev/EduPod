import { HttpException } from '@nestjs/common';

import { AlertTestRateLimitService } from './alert-test-rate-limit.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('AlertTestRateLimitService', () => {
  it('allows and audits test-all attempts up to the daily limit', async () => {
    const redisClient = {
      expire: jest.fn().mockResolvedValue(1),
      incr: jest.fn().mockResolvedValue(1),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new AlertTestRateLimitService(
      { getClient: () => redisClient } as never,
      audit as never,
    );

    await service.assertCanTestAll(USER_ID, {
      actor_user_id: USER_ID,
      actor_user_role: 'platform_owner',
      request_id: 'req-1',
    });

    expect(redisClient.expire).toHaveBeenCalledWith(expect.stringContaining(USER_ID), 86_400);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'alert_test_all_routes',
        payload: { after: { count: 1, limit: 5 } },
      }),
    );
  });

  it('rejects the sixth test-all attempt in a day', async () => {
    const service = new AlertTestRateLimitService(
      {
        getClient: () => ({
          expire: jest.fn(),
          incr: jest.fn().mockResolvedValue(6),
        }),
      } as never,
      { log: jest.fn() } as never,
    );

    await expect(service.assertCanTestAll(USER_ID)).rejects.toBeInstanceOf(HttpException);
  });
});
