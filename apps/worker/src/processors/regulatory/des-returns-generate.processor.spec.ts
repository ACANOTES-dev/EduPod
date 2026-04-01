import { Job } from 'bullmq';

import {
  type DesGeneratePayload,
  REGULATORY_DES_GENERATE_JOB,
  RegulatoryDesGenerateProcessor,
} from './des-returns-generate.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const SUBMISSION_ID = '22222222-2222-2222-2222-222222222222';

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    regulatorySubmission: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ id: SUBMISSION_ID }),
    },
  };
}

type MockTx = ReturnType<typeof buildMockTx>;

function buildMockPrisma(mockTx: MockTx) {
  return {
    $transaction: jest.fn(async (callback: (tx: MockTx) => Promise<unknown>) => callback(mockTx)),
  };
}

function buildJob(
  name: string = REGULATORY_DES_GENERATE_JOB,
  data: Partial<DesGeneratePayload> = {},
): Job<DesGeneratePayload> {
  return {
    data: {
      academic_year: '2025-2026',
      file_type: 'file_e',
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<DesGeneratePayload>;
}

describe('RegulatoryDesGenerateProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const processor = new RegulatoryDesGenerateProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob('regulatory:other-job'));

    expect(mockTx.regulatorySubmission.findFirst).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const mockTx = buildMockTx();
    const processor = new RegulatoryDesGenerateProcessor(buildMockPrisma(mockTx) as never);

    await expect(
      processor.process(buildJob(REGULATORY_DES_GENERATE_JOB, { tenant_id: '' })),
    ).rejects.toThrow('Job rejected: missing tenant_id in payload.');
  });

  it('should mark the latest matching submission as in progress', async () => {
    const mockTx = buildMockTx();
    mockTx.regulatorySubmission.findFirst.mockResolvedValue({ id: SUBMISSION_ID });
    const processor = new RegulatoryDesGenerateProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.regulatorySubmission.findFirst).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        domain: 'des_september_returns',
        submission_type: 'file_e',
        academic_year: '2025-2026',
        status: { in: ['reg_not_started', 'reg_in_progress'] },
      },
      orderBy: { created_at: 'desc' },
    });
    expect(mockTx.regulatorySubmission.update).toHaveBeenCalledWith({
      where: { id: SUBMISSION_ID },
      data: { status: 'reg_in_progress' },
    });
  });

  it('should skip the status update when no matching submission exists', async () => {
    const mockTx = buildMockTx();
    const processor = new RegulatoryDesGenerateProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.regulatorySubmission.update).not.toHaveBeenCalled();
  });
});
