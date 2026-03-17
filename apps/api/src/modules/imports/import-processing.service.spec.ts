jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

import { ImportProcessingService } from './import-processing.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const JOB_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';
const HOUSEHOLD_ID = 'hh-0001';
const YEAR_GROUP_ID = 'yg-0001';

// ── Mock Prisma ────────────────────────────────────────────────────────
const mockPrisma = {
  importJob: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

// ── Mock S3 ────────────────────────────────────────────────────────────
const mockS3 = {
  download: jest.fn(),
  delete: jest.fn(),
};

// ── Mock transactional delegates (passed to the RLS $transaction callback) ──
const mockTx = {
  student: { create: jest.fn() },
  parent: { create: jest.fn() },
  household: { findFirst: jest.fn(), create: jest.fn() },
  householdParent: { create: jest.fn() },
  yearGroup: { findFirst: jest.fn() },
  user: { create: jest.fn() },
  staffProfile: { create: jest.fn() },
};

// Utility: build a mock import job record
function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    tenant_id: TENANT_ID,
    import_type: 'students',
    file_key: 'imports/test.csv',
    status: 'confirmed',
    created_by_user_id: USER_ID,
    summary_json: { errors: [] },
    ...overrides,
  };
}

// Utility: encode a CSV string as a Buffer (simulates S3 download)
function csvBuffer(lines: string[]): Buffer {
  return Buffer.from(lines.join('\n'), 'utf-8');
}

describe('ImportProcessingService', () => {
  let service: ImportProcessingService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: createRlsClient returns an object whose $transaction calls
    // the provided callback with mockTx.
    (createRlsClient as jest.Mock).mockReturnValue({
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    // Default: findUnique returns existing summary (used inside updateJobFinal)
    mockPrisma.importJob.findUnique.mockResolvedValue({
      id: JOB_ID,
      summary_json: { errors: [] },
    });

    // Default: update resolves silently
    mockPrisma.importJob.update.mockResolvedValue({});

    // Default: S3 delete succeeds
    mockS3.delete.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportProcessingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<ImportProcessingService>(ImportProcessingService);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 1. process valid student rows
  // ─────────────────────────────────────────────────────────────────────
  it('should process valid student rows and create records', async () => {
    mockPrisma.importJob.findFirst.mockResolvedValue(makeJob());
    mockS3.download.mockResolvedValue(
      csvBuffer([
        'first_name,last_name,student_number,date_of_birth,year_group_name,gender',
        'Ali,Khan,S001,2015-06-01,Grade 1,male',
        'Sara,Ahmed,S002,2014-03-15,Grade 1,female',
      ]),
    );

    mockTx.yearGroup.findFirst.mockResolvedValue({ id: YEAR_GROUP_ID, name: 'Grade 1' });
    mockTx.household.findFirst.mockResolvedValue(null);
    mockTx.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });
    mockTx.student.create.mockResolvedValue({ id: 'stu-1' });

    await service.process(TENANT_ID, JOB_ID);

    // Two students created
    expect(mockTx.student.create).toHaveBeenCalledTimes(2);

    // First student data check
    expect(mockTx.student.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          first_name: 'Ali',
          last_name: 'Khan',
          full_name: 'Ali Khan',
          student_number: 'S001',
          gender: 'male',
          status: 'active',
          year_group_id: YEAR_GROUP_ID,
        }),
      }),
    );

    // Job marked completed
    expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: JOB_ID },
        data: expect.objectContaining({
          status: 'completed',
          summary_json: expect.objectContaining({ successful: 2, failed: 0 }),
        }),
      }),
    );
  });

  // ─────────────────────────────────────────────────────────────────────
  // 2. skip rows that had validation errors
  // ─────────────────────────────────────────────────────────────────────
  it('should skip rows that had validation errors', async () => {
    // Row 2 (first data row) flagged as error during validation
    mockPrisma.importJob.findFirst.mockResolvedValue(
      makeJob({ summary_json: { errors: [{ row: 2, message: 'bad field' }] } }),
    );
    mockS3.download.mockResolvedValue(
      csvBuffer([
        'first_name,last_name,student_number,date_of_birth,year_group_name,gender',
        'Bad,Row,S000,invalid-date,,',
        'Good,Row,S001,2015-01-01,Grade 1,male',
      ]),
    );

    mockTx.yearGroup.findFirst.mockResolvedValue({ id: YEAR_GROUP_ID });
    mockTx.household.findFirst.mockResolvedValue(null);
    mockTx.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });
    mockTx.student.create.mockResolvedValue({ id: 'stu-1' });

    await service.process(TENANT_ID, JOB_ID);

    // Only the good row processed
    expect(mockTx.student.create).toHaveBeenCalledTimes(1);
    expect(mockTx.student.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ first_name: 'Good', last_name: 'Row' }),
      }),
    );

    // 1 success + 1 fail (the skipped row)
    expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'completed',
          summary_json: expect.objectContaining({ successful: 1, failed: 1 }),
        }),
      }),
    );
  });

  // ─────────────────────────────────────────────────────────────────────
  // 3. process parents CSV — create parent + household_parent
  // ─────────────────────────────────────────────────────────────────────
  it('should process parents CSV and create parent + household_parent', async () => {
    mockPrisma.importJob.findFirst.mockResolvedValue(
      makeJob({ import_type: 'parents' }),
    );
    mockS3.download.mockResolvedValue(
      csvBuffer([
        'first_name,last_name,email,phone,household_name',
        'Fatima,Ali,fatima@example.com,+97150000000,Ali Family',
      ]),
    );

    const parentRecord = { id: 'par-001' };
    const householdRecord = { id: 'hh-002' };

    mockTx.household.findFirst.mockResolvedValue(null);
    mockTx.household.create.mockResolvedValue(householdRecord);
    mockTx.parent.create.mockResolvedValue(parentRecord);
    mockTx.householdParent.create.mockResolvedValue({});

    await service.process(TENANT_ID, JOB_ID);

    // Parent created
    expect(mockTx.parent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          first_name: 'Fatima',
          last_name: 'Ali',
          email: 'fatima@example.com',
          phone: '+97150000000',
        }),
      }),
    );

    // Household created because it didn't exist
    expect(mockTx.household.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          household_name: 'Ali Family',
          needs_completion: true,
        }),
      }),
    );

    // Link created
    expect(mockTx.householdParent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          household_id: householdRecord.id,
          parent_id: parentRecord.id,
        }),
      }),
    );

    // Job completed
    expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'completed',
          summary_json: expect.objectContaining({ successful: 1, failed: 0 }),
        }),
      }),
    );
  });

  // ─────────────────────────────────────────────────────────────────────
  // 4. process staff CSV — create user + staff_profile
  // ─────────────────────────────────────────────────────────────────────
  it('should process staff CSV and create user + staff_profile', async () => {
    mockPrisma.importJob.findFirst.mockResolvedValue(
      makeJob({ import_type: 'staff' }),
    );
    mockS3.download.mockResolvedValue(
      csvBuffer([
        'first_name,last_name,email,job_title,department,employment_type',
        'John,Doe,john@example.com,Teacher,Science,full_time',
      ]),
    );

    const userRecord = { id: 'usr-001' };
    mockTx.user.create.mockResolvedValue(userRecord);
    mockTx.staffProfile.create.mockResolvedValue({ id: 'sp-001' });

    await service.process(TENANT_ID, JOB_ID);

    // User created with placeholder password
    expect(mockTx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
          password_hash: '',
          global_status: 'active',
        }),
      }),
    );

    // Staff profile linked to the created user
    expect(mockTx.staffProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          user_id: userRecord.id,
          job_title: 'Teacher',
          department: 'Science',
          employment_type: 'full_time',
          employment_status: 'active',
        }),
      }),
    );

    expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'completed',
          summary_json: expect.objectContaining({ successful: 1, failed: 0 }),
        }),
      }),
    );
  });

  // ─────────────────────────────────────────────────────────────────────
  // 5. all rows fail → status = 'failed'
  // ─────────────────────────────────────────────────────────────────────
  it('should set job status to failed when all rows fail during processing', async () => {
    mockPrisma.importJob.findFirst.mockResolvedValue(makeJob());
    mockS3.download.mockResolvedValue(
      csvBuffer([
        'first_name,last_name,student_number,date_of_birth,year_group_name,gender',
        'Ali,Khan,S001,2015-06-01,Grade 1,male',
        'Sara,Ahmed,S002,2014-03-15,Grade 1,female',
      ]),
    );

    // Make every student.create call throw
    mockTx.yearGroup.findFirst.mockResolvedValue({ id: YEAR_GROUP_ID });
    mockTx.household.findFirst.mockResolvedValue(null);
    mockTx.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });
    mockTx.student.create.mockRejectedValue(new Error('DB constraint violation'));

    await service.process(TENANT_ID, JOB_ID);

    expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'failed',
          summary_json: expect.objectContaining({ successful: 0, failed: 2 }),
        }),
      }),
    );
  });

  // ─────────────────────────────────────────────────────────────────────
  // 6. at least one row succeeds → status = 'completed'
  // ─────────────────────────────────────────────────────────────────────
  it('should set status completed when at least one row succeeds', async () => {
    mockPrisma.importJob.findFirst.mockResolvedValue(makeJob());
    mockS3.download.mockResolvedValue(
      csvBuffer([
        'first_name,last_name,student_number,date_of_birth,year_group_name,gender',
        'Ali,Khan,S001,2015-06-01,Grade 1,male',
        'Sara,Ahmed,S002,2014-03-15,Grade 1,female',
      ]),
    );

    mockTx.yearGroup.findFirst.mockResolvedValue({ id: YEAR_GROUP_ID });
    mockTx.household.findFirst.mockResolvedValue(null);
    mockTx.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });

    // First row succeeds, second row fails
    mockTx.student.create
      .mockResolvedValueOnce({ id: 'stu-1' })
      .mockRejectedValueOnce(new Error('unique constraint'));

    await service.process(TENANT_ID, JOB_ID);

    expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'completed',
          summary_json: expect.objectContaining({ successful: 1, failed: 1 }),
        }),
      }),
    );
  });

  // ─────────────────────────────────────────────────────────────────────
  // 7. should delete S3 file on completion
  // ─────────────────────────────────────────────────────────────────────
  it('should delete S3 file on completion', async () => {
    const fileKey = 'imports/test.csv';
    mockPrisma.importJob.findFirst.mockResolvedValue(makeJob({ file_key: fileKey }));
    mockS3.download.mockResolvedValue(
      csvBuffer([
        'first_name,last_name,student_number,date_of_birth,year_group_name,gender',
        'Ali,Khan,S001,2015-06-01,Grade 1,male',
      ]),
    );
    mockTx.yearGroup.findFirst.mockResolvedValue({ id: YEAR_GROUP_ID });
    mockTx.household.findFirst.mockResolvedValue(null);
    mockTx.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });
    mockTx.student.create.mockResolvedValue({ id: 'stu-1' });

    await service.process(TENANT_ID, JOB_ID);

    expect(mockS3.delete).toHaveBeenCalledWith(fileKey);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 8. should handle S3 delete failure gracefully
  // ─────────────────────────────────────────────────────────────────────
  it('should handle S3 delete failure gracefully', async () => {
    mockPrisma.importJob.findFirst.mockResolvedValue(makeJob());
    mockS3.download.mockResolvedValue(
      csvBuffer([
        'first_name,last_name,student_number,date_of_birth,year_group_name,gender',
        'Ali,Khan,S001,2015-06-01,Grade 1,male',
      ]),
    );
    mockTx.yearGroup.findFirst.mockResolvedValue({ id: YEAR_GROUP_ID });
    mockTx.household.findFirst.mockResolvedValue(null);
    mockTx.household.create.mockResolvedValue({ id: HOUSEHOLD_ID });
    mockTx.student.create.mockResolvedValue({ id: 'stu-1' });

    // S3 delete throws but processing should still complete
    mockS3.delete.mockRejectedValue(new Error('S3 AccessDenied'));

    await service.process(TENANT_ID, JOB_ID);

    // Job still marked completed despite S3 error
    expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'completed',
          summary_json: expect.objectContaining({ successful: 1, failed: 0 }),
        }),
      }),
    );
  });

  // ─────────────────────────────────────────────────────────────────────
  // 9. should handle missing job gracefully
  // ─────────────────────────────────────────────────────────────────────
  it('should handle missing job gracefully', async () => {
    mockPrisma.importJob.findFirst.mockResolvedValue(null);

    await service.process(TENANT_ID, JOB_ID);

    // No S3 download, no tx, no update
    expect(mockS3.download).not.toHaveBeenCalled();
    expect(createRlsClient).not.toHaveBeenCalled();
    expect(mockPrisma.importJob.update).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────
  // 10. edge: CSV with only headers (no data rows)
  // ─────────────────────────────────────────────────────────────────────
  it('edge: should handle CSV with only headers (no data rows)', async () => {
    mockPrisma.importJob.findFirst.mockResolvedValue(makeJob());
    mockS3.download.mockResolvedValue(
      csvBuffer([
        'first_name,last_name,student_number,date_of_birth,year_group_name,gender',
      ]),
    );

    await service.process(TENANT_ID, JOB_ID);

    // Should call updateJobFinal with failed, 0 processed
    expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'failed',
          summary_json: expect.objectContaining({ successful: 0, failed: 0 }),
        }),
      }),
    );

    // No student creation attempted
    expect(mockTx.student.create).not.toHaveBeenCalled();
  });
});
