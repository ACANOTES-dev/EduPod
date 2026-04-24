import type { PrismaClient } from '@prisma/client';
import type { Job, Queue } from 'bullmq';

import {
  REPORTS_ALERT_EVALUATE_JOB,
  REPORTS_ALERT_EVALUATE_TENANT_JOB,
  ReportAlertsHandler,
  type ReportsAlertEvaluateTenantPayload,
} from './report-alerts.processor';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function buildJob<T = unknown>(name: string, data: T): Job<T> {
  return {
    name,
    id: `job-${name}`,
    data,
    updateProgress: jest.fn(),
  } as unknown as Job<T>;
}

const inner = {
  $executeRaw: jest.fn().mockResolvedValue(1),
  reportAlert: { findMany: jest.fn().mockResolvedValue([]) },
};

function buildPrisma(tenants: Array<{ id: string }>): PrismaClient {
  return {
    tenant: { findMany: jest.fn().mockResolvedValue(tenants) },
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: typeof inner) => Promise<unknown>) => fn(inner)),
  } as unknown as PrismaClient;
}

function buildQueue(): Queue {
  return { add: jest.fn().mockResolvedValue(undefined) } as unknown as Queue;
}

describe('ReportAlertsHandler', () => {
  let handler: ReportAlertsHandler;
  let prisma: PrismaClient;
  let queue: Queue;

  beforeEach(() => {
    prisma = buildPrisma([{ id: TENANT_A }, { id: TENANT_B }]);
    queue = buildQueue();
    handler = new ReportAlertsHandler(prisma, queue);
    inner.reportAlert.findMany.mockResolvedValue([]);
  });

  afterEach(() => jest.clearAllMocks());

  describe('cross-tenant tick', () => {
    it('enqueues one per-tenant job per active tenant', async () => {
      const job = buildJob(REPORTS_ALERT_EVALUATE_JOB, { tenant_id: 'sentinel' });
      await handler.process(job);
      expect(prisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'active' } }),
      );
      expect(queue.add).toHaveBeenCalledTimes(2);
      expect(queue.add).toHaveBeenCalledWith(REPORTS_ALERT_EVALUATE_TENANT_JOB, {
        tenant_id: TENANT_A,
      });
      expect(queue.add).toHaveBeenCalledWith(REPORTS_ALERT_EVALUATE_TENANT_JOB, {
        tenant_id: TENANT_B,
      });
    });

    it('continues dispatching when one enqueue fails', async () => {
      (queue.add as jest.Mock)
        .mockRejectedValueOnce(new Error('redis is down'))
        .mockResolvedValueOnce(undefined);
      const job = buildJob(REPORTS_ALERT_EVALUATE_JOB, { tenant_id: 'sentinel' });
      await expect(handler.process(job)).resolves.not.toThrow();
      expect(queue.add).toHaveBeenCalledTimes(2);
    });
  });

  describe('per-tenant evaluation', () => {
    it('rejects payloads missing tenant_id', async () => {
      const job = buildJob<ReportsAlertEvaluateTenantPayload>(
        REPORTS_ALERT_EVALUATE_TENANT_JOB,
        { tenant_id: '' as unknown as string },
      );
      await expect(handler.process(job)).rejects.toThrow(/tenant_id/);
    });

    it('runs the TenantAwareJob pipeline for valid payloads', async () => {
      const job = buildJob<ReportsAlertEvaluateTenantPayload>(
        REPORTS_ALERT_EVALUATE_TENANT_JOB,
        { tenant_id: TENANT_A },
      );
      await handler.process(job);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('routing', () => {
    it('ignores unknown job names', async () => {
      const job = buildJob('reports:export-batch', { tenant_id: TENANT_A });
      await handler.process(job);
      expect(prisma.tenant.findMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
