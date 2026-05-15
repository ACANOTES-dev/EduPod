import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, type PlatformAlertHistory, type PlatformAlertRule } from '@prisma/client';

import { ResendEmailProvider } from '../communications/providers/resend-email.provider';

import { AlertDispatchService } from './alert-dispatch.service';

const TENANT_ID = '44444444-4444-4444-8444-444444444444';
const ALERT_ID = '22222222-2222-4222-8222-222222222222';
const RULE_ID = '11111111-1111-4111-8111-111111111111';

const RULE: PlatformAlertRule = {
  id: RULE_ID,
  name: 'PostgreSQL latency',
  metric: 'component_latency',
  condition_config: { component: 'postgresql', operator: 'gt', threshold: 500 },
  severity: 'critical',
  cooldown_minutes: 15,
  is_enabled: true,
  notify_emails: ['ops@example.com'],
  created_at: new Date('2026-05-15T10:00:00.000Z'),
  updated_at: new Date('2026-05-15T10:00:00.000Z'),
};

const ALERT: PlatformAlertHistory = {
  id: ALERT_ID,
  rule_id: RULE_ID,
  severity: 'critical',
  message: 'Latency breached',
  metric_value: new Prisma.Decimal(600),
  channels_notified: [],
  status: 'fired',
  fired_at: new Date('2026-05-15T10:00:00.000Z'),
  acknowledged_at: null,
  resolved_at: null,
  acknowledged_by: null,
};

describe('AlertDispatchService', () => {
  let service: AlertDispatchService;
  let mockResendEmail: { send: jest.Mock };
  let mockConfig: { get: jest.Mock };

  beforeEach(async () => {
    mockResendEmail = {
      send: jest.fn().mockResolvedValue({ messageId: 'email-1' }),
    };
    mockConfig = {
      get: jest.fn((key: string) =>
        key === 'PLATFORM_ALERT_EMAIL_TENANT_ID' ? TENANT_ID : undefined,
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertDispatchService,
        { provide: ResendEmailProvider, useValue: mockResendEmail },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AlertDispatchService>(AlertDispatchService);
  });

  afterEach(() => jest.clearAllMocks());

  it('sends alert email via the existing Resend provider', async () => {
    await expect(service.sendEmail(RULE, ALERT, 600)).resolves.toEqual(['email']);

    expect(mockResendEmail.send).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        to: 'ops@example.com',
        subject: '[EduPod CRITICAL] PostgreSQL latency',
        idempotencyKey: `platform-alert:${ALERT_ID}:ops@example.com`,
      }),
    );
  });

  it('returns no channels when email config tenant is absent', async () => {
    mockConfig.get.mockReturnValueOnce(undefined);

    await expect(service.sendEmail(RULE, ALERT, 600)).resolves.toEqual([]);

    expect(mockResendEmail.send).not.toHaveBeenCalled();
  });

  it('handles Resend failures gracefully', async () => {
    mockResendEmail.send.mockRejectedValueOnce(new Error('resend failed'));

    await expect(service.sendEmail(RULE, ALERT, 600)).resolves.toEqual([]);
  });
});
