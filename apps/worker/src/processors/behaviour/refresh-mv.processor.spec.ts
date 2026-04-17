import { Job } from 'bullmq';

import {
  REFRESH_MV_BENCHMARKS_JOB,
  REFRESH_MV_EXPOSURE_RATES_JOB,
  REFRESH_MV_STUDENT_SUMMARY_JOB,
  RefreshMVProcessor,
} from './refresh-mv.processor';

function buildJob(name: string): Job {
  return {
    data: {},
    name,
  } as Job;
}

function extractSqlText(callArg: unknown): string {
  if (
    typeof callArg === 'object' &&
    callArg !== null &&
    'strings' in callArg &&
    Array.isArray((callArg as { strings: unknown }).strings)
  ) {
    return (callArg as { strings: string[] }).strings.join('');
  }

  return String(callArg);
}

describe('RefreshMVProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const prisma = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    const processor = new RefreshMVProcessor(prisma as never);

    await processor.process(buildJob('behaviour:other-job'));

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it.each([
    [REFRESH_MV_STUDENT_SUMMARY_JOB, 'refresh_mv_student_behaviour_summary'],
    [REFRESH_MV_BENCHMARKS_JOB, 'refresh_mv_behaviour_benchmarks'],
    [REFRESH_MV_EXPOSURE_RATES_JOB, 'refresh_mv_behaviour_exposure_rates'],
  ])('should refresh %s via SECURITY DEFINER function', async (jobName, expectedFunction) => {
    const prisma = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    const processor = new RefreshMVProcessor(prisma as never);

    await processor.process(buildJob(jobName));

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const sql = extractSqlText(prisma.$executeRaw.mock.calls[0][0]);
    expect(sql).toContain(`SELECT ${expectedFunction}()`);
  });
});
