import { EvidenceCompletenessController } from './evidence-completeness.controller';

const USER = {
  email: 'admin@example.com',
  platform_permissions: [],
  platform_role: 'platform_owner',
  sub: 'user-1',
};

const REQUEST = {
  headers: {},
  ip: '127.0.0.1',
};

describe('EvidenceCompletenessController', () => {
  it('delegates pipeline reads and writes to the freshness service', async () => {
    const freshness = {
      checkOne: jest.fn().mockResolvedValue({ key: 'health.snapshots' }),
      create: jest.fn().mockResolvedValue({ id: 'pipeline-1' }),
      freshnessSummary: jest.fn().mockResolvedValue({ overall_status: 'all_fresh' }),
      get: jest.fn().mockResolvedValue({ key: 'health.snapshots' }),
      list: jest.fn().mockResolvedValue({ data: [] }),
      remove: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue({ id: 'pipeline-1' }),
    };
    const controller = new EvidenceCompletenessController(
      freshness as never,
      { log: jest.fn() } as never,
      { acknowledge: jest.fn(), listDisagreements: jest.fn() } as never,
    );

    await expect(controller.listPipelines({ status: 'fresh' })).resolves.toEqual({ data: [] });
    await expect(
      controller.createPipeline({ key: 'pipeline.custom' } as never, USER, REQUEST as never),
    ).resolves.toEqual({
      id: 'pipeline-1',
    });
    await expect(controller.getPipeline('health.snapshots')).resolves.toEqual({
      key: 'health.snapshots',
    });
    await expect(
      controller.updatePipeline(
        '11111111-1111-4111-8111-111111111111',
        { enabled: false },
        USER,
        REQUEST as never,
      ),
    ).resolves.toEqual({
      id: 'pipeline-1',
    });
    await expect(
      controller.deletePipeline('11111111-1111-4111-8111-111111111111', USER, REQUEST as never),
    ).resolves.toBeUndefined();
    await expect(
      controller.runPipelineCheck('health.snapshots', USER, REQUEST as never),
    ).resolves.toEqual({
      key: 'health.snapshots',
    });
    await expect(controller.copilotFreshnessSummary()).resolves.toEqual({
      overall_status: 'all_fresh',
    });

    expect(freshness.list).toHaveBeenCalledWith({ status: 'fresh' });
    expect(freshness.create).toHaveBeenCalledWith(
      { key: 'pipeline.custom' },
      expect.objectContaining({ actor_user_id: 'user-1' }),
    );
    expect(freshness.update).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      { enabled: false },
      expect.objectContaining({ actor_user_id: 'user-1' }),
    );
    expect(freshness.checkOne).toHaveBeenCalledWith(
      'health.snapshots',
      expect.objectContaining({ triggered_by_user_id: 'user-1' }),
    );
  });

  it('audits uptime reconciliation acknowledgements', async () => {
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const uptime = {
      acknowledge: jest.fn().mockResolvedValue({ id: 'reconciliation-1', acknowledged: true }),
      listDisagreements: jest.fn().mockResolvedValue({ data: [] }),
    };
    const controller = new EvidenceCompletenessController(
      { checkOne: jest.fn(), freshnessSummary: jest.fn(), list: jest.fn() } as never,
      audit as never,
      uptime as never,
    );

    await expect(controller.listReconciliations({ status: 'active' })).resolves.toEqual({
      data: [],
    });
    await expect(
      controller.acknowledgeReconciliation(
        '11111111-1111-4111-8111-111111111111',
        USER,
        REQUEST as never,
      ),
    ).resolves.toEqual({ acknowledged: true, id: 'reconciliation-1' });

    expect(uptime.listDisagreements).toHaveBeenCalledWith({ status: 'active' });
    expect(uptime.acknowledge).toHaveBeenCalledWith({
      id: '11111111-1111-4111-8111-111111111111',
      user_id: 'user-1',
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'uptime_reconciliation_acknowledged',
        target_resource_id: '11111111-1111-4111-8111-111111111111',
        target_resource_type: 'uptime_reconciliation',
      }),
    );
  });
});
