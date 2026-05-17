import { Prisma } from '@prisma/client';

import { SentryAlertEmitterService } from './sentry-alert-emitter.service';

describe('SentryAlertEmitterService — emit', () => {
  it('creates a rule when missing, records alert history, dispatches, and publishes', async () => {
    const prisma = {
      platformAlertHistory: {
        create: jest.fn().mockResolvedValue({
          id: 'alert-1',
          fired_at: new Date('2026-05-17T10:00:00.000Z'),
        }),
      },
      platformAlertRule: {
        create: jest.fn().mockResolvedValue({ id: 'rule-1', name: 'Sentry issue critical' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as never;
    const redisPubSub = { publish: jest.fn().mockResolvedValue(undefined) } as never;
    const alertRouting = { dispatchInitial: jest.fn().mockResolvedValue(undefined) } as never;
    const service = new SentryAlertEmitterService(prisma, redisPubSub, alertRouting);

    await service.emit({
      key: 'issue.critical',
      message: 'Critical issue',
      severity: 'critical',
    });

    expect(prisma.platformAlertRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        is_security_critical: true,
        metric: 'sentry.issue.critical',
      }),
    });
    expect(prisma.platformAlertHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metric_value: new Prisma.Decimal(1),
        rule_id: 'rule-1',
        status: 'fired',
      }),
    });
    expect(alertRouting.dispatchInitial).toHaveBeenCalledWith('alert-1');
    expect(redisPubSub.publish).toHaveBeenCalledWith(
      'platform:alerts',
      expect.objectContaining({ alert_id: 'alert-1', type: 'alert_fired' }),
    );
  });

  it('reuses an existing rule', async () => {
    const prisma = {
      platformAlertHistory: {
        create: jest.fn().mockResolvedValue({
          id: 'alert-2',
          fired_at: new Date('2026-05-17T11:00:00.000Z'),
        }),
      },
      platformAlertRule: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({ id: 'rule-2', name: 'Existing rule' }),
      },
    } as never;
    const redisPubSub = { publish: jest.fn().mockResolvedValue(undefined) } as never;
    const alertRouting = { dispatchInitial: jest.fn().mockResolvedValue(undefined) } as never;
    const service = new SentryAlertEmitterService(prisma, redisPubSub, alertRouting);

    await service.emit({
      key: 'webhook.invalid_signature',
      message: 'Invalid signature',
      metric_value: 2,
      severity: 'warning',
    });

    expect(prisma.platformAlertRule.create).not.toHaveBeenCalled();
    expect(prisma.platformAlertHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metric_value: new Prisma.Decimal(2),
        rule_id: 'rule-2',
        severity: 'warning',
      }),
    });
  });
});
