import { UptimeReconciliationService } from './uptime-reconciliation.service';

function buildPrisma() {
  return {
    platformAlertHistory: {
      create: jest.fn().mockResolvedValue({
        fired_at: new Date('2026-05-18T09:00:00Z'),
        id: 'alert-1',
      }),
    },
    platformAlertRule: {
      create: jest.fn().mockResolvedValue({ id: 'rule-1', name: 'Uptime disagreement' }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    platformSyntheticCheckDefinition: {
      findMany: jest.fn().mockResolvedValue([
        {
          key: 'platform.admin.home',
          results: [{ ran_at: new Date('2026-05-18T08:59:00Z'), status: 'passed' }],
          target: { url: 'https://dua.edupod.app/health' },
        },
      ]),
    },
    platformUptimeReconciliation: {
      create: jest.fn().mockResolvedValue({
        detected_at: new Date('2026-05-18T09:00:00Z'),
        disagreement_streak: 2,
        external_status: 'down',
        id: 'reconciliation-1',
        internal_check_key: 'platform.admin.home',
        internal_status: 'up',
      }),
      findFirst: jest.fn().mockResolvedValue({ disagreement_streak: 1, in_disagreement: true }),
    },
  };
}

describe('UptimeReconciliationService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('degrades cleanly when UptimeRobot is not configured', async () => {
    const prisma = buildPrisma();
    const service = new UptimeReconciliationService(
      { get: jest.fn().mockReturnValue(undefined) } as never,
      prisma as never,
      { dispatchInitial: jest.fn() } as never,
      { publish: jest.fn() } as never,
    );

    await service.reconcile();

    expect(prisma.platformSyntheticCheckDefinition.findMany).not.toHaveBeenCalled();
  });

  it('emits a warning when a disagreement persists for two cycles', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        monitors: [{ id: 1, status: 9, url: 'https://dua.edupod.app/health' }],
        stat: 'ok',
      }),
      ok: true,
    }) as typeof fetch;
    const prisma = buildPrisma();
    const routing = { dispatchInitial: jest.fn().mockResolvedValue(['email']) };
    const redis = { publish: jest.fn().mockResolvedValue(undefined) };
    const service = new UptimeReconciliationService(
      { get: jest.fn().mockReturnValue('uptimerobot-key') } as never,
      prisma as never,
      routing as never,
      redis as never,
    );

    await service.reconcile();

    expect(prisma.platformUptimeReconciliation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          disagreement_streak: 2,
          external_status: 'down',
          in_disagreement: true,
          internal_status: 'up',
        }),
      }),
    );
    expect(routing.dispatchInitial).toHaveBeenCalledWith('alert-1');
  });
});
