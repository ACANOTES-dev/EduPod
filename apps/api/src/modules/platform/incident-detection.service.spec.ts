import { Test, TestingModule } from '@nestjs/testing';

import { IncidentDetectionService } from './incident-detection.service';
import { PlatformIncidentService } from './platform-incident.service';
import { RedisPubSubService } from './redis-pubsub.service';

describe('IncidentDetectionService', () => {
  let service: IncidentDetectionService;
  let incidents: {
    autoResolveMonitoringIncidents: jest.Mock;
    createOrAttachFromAlert: jest.Mock;
    recordAlertResolved: jest.Mock;
  };
  let redisPubSub: {
    subscribe: jest.Mock;
    unsubscribe: jest.Mock;
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    incidents = {
      autoResolveMonitoringIncidents: jest.fn().mockResolvedValue(0),
      createOrAttachFromAlert: jest.fn().mockResolvedValue(null),
      recordAlertResolved: jest.fn().mockResolvedValue(undefined),
    };
    redisPubSub = {
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentDetectionService,
        { provide: PlatformIncidentService, useValue: incidents },
        { provide: RedisPubSubService, useValue: redisPubSub },
      ],
    }).compile();

    service = module.get(IncidentDetectionService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('subscribes to normal platform alert events', () => {
    service.onModuleInit();

    expect(redisPubSub.subscribe).toHaveBeenCalledWith('platform:alerts', expect.any(Function));
  });

  it('routes fired alerts to non-AI incident creation or attachment', async () => {
    await service.handleAlertEvent({ alert_id: 'alert-1', type: 'alert_fired' });

    expect(incidents.createOrAttachFromAlert).toHaveBeenCalledWith('alert-1');
  });

  it('routes resolved alerts to conservative monitoring checks', async () => {
    await service.handleAlertEvent({
      alert_id: 'alert-1',
      resolved_at: '2026-05-17T10:00:00.000Z',
      type: 'alert_resolved',
    });

    expect(incidents.recordAlertResolved).toHaveBeenCalledWith(
      'alert-1',
      new Date('2026-05-17T10:00:00.000Z'),
    );
  });
});
