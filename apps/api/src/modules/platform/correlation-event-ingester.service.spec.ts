import { recordCorrelationEvent } from '../../common/services/correlation-event-sink';

import { CorrelationEventIngesterService } from './correlation-event-ingester.service';

function buildService() {
  const prisma = {
    platformCorrelationEvent: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return {
    prisma,
    service: new CorrelationEventIngesterService(
      prisma as unknown as ConstructorParameters<typeof CorrelationEventIngesterService>[0],
    ),
  };
}

describe('CorrelationEventIngesterService', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('registers the sink, persists buffered events, and clears the sink on destroy', async () => {
    jest.useFakeTimers();
    const { prisma, service } = buildService();

    service.onModuleInit();
    recordCorrelationEvent({
      correlation_id: 'corr-1',
      source: 'api',
      event_type: 'http_request',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      payload: { path: '/api/v1/admin/deploys' },
    });
    await service.flush();
    await service.onModuleDestroy();
    recordCorrelationEvent({
      correlation_id: 'corr-2',
      source: 'api',
      event_type: 'ignored_after_destroy',
      payload: {},
    });

    expect(prisma.platformCorrelationEvent.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.platformCorrelationEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          correlation_id: 'corr-1',
          event_type: 'http_request',
          source: 'api',
        }),
      ],
    });
  });

  it('drops buffered events if persistence fails without throwing', async () => {
    const { prisma, service } = buildService();
    prisma.platformCorrelationEvent.createMany.mockRejectedValueOnce(new Error('db down'));

    service.enqueue({
      correlation_id: 'corr-1',
      source: 'worker',
      event_type: 'job_failed',
      payload: { queue: 'monitoring' },
    });

    await expect(service.flush()).resolves.toBeUndefined();
    await expect(service.flush()).resolves.toBeUndefined();
    expect(prisma.platformCorrelationEvent.createMany).toHaveBeenCalledTimes(1);
  });
});
