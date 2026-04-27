import type { CommsCacheBusEvent } from '@school/shared';

import { CommsCacheBusService } from './comms-cache-bus.service';

interface MockClient {
  duplicate: jest.Mock;
  publish: jest.Mock;
  subscribe: jest.Mock;
  unsubscribe: jest.Mock;
  quit: jest.Mock;
  on: jest.Mock;
}

function buildMocks(): {
  service: CommsCacheBusService;
  publisher: MockClient;
  subscriber: MockClient;
  fireMessage: (channel: string, payload: string) => void;
} {
  let messageHandler: ((channel: string, payload: string) => void) | undefined;

  const subscriber: MockClient = {
    duplicate: jest.fn(),
    publish: jest.fn(),
    subscribe: jest.fn().mockResolvedValue(1),
    unsubscribe: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue('OK'),
    on: jest.fn((event: string, fn: (...args: unknown[]) => void) => {
      if (event === 'message') {
        messageHandler = fn as (channel: string, payload: string) => void;
      }
    }),
  };

  const publisher: MockClient = {
    duplicate: jest.fn().mockReturnValue(subscriber),
    publish: jest.fn().mockResolvedValue(1),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    quit: jest.fn(),
    on: jest.fn(),
  };

  const redisService = {
    getClient: jest.fn().mockReturnValue(publisher),
  };

  const service = new CommsCacheBusService(redisService as never);
  return {
    service,
    publisher,
    subscriber,
    fireMessage: (channel: string, payload: string) => {
      if (!messageHandler) throw new Error('No message handler registered');
      messageHandler(channel, payload);
    },
  };
}

describe('CommsCacheBusService', () => {
  it('onModuleInit subscribes to comms:config-changed', async () => {
    const { service, subscriber } = buildMocks();
    await service.onModuleInit();
    expect(subscriber.subscribe).toHaveBeenCalledWith('comms:config-changed');
  });

  it('publishConfigChanged publishes JSON event', async () => {
    const { service, publisher } = buildMocks();
    await service.onModuleInit();
    await service.publishConfigChanged('tenant-A', 'email');

    expect(publisher.publish).toHaveBeenCalledWith('comms:config-changed', expect.any(String));
    const [, payload] = publisher.publish.mock.calls[0];
    const parsed = JSON.parse(payload as string);
    expect(parsed).toMatchObject({ tenant_id: 'tenant-A', channel: 'email' });
    expect(typeof parsed.ts).toBe('number');
  });

  it('subscribe handler fires on incoming message', async () => {
    const { service, fireMessage } = buildMocks();
    await service.onModuleInit();
    const events: CommsCacheBusEvent[] = [];
    service.subscribe((e) => events.push(e));

    fireMessage('comms:config-changed', JSON.stringify({ tenant_id: 'A', channel: 'sms', ts: 1 }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ tenant_id: 'A', channel: 'sms' });
  });

  it('discards malformed JSON', async () => {
    const { service, fireMessage } = buildMocks();
    await service.onModuleInit();
    const events: CommsCacheBusEvent[] = [];
    service.subscribe((e) => events.push(e));

    fireMessage('comms:config-changed', '{not json');
    expect(events).toHaveLength(0);
  });

  it('discards events with invalid channel literal', async () => {
    const { service, fireMessage } = buildMocks();
    await service.onModuleInit();
    const events: CommsCacheBusEvent[] = [];
    service.subscribe((e) => events.push(e));

    fireMessage('comms:config-changed', JSON.stringify({ tenant_id: 'A', channel: 'push', ts: 1 }));
    expect(events).toHaveLength(0);
  });

  it('one bad handler does not block others', async () => {
    const { service, fireMessage } = buildMocks();
    await service.onModuleInit();
    const calls: string[] = [];
    service.subscribe(() => {
      calls.push('A');
      throw new Error('boom');
    });
    service.subscribe(() => calls.push('B'));

    fireMessage(
      'comms:config-changed',
      JSON.stringify({ tenant_id: 't', channel: 'email', ts: 2 }),
    );
    expect(calls).toEqual(['A', 'B']);
  });

  it('publishConfigChanged failure logs and resolves', async () => {
    const { service, publisher } = buildMocks();
    publisher.publish.mockRejectedValueOnce(new Error('redis down'));
    await service.onModuleInit();
    await expect(service.publishConfigChanged('A', 'email')).resolves.toBeUndefined();
  });

  it('onModuleDestroy unsubscribes, quits, and clears handlers', async () => {
    const { service, subscriber } = buildMocks();
    await service.onModuleInit();
    service.subscribe(() => undefined);
    await service.onModuleDestroy();
    expect(subscriber.unsubscribe).toHaveBeenCalledWith('comms:config-changed');
    expect(subscriber.quit).toHaveBeenCalled();
  });
});
