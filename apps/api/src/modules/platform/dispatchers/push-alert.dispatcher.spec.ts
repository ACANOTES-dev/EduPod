/* eslint-disable import/order -- jest.mock must be declared before importing the mocked module */
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    sendNotification: jest.fn().mockResolvedValue(undefined),
    setVapidDetails: jest.fn(),
  },
}));

import webpush from 'web-push';

import { PushAlertDispatcher } from './push-alert.dispatcher';

const webpushMock = webpush as jest.Mocked<typeof webpush>;

describe('PushAlertDispatcher', () => {
  let dispatcher: PushAlertDispatcher;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushAlertDispatcher,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, string> = {
                VAPID_EMAIL: 'mailto:admin@edupod.app',
                VAPID_PRIVATE_KEY: 'private',
                VAPID_PUBLIC_KEY: 'public',
              };
              return values[key];
            }),
          },
        },
      ],
    }).compile();

    dispatcher = module.get<PushAlertDispatcher>(PushAlertDispatcher);
  });

  afterEach(() => jest.clearAllMocks());

  it('sends a web-push notification with VAPID details', async () => {
    await dispatcher.send(
      {
        endpoint: 'https://push.example.test/sub',
        keys: { auth: 'auth-key', p256dh: 'p256dh-key' },
      },
      { message: 'Alert fired', metric_value: 5, rule_name: 'Rule', severity: 'critical' },
    );

    expect(webpushMock.setVapidDetails).toHaveBeenCalledWith(
      'mailto:admin@edupod.app',
      'public',
      'private',
    );
    expect(webpushMock.sendNotification).toHaveBeenCalledWith(
      {
        endpoint: 'https://push.example.test/sub',
        keys: { auth: 'auth-key', p256dh: 'p256dh-key' },
      },
      expect.stringContaining('[CRITICAL] Rule'),
    );
  });

  it('throws when VAPID keys are missing', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushAlertDispatcher,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
      ],
    }).compile();
    const missingConfigDispatcher = module.get<PushAlertDispatcher>(PushAlertDispatcher);

    await expect(
      missingConfigDispatcher.send(
        {
          endpoint: 'https://push.example.test/sub',
          keys: { auth: 'auth-key', p256dh: 'p256dh-key' },
        },
        { message: 'Alert fired', metric_value: 5, rule_name: 'Rule', severity: 'critical' },
      ),
    ).rejects.toThrow('VAPID keys are not configured');
  });
});
