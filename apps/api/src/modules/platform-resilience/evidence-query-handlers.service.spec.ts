import { BadRequestException } from '@nestjs/common';

import { EvidenceQueryHandlersService } from './evidence-query-handlers.service';

function buildPrisma() {
  return {
    platformAlertRouteHealthCheck: {
      findFirst: jest.fn().mockResolvedValue({ ran_at: new Date('2026-05-18T09:09:00Z') }),
    },
    platformBackupRun: {
      findFirst: jest.fn().mockResolvedValue({ created_at: new Date('2026-05-18T09:10:00Z') }),
    },
    platformDeployEvent: {
      findFirst: jest.fn().mockResolvedValue({ deployed_at: new Date('2026-05-18T09:00:00Z') }),
    },
    platformErrorLog: {
      findFirst: jest.fn().mockResolvedValue({ last_seen_at: new Date('2026-05-18T09:07:00Z') }),
    },
    platformHealthSnapshot: {
      findFirst: jest.fn().mockResolvedValue({ created_at: new Date('2026-05-18T09:01:00Z') }),
    },
    platformRunbookIndex: {
      findFirst: jest.fn().mockResolvedValue({ indexed_at: new Date('2026-05-18T09:03:00Z') }),
    },
    platformSentryWebhookAudit: {
      findFirst: jest.fn().mockResolvedValue({ received_at: new Date('2026-05-18T09:02:00Z') }),
    },
    platformServiceTopology: {
      findFirst: jest.fn().mockResolvedValue({ updated_at: new Date('2026-05-18T09:04:00Z') }),
    },
    platformSeverityPolicy: {
      findFirst: jest.fn().mockResolvedValue({ updated_at: new Date('2026-05-18T09:05:00Z') }),
    },
    platformSyntheticCheckResult: {
      findFirst: jest.fn().mockResolvedValue({ ran_at: new Date('2026-05-18T09:08:00Z') }),
    },
  };
}

describe('EvidenceQueryHandlersService', () => {
  const backupReadiness = {
    latestReadinessComputedAt: jest.fn().mockResolvedValue(new Date('2026-05-18T09:11:00Z')),
  };
  const readiness = {
    latestSnapshotAt: jest.fn().mockResolvedValue(new Date('2026-05-18T09:12:00Z')),
  };

  it('maps pinned query kinds to hard-coded Prisma reads', async () => {
    const prisma = buildPrisma();
    const redis = { getClient: jest.fn() };
    const service = new EvidenceQueryHandlersService(
      prisma as never,
      redis as never,
      backupReadiness as never,
      readiness as never,
    );

    const result = await service.lastSeenFor('max_deployed_at_deploy_event', {});

    expect(result).toEqual(new Date('2026-05-18T09:00:00Z'));
    expect(prisma.platformDeployEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { deployed_at: 'desc' } }),
    );
  });

  it('covers every direct pinned database query kind without freeform SQL', async () => {
    const service = new EvidenceQueryHandlersService(
      buildPrisma() as never,
      {} as never,
      backupReadiness as never,
      readiness as never,
    );

    await expect(service.lastSeenFor('max_completed_at_health_snapshot', {})).resolves.toEqual(
      new Date('2026-05-18T09:01:00Z'),
    );
    await expect(service.lastSeenFor('max_received_at_sentry_webhook', {})).resolves.toEqual(
      new Date('2026-05-18T09:02:00Z'),
    );
    await expect(service.lastSeenFor('max_indexed_at_runbook_index', {})).resolves.toEqual(
      new Date('2026-05-18T09:03:00Z'),
    );
    await expect(service.lastSeenFor('max_updated_at_topology', {})).resolves.toEqual(
      new Date('2026-05-18T09:04:00Z'),
    );
    await expect(service.lastSeenFor('max_updated_at_severity_policy', {})).resolves.toEqual(
      new Date('2026-05-18T09:05:00Z'),
    );
    await expect(service.lastSeenFor('max_logged_at_error_log', {})).resolves.toEqual(
      new Date('2026-05-18T09:07:00Z'),
    );
    await expect(service.lastSeenFor('max_ran_at_synthetic_result', {})).resolves.toEqual(
      new Date('2026-05-18T09:08:00Z'),
    );
    await expect(service.lastSeenFor('max_ran_at_route_health_check', {})).resolves.toEqual(
      new Date('2026-05-18T09:09:00Z'),
    );
    await expect(service.lastSeenFor('max_received_at_backup_capture', {})).resolves.toEqual(
      new Date('2026-05-18T09:10:00Z'),
    );
    await expect(service.lastSeenFor('max_computed_at_backup_readiness', {})).resolves.toEqual(
      new Date('2026-05-18T09:11:00Z'),
    );
    await expect(service.lastSeenFor('max_snapshot_at_readiness_score', {})).resolves.toEqual(
      new Date('2026-05-18T09:12:00Z'),
    );
  });

  it('maps whitelisted table timestamp templates to pinned handlers', async () => {
    const service = new EvidenceQueryHandlersService(
      buildPrisma() as never,
      {} as never,
      backupReadiness as never,
      readiness as never,
    );

    await expect(
      service.lastSeenFor('max_occurred_at_table', {
        column: 'received_at',
        table: 'platform_sentry_webhook_audit',
      }),
    ).resolves.toEqual(new Date('2026-05-18T09:02:00Z'));
    await expect(
      service.lastSeenFor('max_occurred_at_table', {
        column: 'ran_at',
        table: 'platform_alert_route_health_checks',
      }),
    ).resolves.toEqual(new Date('2026-05-18T09:09:00Z'));
  });

  it('rejects freeform table or column query targets', () => {
    const service = new EvidenceQueryHandlersService(
      buildPrisma() as never,
      {} as never,
      backupReadiness as never,
      readiness as never,
    );

    expect(() =>
      service.validate('max_occurred_at_table', {
        table: 'platform_health_snapshots',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.validate('max_occurred_at_table', {
        column: 'password_hash',
        table: 'users',
      }),
    ).toThrow(BadRequestException);
  });

  it('reads Redis heartbeat timestamps only from platform resilience keys', async () => {
    const prisma = buildPrisma();
    const get = jest
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ ts: 1_779_096_000_000 }))
      .mockResolvedValueOnce('1779096000001')
      .mockResolvedValueOnce(JSON.stringify({ ts: '2026-05-18T09:20:00Z' }))
      .mockResolvedValueOnce('not-a-date');
    const redis = {
      getClient: jest.fn().mockReturnValue({
        get,
      }),
    };
    const service = new EvidenceQueryHandlersService(
      prisma as never,
      redis as never,
      backupReadiness as never,
      readiness as never,
    );

    await expect(
      service.lastSeenFor('max_seen_redis_pubsub', {
        redis_key: 'tenant:unsafe:last_seen_at',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.lastSeenFor('max_seen_redis_pubsub', {
        redis_key: 'platform:resilience:pubsub:last_seen_at',
      }),
    ).resolves.toEqual(new Date(1_779_096_000_000));
    await expect(
      service.lastSeenFor('max_seen_redis_queue_heartbeat', {
        redis_key: 'platform:resilience:bullmq:last_seen_at',
      }),
    ).resolves.toEqual(new Date(1_779_096_000_001));
    await expect(
      service.lastSeenFor('max_seen_redis_pubsub', {
        redis_key: 'platform:resilience:pubsub:last_seen_at',
      }),
    ).resolves.toEqual(new Date('2026-05-18T09:20:00Z'));
    await expect(
      service.lastSeenFor('max_seen_redis_pubsub', {
        redis_key: 'platform:resilience:pubsub:last_seen_at',
      }),
    ).resolves.toBeNull();
  });
});
