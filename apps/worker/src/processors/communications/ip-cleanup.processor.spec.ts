import { Job } from 'bullmq';

import { IP_CLEANUP_JOB, IpCleanupProcessor } from './ip-cleanup.processor';

function buildMockPrisma() {
  return {
    contactFormSubmission: {
      updateMany: jest.fn().mockResolvedValue({ count: 5 }),
    },
  };
}

function buildJob(name: string = IP_CLEANUP_JOB): Job {
  return { data: {}, name } as unknown as Job;
}

describe('IpCleanupProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockPrisma = buildMockPrisma();
    const processor = new IpCleanupProcessor(mockPrisma as never);

    await processor.process(buildJob('communications:other-job'));

    expect(mockPrisma.contactFormSubmission.updateMany).not.toHaveBeenCalled();
  });

  it('should nullify source_ip for contact form submissions older than 90 days', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T12:00:00.000Z'));

    try {
      const mockPrisma = buildMockPrisma();
      const processor = new IpCleanupProcessor(mockPrisma as never);

      await processor.process(buildJob());

      expect(mockPrisma.contactFormSubmission.updateMany).toHaveBeenCalledWith({
        where: {
          source_ip: { not: null },
          created_at: { lt: new Date('2026-01-01T12:00:00.000Z') },
        },
        data: { source_ip: null },
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
