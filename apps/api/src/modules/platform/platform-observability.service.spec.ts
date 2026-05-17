import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PlatformObservabilityService } from './platform-observability.service';

const NOW = new Date('2026-05-17T12:00:00.000Z');

function buildService() {
  const prisma = {
    platformCorrelationEvent: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    platformDeployEvent: {
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'deploy-1',
        deployed_at: NOW,
        created_at: NOW,
        ...data,
      })),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'deploy-1',
          sha: 'abcdef1234567890',
          short_sha: 'abcdef1',
          deployed_at: NOW,
          status: 'succeeded',
        },
      ]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    platformRunbookIndex: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    },
    platformServiceTopology: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    },
    platformSeverityPolicy: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'DEPLOY_EVENT_INTERNAL_TOKEN') return 'x'.repeat(32);
      if (key === 'JWT_SECRET') return 'y'.repeat(32);
      return undefined;
    }),
  };
  return {
    config,
    prisma,
    service: new PlatformObservabilityService(
      prisma as unknown as ConstructorParameters<typeof PlatformObservabilityService>[0],
      config as unknown as ConfigService,
    ),
  };
}

describe('PlatformObservabilityService', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('captures deploy events as platform-level rows', async () => {
    const { prisma, service } = buildService();

    const result = await service.captureDeploy({
      sha: 'abcdef1234567890',
      short_sha: 'abcdef1',
      deploy_run_url: 'https://github.com/ACANOTES-dev/EduPod/actions/runs/123',
      deploy_run_id: '123',
      status: 'succeeded',
      duration_seconds: 42,
      commit_message: 'feat: ship thing',
      commit_author_email: 'test@example.com',
    });

    expect(result.short_sha).toBe('abcdef1');
    expect(prisma.platformDeployEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sha: 'abcdef1234567890',
        status: 'succeeded',
        duration_seconds: 42,
      }),
    });
  });

  it('accepts only the configured internal deploy token', () => {
    const { service } = buildService();

    expect(service.verifyInternalToken('x'.repeat(32))).toBe(true);
    expect(service.verifyInternalToken('wrong')).toBe(false);
  });

  it('lists correlation events in timeline order', async () => {
    const { prisma, service } = buildService();

    await service.listCorrelationEvents('corr-1');

    expect(prisma.platformCorrelationEvent.findMany).toHaveBeenCalledWith({
      where: { correlation_id: 'corr-1' },
      orderBy: { occurred_at: 'asc' },
      take: 200,
    });
  });

  it('lists deploys with pagination metadata', async () => {
    const { prisma, service } = buildService();

    const result = await service.listDeploys({ page: 2, pageSize: 10, status: 'succeeded' });

    expect(result.meta).toEqual({ page: 2, pageSize: 10, total: 1 });
    expect(prisma.platformDeployEvent.findMany).toHaveBeenCalledWith({
      where: { status: 'succeeded' },
      orderBy: { deployed_at: 'desc' },
      skip: 10,
      take: 10,
    });
  });

  it('throws a structured not found error for missing deploys', async () => {
    const { service } = buildService();

    await expect(service.getDeploy('11111111-1111-4111-8111-111111111111')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('filters runbooks, topology, and severity policies', async () => {
    const { prisma, service } = buildService();

    await service.listRunbooks({
      component: 'api',
      alert_key: 'health.api',
      severity: 'critical',
      tag: 'deploy',
    });
    await service.listTopology({ kind: 'queue', component: 'worker', queue: 'monitoring' });
    await service.listSeverityPolicies({
      component: 'api',
      product_area: 'platform',
      severity: 'warning',
    });

    expect(prisma.platformRunbookIndex.findMany).toHaveBeenCalledWith({
      where: {
        components: { has: 'api' },
        alert_keys: { has: 'health.api' },
        severity: 'critical',
        tags: { has: 'deploy' },
      },
      orderBy: [{ severity: 'asc' }, { title: 'asc' }],
    });
    expect(prisma.platformServiceTopology.findMany).toHaveBeenCalledWith({
      where: {
        kind: 'queue',
        related_components: { has: 'worker' },
        related_queue_names: { has: 'monitoring' },
      },
      orderBy: [{ kind: 'asc' }, { display_name: 'asc' }],
    });
    expect(prisma.platformSeverityPolicy.findMany).toHaveBeenCalledWith({
      where: {
        component: 'api',
        product_area: 'platform',
        severity: 'warning',
      },
      orderBy: [{ severity: 'asc' }, { title: 'asc' }],
    });
  });

  it('runs the daily runbook index after the scheduled UTC hour', async () => {
    const { service } = buildService();
    const indexSpy = jest
      .spyOn(service, 'indexRunbooks')
      .mockResolvedValue({ indexed: 1, skipped: 0 });

    await service.runDueRunbookIndex(new Date('2026-05-17T02:05:00.000Z'));
    await service.runDueRunbookIndex(new Date('2026-05-17T03:05:00.000Z'));

    expect(indexSpy).toHaveBeenCalledTimes(1);
  });

  it('seeds operator facts during startup and clears the runbook timer on destroy', async () => {
    jest.useFakeTimers();
    const { prisma, service } = buildService();
    const indexSpy = jest
      .spyOn(service, 'indexRunbooks')
      .mockResolvedValue({ indexed: 0, skipped: 0 });

    await service.onModuleInit();
    service.onModuleDestroy();

    expect(prisma.platformServiceTopology.upsert).toHaveBeenCalled();
    expect(prisma.platformSeverityPolicy.upsert).toHaveBeenCalled();
    expect(indexSpy).toHaveBeenCalledTimes(1);
  });

  it('indexes runbooks from front matter into platform-level rows', async () => {
    const { prisma, service } = buildService();

    const result = await service.indexRunbooks();

    expect(result.indexed).toBeGreaterThanOrEqual(5);
    expect(prisma.platformRunbookIndex.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          components: expect.any(Array),
          content_sha: expect.any(String),
          path: expect.stringContaining('docs/runbooks/'),
          raw_front_matter: expect.any(Object),
        }),
        update: expect.objectContaining({
          indexed_at: expect.any(Date),
        }),
      }),
    );
  });
});
