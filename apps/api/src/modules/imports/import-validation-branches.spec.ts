import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

import { ImportValidationService } from './import-validation.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const JOB_ID = 'job-1';

describe('ImportValidationService — branch coverage', () => {
  let service: ImportValidationService;
  let mockPrisma: {
    importJob: { findFirst: jest.Mock; update: jest.Mock };
  };
  let mockS3: { download: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      importJob: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    mockS3 = {
      download: jest.fn().mockResolvedValue(Buffer.from('')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportValidationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<ImportValidationService>(ImportValidationService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── validate — job not found ────────────────────────────────────────────

  describe('ImportValidationService — validate', () => {
    it('should return early when job not found', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(null);
      await service.validate(TENANT_ID, JOB_ID);
      expect(mockS3.download).not.toHaveBeenCalled();
    });

    it('should return early when job has no file_key', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: null,
        import_type: 'students',
      });
      await service.validate(TENANT_ID, JOB_ID);
      expect(mockS3.download).not.toHaveBeenCalled();
    });

    it('should fail validation when CSV has no headers', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'students',
      });
      mockS3.download.mockResolvedValue(Buffer.from(''));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'failed' }),
        }),
      );
    });

    it('should fail validation when required headers are missing', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'students',
      });
      const csv = 'name,email\nJohn,john@test.com\n';
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            summary_json: expect.objectContaining({
              errors: expect.arrayContaining([
                expect.objectContaining({
                  error: expect.stringContaining('Missing required headers'),
                }),
              ]),
            }),
          }),
        }),
      );
    });

    it('should fail validation when file contains no data rows', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'students',
      });
      const csv = 'first_name,last_name,date_of_birth,gender\n';
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            summary_json: expect.objectContaining({
              errors: expect.arrayContaining([
                expect.objectContaining({ error: 'File contains no data rows' }),
              ]),
            }),
          }),
        }),
      );
    });

    it('should fail when file only contains example rows', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'students',
      });
      const csv = 'first_name,last_name,date_of_birth,gender\naisha,al-mansour,2010-01-01,female\n';
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
          }),
        }),
      );
    });

    it('should validate students with required field errors', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'students',
      });
      // Missing date_of_birth value
      const csv = 'first_name,last_name,date_of_birth,gender\nJohn,Doe,,male\n';
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            summary_json: expect.objectContaining({
              errors: expect.arrayContaining([expect.objectContaining({ field: 'date_of_birth' })]),
            }),
          }),
        }),
      );
    });

    it('should validate student gender values', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'students',
      });
      const csv = 'first_name,last_name,date_of_birth,gender\nJohn,Doe,2015-03-15,invalid\n';
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            summary_json: expect.objectContaining({
              errors: expect.arrayContaining([
                expect.objectContaining({
                  field: 'gender',
                  error: expect.stringContaining('Gender must be'),
                }),
              ]),
            }),
          }),
        }),
      );
    });

    it('should validate student date_of_birth invalid format', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'students',
      });
      const csv = 'first_name,last_name,date_of_birth,gender\nJohn,Doe,not-a-date,male\n';
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            summary_json: expect.objectContaining({
              errors: expect.arrayContaining([
                expect.objectContaining({
                  field: 'date_of_birth',
                  error: expect.stringContaining('Invalid date format'),
                }),
              ]),
            }),
          }),
        }),
      );
    });

    it('should validate student age out of 3-25 range', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'students',
      });
      const csv = 'first_name,last_name,date_of_birth,gender\nJohn,Doe,2025-01-01,male\n';
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            summary_json: expect.objectContaining({
              errors: expect.arrayContaining([
                expect.objectContaining({
                  field: 'date_of_birth',
                  error: expect.stringContaining('age must be between 3 and 25'),
                }),
              ]),
            }),
          }),
        }),
      );
    });

    it('should validate parent email format', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'parents',
      });
      const csv = 'first_name,last_name,email\nJohn,Doe,not-an-email\n';
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            summary_json: expect.objectContaining({
              errors: expect.arrayContaining([
                expect.objectContaining({
                  field: 'email',
                  error: 'Invalid email format',
                }),
              ]),
            }),
          }),
        }),
      );
    });

    it('should warn on duplicate emails in parent import', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'parents',
      });
      const csv = 'first_name,last_name,email\nJohn,Doe,same@test.com\nJane,Doe,same@test.com\n';
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            summary_json: expect.objectContaining({
              warnings_list: expect.arrayContaining([
                expect.objectContaining({
                  field: 'email',
                  warning: expect.stringContaining('Duplicate email'),
                }),
              ]),
            }),
          }),
        }),
      );
    });

    it('should validate fee amount is numeric', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'fees',
      });
      const csv = 'fee_structure_name,household_name,amount\nTuition,Smith Family,not-a-number\n';
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            summary_json: expect.objectContaining({
              errors: expect.arrayContaining([
                expect.objectContaining({
                  field: 'amount',
                  error: 'Amount must be a valid number',
                }),
              ]),
            }),
          }),
        }),
      );
    });

    it('should validate exam result score is numeric', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'exam_results',
      });
      const csv = 'student_number,subject,score\nSTU-001,Math,abc\n';
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            summary_json: expect.objectContaining({
              errors: expect.arrayContaining([
                expect.objectContaining({ field: 'score', error: 'Score must be a valid number' }),
              ]),
            }),
          }),
        }),
      );
    });

    it('should validate staff_compensation rows', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'staff_compensation',
      });
      const csv = 'staff_number,compensation_type,amount\nSTF-001,invalid_type,abc\n';
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            summary_json: expect.objectContaining({
              errors: expect.arrayContaining([
                expect.objectContaining({ field: 'compensation_type' }),
                expect.objectContaining({ field: 'amount' }),
              ]),
            }),
          }),
        }),
      );
    });

    it('should validate student first_name length > 100', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'students',
      });
      const longName = 'A'.repeat(101);
      const csv = `first_name,last_name,date_of_birth,gender\n${longName},Doe,2015-03-15,male\n`;
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            summary_json: expect.objectContaining({
              errors: expect.arrayContaining([
                expect.objectContaining({
                  field: 'first_name',
                  error: expect.stringContaining('100 characters'),
                }),
              ]),
            }),
          }),
        }),
      );
    });

    it('should validate student parent1_email invalid format', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'students',
      });
      const csv =
        'first_name,last_name,date_of_birth,gender,parent1_email\nJohn,Doe,2015-03-15,male,bad-email\n';
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            summary_json: expect.objectContaining({
              errors: expect.arrayContaining([expect.objectContaining({ field: 'parent1_email' })]),
            }),
          }),
        }),
      );
    });

    it('should validate student parent1_phone invalid format', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'students',
      });
      const csv =
        'first_name,last_name,date_of_birth,gender,parent1_phone\nJohn,Doe,2015-03-15,male,abc\n';
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            summary_json: expect.objectContaining({
              errors: expect.arrayContaining([expect.objectContaining({ field: 'parent1_phone' })]),
            }),
          }),
        }),
      );
    });

    it('should validate student parent1_relationship', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'students',
      });
      const csv =
        'first_name,last_name,date_of_birth,gender,parent1_relationship\nJohn,Doe,2015-03-15,male,boss\n';
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            summary_json: expect.objectContaining({
              errors: expect.arrayContaining([
                expect.objectContaining({ field: 'parent1_relationship' }),
              ]),
            }),
          }),
        }),
      );
    });

    it('should warn on duplicate students', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'students',
      });
      const csv =
        'first_name,last_name,date_of_birth,gender\nJohn,Doe,2015-03-15,male\nJohn,Doe,2015-03-15,male\n';
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            summary_json: expect.objectContaining({
              warnings_list: expect.arrayContaining([
                expect.objectContaining({
                  warning: expect.stringContaining('Possible duplicate'),
                }),
              ]),
            }),
          }),
        }),
      );
    });

    it('should handle S3 download error gracefully', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'students',
      });
      mockS3.download.mockRejectedValue(new Error('S3 down'));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            summary_json: expect.objectContaining({
              errors: expect.arrayContaining([
                expect.objectContaining({ error: expect.stringContaining('S3 down') }),
              ]),
            }),
          }),
        }),
      );
    });

    it('should mark all-failed rows as failed status', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'students',
      });
      // All rows have errors (missing required fields)
      const csv = 'first_name,last_name,date_of_birth,gender\n,,invalid-date,invalid\n';
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'failed' }),
        }),
      );
    });

    it('should validate successfully with valid student data', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'students',
      });
      const csv = 'first_name,last_name,date_of_birth,gender\nJohn,Doe,2015-03-15,male\n';
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'validated',
            summary_json: expect.objectContaining({
              total_rows: 1,
              successful: 1,
              failed: 0,
            }),
          }),
        }),
      );
    });

    it('should parse DD/MM/YYYY date format', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'students',
      });
      const csv = 'first_name,last_name,date_of_birth,gender\nJohn,Doe,15/03/2015,male\n';
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'validated',
            summary_json: expect.objectContaining({ successful: 1 }),
          }),
        }),
      );
    });

    it('should parse DD-MM-YYYY date format', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'students',
      });
      const csv = 'first_name,last_name,date_of_birth,gender\nJohn,Doe,15-03-2015,male\n';
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'validated',
            summary_json: expect.objectContaining({ successful: 1 }),
          }),
        }),
      );
    });

    it('should validate staff_compensation base_salary and per_class_rate numeric fields', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'staff_compensation',
      });
      const csv =
        'staff_number,compensation_type,amount,base_salary,per_class_rate\nSTF-001,salaried,1000,abc,xyz\n';
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            summary_json: expect.objectContaining({
              errors: expect.arrayContaining([
                expect.objectContaining({ field: 'base_salary' }),
                expect.objectContaining({ field: 'per_class_rate' }),
              ]),
            }),
          }),
        }),
      );
    });

    it('should handle XLSX file extension', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.xlsx',
        import_type: 'students',
      });
      // Mock XLSX file — empty workbook approach: just provide empty buffer
      // The XLSX library will fail to parse it, triggering the catch block
      mockS3.download.mockResolvedValue(Buffer.alloc(0));

      await service.validate(TENANT_ID, JOB_ID);

      // Should handle error and update status to failed
      expect(mockPrisma.importJob.update).toHaveBeenCalled();
    });

    it('should handle CSV quoted fields', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'students',
      });
      const csv =
        'first_name,last_name,date_of_birth,gender\n"John ""Johnny""",Doe,2015-03-15,male\n';
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'validated',
          }),
        }),
      );
    });

    it('should strip asterisks from header names', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        file_key: 'imports/test.csv',
        import_type: 'students',
      });
      const csv = 'first_name *,last_name *,date_of_birth *,gender\nJohn,Doe,2015-03-15,male\n';
      mockS3.download.mockResolvedValue(Buffer.from(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'validated' }),
        }),
      );
    });
  });
});
