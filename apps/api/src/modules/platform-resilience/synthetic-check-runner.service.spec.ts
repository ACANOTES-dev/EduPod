import type { SyntheticCheckKind, SyntheticCheckResultStatus } from '@prisma/client';

import { SyntheticAlertEmitterService } from './synthetic-alert-emitter.service';
import { SyntheticCheckHandlersService } from './synthetic-check-handlers.service';
import { SyntheticCheckRunnerService } from './synthetic-check-runner.service';

const DEFINITION = {
  consecutive_failure_threshold_critical: 2,
  display_name: 'Synthetic Login',
  expected: {},
  id: 'definition-1',
  key: 'platform.synthetic.login',
  kind: 'http_get' as SyntheticCheckKind,
  related_component: 'auth',
  retry_attempts: 1,
  target: {},
  timeout_ms: 15000,
};

function buildPrisma() {
  return {
    platformCertificateCheck: { upsert: jest.fn() },
    platformExternalDependencyStatus: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    platformMaintenanceWindow: { findFirst: jest.fn() },
    platformSyntheticCheckDefinition: {
      findUnique: jest.fn().mockResolvedValue(DEFINITION),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        consecutive_failure_threshold_critical: 2,
      }),
    },
    platformSyntheticCheckResult: {
      create: jest.fn(async ({ data }) => ({
        ...data,
        id: 'result-1',
        ran_at: new Date('2026-05-17T12:00:00.000Z'),
      })),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

describe('SyntheticCheckRunnerService', () => {
  it('records skipped maintenance results and emits no alert', async () => {
    const prisma = buildPrisma();
    prisma.platformMaintenanceWindow.findFirst.mockResolvedValue({ id: 'window-1' });
    const handler = { execute: jest.fn() };
    const alerts = { emit: jest.fn() };
    const runner = new SyntheticCheckRunnerService(
      prisma as never,
      { get: jest.fn().mockReturnValue(handler) } as unknown as SyntheticCheckHandlersService,
      { redact: jest.fn(async (value: string) => ({ redacted: value })) } as never,
      alerts as unknown as SyntheticAlertEmitterService,
    );

    await runner.run('definition-1');

    expect(prisma.platformSyntheticCheckResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'skipped_maintenance' }),
      }),
    );
    expect(handler.execute).not.toHaveBeenCalled();
    expect(alerts.emit).not.toHaveBeenCalled();
  });

  it('stores a SHA256 digest and redacted snippet without raw response bodies', async () => {
    const prisma = buildPrisma();
    prisma.platformMaintenanceWindow.findFirst.mockResolvedValue(null);
    prisma.platformSyntheticCheckResult.findFirst.mockResolvedValue({
      id: 'result-1',
      status: 'failed' as SyntheticCheckResultStatus,
    });
    prisma.platformSyntheticCheckResult.findMany.mockResolvedValue([
      { id: 'result-1', status: 'failed' as SyntheticCheckResultStatus },
    ]);
    const handler = {
      execute: jest.fn().mockResolvedValue({
        failure_detail: { token: 'super-secret-token' },
        latency_ms: 42,
        response_body: `token=super-secret-token ${'x'.repeat(1000)}`,
        response_status_code: 500,
        status: 'failed',
      }),
    };
    const alerts = { emit: jest.fn() };
    const runner = new SyntheticCheckRunnerService(
      prisma as never,
      { get: jest.fn().mockReturnValue(handler) } as unknown as SyntheticCheckHandlersService,
      {
        redact: jest.fn(async (value: string) => ({
          redacted: value.replace(/super-secret-token/g, '[REDACTED]'),
        })),
      } as never,
      alerts as unknown as SyntheticAlertEmitterService,
    );

    await runner.run('definition-1');

    const data = prisma.platformSyntheticCheckResult.create.mock.calls[0][0].data;
    expect(data.response_body_sha256).toHaveLength(64);
    expect(data.response_body_snippet).toHaveLength(500);
    expect(data.response_body_snippet).not.toContain('super-secret-token');
    expect(JSON.stringify(data.failure_detail)).not.toContain('super-secret-token');
    expect(data).not.toHaveProperty('response_body');
    expect(alerts.emit).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warning', type: 'failed' }),
    );
  });

  it('escalates to critical after the configured consecutive failure threshold', async () => {
    const prisma = buildPrisma();
    prisma.platformMaintenanceWindow.findFirst.mockResolvedValue(null);
    prisma.platformSyntheticCheckResult.findFirst.mockResolvedValue({
      id: 'result-2',
      status: 'failed' as SyntheticCheckResultStatus,
    });
    prisma.platformSyntheticCheckResult.findMany.mockResolvedValue([
      { id: 'result-2', status: 'failed' as SyntheticCheckResultStatus },
      { id: 'result-1', status: 'failed' as SyntheticCheckResultStatus },
    ]);
    const alerts = { emit: jest.fn() };
    const runner = new SyntheticCheckRunnerService(
      prisma as never,
      {
        get: jest.fn().mockReturnValue({
          execute: jest.fn().mockResolvedValue({ status: 'failed' }),
        }),
      } as unknown as SyntheticCheckHandlersService,
      { redact: jest.fn(async (value: string) => ({ redacted: value })) } as never,
      alerts as unknown as SyntheticAlertEmitterService,
    );

    await runner.run('definition-1');

    expect(alerts.emit).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'critical', type: 'failed_critical' }),
    );
  });

  it('emits an info recovery alert after a failed result passes', async () => {
    const prisma = buildPrisma();
    prisma.platformMaintenanceWindow.findFirst.mockResolvedValue(null);
    prisma.platformSyntheticCheckResult.findFirst.mockResolvedValue({
      id: 'result-2',
      status: 'passed' as SyntheticCheckResultStatus,
    });
    prisma.platformSyntheticCheckResult.findMany.mockResolvedValue([
      { id: 'result-1', status: 'failed' as SyntheticCheckResultStatus },
    ]);
    const alerts = { emit: jest.fn() };
    const runner = new SyntheticCheckRunnerService(
      prisma as never,
      {
        get: jest.fn().mockReturnValue({
          execute: jest.fn().mockResolvedValue({ status: 'passed' }),
        }),
      } as unknown as SyntheticCheckHandlersService,
      { redact: jest.fn(async (value: string) => ({ redacted: value })) } as never,
      alerts as unknown as SyntheticAlertEmitterService,
    );

    await runner.run('definition-1');

    expect(alerts.emit).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'info', type: 'recovered' }),
    );
  });
});
