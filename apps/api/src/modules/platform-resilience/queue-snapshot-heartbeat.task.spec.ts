import {
  BULLMQ_HEARTBEAT_REDIS_KEY,
  QueueSnapshotHeartbeatTask,
} from './queue-snapshot-heartbeat.task';

describe('QueueSnapshotHeartbeatTask', () => {
  it('writes a Redis heartbeat only after queue introspection succeeds', async () => {
    const redisSet = jest.fn().mockResolvedValue('OK');
    const task = new QueueSnapshotHeartbeatTask(
      {
        listQueues: jest.fn().mockResolvedValue([
          { is_paused: false, name: 'notifications' },
          { is_paused: true, name: 'finance' },
        ]),
      } as never,
      { getClient: jest.fn().mockReturnValue({ set: redisSet }) } as never,
    );

    await task.tick();

    expect(redisSet).toHaveBeenCalledWith(
      BULLMQ_HEARTBEAT_REDIS_KEY,
      expect.stringContaining('"queue_count":2'),
      'EX',
      86_400,
    );
  });

  it('does not update the heartbeat when queue introspection fails', async () => {
    const redisSet = jest.fn();
    const task = new QueueSnapshotHeartbeatTask(
      { listQueues: jest.fn().mockRejectedValue(new Error('redis down')) } as never,
      { getClient: jest.fn().mockReturnValue({ set: redisSet }) } as never,
    );

    await task.tick();

    expect(redisSet).not.toHaveBeenCalled();
  });
});
