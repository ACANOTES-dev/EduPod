import {
  REDIS_PUBSUB_HEARTBEAT_KEY,
  RedisPubSubHeartbeatService,
} from './redis-pubsub-heartbeat.service';

describe('RedisPubSubHeartbeatService', () => {
  it('publishes heartbeat messages and stores round-trip timestamps', async () => {
    let callback: ((message: Record<string, unknown>) => void) | null = null;
    const redisSet = jest.fn().mockResolvedValue('OK');
    const redis = { getClient: jest.fn().mockReturnValue({ set: redisSet }) };
    const pubsub = {
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn((_channel: string, cb: (message: Record<string, unknown>) => void) => {
        callback = cb;
      }),
      unsubscribe: jest.fn(),
    };
    const service = new RedisPubSubHeartbeatService(redis as never, pubsub as never);

    service.onModuleInit();
    await service.publishHeartbeat();
    callback?.({ ts: 1_779_096_000_000, type: 'resilience_pubsub_heartbeat' });

    expect(pubsub.publish).toHaveBeenCalledWith(
      'platform:health',
      expect.objectContaining({ type: 'resilience_pubsub_heartbeat' }),
    );
    expect(redisSet).toHaveBeenCalledWith(
      REDIS_PUBSUB_HEARTBEAT_KEY,
      JSON.stringify({ ts: 1_779_096_000_000 }),
      'EX',
      86_400,
    );
  });
});
