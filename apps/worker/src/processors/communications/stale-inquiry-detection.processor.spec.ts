import { Job } from 'bullmq';

import {
  STALE_INQUIRY_DETECTION_JOB,
  StaleInquiryDetectionProcessor,
} from './stale-inquiry-detection.processor';

const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';

function buildMockPrisma() {
  return {
    parentInquiry: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    tenant: {
      findMany: jest.fn().mockResolvedValue([{ id: TENANT_A_ID }]),
    },
    tenantSetting: {
      findUnique: jest.fn().mockResolvedValue({ settings: {} }),
    },
  };
}

function buildJob(name: string = STALE_INQUIRY_DETECTION_JOB): Job {
  return { data: {}, name } as unknown as Job;
}

describe('StaleInquiryDetectionProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockPrisma = buildMockPrisma();
    const processor = new StaleInquiryDetectionProcessor(mockPrisma as never);

    await processor.process(buildJob('communications:other-job'));

    expect(mockPrisma.tenant.findMany).not.toHaveBeenCalled();
  });

  it('should use the tenant-specific stale threshold when counting stale inquiries', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T12:00:00.000Z'));

    try {
      const mockPrisma = buildMockPrisma();
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        settings: { inquiryStaleHours: 24 },
      });
      mockPrisma.parentInquiry.findMany.mockResolvedValue([{ id: 'stale-1' }]);
      const processor = new StaleInquiryDetectionProcessor(mockPrisma as never);

      await processor.process(buildJob());

      expect(mockPrisma.parentInquiry.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_A_ID,
          status: { in: ['open', 'in_progress'] },
          messages: {
            none: {
              created_at: { gt: new Date('2026-03-31T12:00:00.000Z') },
            },
          },
        },
        select: { id: true },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('should iterate all active tenants', async () => {
    const mockPrisma = buildMockPrisma();
    mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A_ID }, { id: TENANT_B_ID }]);
    const processor = new StaleInquiryDetectionProcessor(mockPrisma as never);

    await processor.process(buildJob());

    expect(mockPrisma.parentInquiry.findMany).toHaveBeenCalledTimes(2);
  });
});
