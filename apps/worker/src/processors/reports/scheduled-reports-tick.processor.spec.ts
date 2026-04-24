import type { PrismaClient } from '@prisma/client';
import type { Job, Queue } from 'bullmq';

import {
  REPORTS_SCHEDULED_RUN_JOB,
  ScheduledReportsTickProcessor,
} from './scheduled-reports-tick.processor';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

interface ScheduledReportRow {
  id: string;
  tenant_id: string;
  schedule_cron: string;
  last_sent_at: Date | null;
}

function buildPrisma(rows: ScheduledReportRow[]): PrismaClient {
  return {
    scheduledReport: {
      findMany: jest.fn().mockResolvedValue(rows),
    },
  } as unknown as PrismaClient;
}

function buildQueue(): jest.Mocked<Pick<Queue, 'add'>> {
  return { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
}

function buildTickJob(name = REPORTS_SCHEDULED_RUN_JOB): Job {
  return { name, id: 'tick-job', data: {} } as unknown as Job;
}

describe('ScheduledReportsTickProcessor', () => {
  let prisma: PrismaClient;
  let queue: jest.Mocked<Pick<Queue, 'add'>>;
  let processor: ScheduledReportsTickProcessor;

  beforeEach(() => {
    queue = buildQueue();
    // Pin "now" to 2026-04-25 12:01 UTC so daily/hourly cron prev() values
    // are deterministic across the suite. `useFakeTimers({ now })` swaps
    // both `Date.now()` and the no-arg `new Date()` constructor — a
    // simple `jest.spyOn(Date, 'now')` only affects the former, leaving
    // `new Date()` reading the wall clock.
    jest.useFakeTimers({ now: new Date('2026-04-25T12:01:00Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('ignores jobs with a different name', async () => {
    prisma = buildPrisma([]);
    processor = new ScheduledReportsTickProcessor(prisma, queue as unknown as Queue);
    await processor.process(buildTickJob('not:my:job'));
    expect(prisma.scheduledReport.findMany).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('enqueues nothing when no scheduled reports exist', async () => {
    prisma = buildPrisma([]);
    processor = new ScheduledReportsTickProcessor(prisma, queue as unknown as Queue);
    await processor.process(buildTickJob());
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('treats never-sent reports as due and enqueues one job per row', async () => {
    prisma = buildPrisma([
      {
        id: 'sched-1',
        tenant_id: TENANT_A,
        schedule_cron: '0 8 * * *', // daily 08:00 — prev() at 12:01 is today 08:00
        last_sent_at: null,
      },
      {
        id: 'sched-2',
        tenant_id: TENANT_B,
        schedule_cron: '0 8 * * *',
        last_sent_at: null,
      },
    ]);
    processor = new ScheduledReportsTickProcessor(prisma, queue as unknown as Queue);
    await processor.process(buildTickJob());

    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith(
      'reports:scheduled-deliver',
      expect.objectContaining({ tenant_id: TENANT_A, scheduled_report_id: 'sched-1' }),
      expect.any(Object),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'reports:scheduled-deliver',
      expect.objectContaining({ tenant_id: TENANT_B, scheduled_report_id: 'sched-2' }),
      expect.any(Object),
    );
  });

  it('skips reports whose last_sent_at is past the most recent fire time', async () => {
    prisma = buildPrisma([
      {
        id: 'sched-1',
        tenant_id: TENANT_A,
        schedule_cron: '0 8 * * *', // prev() at 12:01 = 2026-04-25 08:00
        last_sent_at: new Date('2026-04-25T08:00:30Z'), // already ran at 08:00:30 — not due
      },
    ]);
    processor = new ScheduledReportsTickProcessor(prisma, queue as unknown as Queue);
    await processor.process(buildTickJob());
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('triggers reports whose last_sent_at is older than the most recent fire time', async () => {
    prisma = buildPrisma([
      {
        id: 'sched-1',
        tenant_id: TENANT_A,
        schedule_cron: '0 8 * * *', // prev() at 12:01 = 2026-04-25 08:00
        last_sent_at: new Date('2026-04-24T08:00:30Z'), // ran yesterday — due today
      },
    ]);
    processor = new ScheduledReportsTickProcessor(prisma, queue as unknown as Queue);
    await processor.process(buildTickJob());
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('refuses to fire reports whose lookback exceeds the 24h ceiling', async () => {
    prisma = buildPrisma([
      {
        id: 'sched-1',
        tenant_id: TENANT_A,
        schedule_cron: '0 8 1 * *', // monthly on the 1st at 08:00 — prev() = 2026-04-01 08:00
        last_sent_at: null,
      },
    ]);
    processor = new ScheduledReportsTickProcessor(prisma, queue as unknown as Queue);
    await processor.process(buildTickJob());
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('logs a warning and skips reports with invalid cron expressions', async () => {
    prisma = buildPrisma([
      {
        id: 'sched-1',
        tenant_id: TENANT_A,
        schedule_cron: 'not-a-cron-expression',
        last_sent_at: null,
      },
    ]);
    processor = new ScheduledReportsTickProcessor(prisma, queue as unknown as Queue);
    const warnSpy = jest.spyOn(processor['logger'], 'warn').mockImplementation();
    await processor.process(buildTickJob());
    expect(queue.add).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid cron expression'),
    );
    warnSpy.mockRestore();
  });

  it('continues iterating when one enqueue fails', async () => {
    prisma = buildPrisma([
      {
        id: 'sched-1',
        tenant_id: TENANT_A,
        schedule_cron: '0 8 * * *',
        last_sent_at: null,
      },
      {
        id: 'sched-2',
        tenant_id: TENANT_B,
        schedule_cron: '0 8 * * *',
        last_sent_at: null,
      },
    ]);
    queue.add
      .mockRejectedValueOnce(new Error('Redis temporarily unreachable'))
      .mockResolvedValueOnce({ id: 'job-2' } as unknown as Awaited<ReturnType<Queue['add']>>);
    processor = new ScheduledReportsTickProcessor(prisma, queue as unknown as Queue);
    const errSpy = jest.spyOn(processor['logger'], 'error').mockImplementation();
    await processor.process(buildTickJob());

    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('sched-1'),
    );
    errSpy.mockRestore();
  });
});
