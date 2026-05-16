import type { PrismaClient } from '@prisma/client';
import type { Job } from 'bullmq';

import {
  TENANT_MAINTENANCE_WINDOW_CHECK_JOB,
  type TenantMaintenanceWindowCheckProcessor,
} from './maintenance-window-check.processor';
import {
  REPORTS_ALERT_EVALUATE_JOB,
  REPORTS_ALERT_EVALUATE_TENANT_JOB,
  type ReportAlertsHandler,
} from './report-alerts.processor';
import {
  REPORTS_EXPORT_BATCH_JOB,
  ReportsExportBatchHandler,
  ReportsExportBatchProcessor,
  type ReportsExportBatchPayload,
} from './reports-export-batch.processor';
import {
  REPORTS_SCHEDULED_DELIVER_JOB,
  type ScheduledReportsDeliverProcessor,
} from './scheduled-reports-deliver.processor';
import {
  REPORTS_SCHEDULED_RUN_JOB,
  type ScheduledReportsTickProcessor,
} from './scheduled-reports-tick.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const REPORT_ID = '33333333-3333-3333-3333-333333333333';

function buildExportJob(
  name: string,
  data: Partial<ReportsExportBatchPayload> = {},
): Job<ReportsExportBatchPayload> {
  return {
    name,
    id: 'job-1',
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

function buildBareJob(name: string): Job {
  return { name, id: `job-${name}`, data: {} } as unknown as Job;
}

function buildPrisma(): PrismaClient {
  const tx = { $executeRaw: jest.fn().mockResolvedValue(1) };
  return {
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaClient;
}

describe('ReportsExportBatchHandler', () => {
  let handler: ReportsExportBatchHandler;
  let prisma: PrismaClient;

  beforeEach(() => {
    prisma = buildPrisma();
    handler = new ReportsExportBatchHandler(prisma);
  });

  afterEach(() => jest.clearAllMocks());

  it('ignores jobs with a different name (shared REPORTS queue)', async () => {
    const job = buildExportJob(REPORTS_SCHEDULED_RUN_JOB);
    await handler.process(job);
    expect(job.updateProgress).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects jobs missing tenant_id', async () => {
    const job = buildExportJob(REPORTS_EXPORT_BATCH_JOB, {
      tenant_id: '' as unknown as string,
    });
    await expect(handler.process(job)).rejects.toThrow(/tenant_id/);
  });

  it('runs the TenantAwareJob pipeline for valid payloads and completes', async () => {
    const job = buildExportJob(REPORTS_EXPORT_BATCH_JOB);
    await handler.process(job);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });
});

describe('ReportsExportBatchProcessor (dispatcher)', () => {
  let dispatcher: ReportsExportBatchProcessor;
  let exportBatch: jest.Mocked<Pick<ReportsExportBatchHandler, 'process'>>;
  let scheduledTick: jest.Mocked<Pick<ScheduledReportsTickProcessor, 'process'>>;
  let scheduledDeliver: jest.Mocked<Pick<ScheduledReportsDeliverProcessor, 'process'>>;
  let alertsHandler: jest.Mocked<Pick<ReportAlertsHandler, 'process'>>;
  let maintenanceWindowCheck: jest.Mocked<Pick<TenantMaintenanceWindowCheckProcessor, 'process'>>;

  beforeEach(() => {
    exportBatch = { process: jest.fn().mockResolvedValue(undefined) };
    scheduledTick = { process: jest.fn().mockResolvedValue(undefined) };
    scheduledDeliver = { process: jest.fn().mockResolvedValue(undefined) };
    alertsHandler = { process: jest.fn().mockResolvedValue(undefined) };
    maintenanceWindowCheck = { process: jest.fn().mockResolvedValue(undefined) };
    dispatcher = new ReportsExportBatchProcessor(
      exportBatch as unknown as ReportsExportBatchHandler,
      scheduledTick as unknown as ScheduledReportsTickProcessor,
      scheduledDeliver as unknown as ScheduledReportsDeliverProcessor,
      alertsHandler as unknown as ReportAlertsHandler,
      maintenanceWindowCheck as unknown as TenantMaintenanceWindowCheckProcessor,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('routes export-batch jobs to the export-batch handler', async () => {
    const job = buildExportJob(REPORTS_EXPORT_BATCH_JOB);
    await dispatcher.process(job);
    expect(exportBatch.process).toHaveBeenCalledTimes(1);
    expect(scheduledTick.process).not.toHaveBeenCalled();
    expect(scheduledDeliver.process).not.toHaveBeenCalled();
    expect(alertsHandler.process).not.toHaveBeenCalled();
  });

  it('routes alert-evaluate jobs to the alerts handler', async () => {
    const job = buildBareJob(REPORTS_ALERT_EVALUATE_JOB);
    await dispatcher.process(job);
    expect(alertsHandler.process).toHaveBeenCalledTimes(1);
  });

  it('routes alert-evaluate-tenant jobs to the alerts handler', async () => {
    const job = buildBareJob(REPORTS_ALERT_EVALUATE_TENANT_JOB);
    await dispatcher.process(job);
    expect(alertsHandler.process).toHaveBeenCalledTimes(1);
  });

  it('routes tenant maintenance window checks to the maintenance handler', async () => {
    const job = buildBareJob(TENANT_MAINTENANCE_WINDOW_CHECK_JOB);
    await dispatcher.process(job);
    expect(maintenanceWindowCheck.process).toHaveBeenCalledTimes(1);
    expect(alertsHandler.process).not.toHaveBeenCalled();
  });

  it('routes scheduled-run jobs to the tick handler', async () => {
    const job = buildBareJob(REPORTS_SCHEDULED_RUN_JOB);
    await dispatcher.process(job);
    expect(scheduledTick.process).toHaveBeenCalledTimes(1);
    expect(exportBatch.process).not.toHaveBeenCalled();
    expect(scheduledDeliver.process).not.toHaveBeenCalled();
  });

  it('routes scheduled-deliver jobs to the deliver handler', async () => {
    const job = buildBareJob(REPORTS_SCHEDULED_DELIVER_JOB);
    await dispatcher.process(job);
    expect(scheduledDeliver.process).toHaveBeenCalledTimes(1);
    expect(scheduledTick.process).not.toHaveBeenCalled();
    expect(exportBatch.process).not.toHaveBeenCalled();
  });

  it('silently swallows monitoring canary jobs without warning', async () => {
    const warnSpy = jest.spyOn(dispatcher['logger'], 'warn').mockImplementation();
    const job = buildBareJob('monitoring:canary-echo');
    await dispatcher.process(job);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('logs and ignores unknown job names', async () => {
    const warnSpy = jest.spyOn(dispatcher['logger'], 'warn').mockImplementation();
    const job = buildBareJob('reports:totally-unknown');
    await dispatcher.process(job);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('reports:totally-unknown'));
    warnSpy.mockRestore();
  });
});
