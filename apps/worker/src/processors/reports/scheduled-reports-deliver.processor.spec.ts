/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { ConfigService } from '@nestjs/config';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Job } from 'bullmq';

jest.mock('../../base/s3.helpers', () => ({
  uploadToS3: jest.fn().mockResolvedValue(undefined),
}));

// Mock Resend SDK so tests don't make real HTTP calls. The processor
// constructs `new Resend(apiKey)` per send; we capture the call via the
// shared mock send fn.
const mockResendSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockResendSend },
  })),
}));

// Mock the tenant credential helper — `sendEmail` calls `getEmailCreds`
// before instantiating Resend. Tests override the per-test return.
const mockGetEmailCreds = jest.fn();
jest.mock('../communications/tenant-creds.helper', () => ({
  getEmailCreds: (...args: unknown[]) => mockGetEmailCreds(...args),
}));

import { uploadToS3 } from '../../base/s3.helpers';

import {
  REPORTS_SCHEDULED_DELIVER_JOB,
  ScheduledReportsDeliverProcessor,
  ScheduledReportsDeliverWork,
  type ScheduledReportsDeliverPayload,
  renderArtifactCsv,
} from './scheduled-reports-deliver.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const SCHEDULED_REPORT_ID = '22222222-2222-2222-2222-222222222222';
const SAVED_REPORT_ID = '33333333-3333-3333-3333-333333333333';
const RUN_ID = '44444444-4444-4444-4444-444444444444';

interface ScheduledReportRow {
  id: string;
  tenant_id: string;
  name: string;
  report_type: string;
  schedule_cron: string;
  format: string;
  recipient_emails: unknown;
  parameters_json: unknown;
}

function buildJob(
  name: string,
  data: Partial<ScheduledReportsDeliverPayload> = {},
): Job<ScheduledReportsDeliverPayload> {
  return {
    name,
    id: 'job-1',
    data: {
      tenant_id: TENANT_ID,
      scheduled_report_id: SCHEDULED_REPORT_ID,
      ...data,
    } as ScheduledReportsDeliverPayload,
  } as unknown as Job<ScheduledReportsDeliverPayload>;
}

interface BuildPrismaOpts {
  scheduledReport?: ScheduledReportRow | null;
  savedReport?: { id: string; name: string; data_source: string } | null;
  tenant?: { name: string; default_locale: string } | null;
  recentRunningRun?: { id: string } | null;
  createdRunId?: string;
  scheduledReportRunUpdate?: jest.Mock;
  scheduledReportUpdate?: jest.Mock;
}

interface PrismaTxStub {
  scheduledReportRun: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  scheduledReport: { findFirst: jest.Mock; update: jest.Mock };
  savedReport: { findFirst: jest.Mock };
  tenant: { findFirst: jest.Mock };
  $executeRaw: jest.Mock;
}

interface BuiltPrisma {
  prisma: PrismaClient;
  tx: PrismaTxStub;
}

function buildPrisma(opts: BuildPrismaOpts = {}): BuiltPrisma {
  const tx: PrismaTxStub = {
    scheduledReportRun: {
      findFirst: jest.fn().mockResolvedValue(opts.recentRunningRun ?? null),
      create: jest.fn().mockResolvedValue({ id: opts.createdRunId ?? RUN_ID }),
      update: opts.scheduledReportRunUpdate ?? jest.fn().mockResolvedValue({}),
    },
    scheduledReport: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opts.scheduledReport === undefined ? defaultScheduledReport() : opts.scheduledReport,
        ),
      update: opts.scheduledReportUpdate ?? jest.fn().mockResolvedValue({}),
    },
    savedReport: {
      findFirst: jest.fn().mockResolvedValue(opts.savedReport ?? null),
    },
    tenant: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opts.tenant === undefined ? { name: 'Test School', default_locale: 'en' } : opts.tenant,
        ),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  const prisma = {
    $transaction: jest
      .fn()
      .mockImplementation(
        async (fn: (tx: PrismaTxStub | Prisma.TransactionClient) => Promise<unknown>) => fn(tx),
      ),
  } as unknown as PrismaClient;
  return { prisma, tx };
}

function defaultScheduledReport(): ScheduledReportRow {
  return {
    id: SCHEDULED_REPORT_ID,
    tenant_id: TENANT_ID,
    name: 'Daily Attendance Roundup',
    report_type: 'attendance',
    schedule_cron: '0 8 * * *',
    format: 'csv',
    recipient_emails: ['principal@nhqs.test'],
    parameters_json: { saved_report_id: SAVED_REPORT_ID },
  };
}

/**
 * Configures the shared Resend mock. Returns a stable handle whose `send`
 * is the same `jest.fn()` the production processor's `new Resend(...)` will
 * resolve to (via `jest.mock('resend', ...)` at the top of this file).
 */
function buildResendClient(rejectWith: { message: string } | null = null) {
  mockResendSend.mockImplementation(async () => ({
    error: rejectWith,
    data: rejectWith ? null : { id: 'msg-1' },
  }));
  // Default: tenant has a configured + enabled email config row.
  mockGetEmailCreds.mockResolvedValue({
    resend_api_key: 're_tenant',
    from_email: 'noreply@school.edu',
    from_name: null,
    reply_to_email: null,
    is_enabled: true,
  });
  return {
    send: mockResendSend,
  };
}

describe('ScheduledReportsDeliverProcessor', () => {
  beforeEach(() => {
    (uploadToS3 as jest.Mock).mockClear();
    (uploadToS3 as jest.Mock).mockResolvedValue(undefined);
  });

  it('ignores jobs with a different name', async () => {
    const { prisma } = buildPrisma();
    const config = { get: jest.fn() } as unknown as ConfigService;
    const processor = new ScheduledReportsDeliverProcessor(prisma, config);
    await processor.process(buildJob('reports:export-batch'));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects jobs missing tenant_id', async () => {
    const { prisma } = buildPrisma();
    const config = { get: jest.fn() } as unknown as ConfigService;
    const processor = new ScheduledReportsDeliverProcessor(prisma, config);
    await expect(
      processor.process(
        buildJob(REPORTS_SCHEDULED_DELIVER_JOB, {
          tenant_id: '' as unknown as string,
        }),
      ),
    ).rejects.toThrow(/tenant_id/);
  });

  it('rejects jobs missing scheduled_report_id', async () => {
    const { prisma } = buildPrisma();
    const config = { get: jest.fn() } as unknown as ConfigService;
    const processor = new ScheduledReportsDeliverProcessor(prisma, config);
    await expect(
      processor.process(
        buildJob(REPORTS_SCHEDULED_DELIVER_JOB, {
          scheduled_report_id: '' as unknown as string,
        }),
      ),
    ).rejects.toThrow(/scheduled_report_id/);
  });
});

describe('ScheduledReportsDeliverWork', () => {
  beforeEach(() => {
    // Reset shared Resend / creds mocks between tests so a prior
    // `buildResendClient()` call doesn't leak into the next test.
    mockResendSend.mockReset();
    mockGetEmailCreds.mockReset();
  });

  beforeEach(() => {
    (uploadToS3 as jest.Mock).mockClear();
    (uploadToS3 as jest.Mock).mockResolvedValue(undefined);
  });

  it('creates a run row, uploads the artifact, sends email, marks succeeded', async () => {
    const { prisma, tx } = buildPrisma({
      savedReport: {
        id: SAVED_REPORT_ID,
        name: 'Year 10 Attendance',
        data_source: 'student',
      },
    });
    const config = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'RESEND_API_KEY') return 'test-key';
        if (key === 'RESEND_FROM_EMAIL') return 'noreply@edupod.app';
        return undefined;
      }),
    } as unknown as ConfigService;
    buildResendClient();
    const work = new ScheduledReportsDeliverWork(prisma, config);

    await work.execute({
      tenant_id: TENANT_ID,
      scheduled_report_id: SCHEDULED_REPORT_ID,
    });

    expect(tx.scheduledReportRun.create).toHaveBeenCalledTimes(1);
    expect(uploadToS3).toHaveBeenCalledTimes(1);
    expect(mockResendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['principal@nhqs.test'],
        attachments: expect.arrayContaining([
          expect.objectContaining({
            filename: expect.stringContaining('daily_attendance_roundup'),
          }),
        ]),
      }),
    );
    expect(tx.scheduledReportRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: RUN_ID },
        data: expect.objectContaining({
          status: 'succeeded',
          delivered_via: ['email'],
          error_message: null,
        }),
      }),
    );
    expect(tx.scheduledReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SCHEDULED_REPORT_ID },
        data: expect.objectContaining({ last_sent_at: expect.any(Date) }),
      }),
    );
  });

  it('marks delivery error when Resend rejects but still records succeeded run', async () => {
    const { prisma, tx } = buildPrisma();
    const config = {
      get: jest.fn().mockReturnValue('test-key'),
    } as unknown as ConfigService;
    buildResendClient({ message: 'recipient blocked' });
    const work = new ScheduledReportsDeliverWork(prisma, config);

    await work.execute({
      tenant_id: TENANT_ID,
      scheduled_report_id: SCHEDULED_REPORT_ID,
    });

    expect(tx.scheduledReportRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'succeeded',
          delivered_via: [],
          error_message: expect.stringContaining('recipient blocked'),
        }),
      }),
    );
  });

  it('records error_message when S3 upload fails but still marks run succeeded', async () => {
    (uploadToS3 as jest.Mock).mockRejectedValueOnce(new Error('S3 timeout'));
    const { prisma, tx } = buildPrisma();
    const config = {
      get: jest.fn().mockReturnValue('test-key'),
    } as unknown as ConfigService;
    buildResendClient();
    const work = new ScheduledReportsDeliverWork(prisma, config);

    await work.execute({
      tenant_id: TENANT_ID,
      scheduled_report_id: SCHEDULED_REPORT_ID,
    });

    expect(tx.scheduledReportRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'succeeded',
          artifact_object_key: null,
          error_message: expect.stringContaining('S3 timeout'),
        }),
      }),
    );
  });

  it('skips when another running run started in the last 10 minutes (idempotency)', async () => {
    const { prisma, tx } = buildPrisma({
      recentRunningRun: { id: 'prior-run-1' },
    });
    const config = { get: jest.fn() } as unknown as ConfigService;
    buildResendClient();
    const work = new ScheduledReportsDeliverWork(prisma, config);

    await work.execute({
      tenant_id: TENANT_ID,
      scheduled_report_id: SCHEDULED_REPORT_ID,
    });

    expect(tx.scheduledReportRun.create).not.toHaveBeenCalled();
    expect(uploadToS3).not.toHaveBeenCalled();
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('skips when the scheduled report is not found', async () => {
    const { prisma, tx } = buildPrisma({ scheduledReport: null });
    const config = { get: jest.fn() } as unknown as ConfigService;
    buildResendClient();
    const work = new ScheduledReportsDeliverWork(prisma, config);

    await work.execute({
      tenant_id: TENANT_ID,
      scheduled_report_id: SCHEDULED_REPORT_ID,
    });

    expect(tx.scheduledReportRun.create).not.toHaveBeenCalled();
    expect(uploadToS3).not.toHaveBeenCalled();
  });

  it('records "no recipient emails configured" when recipients list is empty', async () => {
    const { prisma, tx } = buildPrisma({
      scheduledReport: {
        ...defaultScheduledReport(),
        recipient_emails: [],
      },
    });
    const config = { get: jest.fn() } as unknown as ConfigService;
    buildResendClient();
    const work = new ScheduledReportsDeliverWork(prisma, config);

    await work.execute({
      tenant_id: TENANT_ID,
      scheduled_report_id: SCHEDULED_REPORT_ID,
    });

    expect(mockResendSend).not.toHaveBeenCalled();
    expect(tx.scheduledReportRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          delivered_via: [],
          error_message: 'no recipient emails configured',
        }),
      }),
    );
  });

  it('handles legacy parameters_json without saved_report_id', async () => {
    const { prisma, tx } = buildPrisma({
      scheduledReport: {
        ...defaultScheduledReport(),
        parameters_json: { legacy_thing: 'value' },
      },
      savedReport: null,
    });
    const config = { get: jest.fn().mockReturnValue('test-key') } as unknown as ConfigService;
    buildResendClient();
    const work = new ScheduledReportsDeliverWork(prisma, config);

    await work.execute({
      tenant_id: TENANT_ID,
      scheduled_report_id: SCHEDULED_REPORT_ID,
    });

    // Saved-report lookup is skipped when parameters_json has no
    // saved_report_id; the artifact still emits with legacy metadata.
    expect(tx.savedReport.findFirst).not.toHaveBeenCalled();
    expect(tx.scheduledReportRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'succeeded' }),
      }),
    );
  });
});

describe('renderArtifactCsv', () => {
  it('emits a header row, escaped values, and a saved-report block when present', () => {
    const csv = renderArtifactCsv({
      reportName: 'Daily, Attendance Report',
      tenantName: 'Test "School"',
      generatedAt: new Date('2026-04-25T08:00:00Z'),
      schedule_cron: '0 8 * * *',
      report_type: 'attendance',
      saved_report: { id: SAVED_REPORT_ID, name: 'Year 10', data_source: 'student' },
      recipient_count: 3,
    });

    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Field,Value');
    // commas in the report name must be quoted
    expect(csv).toContain('"Daily, Attendance Report"');
    // double-quotes in the tenant name must be doubled-up
    expect(csv).toContain('"Test ""School"""');
    expect(csv).toContain('Saved Report,Year 10');
    expect(csv).toContain('Saved Report Subject,student');
    expect(csv).toContain('Recipient Count,3');
  });

  it('emits the legacy migration hint when no saved report is linked', () => {
    const csv = renderArtifactCsv({
      reportName: 'Legacy Schedule',
      tenantName: 'School',
      generatedAt: new Date('2026-04-25T08:00:00Z'),
      schedule_cron: '*/15 * * * *',
      report_type: 'attendance',
      saved_report: null,
      recipient_count: 1,
    });

    expect(csv).toContain('Pending — link a saved report via parameters_json.saved_report_id');
  });
});
