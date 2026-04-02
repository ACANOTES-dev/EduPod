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

function buildMockPrisma(mockTx: MockTx) {
  return {
    $transaction: jest.fn(async (callback: (tx: MockTx) => Promise<unknown>) => callback(mockTx)),
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

  describe('job name filtering', () => {
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
  });

  describe('import job existence', () => {
    it('should throw error when import job not found', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue(null);
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await expect(processor.process(buildJob())).rejects.toThrow(
        `ImportJob ${IMPORT_JOB_ID} not found for tenant ${TENANT_ID}`,
      );
    });

    it('should fail the import when no file_key exists', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: null,
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'failed',
          summary_json: { error: 'No file_key associated with this import job.' },
        },
      });
    });
  });

  describe('S3 download handling', () => {
    it('should fail the import when S3 download fails', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockRejectedValue(new Error('network down'));
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'failed',
          summary_json: { error: 'Failed to download file: network down' },
        },
      });
    });
  });

  describe('students import processing', () => {
    it('should process student rows, create a household, and delete the S3 file afterwards', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

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

    it('should use existing household when household_name is provided', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockTx.household.findFirst.mockResolvedValue({ id: HOUSEHOLD_ID });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from(
          'first_name,last_name,date_of_birth,gender,household_name\nAmina,OBrien,2010-03-15,female,Smith Family',
        ),
      );
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.household.findFirst).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, household_name: 'Smith Family' },
        select: { id: true },
      });
      expect(mockTx.household.create).not.toHaveBeenCalled();
      expect(mockTx.student.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          household_id: HOUSEHOLD_ID,
        }),
      });
    });

    it('should create new household when household_name is provided but not found', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from(
          'first_name,last_name,date_of_birth,gender,household_name\nAmina,OBrien,2010-03-15,female,New Family',
        ),
      );
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.household.findFirst).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, household_name: 'New Family' },
        select: { id: true },
      });
      expect(mockTx.household.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          household_name: 'New Family',
          status: 'active',
        },
      });
    });

    it('should handle students with Arabic names', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from(
          'first_name,last_name,date_of_birth,gender,first_name_ar,last_name_ar\nAmina,OBrien,2010-03-15,female,امينة,العبري',
        ),
      );
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.student.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          first_name: 'Amina',
          last_name: 'OBrien',
          first_name_ar: 'امينة',
          last_name_ar: 'العبري',
          full_name_ar: 'امينة العبري',
        }),
      });
    });

    it('should handle students without gender', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('first_name,last_name,date_of_birth,gender\nAmina,OBrien,2010-03-15,'),
      );
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.student.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          gender: null,
        }),
      });
    });

    it('should handle uppercase gender values', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('first_name,last_name,date_of_birth,gender\nAmina,OBrien,2010-03-15,FEMALE'),
      );
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.student.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          gender: 'female',
        }),
      });
    });

    it('should record row failure when required fields are missing', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('first_name,last_name,date_of_birth,gender\n,OBrien,2010-03-15,female'),
      );
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.student.create).not.toHaveBeenCalled();
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
                error: 'Missing required fields: first_name, last_name, or date_of_birth',
              },
            ],
          },
        },
      });
    });

    it('should process multiple student rows', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from(
          'first_name,last_name,date_of_birth,gender\nAmina,OBrien,2010-03-15,female\nJohn,Doe,2011-04-20,male',
        ),
      );
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.student.create).toHaveBeenCalledTimes(2);
      expect(mockTx.importJob.update).toHaveBeenLastCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'completed',
          summary_json: {
            total_rows: 2,
            success_count: 2,
            failure_count: 0,
            row_errors: [],
          },
        },
      });
    });

    it('should handle mixed success and failure rows', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from(
          'first_name,last_name,date_of_birth,gender\nAmina,OBrien,2010-03-15,female\n,Doe,2011-04-20,male',
        ),
      );
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.student.create).toHaveBeenCalledTimes(1);
      expect(mockTx.importJob.update).toHaveBeenLastCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'completed',
          summary_json: expect.objectContaining({
            total_rows: 2,
            success_count: 1,
            failure_count: 1,
          }),
        },
      });
    });
  });

  describe('parents import processing', () => {
    it('should process parent rows and delete the S3 file afterwards', async () => {
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
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.parent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          first_name: 'Alice',
          last_name: 'Johnson',
          email: 'alice@example.com',
          phone: '+1234567890',
          relationship_label: 'mother',
          preferred_contact_channels: ['email'],
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
      expect(mockDeleteFromS3).toHaveBeenCalledWith('imports/parents.csv');
    });

    it('should handle parents with optional fields', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/parents.csv',
        id: IMPORT_JOB_ID,
        import_type: 'parents',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from(
          'first_name,last_name,email,phone,relationship_label\nAlice,Johnson,alice@example.com,,',
        ),
      );
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.parent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          phone: null,
          relationship_label: null,
        }),
      });
    });

    it('should fail when parent with email already exists', async () => {
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
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

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
                error: 'Parent with email "alice@example.com" already exists',
              },
            ],
          },
        },
      });
    });

    it('should record row failure when required fields are missing', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/parents.csv',
        id: IMPORT_JOB_ID,
        import_type: 'parents',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from(
          'first_name,last_name,email,phone,relationship_label\n,Johnson,alice@example.com,+1234567890,mother',
        ),
      );
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

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
                error: 'Missing required fields: first_name, last_name, or email',
              },
            ],
          },
        },
      });
    });
  });

  describe('unsupported import types', () => {
    it('should fail when import type is not implemented', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/fees.csv',
        id: IMPORT_JOB_ID,
        import_type: 'fees',
      });
      mockDownloadBufferFromS3.mockResolvedValue(Buffer.from('fee_name,amount\nTuition,5000'));
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

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
                error: 'Import type "fees" processing not yet implemented',
              },
            ],
          },
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
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('first_name,last_name,date_of_birth,gender\n"John, Jr.",Doe,2010-03-15,male'),
      );
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.student.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          first_name: 'John, Jr.',
          last_name: 'Doe',
        }),
      });
    });

    it('should handle CSV with escaped quotes', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from(
          'first_name,last_name,date_of_birth,gender\n"John ""Johnny""",Doe,2010-03-15,male',
        ),
      );
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.student.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          first_name: 'John "Johnny"',
          last_name: 'Doe',
        }),
      });
    });

    it('should handle CSV with empty lines between data rows', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from(
          'first_name,last_name,date_of_birth,gender\nJohn,Doe,2010-03-15,male\n\n\nJane,Doe,2011-04-20,female',
        ),
      );
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.student.create).toHaveBeenCalledTimes(2);
      expect(mockTx.importJob.update).toHaveBeenLastCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: expect.objectContaining({
          summary_json: expect.objectContaining({
            total_rows: 2,
            success_count: 2,
          }),
        }),
      });
    });
  });

  describe('error handling and rollback', () => {
    it('should still delete S3 file when processing completes', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockDeleteFromS3).toHaveBeenCalledWith('imports/students.csv');
    });

    it('should handle errors when deleting S3 file gracefully', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDeleteFromS3.mockRejectedValue(new Error('S3 deletion failed'));
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      // Should still complete successfully even if S3 deletion fails
      expect(mockTx.importJob.update).toHaveBeenCalled();
    });

    it('should limit error reporting to first 50 rows', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      // Create CSV with 60 rows that will all fail
      const rows = Array(60).fill(',Doe,2010-03-15,male');
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from(`first_name,last_name,date_of_birth,gender\n${rows.join('\n')}`),
      );
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      const updateCall =
        mockTx.importJob.update.mock.calls[mockTx.importJob.update.mock.calls.length - 1][0];
      expect(updateCall.data.summary_json.row_errors.length).toBeLessThanOrEqual(50);
    });
  });

  describe('status transitions', () => {
    it('should mark status as processing during execution', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      // Check that processing status was set
      const updateCalls = mockTx.importJob.update.mock.calls;
      const processingCall = updateCalls.find((call) => call[0].data.status === 'processing');
      expect(processingCall).toBeDefined();
    });

    it('should mark status as failed when all rows fail', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('first_name,last_name,date_of_birth,gender\n,OBrien,2010-03-15,female'),
      );
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenLastCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'failed',
          summary_json: expect.objectContaining({
            success_count: 0,
            failure_count: 1,
          }),
        },
      });
    });

    it('should mark status as completed when some rows succeed', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from(
          'first_name,last_name,date_of_birth,gender\nAmina,OBrien,2010-03-15,female\n,Doe,2011-04-20,male',
        ),
      );
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.importJob.update).toHaveBeenLastCalledWith({
        where: { id: IMPORT_JOB_ID },
        data: {
          status: 'completed',
          summary_json: expect.objectContaining({
            success_count: 1,
            failure_count: 1,
          }),
        },
      });
    });
  });

  describe('field extraction edge cases', () => {
    it('should handle missing optional fields gracefully', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      // CSV with only required fields
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from('first_name,last_name,date_of_birth,gender\nAmina,OBrien,2010-03-15,'),
      );
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      expect(mockTx.student.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          first_name: 'Amina',
          last_name: 'OBrien',
          gender: null,
          first_name_ar: null,
          last_name_ar: null,
        }),
      });
    });

    it('should handle whitespace-only fields as empty', async () => {
      const mockTx = buildMockTx();
      mockTx.importJob.findFirst.mockResolvedValue({
        file_key: 'imports/students.csv',
        id: IMPORT_JOB_ID,
        import_type: 'students',
      });
      mockDownloadBufferFromS3.mockResolvedValue(
        Buffer.from(
          'first_name,last_name,date_of_birth,gender,household_name\nAmina,OBrien,2010-03-15,female,   ',
        ),
      );
      const processor = new ImportProcessingProcessor(buildMockPrisma(mockTx) as never);

      await processor.process(buildJob());

      // Should create default household since whitespace is treated as empty
      expect(mockTx.household.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          household_name: 'OBrien Family',
          status: 'active',
        },
      });
    });
  });
});
