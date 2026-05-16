import { QueueMetricsService } from './queue-metrics.service';

describe('QueueMetricsService', () => {
  const queueManagementService = {
    listQueues: jest.fn(),
  };
  const redisPubSubService = {
    publish: jest.fn(),
  };

  let service: QueueMetricsService;

  beforeEach(() => {
    jest.clearAllMocks();
    queueManagementService.listQueues.mockResolvedValue([
      {
        name: 'notifications',
        is_paused: false,
        counts: { active: 2, completed: 10, delayed: 1, failed: 3, paused: 0, waiting: 4 },
      },
    ]);
    redisPubSubService.publish.mockResolvedValue(undefined);
    service = new QueueMetricsService(queueManagementService, redisPubSubService);
  });

  it('publishes queue metrics to the platform queue channel', async () => {
    await service.publishQueueMetrics();

    expect(redisPubSubService.publish).toHaveBeenCalledWith(
      'platform:queues',
      expect.objectContaining({
        queues: [
          {
            active: 2,
            completed: 10,
            delayed: 1,
            failed: 3,
            is_paused: false,
            name: 'notifications',
            paused: 0,
            waiting: 4,
          },
        ],
        type: 'queue_metrics',
      }),
    );
  });

  it('handles publish errors gracefully', async () => {
    redisPubSubService.publish.mockRejectedValueOnce(new Error('redis down'));

    await expect(service.publishQueueMetrics()).resolves.toBeUndefined();
  });
});
