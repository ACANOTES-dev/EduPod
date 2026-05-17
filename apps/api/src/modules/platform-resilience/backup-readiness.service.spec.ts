import { BackupReadinessService } from './backup-readiness.service';

const NOW = new Date('2026-05-18T12:00:00.000Z');

function buildService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    platformAlertHistory: {
      create: jest.fn().mockResolvedValue({ fired_at: NOW, id: 'alert-1', message: 'alert' }),
    },
    platformAlertRule: {
      create: jest.fn().mockResolvedValue({ id: 'rule-1', name: 'Rule' }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    platformBackupRun: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    platformMaintenanceWindow: { findFirst: jest.fn().mockResolvedValue(null) },
    platformOffsiteReplication: { count: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    platformOwnerActionConfirmation: { findUnique: jest.fn() },
    platformRestoreDrill: {
      count: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    platformUser: { findFirst: jest.fn().mockResolvedValue({ user_id: 'owner-user' }) },
    ...overrides,
  };
  const redisClient = {
    del: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  };
  const service = new BackupReadinessService(
    prisma as never,
    {
      get: jest.fn((key: string) => (key === 'BACKUP_EVENT_INTERNAL_TOKEN' ? 'secret' : undefined)),
    } as never,
    { log: jest.fn().mockResolvedValue({ id: 'audit-1' }) } as never,
    { getClient: jest.fn().mockReturnValue(redisClient) } as never,
    { publish: jest.fn().mockResolvedValue(undefined) } as never,
    { dispatchInitial: jest.fn().mockResolvedValue([]) } as never,
  );
  return { prisma, redisClient, service };
}

describe('BackupReadinessService', () => {
  it('validates the internal backup event token', () => {
    const { service } = buildService();

    expect(service.verifyInternalToken('secret')).toBe(true);
    expect(service.verifyInternalToken('wrong')).toBe(false);
  });

  it('captures backup events idempotently by backup_key', async () => {
    const { prisma, service } = buildService();
    prisma.platformBackupRun.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'backup-1' });
    prisma.platformBackupRun.upsert
      .mockResolvedValueOnce({
        backup_key: 'key-1',
        created_at: NOW,
        id: 'backup-1',
        size_bytes: BigInt(12),
      })
      .mockResolvedValueOnce({
        backup_key: 'key-1',
        created_at: NOW,
        id: 'backup-1',
        size_bytes: BigInt(24),
      });

    const dto = {
      backup_key: 'key-1',
      finished_at: NOW,
      kind: 'pg_dump' as const,
      location: 'local:/backup.dump',
      size_bytes: 12,
      started_at: new Date('2026-05-18T11:59:00Z'),
      status: 'succeeded' as const,
      storage_kind: 'local',
      trigger_source: 'deploy_pipeline' as const,
    };

    await expect(service.capture(dto)).resolves.toMatchObject({ created: true, id: 'backup-1' });
    await expect(service.capture({ ...dto, size_bytes: 24 })).resolves.toMatchObject({
      created: false,
      id: 'backup-1',
    });
    expect(prisma.platformBackupRun.upsert).toHaveBeenCalledTimes(2);
  });

  it('computes red readiness when backup, replication, and drill evidence are missing', async () => {
    const { prisma, service } = buildService();
    prisma.platformBackupRun.findFirst.mockResolvedValue(null);
    prisma.platformOffsiteReplication.findFirst.mockResolvedValue(null);
    prisma.platformRestoreDrill.findFirst.mockResolvedValue(null);

    const summary = await service.getReadinessSummary(NOW);

    expect(summary.overall_status).toBe('red');
    expect(summary.reasons).toContain('No successful backup has been captured.');
    expect(summary.reasons).toContain('No restore drill has been recorded.');
  });

  it('emits threshold alerts only when the signal state changes', async () => {
    const { prisma, redisClient, service } = buildService();
    prisma.platformBackupRun.findFirst.mockImplementation((args?: { where?: unknown }) => {
      if (args?.where) {
        return Promise.resolve({
          finished_at: new Date('2026-05-16T12:00:00Z'),
          id: 'backup-1',
          integrity_check_passed: true,
          kind: 'pg_dump',
          size_bytes: BigInt(1),
          status: 'succeeded',
        });
      }
      return Promise.resolve({
        finished_at: new Date('2026-05-16T12:00:00Z'),
        id: 'backup-1',
        integrity_check_passed: true,
        kind: 'pg_dump',
        size_bytes: BigInt(1),
        status: 'succeeded',
      });
    });
    prisma.platformOffsiteReplication.findFirst.mockResolvedValue({
      id: 'rep-1',
      lag_seconds: 1,
      replicated_at: NOW,
      replication_target: 's3://backups',
    });
    prisma.platformRestoreDrill.findFirst.mockResolvedValue({
      drill_at: NOW,
      id: 'drill-1',
      outcome: 'passed',
    });

    await service.checkAndAlert(NOW);
    redisClient.get.mockResolvedValue('critical');
    await service.checkAndAlert(NOW);

    expect(prisma.platformAlertHistory.create).toHaveBeenCalledTimes(1);
  });

  it('requires owner confirmation for destructive restore drill edits', async () => {
    const { prisma, service } = buildService();
    prisma.platformRestoreDrill.findUnique.mockResolvedValue({
      drill_at: NOW,
      id: 'drill-1',
      outcome: 'passed',
      restore_point: 'predeploy.dump',
    });

    await expect(
      service.updateRestoreDrill(
        'drill-1',
        { outcome: 'failed_blocking' },
        { actor_user_id: 'owner-user' },
      ),
    ).rejects.toMatchObject({
      response: { code: 'OWNER_CONFIRMATION_REQUIRED' },
    });

    expect(prisma.platformRestoreDrill.update).not.toHaveBeenCalled();
  });

  it('allows owner-confirmed destructive restore drill edits', async () => {
    const { prisma, service } = buildService();
    prisma.platformRestoreDrill.findUnique.mockResolvedValue({
      drill_at: NOW,
      id: 'drill-1',
      outcome: 'passed',
      restore_point: 'predeploy.dump',
    });
    prisma.platformOwnerActionConfirmation.findUnique.mockResolvedValue({
      action: 'backup_restore_drill_updated',
      execution_status: 'executed',
      target_resource_id: 'drill-1',
    });
    prisma.platformRestoreDrill.update.mockResolvedValue({
      drill_at: NOW,
      id: 'drill-1',
      outcome: 'failed_recoverable',
      restore_point: 'predeploy.dump',
    });

    await expect(
      service.updateRestoreDrill(
        'drill-1',
        { outcome: 'failed_recoverable' },
        { actor_user_id: 'owner-user' },
        'confirmation-1',
      ),
    ).resolves.toMatchObject({ id: 'drill-1', outcome: 'failed_recoverable' });
  });

  it('lists backup runs, replications, and restore drills with filters', async () => {
    const { prisma, service } = buildService();
    prisma.platformBackupRun.findMany.mockResolvedValue([
      {
        backup_key: 'backup-key',
        created_at: NOW,
        finished_at: NOW,
        id: 'backup-1',
        kind: 'pg_dump',
        size_bytes: BigInt(42),
        started_at: NOW,
        status: 'succeeded',
      },
    ]);
    prisma.platformBackupRun.count.mockResolvedValue(1);
    prisma.platformOffsiteReplication.findMany.mockResolvedValue([
      {
        id: 'rep-1',
        replicated_at: NOW,
        replication_target: 's3://backups',
        size_bytes: BigInt(42),
        snapshot_id: 'predeploy.dump',
      },
    ]);
    prisma.platformOffsiteReplication.count.mockResolvedValue(1);
    prisma.platformRestoreDrill.findMany.mockResolvedValue([
      {
        drill_at: NOW,
        id: 'drill-1',
        outcome: 'passed',
        performed_by: { email: 'owner@example.com', first_name: 'Owner', last_name: 'User' },
        restore_point: 'predeploy.dump',
      },
    ]);
    prisma.platformRestoreDrill.count.mockResolvedValue(1);

    await expect(
      service.listRuns({ kind: 'pg_dump', page: 1, pageSize: 10, status: 'succeeded' }),
    ).resolves.toMatchObject({
      data: [{ id: 'backup-1', size_bytes: '42' }],
      meta: { total: 1 },
    });
    await expect(
      service.listReplications({ page: 1, pageSize: 10, replication_target: 's3://backups' }),
    ).resolves.toMatchObject({
      data: [{ id: 'rep-1', size_bytes: '42' }],
      meta: { total: 1 },
    });
    await expect(
      service.listRestoreDrills({ outcome: 'passed', page: 1, pageSize: 10 }),
    ).resolves.toMatchObject({
      data: [{ id: 'drill-1', performed_by: { email: 'owner@example.com' } }],
      meta: { total: 1 },
    });
  });

  it('fetches backup runs by id and reports missing runs', async () => {
    const { prisma, service } = buildService();
    prisma.platformBackupRun.findUnique
      .mockResolvedValueOnce({
        backup_key: 'backup-key',
        finished_at: NOW,
        id: 'backup-1',
        kind: 'pg_dump',
        size_bytes: BigInt(42),
        status: 'succeeded',
      })
      .mockResolvedValueOnce(null);

    await expect(service.getRun('backup-1')).resolves.toMatchObject({
      id: 'backup-1',
      size_bytes: '42',
    });
    await expect(service.getRun('missing-run')).rejects.toMatchObject({
      response: { code: 'BACKUP_RUN_NOT_FOUND' },
    });
  });

  it('records restore drills and audit evidence', async () => {
    const audit = { log: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
    const { prisma } = buildService({ platformRestoreDrill: undefined });
    prisma.platformRestoreDrill = {
      count: jest.fn(),
      create: jest.fn().mockResolvedValue({
        drill_at: NOW,
        duration_seconds: 1800,
        evidence_url: 'https://evidence.example.test/drill',
        follow_ups: [{ owner: 'Ops', task: 'Attach checksum' }],
        id: 'drill-1',
        notes: 'Restored staging from latest dump.',
        outcome: 'passed',
        performed_by_user_id: 'owner-user',
        restore_point: 'predeploy.dump',
        rpo_observed_seconds: 120,
        rto_observed_seconds: 1800,
      }),
      delete: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    };
    const serviceWithAudit = new BackupReadinessService(
      prisma as never,
      {
        get: jest.fn((key: string) =>
          key === 'BACKUP_EVENT_INTERNAL_TOKEN' ? 'secret' : undefined,
        ),
      } as never,
      audit as never,
      {
        getClient: jest.fn().mockReturnValue({ del: jest.fn(), get: jest.fn(), set: jest.fn() }),
      } as never,
      { publish: jest.fn() } as never,
      { dispatchInitial: jest.fn() } as never,
    );

    await expect(
      serviceWithAudit.createRestoreDrill(
        {
          drill_at: NOW,
          duration_seconds: 1800,
          evidence_url: 'https://evidence.example.test/drill',
          follow_ups: [{ owner: 'Ops', task: 'Attach checksum' }],
          notes: 'Restored staging from latest dump.',
          outcome: 'passed',
          restore_point: 'predeploy.dump',
          rpo_observed_seconds: 120,
          rto_observed_seconds: 1800,
          scope: 'staging',
          summary: 'Restore completed.',
        },
        'owner-user',
        { actor_user_id: 'owner-user' },
      ),
    ).resolves.toMatchObject({ id: 'drill-1', outcome: 'passed' });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'backup_restore_drill_recorded',
        target_resource_id: 'drill-1',
      }),
    );
  });

  it('deletes restore drills only after executed owner confirmation', async () => {
    const { prisma, service } = buildService();
    prisma.platformOwnerActionConfirmation.findUnique.mockResolvedValue({
      action: 'backup_restore_drill_deleted',
      execution_status: 'executed',
      target_resource_id: 'drill-1',
    });
    prisma.platformRestoreDrill.findUnique.mockResolvedValue({
      drill_at: NOW,
      id: 'drill-1',
      outcome: 'passed',
      restore_point: 'predeploy.dump',
    });

    await service.deleteRestoreDrillWithConfirmation('drill-1', 'confirmation-1', {
      actor_user_id: 'owner-user',
    });

    expect(prisma.platformRestoreDrill.delete).toHaveBeenCalledWith({ where: { id: 'drill-1' } });
  });

  it('returns null for missing or invalid readiness computed timestamps', async () => {
    const { redisClient, service } = buildService();

    await expect(service.latestReadinessComputedAt()).resolves.toBeNull();
    redisClient.get.mockResolvedValueOnce('not-a-date');
    await expect(service.latestReadinessComputedAt()).resolves.toBeNull();
    redisClient.get.mockResolvedValueOnce(NOW.toISOString());
    await expect(service.latestReadinessComputedAt()).resolves.toEqual(NOW);
  });
});
