import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { ResendEmailProvider } from '../../communications/providers/resend-email.provider';

import { EmailAlertDispatcher } from './email-alert.dispatcher';

describe('EmailAlertDispatcher', () => {
  let dispatcher: EmailAlertDispatcher;
  let resend: { send: jest.Mock };

  beforeEach(async () => {
    resend = { send: jest.fn().mockResolvedValue({ messageId: 'email-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailAlertDispatcher,
        { provide: ResendEmailProvider, useValue: resend },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'PLATFORM_ALERT_EMAIL_TENANT_ID'
                ? '11111111-1111-4111-8111-111111111111'
                : undefined,
            ),
          },
        },
      ],
    }).compile();

    dispatcher = module.get<EmailAlertDispatcher>(EmailAlertDispatcher);
  });

  afterEach(() => jest.clearAllMocks());

  it('sends alert email to each configured recipient', async () => {
    await expect(
      dispatcher.send(
        { recipients: ['ops@example.com', 'founder@example.com'] },
        { message: 'Alert fired', metric_value: 10, rule_name: 'Rule', severity: 'warning' },
      ),
    ).resolves.toBeUndefined();

    expect(resend.send).toHaveBeenCalledTimes(2);
    expect(resend.send).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({ to: 'ops@example.com' }),
    );
  });

  it('throws when platform email tenant is missing', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailAlertDispatcher,
        { provide: ResendEmailProvider, useValue: resend },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
      ],
    }).compile();

    const missingConfigDispatcher = module.get<EmailAlertDispatcher>(EmailAlertDispatcher);
    await expect(
      missingConfigDispatcher.send(
        { recipients: ['ops@example.com'] },
        { message: 'Alert fired', metric_value: 10, rule_name: 'Rule', severity: 'warning' },
      ),
    ).rejects.toThrow('Platform alert email tenant is not configured');
  });
});
