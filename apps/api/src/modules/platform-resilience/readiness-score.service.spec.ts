import { UnauthorizedException } from '@nestjs/common';
import { Prisma, type ReadinessDimension } from '@prisma/client';

import { DEFAULT_READINESS_WEIGHTS, READINESS_DIMENSIONS } from './readiness-score.constants';
import { ReadinessScoreService } from './readiness-score.service';

const NOW = new Date('2026-05-18T12:00:00.000Z');
const ACTOR_ID = 'platform-owner-user';

type FindManyArgs = { where?: { kind?: unknown } };

function buildPrisma(overrides: Record<string, unknown> = {}) {
  const prisma = {
    platformAlertHistory: {
      count: jest.fn().mockResolvedValue(0),
    },
    platformAlertRoute: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ health_checks: [{ success: true }], id: 'route-1' }]),
    },
    platformCertificateCheck: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ check_status: 'valid', days_until_expiry: 60, id: 'cert-1' }]),
    },
    platformDeployEvent: {
      findFirst: jest.fn().mockResolvedValue({
        deployed_at: new Date('2026-05-18T11:30:00Z'),
        id: 'deploy-1',
      }),
    },
    platformEvidencePipeline: {
      findMany: jest.fn().mockResolvedValue([{ id: 'pipeline-1', status: { status: 'fresh' } }]),
    },
    platformExternalDependencyStatus: {
      findMany: jest.fn().mockResolvedValue([{ id: 'dep-1', status: 'operational' }]),
    },
    platformOwnerActionConfirmation: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    platformReadinessDimensionWeight: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation((args: { create: unknown }) =>
        Promise.resolve({
          ...(args.create as Record<string, unknown>),
          updated_at: NOW,
        }),
      ),
    },
    platformReadinessScoreSnapshot: {
      create: jest.fn().mockResolvedValue({
        breakdown: [],
        id: 'snapshot-1',
        reasons: [],
        score: new Prisma.Decimal(100),
        snapshot_at: NOW,
        weights_snapshot: [],
        worst_dimension: null,
        worst_dimension_value: null,
      }),
      findFirst: jest.fn().mockResolvedValue({ snapshot_at: NOW }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    platformSentryWebhookAudit: {
      count: jest.fn().mockResolvedValue(2),
      findFirst: jest.fn().mockResolvedValue({
        id: 'webhook-1',
        received_at: new Date('2026-05-18T11:55:00Z'),
      }),
    },
    platformSyntheticCheckDefinition: {
      findMany: jest.fn().mockImplementation((args?: FindManyArgs) => {
        if (args?.where?.kind === 'queue_canary') {
          return Promise.resolve([
            {
              expected: { max_latency_ms: 1_000 },
              id: 'queue-canary-1',
              results: [
                {
                  latency_ms: 25,
                  ran_at: new Date('2026-05-18T11:58:00Z'),
                  status: 'passed',
                },
              ],
            },
          ]);
        }
        return Promise.resolve([
          {
            id: 'synthetic-1',
            results: [{ ran_at: NOW, status: 'passed' }],
          },
        ]);
      }),
    },
    ...overrides,
  };
  return prisma;
}

function buildService(overrides: Record<string, unknown> = {}) {
  const prisma = buildPrisma(overrides);
  const backups = {
    getReadinessSummary: jest.fn().mockResolvedValue({
      overall_status: 'green',
      reasons: ['Backup readiness is green.'],
    }),
  };
  const audit = { log: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
  return {
    audit,
    backups,
    prisma,
    service: new ReadinessScoreService(prisma as never, backups as never, audit as never),
  };
}

describe('ReadinessScoreService', () => {
  it('scores every enumerated dimension and penalizes missing data as zero', async () => {
    const { service } = buildService({
      platformSentryWebhookAudit: {
        count: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });

    const result = await service.compute(NOW);

    expect(result.breakdown).toHaveLength(READINESS_DIMENSIONS.length);
    expect(result.breakdown.map((row) => row.dimension).sort()).toEqual(
      [...READINESS_DIMENSIONS].sort(),
    );
    expect(result.score).toBe(92);
    expect(result.weights_sum).toBe(100);
    expect(result.breakdown).toContainEqual(
      expect.objectContaining({
        dimension: 'sentry_intake',
        enabled: true,
        value: 0,
        weight: DEFAULT_READINESS_WEIGHTS.sentry_intake,
      }),
    );
    expect(result.reasons[0]).toContain('Sentry webhook');
  });

  it('renormalizes enabled weights while disabled dimensions keep a zero contribution', async () => {
    const { service } = buildService({
      platformReadinessDimensionWeight: {
        findMany: jest.fn().mockResolvedValue([
          {
            dimension: 'sentry_intake' satisfies ReadinessDimension,
            enabled: false,
            weight: new Prisma.Decimal(DEFAULT_READINESS_WEIGHTS.sentry_intake),
          },
        ]),
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      platformSentryWebhookAudit: {
        count: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });

    const result = await service.compute(NOW);
    const sentry = result.breakdown.find((row) => row.dimension === 'sentry_intake');

    expect(result.score).toBe(100);
    expect(result.weights_sum).toBe(92);
    expect(sentry).toMatchObject({
      enabled: false,
      value: 0,
      weighted_contribution: 0,
    });
  });

  it('persists daily snapshots with breakdown, reasons, and a weights snapshot', async () => {
    const { prisma, service } = buildService();

    await service.snapshot(NOW);

    expect(prisma.platformReadinessScoreSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        breakdown: expect.arrayContaining([
          expect.objectContaining({ dimension: 'synthetic_journeys' }),
        ]),
        reasons: expect.any(Array),
        score: new Prisma.Decimal(100),
        snapshot_at: NOW,
        weights_snapshot: expect.arrayContaining([
          expect.objectContaining({ dimension: 'synthetic_journeys', enabled: true }),
        ]),
      }),
    });
  });

  it('serializes history, latest snapshot timestamps, and dimension rows', async () => {
    const { prisma, service } = buildService({
      platformReadinessScoreSnapshot: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([
          {
            breakdown: [{ dimension: 'alert_route_health' }],
            id: 'snapshot-2',
            reasons: ['Historical reason'],
            score: '88.5',
            snapshot_at: NOW,
            weights_snapshot: [{ dimension: 'alert_route_health', weight: 20 }],
            worst_dimension: 'alert_route_health',
            worst_dimension_value: new Prisma.Decimal(42.25),
          },
        ]),
      },
    });

    await expect(service.dimensions()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ dimension: 'alert_route_health' })]),
    );
    await expect(service.history(7)).resolves.toEqual([
      expect.objectContaining({
        id: 'snapshot-2',
        score: 88.5,
        snapshot_at: NOW.toISOString(),
        worst_dimension_value: 42.25,
      }),
    ]);
    await expect(service.latestSnapshotAt()).resolves.toBeNull();
    expect(prisma.platformReadinessScoreSnapshot.findMany).toHaveBeenCalledWith({
      orderBy: { snapshot_at: 'asc' },
      where: { snapshot_at: { gte: expect.any(Date) } },
    });
  });

  it('scores degraded and missing operational inputs deterministically', async () => {
    const { service } = buildService({
      platformAlertHistory: {
        count: jest.fn().mockResolvedValue(3),
      },
      platformAlertRoute: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      platformCertificateCheck: {
        findMany: jest.fn().mockResolvedValue([{ check_status: 'invalid', days_until_expiry: 10 }]),
      },
      platformDeployEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      platformEvidencePipeline: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'lagging', status: { status: 'lagging' } },
          { id: 'stale', status: { status: 'stale' } },
          { id: 'unknown', status: null },
        ]),
      },
      platformExternalDependencyStatus: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { status: 'degraded_performance' },
            { status: 'partial_outage' },
            { status: 'major_outage' },
            { status: 'unknown' },
          ]),
      },
      platformSentryWebhookAudit: {
        count: jest.fn().mockResolvedValueOnce(4).mockResolvedValueOnce(2),
        findFirst: jest.fn().mockResolvedValue({
          received_at: new Date('2026-05-18T04:00:00Z'),
        }),
      },
      platformSyntheticCheckDefinition: {
        findMany: jest.fn().mockImplementation((args?: FindManyArgs) => {
          if (args?.where?.kind === 'queue_canary') {
            return Promise.resolve([
              {
                expected: { max_latency_ms: '10' },
                results: [
                  {
                    latency_ms: 25,
                    ran_at: new Date('2026-05-18T11:59:00Z'),
                    status: 'passed',
                  },
                ],
              },
            ]);
          }
          return Promise.resolve([]);
        }),
      },
    });

    const result = await service.compute(NOW);

    expect(result.breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dimension: 'synthetic_journeys',
          reason: 'No enabled synthetic journeys.',
          value: 0,
        }),
        expect.objectContaining({
          dimension: 'alert_route_health',
          reason: 'No enabled alert routes are configured.',
          value: 0,
        }),
        expect.objectContaining({
          dimension: 'queue_canary',
          reason: '1 queue canary has not passed within the last hour.',
          value: 0,
        }),
        expect.objectContaining({
          dimension: 'external_dependency_status',
          reason: '4 external dependency is degraded or unavailable.',
          value: 0,
        }),
        expect.objectContaining({
          dimension: 'deploy_event_freshness',
          reason: 'No successful deploy event has been captured.',
          value: 0,
        }),
        expect.objectContaining({
          dimension: 'certificate_expiry',
          reason: 'At least one certificate check is not valid.',
          value: 0,
        }),
        expect.objectContaining({
          dimension: 'unresolved_critical_incidents',
          reason: '3 unresolved critical alert incident remains open.',
          value: 25,
        }),
      ]),
    );
  });

  it('audits small readiness weight updates without owner confirmation', async () => {
    const { audit, prisma, service } = buildService({
      platformReadinessDimensionWeight: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({
          dimension: 'alert_route_health',
          enabled: true,
          updated_at: NOW,
          updated_by_user_id: null,
          weight: new Prisma.Decimal(20),
        }),
        upsert: jest.fn().mockResolvedValue({
          dimension: 'alert_route_health',
          enabled: true,
          updated_at: NOW,
          updated_by_user_id: ACTOR_ID,
          weight: new Prisma.Decimal(25),
        }),
      },
    });

    await expect(
      service.updateWeight('alert_route_health', { enabled: true, weight: 25 }, ACTOR_ID, {
        actor_user_id: ACTOR_ID,
      }),
    ).resolves.toMatchObject({ dimension: 'alert_route_health', weight: 25 });

    expect(prisma.platformOwnerActionConfirmation.findUnique).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'readiness_weight_updated',
        target_resource_id: 'alert_route_health',
        target_resource_type: 'readiness_dimension_weight',
      }),
    );
  });

  it('requires executed owner confirmation for readiness weight changes above ten points', async () => {
    const { prisma, service } = buildService({
      platformReadinessDimensionWeight: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({
          dimension: 'alert_route_health',
          enabled: true,
          updated_at: NOW,
          updated_by_user_id: null,
          weight: new Prisma.Decimal(20),
        }),
        upsert: jest.fn(),
      },
    });

    await expect(
      service.updateWeight('alert_route_health', { enabled: true, weight: 35 }, ACTOR_ID, {
        actor_user_id: ACTOR_ID,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.platformReadinessDimensionWeight.upsert).not.toHaveBeenCalled();

    prisma.platformOwnerActionConfirmation.findUnique.mockResolvedValue({
      action: 'readiness_weight_updated',
      execution_status: 'executed',
      target_resource_id: 'alert_route_health',
    });
    prisma.platformReadinessDimensionWeight.upsert.mockResolvedValue({
      dimension: 'alert_route_health',
      enabled: true,
      updated_at: NOW,
      updated_by_user_id: ACTOR_ID,
      weight: new Prisma.Decimal(35),
    });

    await expect(
      service.updateWeight(
        'alert_route_health',
        { enabled: true, owner_confirmation_id: 'confirmation-1', weight: 35 },
        ACTOR_ID,
        { actor_user_id: ACTOR_ID },
      ),
    ).resolves.toMatchObject({ dimension: 'alert_route_health', weight: 35 });
  });

  it('rejects mismatched owner confirmation records', async () => {
    const { prisma, service } = buildService({
      platformReadinessDimensionWeight: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({
          dimension: 'backup_readiness',
          enabled: true,
          updated_at: NOW,
          updated_by_user_id: null,
          weight: new Prisma.Decimal(15),
        }),
        upsert: jest.fn(),
      },
    });
    prisma.platformOwnerActionConfirmation.findUnique.mockResolvedValue({
      action: 'readiness_weight_updated',
      execution_status: 'pending',
      target_resource_id: 'backup_readiness',
    });

    await expect(
      service.updateWeight(
        'backup_readiness',
        { enabled: true, owner_confirmation_id: 'confirmation-2', weight: 30 },
        ACTOR_ID,
        { actor_user_id: ACTOR_ID },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.platformReadinessDimensionWeight.upsert).not.toHaveBeenCalled();
  });
});
