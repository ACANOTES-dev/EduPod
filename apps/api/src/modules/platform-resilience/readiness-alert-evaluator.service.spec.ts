import type { PlatformAlertSeverity } from '@prisma/client';

import { ReadinessAlertEvaluatorService } from './readiness-alert-evaluator.service';
import type { ReadinessScoreResult } from './readiness-score.service';

const NOW = new Date('2026-05-18T12:00:00.000Z');

function result(score: number): ReadinessScoreResult {
  return {
    breakdown: [],
    computed_at: NOW.toISOString(),
    reasons: ['Synthetic journeys: degraded.'],
    score,
    weights_sum: 100,
    worst_dimension: 'synthetic_journeys',
    worst_dimension_value: score,
  };
}

function buildRedisClient() {
  const values = new Map<string, string>();
  const lists = new Map<string, string[]>();
  const client = {
    del: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    get: jest.fn((key: string) => Promise.resolve(values.get(key) ?? null)),
    incr: jest.fn((key: string) => {
      const next = Number(values.get(key) ?? '0') + 1;
      values.set(key, String(next));
      return Promise.resolve(next);
    }),
    lpush: jest.fn((key: string, value: string) => {
      const list = lists.get(key) ?? [];
      list.unshift(value);
      lists.set(key, list);
      return Promise.resolve(list.length);
    }),
    lrange: jest.fn((key: string, start: number, stop: number) => {
      const list = lists.get(key) ?? [];
      return Promise.resolve(list.slice(start, stop + 1));
    }),
    ltrim: jest.fn((key: string, start: number, stop: number) => {
      const list = lists.get(key) ?? [];
      lists.set(key, list.slice(start, stop + 1));
      return Promise.resolve('OK');
    }),
    set: jest.fn((key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve('OK');
    }),
  };
  return { client, values };
}

function buildService(options: { maintenanceWindow?: boolean } = {}) {
  const { client, values } = buildRedisClient();
  const prisma = {
    platformAlertHistory: {
      create: jest.fn().mockImplementation(
        (args: {
          data: {
            message: string;
            rule_id: string;
            severity: PlatformAlertSeverity;
            status?: string;
          };
        }) =>
          Promise.resolve({
            ...args.data,
            fired_at: NOW,
            id: `alert-${prisma.platformAlertHistory.create.mock.calls.length + 1}`,
          }),
      ),
    },
    platformAlertRule: {
      create: jest.fn().mockImplementation(
        (args: {
          data: {
            metric: string;
            name: string;
            severity: PlatformAlertSeverity;
          };
        }) => Promise.resolve({ id: `rule-${args.data.metric}`, ...args.data }),
      ),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    platformMaintenanceWindow: {
      findFirst: jest.fn().mockResolvedValue(
        options.maintenanceWindow
          ? {
              id: 'window-1',
            }
          : null,
      ),
    },
  };
  const dispatchInitial = jest.fn().mockResolvedValue([]);
  const publish = jest.fn().mockResolvedValue(undefined);
  return {
    client,
    dispatchInitial,
    prisma,
    publish,
    service: new ReadinessAlertEvaluatorService(
      prisma as never,
      { getClient: jest.fn().mockReturnValue(client) } as never,
      { dispatchInitial } as never,
      { publish } as never,
    ),
    values,
  };
}

describe('ReadinessAlertEvaluatorService', () => {
  it('debounces warning and critical score transitions across two live evaluations', async () => {
    const { dispatchInitial, prisma, service } = buildService();

    await service.evaluate(result(70), NOW);
    expect(prisma.platformAlertHistory.create).not.toHaveBeenCalled();

    await service.evaluate(result(75), NOW);
    expect(prisma.platformAlertHistory.create).toHaveBeenCalledTimes(1);
    expect(prisma.platformAlertHistory.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ severity: 'warning', status: 'fired' }),
    });

    await service.evaluate(result(35), NOW);
    expect(prisma.platformAlertHistory.create).toHaveBeenCalledTimes(1);

    await service.evaluate(result(30), NOW);
    expect(prisma.platformAlertHistory.create).toHaveBeenCalledTimes(2);
    expect(prisma.platformAlertHistory.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ severity: 'critical', status: 'fired' }),
    });
    expect(dispatchInitial).toHaveBeenCalledTimes(2);
  });

  it('suppresses non-critical score alerts during an active maintenance window', async () => {
    const { dispatchInitial, prisma, service } = buildService({ maintenanceWindow: true });

    await service.evaluate(result(70), NOW);
    await service.evaluate(result(75), NOW);

    expect(prisma.platformAlertHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        resolved_at: NOW,
        severity: 'warning',
        status: 'resolved',
        suppressed_by_maintenance_window_id: 'window-1',
      }),
    });
    expect(dispatchInitial).not.toHaveBeenCalled();
  });

  it('emits recovery alerts after a debounced unhealthy state returns to green', async () => {
    const { prisma, service } = buildService();

    await service.evaluate(result(35), NOW);
    await service.evaluate(result(30), NOW);
    await service.evaluate(result(90), NOW);

    expect(prisma.platformAlertHistory.create).toHaveBeenCalledTimes(2);
    expect(prisma.platformAlertHistory.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ metric_value: expect.anything(), severity: 'info' }),
    });
  });

  it('escalates repeated live evaluation failures without waiting for score snapshots', async () => {
    const { prisma, service } = buildService();

    await service.recordLiveFailure(new Error('boom'), NOW);
    await service.recordLiveFailure(new Error('boom'), NOW);
    await service.recordLiveFailure(new Error('boom'), NOW);

    expect(prisma.platformAlertHistory.create).toHaveBeenCalledTimes(1);
    expect(prisma.platformAlertHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        severity: 'critical',
        status: 'fired',
      }),
    });
  });
});
