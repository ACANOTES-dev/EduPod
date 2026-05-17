import { GoneException, UnauthorizedException } from '@nestjs/common';

import { AlertAckTokenService } from './alert-ack-token.service';

const ALERT_ID = '11111111-1111-4111-8111-111111111111';
const PLATFORM_USER_ID = '22222222-2222-4222-8222-222222222222';
const ROUTE_ID = '33333333-3333-4333-8333-333333333333';

function buildService(setResult: 'OK' | null = 'OK') {
  const redisClient = {
    set: jest.fn().mockResolvedValue(setResult),
  };
  return {
    redisClient,
    service: new AlertAckTokenService(
      { get: jest.fn().mockReturnValue('test-secret') } as never,
      { getClient: () => redisClient } as never,
    ),
  };
}

describe('AlertAckTokenService', () => {
  it('signs and verifies short-lived single-use acknowledgement tokens', async () => {
    const { redisClient, service } = buildService();

    const token = service.sign({
      alert_history_id: ALERT_ID,
      platform_user_id: PLATFORM_USER_ID,
      route_id: ROUTE_ID,
    });
    const payload = await service.verify(token);

    expect(payload).toEqual(
      expect.objectContaining({
        alert_history_id: ALERT_ID,
        platform_user_id: PLATFORM_USER_ID,
        route_id: ROUTE_ID,
      }),
    );
    expect(redisClient.set).toHaveBeenCalledWith(
      expect.stringContaining('platform:alert-ack-token:'),
      'used',
      'EX',
      600,
      'NX',
    );
  });

  it('rejects malformed, tampered, expired, and reused tokens', async () => {
    await expect(buildService().service.verify('not-a-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    const token = buildService().service.sign({
      alert_history_id: ALERT_ID,
      platform_user_id: PLATFORM_USER_ID,
    });
    await expect(buildService().service.verify(`${token}tampered`)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    jest.useFakeTimers().setSystemTime(new Date('2026-05-17T12:00:00Z'));
    const expiring = buildService().service.sign({
      alert_history_id: ALERT_ID,
      platform_user_id: PLATFORM_USER_ID,
    });
    jest.setSystemTime(new Date('2026-05-17T12:11:00Z'));
    await expect(buildService().service.verify(expiring)).rejects.toBeInstanceOf(GoneException);
    jest.useRealTimers();

    await expect(buildService(null).service.verify(token)).rejects.toBeInstanceOf(GoneException);
  });
});
