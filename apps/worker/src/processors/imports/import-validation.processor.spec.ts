/* eslint-disable import/order -- jest.mock must precede mocked imports */
jest.mock('../../base/s3.helpers', () => ({
  downloadBufferFromS3: jest.fn(),
}));

import { Job } from 'bullmq';

import { downloadBufferFromS3 } from '../../base/s3.helpers';

import {
  IMPORT_VALIDATION_JOB,
  type ImportValidationPayload,
  ImportValidationProcessor,
} from './import-validation.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const IMPORT_JOB_ID = '22222222-2222-2222-2222-222222222222';
const STUDENT_ID = '33333333-3333-3333-3333-333333333333';

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    importJob: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ id: IMPORT_JOB_ID }),
    },
    parent: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    staffProfile: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    student: {
      findFirst: jest.fn().mockResolvedValue(null),
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
  name: string = IMPORT_VALIDATION_JOB,
  data: Partial<ImportValidationPayload> = {},
): Job<ImportValidationPayload> {
  return {
    data: {
      import_job_id: IMPORT_JOB_ID,
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<ImportValidationPayload>;
}

describe('ImportValidationProcessor', () => {
  const mockDownloadBufferFromS3 = jest.mocked(downloadBufferFromS3);

  beforeEach(() => {
    mockDownloadBufferFromS3.mockResolvedValue(
      Buffer.from('first_name,last_name,date_of_birth,gender\nAmina,OBrien,2010-03-15,female'),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob('imports:other-job'));

    expect(mockTx.importJob.findFirst).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const mockTx = buildMockTx();
    const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

    await expect(
      processor.process(buildJob(IMPORT_VALIDATION_JOB, { tenant_id: '' })),
    ).rejects.toThrow('Job rejected: missing tenant_id in payload.');
  });

  it('should mark the import as failed when no file_key exists', async () => {
    const mockTx = buildMockTx();
    mockTx.importJob.findFirst.mockResolvedValue({
      file_key: null,
      id: IMPORT_JOB_ID,
      import_type: 'students',
    });
    const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.importJob.update).toHaveBeenCalledWith({
      where: { id: IMPORT_JOB_ID },
      data: {
        status: 'failed',
        summary_json: { error: 'No file_key associated with this import job.' },
      },
    });
    expect(mockDownloadBufferFromS3).not.toHaveBeenCalled();
  });

  it('should mark the import as failed when the import type is unsupported', async () => {
    const mockTx = buildMockTx();
    mockTx.importJob.findFirst.mockResolvedValue({
      file_key: 'imports/job.csv',
      id: IMPORT_JOB_ID,
      import_type: 'unknown-type',
    });
    const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.importJob.update).toHaveBeenCalledWith({
      where: { id: IMPORT_JOB_ID },
      data: {
        status: 'failed',
        summary_json: { error: 'Unsupported import type: unknown-type' },
      },
    });
  });

  it('should fail files that contain only example rows', async () => {
    const mockTx = buildMockTx();
    mockTx.importJob.findFirst.mockResolvedValue({
      file_key: 'imports/students.csv',
      id: IMPORT_JOB_ID,
      import_type: 'students',
    });
    mockDownloadBufferFromS3.mockResolvedValue(
      Buffer.from('first_name,last_name,date_of_birth,gender\nAisha,Al-Mansour,2010-03-15,female'),
    );
    const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.importJob.update).toHaveBeenCalledWith({
      where: { id: IMPORT_JOB_ID },
      data: {
        status: 'failed',
        summary_json: expect.objectContaining({
          error: 'File contains only example/template rows. Please replace them with real data.',
          invalid_rows: 0,
          total_rows: 0,
          valid_rows: 0,
        }),
      },
    });
  });

  it('should validate rows and record duplicate matches in the summary', async () => {
    const mockTx = buildMockTx();
    mockTx.importJob.findFirst.mockResolvedValue({
      file_key: 'imports/students.csv',
      id: IMPORT_JOB_ID,
      import_type: 'students',
    });
    mockTx.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
    const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.student.findFirst).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        first_name: 'Amina',
        last_name: 'OBrien',
      },
      select: { id: true },
    });
    expect(mockTx.importJob.update).toHaveBeenCalledWith({
      where: { id: IMPORT_JOB_ID },
      data: {
        status: 'validated',
        summary_json: expect.objectContaining({
          duplicate_count: 1,
          duplicates: [{ row: 2, match: 'Student "Amina OBrien" already exists' }],
          invalid_rows: 0,
          total_rows: 1,
          valid_rows: 1,
        }),
      },
    });
  });
});
