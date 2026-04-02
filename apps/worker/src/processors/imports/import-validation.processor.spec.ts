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
const PARENT_ID = '44444444-4444-4444-4444-444444444444';
const STAFF_PROFILE_ID = '55555555-5555-5555-5555-555555555555';

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

  describe('job name filtering', () => {
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
  });

  describe('import job existence', () => {
    it('should throw error when import job not found', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue(null);
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await expect(processor.process(buildJob())).rejects.toThrow(
        `ImportJob ${IMPORT_JOB_ID} not found for tenant ${TENANT_ID}`,
      );
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
  });

  describe('import type validation', () => {
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
  });

  describe('S3 download handling', () => {
    it('should mark the import as failed when S3 download fails', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockRejectedValue(new Error('Access denied'));
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'failed',
          summary_json: { error: 'Failed to download file: Access denied' },
        },
      });
    });
  });

  describe('file parsing and header validation', () => {
    it('should mark the import as failed when file has no headers', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(Buffer.from(''));
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'failed',
          summary_json: { error: 'File is empty or has no recognisable headers.' },
        },
      });
    });

    it('should mark the import as failed when file has only whitespace', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(Buffer.from('   \n\n   '));
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'failed',
          summary_json: { error: 'File is empty or has no recognisable headers.' },
        },
      });
    });

    it('should report missing required headers', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(Buffer.from('first_name,gender\nJohn,male'));
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'failed',
          summary_json: expect.objectContaining({
            header_errors: expect.arrayContaining([
              expect.stringContaining('Missing required headers'),
            ]),
          }),
        },
      });
    });
  });

  describe('example row filtering', () => {
    it('should fail files that contain only example rows with template names', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from(
          'first_name,last_name,date_of_birth,gender\nAisha,Al-Mansour,2010-03-15,female',
        ),
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

    it('should fail files that contain only example rows with Omar Al-Mansour', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('first_name,last_name,date_of_birth,gender\nOmar,Al-Mansour,2012-07-20,male'),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'failed',
          summary_json: expect.objectContaining({
            error: 'File contains only example/template rows. Please replace them with real data.',
          }),
        },
      });
    });

    it('should fail files that contain only example rows with Ahmed Al-Farsi', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('first_name,last_name,date_of_birth,gender\nAhmed,Al-Farsi,2011-11-05,male'),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'failed',
          summary_json: expect.objectContaining({
            error: 'File contains only example/template rows. Please replace them with real data.',
          }),
        },
      });
    });

    it('should fail files containing only rows with hint patterns', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      // Must use a first_name that is in EXAMPLE_FIRST_NAMES set to trigger hint pattern check
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from(
          'first_name,last_name,date_of_birth,gender\nSarah,(e.g. sample),2010-01-01,female',
        ),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'failed',
          summary_json: expect.objectContaining({
            error: expect.stringContaining('example'),
          }),
        },
      });
    });

    it('should fail when file has headers but no data rows', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('first_name,last_name,date_of_birth,gender'),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'failed',
          summary_json: expect.objectContaining({
            error: 'File has headers but no data rows.',
          }),
        },
      });
    });
  });

  describe('CSV parsing edge cases', () => {
    it('should handle CSV with quoted fields containing commas', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockTx.student.findFirst.mockResolvedValue(null);
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('first_name,last_name,date_of_birth,gender\n"John, Jr.",Doe,2010-03-15,male'),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'validated',
          summary_json: expect.objectContaining({
            total_rows: 1,
            valid_rows: 1,
          }),
        },
      });
    });

    it('should handle CSV with escaped quotes', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockTx.student.findFirst.mockResolvedValue(null);
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from(
          'first_name,last_name,date_of_birth,gender\n"John ""Johnny""",Doe,2010-03-15,male',
        ),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'validated',
          summary_json: expect.objectContaining({
            total_rows: 1,
            valid_rows: 1,
          }),
        },
      });
    });

    it('should handle CSV with trailing spaces in headers', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockTx.student.findFirst.mockResolvedValue(null);
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('first_name , last_name *,date_of_birth,gender\nJohn,Doe,2010-03-15,male'),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'validated',
          summary_json: expect.objectContaining({
            total_rows: 1,
            valid_rows: 1,
          }),
        },
      });
    });

    it('should handle CSV with empty lines between data rows', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockTx.student.findFirst.mockResolvedValue(null);
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from(
          'first_name,last_name,date_of_birth,gender\nJohn,Doe,2010-03-15,male\n\n\nJane,Doe,2011-04-20,female',
        ),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'validated',
          summary_json: expect.objectContaining({
            total_rows: 2,
            valid_rows: 2,
          }),
        },
      });
    });
  });

  describe('students import validation', () => {
    it('should validate rows and mark as validated when all rows are valid', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockTx.student.findFirst.mockResolvedValue(null);
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'validated',
          summary_json: expect.objectContaining({
            total_rows: 1,
            valid_rows: 1,
            invalid_rows: 0,
          }),
        },
      });
    });

    it('should fail rows with missing required first_name', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('first_name,last_name,date_of_birth,gender\n,Doe,2010-03-15,male'),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'failed',
          summary_json: expect.objectContaining({
            row_errors: expect.arrayContaining([
              expect.objectContaining({
                row: 2,
                errors: expect.arrayContaining([expect.stringContaining('first_name')]),
              }),
            ]),
          }),
        },
      });
    });

    it('should fail rows with missing required last_name', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('first_name,last_name,date_of_birth,gender\nJohn,,2010-03-15,male'),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'failed',
          summary_json: expect.objectContaining({
            row_errors: expect.arrayContaining([
              expect.objectContaining({
                errors: expect.arrayContaining([expect.stringContaining('last_name')]),
              }),
            ]),
          }),
        },
      });
    });

    it('should fail rows with missing required date_of_birth', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('first_name,last_name,date_of_birth,gender\nJohn,Doe,,male'),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'failed',
          summary_json: expect.objectContaining({
            row_errors: expect.arrayContaining([
              expect.objectContaining({
                errors: expect.arrayContaining([expect.stringContaining('date_of_birth')]),
              }),
            ]),
          }),
        },
      });
    });

    it('should fail rows with invalid date_of_birth format', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('first_name,last_name,date_of_birth,gender\nJohn,Doe,15-03-2010,male'),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'failed',
          summary_json: expect.objectContaining({
            row_errors: expect.arrayContaining([
              expect.objectContaining({
                errors: expect.arrayContaining([expect.stringContaining('date_of_birth')]),
              }),
            ]),
          }),
        },
      });
    });

    it('should validate rows and record duplicate matches', async () => {
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

    it('should handle duplicate detection when first_name is missing', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('first_name,last_name,date_of_birth,gender\n,Doe,2010-03-15,male'),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.student.findFirst).not.toHaveBeenCalled();
    });

    it('should handle duplicate detection when last_name is missing', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('first_name,last_name,date_of_birth,gender\nJohn,,2010-03-15,male'),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.student.findFirst).not.toHaveBeenCalled();
    });

    it('should continue validation if duplicate detection throws an error', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockTx.student.findFirst.mockRejectedValue(new Error('DB error'));
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'validated',
          summary_json: expect.objectContaining({
            duplicate_count: 0,
            valid_rows: 1,
          }),
        },
      });
    });
  });

  describe('parents import validation', () => {
    it('should validate correct parents import', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/parents.csv',
        id: IMPORT_JOB_ID,
        import_type: 'parents',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from(
          'first_name,last_name,email,phone,relationship_label\nAlice,Johnson,alice@example.com,+1234567890,mother',
        ),
      );
      mockTx.parent.findFirst.mockResolvedValue(null);
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'validated',
          summary_json: expect.objectContaining({
            total_rows: 1,
            valid_rows: 1,
          }),
        },
      });
    });

    it('should fail parents rows with invalid email format', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/parents.csv',
        id: IMPORT_JOB_ID,
        import_type: 'parents',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from(
          'first_name,last_name,email,phone,relationship_label\nAlice,Johnson,invalid-email,+1234567890,mother',
        ),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'failed',
          summary_json: expect.objectContaining({
            row_errors: expect.arrayContaining([
              expect.objectContaining({
                errors: expect.arrayContaining([expect.stringContaining('email')]),
              }),
            ]),
          }),
        },
      });
    });

    it('should detect duplicate parents by email', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/parents.csv',
        id: IMPORT_JOB_ID,
        import_type: 'parents',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from(
          'first_name,last_name,email,phone,relationship_label\nAlice,Johnson,alice@example.com,+1234567890,mother',
        ),
      );
      mockTx.parent.findFirst.mockResolvedValue({ id: PARENT_ID });
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.parent.findFirst).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, email: 'alice@example.com' },
        select: { id: true },
      });
      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'validated',
          summary_json: expect.objectContaining({
            duplicate_count: 1,
            duplicates: [{ row: 2, match: 'Parent with email "alice@example.com" already exists' }],
          }),
        },
      });
    });

    it('should skip duplicate check for empty email', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/parents.csv',
        id: IMPORT_JOB_ID,
        import_type: 'parents',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from(
          'first_name,last_name,email,phone,relationship_label\nAlice,Johnson,,+1234567890,mother',
        ),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.parent.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('staff import validation', () => {
    it('should validate correct staff import', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/staff.csv',
        id: IMPORT_JOB_ID,
        import_type: 'staff',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from(
          'first_name,last_name,email,job_title,department\nJane,Smith,jane@school.com,Teacher,Math',
        ),
      );
      mockTx.staffProfile.findFirst.mockResolvedValue(null);
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'validated',
          summary_json: expect.objectContaining({
            total_rows: 1,
            valid_rows: 1,
          }),
        },
      });
    });

    it('should fail staff rows with invalid email format', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/staff.csv',
        id: IMPORT_JOB_ID,
        import_type: 'staff',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from(
          'first_name,last_name,email,job_title,department\nJane,Smith,bad-email,Teacher,Math',
        ),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'failed',
          summary_json: expect.objectContaining({
            row_errors: expect.arrayContaining([
              expect.objectContaining({
                errors: expect.arrayContaining([expect.stringContaining('email')]),
              }),
            ]),
          }),
        },
      });
    });

    it('should detect duplicate staff by email', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/staff.csv',
        id: IMPORT_JOB_ID,
        import_type: 'staff',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from(
          'first_name,last_name,email,job_title,department\nJane,Smith,jane@school.com,Teacher,Math',
        ),
      );
      mockTx.staffProfile.findFirst.mockResolvedValue({ id: STAFF_PROFILE_ID });
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.staffProfile.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          user: { email: 'jane@school.com' },
        },
        select: { id: true },
      });
      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'validated',
          summary_json: expect.objectContaining({
            duplicate_count: 1,
            duplicates: [{ row: 2, match: 'Staff with email "jane@school.com" already exists' }],
          }),
        },
      });
    });

    it('should skip duplicate check for empty email', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/staff.csv',
        id: IMPORT_JOB_ID,
        import_type: 'staff',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('first_name,last_name,email,job_title,department\nJane,Smith,,Teacher,Math'),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.staffProfile.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('fees import validation', () => {
    it('should validate correct fees import', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/fees.csv',
        id: IMPORT_JOB_ID,
        import_type: 'fees',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('fee_name,amount,currency_code,academic_year\nTuition,5000,USD,2024'),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'validated',
          summary_json: expect.objectContaining({
            total_rows: 1,
            valid_rows: 1,
          }),
        },
      });
    });

    it('should fail fees rows with missing required fee_name', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/fees.csv',
        id: IMPORT_JOB_ID,
        import_type: 'fees',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('fee_name,amount,currency_code,academic_year\n,5000,USD,2024'),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'failed',
          summary_json: expect.objectContaining({
            row_errors: expect.arrayContaining([
              expect.objectContaining({
                errors: expect.arrayContaining([expect.stringContaining('fee_name')]),
              }),
            ]),
          }),
        },
      });
    });

    it('should fail fees rows with missing required amount', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/fees.csv',
        id: IMPORT_JOB_ID,
        import_type: 'fees',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('fee_name,amount,currency_code,academic_year\nTuition,,USD,2024'),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'failed',
          summary_json: expect.objectContaining({
            row_errors: expect.arrayContaining([
              expect.objectContaining({
                errors: expect.arrayContaining([expect.stringContaining('amount')]),
              }),
            ]),
          }),
        },
      });
    });
  });

  describe('exam_results import validation', () => {
    it('should validate correct exam_results import', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/exam_results.csv',
        id: IMPORT_JOB_ID,
        import_type: 'exam_results',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('student_number,subject,score,max_score\nSTU001,Math,95,100'),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'validated',
          summary_json: expect.objectContaining({
            total_rows: 1,
            valid_rows: 1,
          }),
        },
      });
    });

    it('should fail exam_results rows with missing required fields', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/exam_results.csv',
        id: IMPORT_JOB_ID,
        import_type: 'exam_results',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('student_number,subject,score,max_score\nSTU001,,95,100'),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'failed',
          summary_json: expect.objectContaining({
            row_errors: expect.arrayContaining([
              expect.objectContaining({
                errors: expect.arrayContaining([expect.stringContaining('subject')]),
              }),
            ]),
          }),
        },
      });
    });
  });

  describe('staff_compensation import validation', () => {
    it('should validate correct staff_compensation import', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/staff_compensation.csv',
        id: IMPORT_JOB_ID,
        import_type: 'staff_compensation',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('staff_number,compensation_type,base_salary\nSTF001,salaried,50000'),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'validated',
          summary_json: expect.objectContaining({
            total_rows: 1,
            valid_rows: 1,
          }),
        },
      });
    });

    it('should fail staff_compensation rows with missing required fields', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/staff_compensation.csv',
        id: IMPORT_JOB_ID,
        import_type: 'staff_compensation',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('staff_number,compensation_type,base_salary\n,salaried,50000'),
      );
      const processor = new ImportValidationProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'failed',
          summary_json: expect.objectContaining({
            row_errors: expect.arrayContaining([
              expect.objectContaining({
                errors: expect.arrayContaining([expect.stringContaining('staff_number')]),
              }),
            ]),
          }),
        },
      });
    });
  });
});
