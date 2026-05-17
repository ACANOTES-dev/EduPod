import { ConflictException } from '@nestjs/common';

import { EvidenceFreshnessService } from './evidence-freshness.service';

const PIPELINE_ID = '11111111-1111-4111-8111-111111111111';

function buildPipeline(status = 'fresh') {
  return {
    alert_severity_lagging: 'warning',
    alert_severity_silent: 'critical',
    created_at: new Date('2026-05-18T09:00:00Z'),
    description: null,
    display_name: 'Health snapshots',
    enabled: true,
    expected_interval_seconds: 60,
    id: PIPELINE_ID,
    is_seeded: true,
    key: 'health.snapshots',
    lagging_threshold_seconds: 180,
    query_kind: 'max_completed_at_health_snapshot',
    query_params: {},
    related_component: 'monitoring',
    silent_threshold_seconds: 1800,
    stale_threshold_seconds: 600,
    status: {
      breach_count: status === 'fresh' ? 0 : 1,
      lag_seconds: 10,
      last_check_at: new Date('2026-05-18T09:00:00Z'),
      last_seen_at: new Date('2026-05-18T08:59:50Z'),
      last_status_change_at: new Date('2026-05-18T09:00:00Z'),
      pipeline_id: PIPELINE_ID,
      status,
    },
    updated_at: new Date('2026-05-18T09:00:00Z'),
  };
}

function buildPrisma() {
  return {
    platformAlertHistory: {
      create: jest.fn().mockResolvedValue({
        fired_at: new Date('2026-05-18T09:10:00Z'),
        id: 'alert-1',
      }),
    },
    platformAlertRule: {
      create: jest.fn().mockResolvedValue({ id: 'rule-1', name: 'Evidence rule' }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    platformEvidencePipeline: {
      create: jest.fn().mockImplementation(({ data }) => ({
        ...buildPipeline(),
        ...data,
        id: 'created-pipeline',
        status: null,
      })),
      delete: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn().mockImplementation(({ data }) => ({
        ...buildPipeline(),
        ...data,
        status: buildPipeline().status,
      })),
    },
    platformEvidencePipelineStatus: {
      upsert: jest.fn().mockImplementation(({ update }) => ({
        ...update,
        pipeline_id: PIPELINE_ID,
      })),
    },
    platformMaintenanceWindow: {
      findFirst: jest.fn(),
    },
  };
}

describe('EvidenceFreshnessService', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('suppresses warning-level lagging transitions during active maintenance windows', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-18T09:10:00Z'));
    const prisma = buildPrisma();
    prisma.platformEvidencePipeline.findUnique.mockResolvedValueOnce(buildPipeline('fresh'));
    prisma.platformMaintenanceWindow.findFirst.mockResolvedValueOnce({ id: 'window-1' });
    const queryHandlers = {
      lastSeenFor: jest.fn().mockResolvedValue(new Date('2026-05-18T09:05:00Z')),
      validate: jest.fn(),
    };
    const routing = { dispatchInitial: jest.fn() };
    const redis = { publish: jest.fn().mockResolvedValue(undefined) };
    const audit = { log: jest.fn() };
    const service = new EvidenceFreshnessService(
      prisma as never,
      queryHandlers as never,
      routing as never,
      redis as never,
      audit as never,
    );

    await service.checkOne('health.snapshots');

    expect(prisma.platformAlertHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'resolved',
          suppressed_by_maintenance_window_id: 'window-1',
        }),
      }),
    );
    expect(routing.dispatchInitial).not.toHaveBeenCalled();
  });

  it('never suppresses silent transitions during maintenance windows', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-18T09:40:00Z'));
    const prisma = buildPrisma();
    prisma.platformEvidencePipeline.findUnique.mockResolvedValueOnce(buildPipeline('stale'));
    prisma.platformMaintenanceWindow.findFirst.mockResolvedValueOnce({ id: 'window-1' });
    const queryHandlers = {
      lastSeenFor: jest.fn().mockResolvedValue(new Date('2026-05-18T09:00:00Z')),
      validate: jest.fn(),
    };
    const routing = { dispatchInitial: jest.fn().mockResolvedValue(['email']) };
    const redis = { publish: jest.fn().mockResolvedValue(undefined) };
    const audit = { log: jest.fn() };
    const service = new EvidenceFreshnessService(
      prisma as never,
      queryHandlers as never,
      routing as never,
      redis as never,
      audit as never,
    );

    await service.checkOne('health.snapshots');

    expect(prisma.platformAlertHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ severity: 'critical', status: 'fired' }),
      }),
    );
    expect(routing.dispatchInitial).toHaveBeenCalledWith('alert-1');
  });

  it('emits a critical alert when the first observed state is silent', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-18T09:40:00Z'));
    const prisma = buildPrisma();
    prisma.platformEvidencePipeline.findUnique.mockResolvedValueOnce({
      ...buildPipeline('unknown'),
      status: null,
    });
    const queryHandlers = {
      lastSeenFor: jest.fn().mockResolvedValue(new Date('2026-05-18T09:00:00Z')),
      validate: jest.fn(),
    };
    const routing = { dispatchInitial: jest.fn().mockResolvedValue(['email']) };
    const redis = { publish: jest.fn().mockResolvedValue(undefined) };
    const audit = { log: jest.fn() };
    const service = new EvidenceFreshnessService(
      prisma as never,
      queryHandlers as never,
      routing as never,
      redis as never,
      audit as never,
    );

    await service.checkOne('health.snapshots');

    expect(prisma.platformAlertHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ severity: 'critical', status: 'fired' }),
      }),
    );
    expect(routing.dispatchInitial).toHaveBeenCalledWith('alert-1');
  });

  it('blocks deletion of seeded pipelines before reaching the database trigger', async () => {
    const prisma = buildPrisma();
    prisma.platformEvidencePipeline.findUnique.mockResolvedValueOnce(buildPipeline());
    const service = new EvidenceFreshnessService(
      prisma as never,
      { lastSeenFor: jest.fn(), validate: jest.fn() } as never,
      { dispatchInitial: jest.fn() } as never,
      { publish: jest.fn() } as never,
      { log: jest.fn() } as never,
    );

    await expect(service.remove(PIPELINE_ID)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.platformEvidencePipeline.delete).not.toHaveBeenCalled();
  });

  it('supports read and configuration management actions with audit entries', async () => {
    const prisma = buildPrisma();
    const customPipeline = { ...buildPipeline(), is_seeded: false };
    prisma.platformEvidencePipeline.findMany.mockResolvedValueOnce([customPipeline]);
    prisma.platformEvidencePipeline.findUnique
      .mockResolvedValueOnce(customPipeline)
      .mockResolvedValueOnce(customPipeline)
      .mockResolvedValueOnce(customPipeline);
    const queryHandlers = { lastSeenFor: jest.fn(), validate: jest.fn() };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new EvidenceFreshnessService(
      prisma as never,
      queryHandlers as never,
      { dispatchInitial: jest.fn() } as never,
      { publish: jest.fn() } as never,
      audit as never,
    );
    const auditContext = { actor_user_id: 'user-1' };

    await expect(service.list({ enabled: true })).resolves.toEqual([customPipeline]);
    await expect(service.get('health.snapshots')).resolves.toEqual(customPipeline);
    await expect(
      service.create(
        {
          alert_severity_lagging: 'warning',
          alert_severity_silent: 'critical',
          description: null,
          display_name: 'Custom pipeline',
          enabled: true,
          expected_interval_seconds: 60,
          key: 'custom.pipeline',
          lagging_threshold_seconds: 120,
          query_kind: 'max_completed_at_health_snapshot',
          query_params: {},
          related_component: 'custom',
          silent_threshold_seconds: 600,
          stale_threshold_seconds: 300,
        },
        auditContext,
      ),
    ).resolves.toEqual(expect.objectContaining({ id: 'created-pipeline' }));
    await expect(service.update(PIPELINE_ID, { enabled: false }, auditContext)).resolves.toEqual(
      expect.objectContaining({ enabled: false }),
    );
    await expect(service.remove(PIPELINE_ID, auditContext)).resolves.toBeUndefined();

    expect(queryHandlers.validate).toHaveBeenCalledWith('max_completed_at_health_snapshot', {});
    expect(prisma.platformEvidencePipeline.delete).toHaveBeenCalledWith({
      where: { id: PIPELINE_ID },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'evidence_pipeline_created' }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'evidence_pipeline_updated' }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'evidence_pipeline_deleted' }),
    );
  });

  it('summarizes current statuses and emits scheduled-task meta failures', async () => {
    const prisma = buildPrisma();
    prisma.platformEvidencePipeline.findMany
      .mockResolvedValueOnce([
        buildPipeline('fresh'),
        { ...buildPipeline('stale'), key: 'second.pipeline' },
      ])
      .mockResolvedValueOnce([
        buildPipeline('fresh'),
        { ...buildPipeline('lagging'), key: 'lagging.pipeline' },
        { ...buildPipeline('stale'), key: 'stale.pipeline' },
      ])
      .mockResolvedValueOnce([
        buildPipeline('fresh'),
        { ...buildPipeline('silent'), key: 'silent.pipeline' },
      ]);
    const routing = { dispatchInitial: jest.fn().mockResolvedValue(['email']) };
    const redis = { publish: jest.fn().mockResolvedValue(undefined) };
    const service = new EvidenceFreshnessService(
      prisma as never,
      { lastSeenFor: jest.fn(), validate: jest.fn() } as never,
      routing as never,
      redis as never,
      { log: jest.fn() } as never,
    );

    await expect(service.getCurrentStatusMap()).resolves.toEqual(
      new Map([
        ['health.snapshots', 'fresh'],
        ['second.pipeline', 'stale'],
      ]),
    );
    await expect(service.freshnessSummary()).resolves.toEqual(
      expect.objectContaining({ overall_status: 'some_stale' }),
    );
    await expect(service.freshnessSummary()).resolves.toEqual(
      expect.objectContaining({ overall_status: 'some_silent' }),
    );
    await service.emitMetaFailure(new Error('scheduler failed'));

    expect(routing.dispatchInitial).toHaveBeenCalledWith('alert-1');
    expect(redis.publish).toHaveBeenCalledWith(
      'platform:alerts',
      expect.objectContaining({
        message: '[CRITICAL] Evidence freshness scheduled task failed: scheduler failed',
      }),
    );
  });
});
