/* eslint-disable import/order -- jest.mock must precede mocked imports */
jest.mock('../../base/s3.helpers', () => ({
  deleteFromS3: jest.fn(),
}));

import { Job } from 'bullmq';

import { deleteFromS3 } from '../../base/s3.helpers';

import {
  IMPORT_FILE_CLEANUP_JOB,
  ImportFileCleanupProcessor,
} from './import-file-cleanup.processor';

const JOB_A_ID = '11111111-1111-1111-1111-111111111111';
const JOB_B_ID = '22222222-2222-2222-2222-222222222222';

function buildMockPrisma() {
  return {
    importJob: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

function buildJob(name: string = IMPORT_FILE_CLEANUP_JOB): Job {
  return { data: {}, name } as unknown as Job;
}

describe('ImportFileCleanupProcessor', () => {
  const mockDeleteFromS3 = jest.mocked(deleteFromS3);

  beforeEach(() => {
    mockDeleteFromS3.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockPrisma = buildMockPrisma();
    const processor = new ImportFileCleanupProcessor(mockPrisma as never);

    await processor.process(buildJob('imports:other-job'));

    expect(mockPrisma.importJob.findMany).not.toHaveBeenCalled();
  });

  it('should delete stale S3 files and clear file keys', async () => {
    const mockPrisma = buildMockPrisma();
    mockPrisma.importJob.findMany.mockResolvedValue([
      {
        file_key: 'imports/job-a.csv',
        id: JOB_A_ID,
        status: 'completed',
        tenant_id: 'tenant-a',
      },
    ]);
    const processor = new ImportFileCleanupProcessor(mockPrisma as never);

    await processor.process(buildJob());

    expect(mockDeleteFromS3).toHaveBeenCalledWith('imports/job-a.csv');
    expect(mockPrisma.importJob.update).toHaveBeenCalledWith({
      where: { id: JOB_A_ID },
      data: { file_key: null },
    });
  });

  it('should still clear file keys when S3 deletion fails', async () => {
    const mockPrisma = buildMockPrisma();
    mockPrisma.importJob.findMany.mockResolvedValue([
      {
        file_key: 'imports/job-b.csv',
        id: JOB_B_ID,
        status: 'failed',
        tenant_id: 'tenant-b',
      },
    ]);
    mockDeleteFromS3.mockRejectedValue(new Error('s3 unavailable'));
    const processor = new ImportFileCleanupProcessor(mockPrisma as never);

    await processor.process(buildJob());

    expect(mockPrisma.importJob.update).toHaveBeenCalledWith({
      where: { id: JOB_B_ID },
      data: { file_key: null },
    });
  });
});
