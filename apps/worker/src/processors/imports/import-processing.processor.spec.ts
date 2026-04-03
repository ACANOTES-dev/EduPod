/* eslint-disable import/order -- jest.mock must precede mocked imports */
jest.mock('../../base/s3.helpers', () => ({
  deleteFromS3: jest.fn(),
  downloadBufferFromS3: jest.fn(),
}));

import { Job } from 'bullmq';

import { deleteFromS3, downloadBufferFromS3 } from '../../base/s3.helpers';

import {
  IMPORT_PROCESSING_JOB,
  type ImportProcessingPayload,
  ImportProcessingProcessor,
} from './import-processing.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const IMPORT_JOB_ID = '22222222-2222-2222-2222-222222222222';
const HOUSEHOLD_ID = '33333333-3333-3333-3333-333333333333';
const STUDENT_ID = '44444444-4444-4444-4444-444444444444';
const PARENT_ID = '55555555-5555-5555-5555-555555555555';

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    household: {
      create: jest.fn().mockResolvedValue({ id: HOUSEHOLD_ID }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    importJob: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ id: IMPORT_JOB_ID }),
    },
    parent: {
      create: jest.fn().mockResolvedValue({ id: PARENT_ID }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    student: {
      create: jest.fn().mockResolvedValue({ id: STUDENT_ID }),
    },
  };
}

type MockTx = ReturnType<typeof buildMockTx>;

function buildMockPrisma(mockTx: MockTx, topLevelOverrides: Record<string, unknown> = {}) {
  return {
    $transaction: jest.fn(async (callback: (tx: MockTx) => Promise<unknown>) => callback(mockTx)),
    importJob: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    ...topLevelOverrides,
  };
}

function buildJob(
  name: string = IMPORT_PROCESSING_JOB,
  data: Partial<ImportProcessingPayload> = {},
): Job<ImportProcessingPayload> {
  return {
    data: {
      import_job_id: IMPORT_JOB_ID,
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<ImportProcessingPayload>;
}

describe('ImportProcessingProcessor', () => {
  const mockDeleteFromS3 = jest.mocked(deleteFromS3);
  const mockDownloadBufferFromS3 = jest.mocked(downloadBufferFromS3);

  beforeEach(() => {
    mockDeleteFromS3.mockResolvedValue(undefined);
    mockDownloadBufferFromS3.mockResolvedValue(
      Buffer.from('first_name,last_name,date_of_birth,gender\nAmina,OBrien,2010-03-15,female'),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob('imports:other-job'));

    expect(mockTx.importJob.findFirst).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const mockTx = buildMockTx();
    const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

    await expect(
      processor.process(buildJob(IMPORT_PROCESSING_JOB, { tenant_id: '' })),
    ).rejects.toThrow('Job rejected: missing tenant_id in payload.');
  });

  it('should fail the import when no file_key exists', async () => {
    const mockTx = buildMockTx();
    mockTx.importJob.findFirst.mockResolvedValue({
      file_key: null,
      id: IMPORT_JOB_ID,
      import_type: 'students',
    });
    // Top-level prisma.importJob.findFirst returns null file_key so processor takes the null-buffer path
    const mockPrisma = buildMockPrisma(mockTx);
    mockPrisma.importJob.findFirst.mockResolvedValue({ file_key: null });
    const processor = new ImportProcessingProcessor(mockPrisma as never);

    await processor.process(buildJob());

    expect(mockTx.importJob.update).toHaveBeenCalledWith({
      where: { id: IMPORT_JOB_ID },
      data: {
        status: 'failed',
        summary_json: { error: 'No file_key associated with this import job.' },
      },
    });
  });

  it('should process student rows, create a household, and delete the S3 file afterwards', async () => {
    const mockTx = buildMockTx();
    mockTx.importJob.findFirst.mockResolvedValue({
      file_key: 'imports/students.csv',
      id: IMPORT_JOB_ID,
      import_type: 'students',
    });
    // Top-level prisma.importJob.findFirst must return file_key for the pre-download
    const mockPrisma = buildMockPrisma(mockTx);
    mockPrisma.importJob.findFirst.mockResolvedValue({ file_key: 'imports/students.csv' });
    const processor = new ImportProcessingProcessor(mockPrisma as never);

    await processor.process(buildJob());

    expect(mockTx.household.create).toHaveBeenCalledWith({
      data: {
        tenant_id: TENANT_ID,
        household_name: 'OBrien Family',
        status: 'active',
      },
    });
    expect(mockTx.student.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        date_of_birth: new Date('2010-03-15'),
        first_name: 'Amina',
        full_name: 'Amina OBrien',
        gender: 'female',
        household_id: HOUSEHOLD_ID,
        last_name: 'OBrien',
        status: 'active',
        tenant_id: TENANT_ID,
      }),
    });
    expect(mockTx.importJob.update).toHaveBeenLastCalledWith({
      where: { id: IMPORT_JOB_ID },
      data: {
        status: 'completed',
        summary_json: {
          total_rows: 1,
          success_count: 1,
          failure_count: 0,
          row_errors: [],
        },
      },
    });
    expect(mockDeleteFromS3).toHaveBeenCalledWith('imports/students.csv');
  });

  it('should record row failures and mark the import failed when every row errors', async () => {
    const mockTx = buildMockTx();
    mockTx.importJob.findFirst.mockResolvedValue({
      file_key: 'imports/parents.csv',
      id: IMPORT_JOB_ID,
      import_type: 'parents',
    });
    mockDownloadBufferFromS3.mockResolvedValue(
      Buffer.from(
        'first_name,last_name,email,phone,relationship_label\nAmina,OBrien,parent@example.com,,mother',
      ),
    );
    mockTx.parent.findFirst.mockResolvedValue({ id: PARENT_ID });
    const mockPrisma = buildMockPrisma(mockTx);
    mockPrisma.importJob.findFirst.mockResolvedValue({ file_key: 'imports/parents.csv' });
    const processor = new ImportProcessingProcessor(mockPrisma as never);

    await processor.process(buildJob());

    expect(mockTx.parent.create).not.toHaveBeenCalled();
    expect(mockTx.importJob.update).toHaveBeenLastCalledWith({
      where: { id: IMPORT_JOB_ID },
      data: {
        status: 'failed',
        summary_json: {
          total_rows: 1,
          success_count: 0,
          failure_count: 1,
          row_errors: [
            {
              row: 2,
              error: 'Parent with email "parent@example.com" already exists',
            },
          ],
        },
      },
    });
    expect(mockDeleteFromS3).toHaveBeenCalledWith('imports/parents.csv');
  });

  it('should fail the import when the S3 download fails', async () => {
    const mockTx = buildMockTx();
    mockTx.importJob.findFirst.mockResolvedValue({
      file_key: 'imports/students.csv',
      id: IMPORT_JOB_ID,
      import_type: 'students',
    });
    mockDownloadBufferFromS3.mockRejectedValue(new Error('network down'));
    // Top-level prisma returns file_key so the processor attempts the S3 download
    const mockPrisma = buildMockPrisma(mockTx);
    mockPrisma.importJob.findFirst.mockResolvedValue({ file_key: 'imports/students.csv' });
    const processor = new ImportProcessingProcessor(mockPrisma as never);

    await processor.process(buildJob());

    // S3 download fails outside the transaction; processJob sees a null buffer
    expect(mockTx.importJob.update).toHaveBeenLastCalledWith({
      where: { id: IMPORT_JOB_ID },
      data: {
        status: 'failed',
        summary_json: { error: 'Failed to download file from storage.' },
      },
    });
  });
});
