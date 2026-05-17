import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PlatformAuditService } from '../platform-audit/platform-audit.service';

import { SyntheticCheckSchedulerService } from './synthetic-check-scheduler.service';
import { SyntheticChecksService } from './synthetic-checks.service';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const CHECK_ID = '22222222-2222-4222-8222-222222222222';

const DEFINITION = {
  consecutive_failure_threshold_critical: 2,
  created_at: new Date('2026-05-17T10:00:00.000Z'),
  created_by_user_id: ACTOR_ID,
  description: 'Synthetic readiness check',
  display_name: 'Readiness',
  enabled: true,
  expected: { status_codes: [200] },
  id: CHECK_ID,
  key: 'platform.readiness',
  kind: 'http_get',
  related_component: 'api',
  related_tenant_id: null,
  retry_attempts: 1,
  schedule_cron: '*/5 * * * *',
  target: { url: 'https://example.test/ready' },
  timeout_ms: 1000,
  updated_at: new Date('2026-05-17T10:00:00.000Z'),
};

const AUDIT_CONTEXT = {
  actor_user_id: ACTOR_ID,
  ip_address: '127.0.0.1',
  user_agent: 'jest',
};

function buildPrisma() {
  return {
    platformCertificateCheck: { findMany: jest.fn().mockResolvedValue([{ hostname: 'dua' }]) },
    platformExternalDependencyStatus: {
      findMany: jest.fn().mockResolvedValue([{ provider_key: 'resend' }]),
    },
    platformSyntheticCheckDefinition: {
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn(async ({ data }) => ({ ...DEFINITION, ...data })),
      delete: jest.fn().mockResolvedValue(DEFINITION),
      findMany: jest.fn().mockResolvedValue([
        {
          ...DEFINITION,
          results: [
            { ran_at: new Date(), status: 'passed' },
            { ran_at: new Date(), status: 'failed' },
          ],
        },
      ]),
      findUnique: jest.fn().mockResolvedValue({
        ...DEFINITION,
        results: [{ ran_at: new Date(), status: 'passed' }],
      }),
      update: jest.fn(async ({ data }) => ({ ...DEFINITION, ...data })),
    },
    platformSyntheticCheckResult: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([{ id: 'result-1', status: 'passed' }]),
      findUnique: jest.fn().mockResolvedValue({
        definition: DEFINITION,
        id: 'result-1',
        status: 'passed',
      }),
    },
  };
}

function buildService(prisma = buildPrisma()) {
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const scheduler = {
    removeDefinitionSchedule: jest.fn().mockResolvedValue(undefined),
    syncDefinition: jest.fn().mockResolvedValue(undefined),
  };
  return {
    audit,
    prisma,
    scheduler,
    service: new SyntheticChecksService(
      prisma as never,
      audit as unknown as PlatformAuditService,
      scheduler as unknown as SyntheticCheckSchedulerService,
    ),
  };
}

describe('SyntheticChecksService', () => {
  it('lists checks with last result and uptime summary', async () => {
    const { prisma, service } = buildService();

    const result = await service.list({ page: 1, pageSize: 10 });

    expect(prisma.platformSyntheticCheckDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { results: { orderBy: { ran_at: 'desc' }, take: 50 } },
        take: 10,
      }),
    );
    expect(result.data[0]).toEqual(
      expect.objectContaining({ last_result: expect.any(Object), uptime_24h: 50 }),
    );
    expect(result.meta.total).toBe(1);
  });

  it('returns one check or throws a structured not-found error', async () => {
    const { prisma, service } = buildService();

    await expect(service.get(CHECK_ID)).resolves.toEqual(
      expect.objectContaining({ id: CHECK_ID, last_result: expect.any(Object) }),
    );

    prisma.platformSyntheticCheckDefinition.findUnique.mockResolvedValueOnce(null);
    await expect(service.get(CHECK_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates validated checks, writes audit, and syncs the schedule', async () => {
    const { audit, prisma, scheduler, service } = buildService();

    const created = await service.create(
      {
        consecutive_failure_threshold_critical: 2,
        display_name: 'Readiness',
        enabled: true,
        expected: { status_codes: [200] },
        key: 'platform.readiness',
        kind: 'http_get',
        retry_attempts: 1,
        schedule_cron: '*/5 * * * *',
        target: { url: 'https://example.test/ready' },
        timeout_ms: 1000,
      },
      ACTOR_ID,
      AUDIT_CONTEXT,
    );

    expect(prisma.platformSyntheticCheckDefinition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ created_by_user_id: ACTOR_ID, key: 'platform.readiness' }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'synthetic_check_created' }),
    );
    expect(scheduler.syncDefinition).toHaveBeenCalledWith(created.id);
  });

  it('rejects invalid check definitions before writing', async () => {
    const { prisma, service } = buildService();

    await expect(
      service.create(
        {
          consecutive_failure_threshold_critical: 2,
          display_name: 'Bad',
          enabled: true,
          key: 'bad',
          kind: 'http_get',
          retry_attempts: 1,
          schedule_cron: '* * * * *',
          target: { url: '~/.codex/secret' },
          timeout_ms: 1000,
        },
        ACTOR_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.platformSyntheticCheckDefinition.create).not.toHaveBeenCalled();
  });

  it('updates existing checks, writes audit, and syncs the schedule', async () => {
    const { audit, scheduler, service } = buildService();

    const updated = await service.update(
      CHECK_ID,
      { display_name: 'Readiness API' },
      AUDIT_CONTEXT,
    );

    expect(updated.display_name).toBe('Readiness API');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'synthetic_check_updated' }),
    );
    expect(scheduler.syncDefinition).toHaveBeenCalledWith(CHECK_ID);
  });

  it('removes existing checks, writes audit, and removes the schedule', async () => {
    const { audit, scheduler, service } = buildService();

    await service.remove(CHECK_ID, AUDIT_CONTEXT);

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'synthetic_check_deleted' }),
    );
    expect(scheduler.removeDefinitionSchedule).toHaveBeenCalledWith('platform.readiness');
  });

  it('lists results, reads result details, dependencies, and certificates', async () => {
    const { service } = buildService();

    await expect(service.listResults(CHECK_ID, { page: 1, pageSize: 25 })).resolves.toEqual(
      expect.objectContaining({ data: [{ id: 'result-1', status: 'passed' }] }),
    );
    await expect(service.getResult('result-1')).resolves.toEqual(
      expect.objectContaining({ definition: DEFINITION, id: 'result-1' }),
    );
    await expect(service.externalDependencies()).resolves.toEqual([{ provider_key: 'resend' }]);
    await expect(service.certificates()).resolves.toEqual([{ hostname: 'dua' }]);
  });
});
