import type { Request } from 'express';

import type { JwtPayload } from '@school/shared';

import { PlatformAuditService } from '../platform-audit/platform-audit.service';

import { SyntheticCheckRunnerService } from './synthetic-check-runner.service';
import { SyntheticChecksController } from './synthetic-checks.controller';
import { SyntheticChecksService } from './synthetic-checks.service';

const CHECK_ID = '22222222-2222-4222-8222-222222222222';
const USER = { sub: '11111111-1111-4111-8111-111111111111' } as JwtPayload;
const REQUEST = {
  get: jest.fn().mockReturnValue('jest'),
  headers: {},
  ip: '127.0.0.1',
} as unknown as Request;

function buildController() {
  const checks = {
    certificates: jest.fn().mockResolvedValue([{ hostname: 'dua' }]),
    create: jest.fn().mockResolvedValue({ id: CHECK_ID }),
    externalDependencies: jest.fn().mockResolvedValue([{ provider_key: 'resend' }]),
    get: jest.fn().mockResolvedValue({ id: CHECK_ID }),
    getResult: jest.fn().mockResolvedValue({ id: 'result-1' }),
    list: jest.fn().mockResolvedValue({ data: [] }),
    listResults: jest.fn().mockResolvedValue({ data: [] }),
    remove: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue({ id: CHECK_ID }),
  };
  const runner = { run: jest.fn().mockResolvedValue({ id: 'result-1', status: 'passed' }) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  return {
    audit,
    checks,
    controller: new SyntheticChecksController(
      checks as unknown as SyntheticChecksService,
      runner as unknown as SyntheticCheckRunnerService,
      audit as unknown as PlatformAuditService,
    ),
    runner,
  };
}

describe('SyntheticChecksController', () => {
  it('delegates read endpoints to the service', async () => {
    const { checks, controller } = buildController();

    await controller.list({ page: 1, pageSize: 10 });
    await controller.get(CHECK_ID);
    await controller.listResults(CHECK_ID, { page: 1, pageSize: 10 });
    await controller.getResult('33333333-3333-4333-8333-333333333333');
    await controller.externalDependencies();
    await controller.certificates();

    expect(checks.list).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
    expect(checks.get).toHaveBeenCalledWith(CHECK_ID);
    expect(checks.listResults).toHaveBeenCalledWith(CHECK_ID, { page: 1, pageSize: 10 });
    expect(checks.getResult).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333');
    expect(checks.externalDependencies).toHaveBeenCalledTimes(1);
    expect(checks.certificates).toHaveBeenCalledTimes(1);
  });

  it('passes operator audit context for mutations', async () => {
    const { checks, controller } = buildController();
    const dto = {
      consecutive_failure_threshold_critical: 2,
      display_name: 'Readiness',
      enabled: true,
      key: 'platform.readiness',
      kind: 'http_get' as const,
      retry_attempts: 1,
      schedule_cron: '*/5 * * * *',
      target: { url: 'https://example.test/ready' },
      timeout_ms: 1000,
    };

    await controller.create(dto, USER, REQUEST);
    await controller.update(CHECK_ID, { display_name: 'Updated' }, USER, REQUEST);
    await controller.remove(CHECK_ID, USER, REQUEST);

    expect(checks.create).toHaveBeenCalledWith(
      dto,
      USER.sub,
      expect.objectContaining({ actor_user_id: USER.sub }),
    );
    expect(checks.update).toHaveBeenCalledWith(
      CHECK_ID,
      { display_name: 'Updated' },
      expect.objectContaining({ actor_user_id: USER.sub }),
    );
    expect(checks.remove).toHaveBeenCalledWith(
      CHECK_ID,
      expect.objectContaining({ actor_user_id: USER.sub }),
    );
  });

  it('runs checks on demand and writes the run-now audit event', async () => {
    const { audit, controller, runner } = buildController();

    const result = await controller.runNow(CHECK_ID, USER, REQUEST);

    expect(runner.run).toHaveBeenCalledWith(CHECK_ID, {
      triggered_by: 'run_now',
      user_id: USER.sub,
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'synthetic_check_run_now',
        payload: { after: { result_id: 'result-1', status: 'passed' } },
      }),
    );
    expect(result).toEqual({ id: 'result-1', status: 'passed' });
  });
});
