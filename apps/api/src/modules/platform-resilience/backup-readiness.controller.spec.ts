import { UnauthorizedException } from '@nestjs/common';

import type {
  BackupReadinessListQuery,
  BackupReplicationListQuery,
  CreateRestoreDrillDto,
  RestoreDrillListQuery,
  UpdateRestoreDrillDto,
} from '@school/shared';

import { BackupCaptureController, BackupReadinessController } from './backup-readiness.controller';

const USER = {
  email: 'owner@example.com',
  roles: ['platform_owner'],
  sub: 'owner-user',
};

const REQUEST = {
  headers: {
    'user-agent': 'jest',
    'x-forwarded-for': '203.0.113.10, 10.0.0.1',
  },
  ip: '127.0.0.1',
};

function buildService() {
  return {
    capture: jest.fn().mockResolvedValue({ backup_key: 'backup-key', created: true, id: 'run-1' }),
    createRestoreDrill: jest.fn().mockResolvedValue({ id: 'drill-1' }),
    deleteRestoreDrillWithConfirmation: jest.fn().mockResolvedValue(undefined),
    getReadinessSummary: jest.fn().mockResolvedValue({ overall_status: 'green' }),
    getRun: jest.fn().mockResolvedValue({ id: 'run-1' }),
    listReplications: jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
    listRestoreDrills: jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
    listRuns: jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
    updateRestoreDrill: jest.fn().mockResolvedValue({ id: 'drill-1' }),
    verifyInternalToken: jest.fn((token: string | undefined) => token === 'secret'),
  };
}

describe('BackupCaptureController', () => {
  it('captures internal backup evidence with a valid token', async () => {
    const service = buildService();
    const controller = new BackupCaptureController(service as never);
    const dto = {
      backup_key: 'backup-key',
      finished_at: new Date('2026-05-18T12:00:00.000Z'),
      kind: 'pg_dump' as const,
      location: 'local:/backups/predeploy.dump',
      size_bytes: 42,
      started_at: new Date('2026-05-18T11:59:00.000Z'),
      status: 'succeeded' as const,
      storage_kind: 'local',
      trigger_source: 'deploy_pipeline' as const,
    };

    await expect(controller.captureBackup('secret', dto)).resolves.toMatchObject({
      backup_key: 'backup-key',
      created: true,
    });
    expect(service.capture).toHaveBeenCalledWith(dto);
  });

  it('rejects internal backup evidence with an invalid token', async () => {
    const service = buildService();
    const controller = new BackupCaptureController(service as never);

    await expect(controller.captureBackup('wrong', {} as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(service.capture).not.toHaveBeenCalled();
  });
});

describe('BackupReadinessController', () => {
  it('delegates read endpoints to the backup readiness service', async () => {
    const service = buildService();
    const controller = new BackupReadinessController(service as never);
    const runQuery: BackupReadinessListQuery = { page: 1, pageSize: 10 };
    const replicationQuery: BackupReplicationListQuery = { page: 1, pageSize: 10 };
    const drillQuery: RestoreDrillListQuery = { page: 1, pageSize: 10 };

    await expect(controller.readiness()).resolves.toMatchObject({ overall_status: 'green' });
    await expect(controller.runs(runQuery)).resolves.toMatchObject({ data: [] });
    await expect(controller.run('11111111-1111-4111-8111-111111111111')).resolves.toMatchObject({
      id: 'run-1',
    });
    await expect(controller.replications(replicationQuery)).resolves.toMatchObject({ data: [] });
    await expect(controller.restoreDrills(drillQuery)).resolves.toMatchObject({ data: [] });

    expect(service.listRuns).toHaveBeenCalledWith(runQuery);
    expect(service.getRun).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(service.listReplications).toHaveBeenCalledWith(replicationQuery);
    expect(service.listRestoreDrills).toHaveBeenCalledWith(drillQuery);
  });

  it('records, updates, and owner-confirms restore drill deletion', async () => {
    const service = buildService();
    const controller = new BackupReadinessController(service as never);
    const createDto: CreateRestoreDrillDto = {
      drill_at: new Date('2026-05-18T12:00:00.000Z'),
      outcome: 'passed',
      restore_point: 'predeploy.dump',
      scope: 'staging',
      summary: 'Validated restore into staging.',
    };
    const updateDto: UpdateRestoreDrillDto = { notes: 'Evidence attached.' };

    await controller.createRestoreDrill(createDto, USER as never, REQUEST as never);
    await controller.updateRestoreDrill(
      '11111111-1111-4111-8111-111111111111',
      'confirmation-1',
      updateDto,
      USER as never,
      REQUEST as never,
    );
    await controller.deleteRestoreDrill(
      '11111111-1111-4111-8111-111111111111',
      'confirmation-2',
      USER as never,
      REQUEST as never,
    );

    expect(service.createRestoreDrill).toHaveBeenCalledWith(
      createDto,
      'owner-user',
      expect.objectContaining({
        actor_user_id: 'owner-user',
        ip_address: '203.0.113.10',
        user_agent: 'jest',
      }),
    );
    expect(service.updateRestoreDrill).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      updateDto,
      expect.objectContaining({ actor_user_id: 'owner-user' }),
      'confirmation-1',
    );
    expect(service.deleteRestoreDrillWithConfirmation).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'confirmation-2',
      expect.objectContaining({ actor_user_id: 'owner-user' }),
    );
  });
});
