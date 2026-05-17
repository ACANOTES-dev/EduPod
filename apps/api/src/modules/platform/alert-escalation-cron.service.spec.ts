import { AlertEscalationCronService } from './alert-escalation-cron.service';

const ALERT_ID = '11111111-1111-4111-8111-111111111111';

describe('AlertEscalationCronService', () => {
  it('escalates due fired alerts and continues after individual failures', async () => {
    const prisma = {
      platformAlertHistory: {
        findMany: jest.fn().mockResolvedValue([{ id: ALERT_ID }, { id: 'bad-alert' }]),
      },
    };
    const routing = {
      escalateNext: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('route failed')),
    };
    const service = new AlertEscalationCronService(prisma as never, routing as never);

    await service.tick(new Date('2026-05-17T12:00:00Z'));

    expect(prisma.platformAlertHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 25,
        where: expect.objectContaining({
          escalation_state: { in: ['awaiting_ack', 'escalating'] },
          next_escalation_at: { lte: new Date('2026-05-17T12:00:00Z') },
          status: 'fired',
        }),
      }),
    );
    expect(routing.escalateNext).toHaveBeenCalledTimes(2);
  });

  it('starts and stops its timer', () => {
    jest.useFakeTimers();
    const service = new AlertEscalationCronService(
      { platformAlertHistory: { findMany: jest.fn().mockResolvedValue([]) } } as never,
      { escalateNext: jest.fn() } as never,
    );

    service.onModuleInit();
    service.onModuleDestroy();

    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });
});
