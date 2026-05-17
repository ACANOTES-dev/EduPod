import { SyntheticAlertEmitterService } from './synthetic-alert-emitter.service';

function buildPrisma() {
  return {
    platformAlertHistory: {
      create: jest.fn().mockResolvedValue({
        fired_at: new Date('2026-05-17T12:00:00.000Z'),
        id: 'alert-1',
      }),
      findMany: jest.fn().mockResolvedValue([
        { id: 'old-warning', rule_id: 'rule-warning' },
        { id: 'old-critical', rule_id: 'rule-critical' },
      ]),
      update: jest.fn().mockResolvedValue({}),
    },
    platformAlertRule: {
      create: jest.fn().mockResolvedValue({ id: 'rule-1', name: 'Synthetic Login failed' }),
      findFirst: jest.fn(),
    },
  };
}

describe('SyntheticAlertEmitterService', () => {
  it('creates a synthetic alert rule and publishes fired alerts', async () => {
    const prisma = buildPrisma();
    const redis = { publish: jest.fn().mockResolvedValue(undefined) };
    const service = new SyntheticAlertEmitterService(prisma as never, redis as never);

    await service.emit({
      definition_key: 'platform.login',
      display_name: 'Platform Login',
      message: 'Platform Login failed',
      metric_value: 1,
      severity: 'warning',
      type: 'failed',
    });

    expect(prisma.platformAlertRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metric: 'synthetic.check.failed:platform.login',
          severity: 'warning',
        }),
      }),
    );
    expect(prisma.platformAlertHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ message: 'Platform Login failed', status: 'fired' }),
      }),
    );
    expect(redis.publish).toHaveBeenCalledWith(
      'platform:alerts',
      expect.objectContaining({ type: 'alert_fired' }),
    );
  });

  it('reuses existing rules and resolves open failure alerts on recovery', async () => {
    const prisma = buildPrisma();
    prisma.platformAlertRule.findFirst.mockResolvedValueOnce({
      id: 'rule-existing',
      name: 'Synthetic Platform Login recovered',
    });
    const redis = { publish: jest.fn().mockResolvedValue(undefined) };
    const service = new SyntheticAlertEmitterService(prisma as never, redis as never);

    await service.emit({
      definition_key: 'platform.login',
      display_name: 'Platform Login',
      message: 'Platform Login recovered',
      metric_value: 0,
      severity: 'info',
      type: 'recovered',
    });

    expect(prisma.platformAlertRule.create).not.toHaveBeenCalled();
    expect(prisma.platformAlertHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ['fired', 'acknowledged'] } }),
      }),
    );
    expect(prisma.platformAlertHistory.update).toHaveBeenCalledTimes(2);
    expect(prisma.platformAlertHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ severity: 'info', status: 'resolved' }),
      }),
    );
  });
});
