import { Test, TestingModule } from '@nestjs/testing';

import { ChannelDispatchService } from './channel-dispatch.service';
import type { AlertChannelForDispatch } from './dispatchers/channel-dispatcher.interface';
import { EmailAlertDispatcher } from './dispatchers/email-alert.dispatcher';
import { PushAlertDispatcher } from './dispatchers/push-alert.dispatcher';
import { TelegramAlertDispatcher } from './dispatchers/telegram-alert.dispatcher';
import { WhatsAppAlertDispatcher } from './dispatchers/whatsapp-alert.dispatcher';

const ALERT = {
  message: 'Metric breached',
  metric_value: 10,
  rule_name: 'Queue depth',
  severity: 'warning',
};

const EMAIL_CHANNEL: AlertChannelForDispatch = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Ops email',
  type: 'email',
  config: { recipients: ['ops@example.com'] },
  is_enabled: true,
};

function dispatcherMock() {
  return { send: jest.fn().mockResolvedValue(undefined) };
}

describe('ChannelDispatchService', () => {
  let service: ChannelDispatchService;
  let email: ReturnType<typeof dispatcherMock>;
  let telegram: ReturnType<typeof dispatcherMock>;
  let whatsapp: ReturnType<typeof dispatcherMock>;
  let push: ReturnType<typeof dispatcherMock>;

  beforeEach(async () => {
    email = dispatcherMock();
    telegram = dispatcherMock();
    whatsapp = dispatcherMock();
    push = dispatcherMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelDispatchService,
        { provide: EmailAlertDispatcher, useValue: email },
        { provide: TelegramAlertDispatcher, useValue: telegram },
        { provide: WhatsAppAlertDispatcher, useValue: whatsapp },
        { provide: PushAlertDispatcher, useValue: push },
      ],
    }).compile();

    service = module.get<ChannelDispatchService>(ChannelDispatchService);
  });

  afterEach(() => jest.clearAllMocks());

  it('dispatches to all enabled channels', async () => {
    const channels: AlertChannelForDispatch[] = [
      EMAIL_CHANNEL,
      { ...EMAIL_CHANNEL, id: '44444444-4444-4444-8444-444444444444', type: 'telegram' },
    ];

    await expect(service.dispatchAlert(ALERT, channels)).resolves.toEqual(['email', 'telegram']);
    expect(email.send).toHaveBeenCalledWith(EMAIL_CHANNEL.config, ALERT);
    expect(telegram.send).toHaveBeenCalledWith(channels[1]?.config, ALERT);
  });

  it('skips disabled channels', async () => {
    await expect(
      service.dispatchAlert(ALERT, [{ ...EMAIL_CHANNEL, is_enabled: false }]),
    ).resolves.toEqual([]);
    expect(email.send).not.toHaveBeenCalled();
  });

  it('continues dispatching when one channel fails', async () => {
    email.send.mockRejectedValueOnce(new Error('provider down'));
    const channels: AlertChannelForDispatch[] = [
      EMAIL_CHANNEL,
      { ...EMAIL_CHANNEL, id: '55555555-5555-4555-8555-555555555555', type: 'push' },
    ];

    await expect(service.dispatchAlert(ALERT, channels)).resolves.toEqual(['push']);
    expect(push.send).toHaveBeenCalled();
  });

  it('sends test alerts through the matching dispatcher', async () => {
    await expect(service.sendTestAlert(EMAIL_CHANNEL)).resolves.toEqual({
      success: true,
      message: 'Test alert sent to email successfully.',
    });
    expect(email.send).toHaveBeenCalledWith(
      EMAIL_CHANNEL.config,
      expect.objectContaining({ rule_name: 'Test Alert' }),
    );
  });
});
