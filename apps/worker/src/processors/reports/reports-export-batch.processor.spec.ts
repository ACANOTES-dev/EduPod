import type { PrismaClient } from '@prisma/client';
import type { Job } from 'bullmq';

import {
  REPORTS_EXPORT_BATCH_JOB,
  ReportsExportBatchProcessor,
  type ReportsExportBatchPayload,
} from './reports-export-batch.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const REPORT_ID = '33333333-3333-3333-3333-333333333333';

function buildJob(
  name: string,
  data: Partial<ReportsExportBatchPayload>,
): Job<ReportsExportBatchPayload> {
  return {
    name,
    data: {
      tenant_id: TENANT_ID,
      user_id: USER_ID,
      saved_report_id: REPORT_ID,
      format: 'pdf',
      ...data,
    } as ReportsExportBatchPayload,
    updateProgress: jest.fn(),
  } as unknown as Job<ReportsExportBatchPayload>;
}

function buildPrisma(): PrismaClient {
  // TenantAwareJob wraps processJob in $transaction and calls
  // set_config('app.current_tenant_id') / set_config('app.current_user_id')
  // inside the transaction; mimic that here so the processor's execute() path
  // runs end-to-end without hitting a real DB.
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  return {
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaClient;
}

describe('ReportsExportBatchProcessor', () => {
  let processor: ReportsExportBatchProcessor;
  let prisma: PrismaClient;

  beforeEach(() => {
    prisma = buildPrisma();
    processor = new ReportsExportBatchProcessor(prisma);
  });

  it('ignores jobs with a different name (shared REPORTS queue)', async () => {
    const job = buildJob('reports:scheduled-run', {});
    await processor.process(job);
    expect(job.updateProgress).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects jobs missing tenant_id', async () => {
    const job = buildJob(REPORTS_EXPORT_BATCH_JOB, {
      tenant_id: '' as unknown as string,
    });
    await expect(processor.process(job)).rejects.toThrow(/tenant_id/);
  });

  it('runs the TenantAwareJob pipeline for valid payloads and completes', async () => {
    const job = buildJob(REPORTS_EXPORT_BATCH_JOB, {});
    await processor.process(job);
    // TenantAwareJob opens a $transaction; the stub processJob body returns
    // cleanly so the processor updates progress to 100.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });
});
