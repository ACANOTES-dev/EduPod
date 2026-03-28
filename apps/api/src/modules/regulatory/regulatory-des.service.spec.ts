/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  }),
}));

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

import { DES_FILE_EXPORTER } from './adapters/des-file-exporter.interface';
import type { DesFileExporter } from './adapters/des-file-exporter.interface';
import { RegulatoryDesService } from './regulatory-des.service';
import { RegulatorySubmissionService } from './regulatory-submission.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ACADEMIC_YEAR = '2025-2026';
const ACADEMIC_YEAR_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SUBMISSION_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const MOCK_ACADEMIC_YEAR = {
  id: ACADEMIC_YEAR_ID,
  tenant_id: TENANT_ID,
  name: ACADEMIC_YEAR,
  start_date: new Date('2025-09-01'),
  end_date: new Date('2026-06-30'),
  status: 'active',
};

// ─── Mock Factories ──────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    staffProfile: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    class: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    subject: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    student: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    schedule: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    academicYear: {
      findFirst: jest.fn().mockResolvedValue(MOCK_ACADEMIC_YEAR),
    },
  };
}

function buildMockS3(): Record<string, jest.Mock> {
  return {
    upload: jest.fn().mockResolvedValue(`${TENANT_ID}/regulatory/des/${ACADEMIC_YEAR}/des_file_a_stub.json`),
  };
}

function buildMockSubmissionService(): Record<string, jest.Mock> {
  return {
    create: jest.fn().mockResolvedValue({ id: SUBMISSION_ID }),
    update: jest.fn().mockResolvedValue({ id: SUBMISSION_ID }),
  };
}

function buildMockExporter(): DesFileExporter {
  return {
    export: jest.fn().mockReturnValue({
      content: Buffer.from('test-content'),
      filename: 'des_file_a_stub.json',
      content_type: 'application/json',
      record_count: 2,
    }),
  };
}

// ─── Helper Types ────────────────────────────────────────────────────────────

interface PreviewResult {
  file_type: string;
  academic_year: string;
  columns: Array<{ header: string; field: string }>;
  rows: Array<Record<string, string | number | null>>;
  record_count: number;
  validation_errors: Array<{ row_index: number; field: string; message: string; severity: string }>;
}

interface GenerateResult {
  id: string;
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('RegulatoryDesService', () => {
  let service: RegulatoryDesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;
  let mockSubmissionService: ReturnType<typeof buildMockSubmissionService>;
  let mockExporter: DesFileExporter;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    mockSubmissionService = buildMockSubmissionService();
    mockExporter = buildMockExporter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegulatoryDesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
        { provide: RegulatorySubmissionService, useValue: mockSubmissionService },
        { provide: DES_FILE_EXPORTER, useValue: mockExporter },
      ],
    }).compile();

    service = module.get<RegulatoryDesService>(RegulatoryDesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── checkReadiness ──────────────────────────────────────────────────────

  describe('checkReadiness', () => {
    it('should return ready=true when all categories pass', async () => {
      mockPrisma.staffProfile.count.mockResolvedValue(5);
      mockPrisma.class.count.mockResolvedValueOnce(3).mockResolvedValueOnce(3);
      mockPrisma.subject.count.mockResolvedValueOnce(4).mockResolvedValueOnce(4);
      mockPrisma.student.count.mockResolvedValueOnce(20).mockResolvedValueOnce(20);
      mockPrisma.schedule.count.mockResolvedValue(10);

      const result = await service.checkReadiness(TENANT_ID, ACADEMIC_YEAR);

      expect(result.ready).toBe(true);
      expect(result.academic_year).toBe(ACADEMIC_YEAR);
      expect(result.categories).toHaveLength(5);
      expect(result.categories.every((c) => c.status === 'pass')).toBe(true);
    });

    it('should return ready=false when staff data is missing', async () => {
      mockPrisma.staffProfile.count.mockResolvedValue(0);
      mockPrisma.class.count.mockResolvedValueOnce(3).mockResolvedValueOnce(3);
      mockPrisma.subject.count.mockResolvedValueOnce(4).mockResolvedValueOnce(4);
      mockPrisma.student.count.mockResolvedValueOnce(20).mockResolvedValueOnce(20);
      mockPrisma.schedule.count.mockResolvedValue(10);

      const result = await service.checkReadiness(TENANT_ID, ACADEMIC_YEAR);

      expect(result.ready).toBe(false);
      const staffCategory = result.categories.find((c) => c.name === 'staff_data');
      expect(staffCategory).toBeDefined();
      expect(staffCategory!.status).toBe('fail');
    });

    it('should return warning when some students are missing required fields', async () => {
      mockPrisma.staffProfile.count.mockResolvedValue(5);
      mockPrisma.class.count.mockResolvedValueOnce(3).mockResolvedValueOnce(3);
      mockPrisma.subject.count.mockResolvedValueOnce(4).mockResolvedValueOnce(4);
      mockPrisma.student.count.mockResolvedValueOnce(20).mockResolvedValueOnce(15);
      mockPrisma.schedule.count.mockResolvedValue(10);

      const result = await service.checkReadiness(TENANT_ID, ACADEMIC_YEAR);

      expect(result.ready).toBe(false);
      const studentCategory = result.categories.find((c) => c.name === 'student_data');
      expect(studentCategory).toBeDefined();
      expect(studentCategory!.status).toBe('warning');
      expect(studentCategory!.details?.issues).toBe(5);
    });

    it('should return fail for schedules when academic year has no records', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);
      mockPrisma.staffProfile.count.mockResolvedValue(5);
      mockPrisma.subject.count.mockResolvedValueOnce(4).mockResolvedValueOnce(4);
      mockPrisma.student.count.mockResolvedValueOnce(20).mockResolvedValueOnce(20);

      const result = await service.checkReadiness(TENANT_ID, ACADEMIC_YEAR);

      const classCategory = result.categories.find((c) => c.name === 'class_data');
      expect(classCategory).toBeDefined();
      expect(classCategory!.status).toBe('fail');
      const scheduleCategory = result.categories.find((c) => c.name === 'schedule_data');
      expect(scheduleCategory).toBeDefined();
      expect(scheduleCategory!.status).toBe('fail');
    });
  });

  // ─── previewFile ─────────────────────────────────────────────────────────

  describe('previewFile', () => {
    it('should preview File A with correct columns and rows', async () => {
      mockPrisma.staffProfile.findMany.mockResolvedValue([
        {
          id: 'staff-1',
          staff_number: 'T001',
          job_title: 'Teacher',
          employment_type: 'full_time',
          user: { first_name: 'John', last_name: 'Smith' },
        },
      ]);

      const result: PreviewResult = await service.previewFile(TENANT_ID, 'file_a', ACADEMIC_YEAR);

      expect(result.file_type).toBe('file_a');
      expect(result.columns).toHaveLength(5);
      const firstCol = result.columns[0]!;
      expect(firstCol.field).toBe('teacher_number');
      expect(result.rows).toHaveLength(1);
      const firstRow = result.rows[0]!;
      expect(firstRow.first_name).toBe('John');
      expect(firstRow.teacher_number).toBe('T001');
      expect(result.record_count).toBe(1);
    });

    it('should preview File C with class enrolment counts', async () => {
      mockPrisma.class.findMany.mockResolvedValue([
        {
          name: '1A',
          max_capacity: 30,
          year_group: { name: '1st Year' },
          _count: { class_enrolments: 25 },
        },
      ]);

      const result: PreviewResult = await service.previewFile(TENANT_ID, 'file_c', ACADEMIC_YEAR);

      expect(result.file_type).toBe('file_c');
      expect(result.columns).toHaveLength(4);
      expect(result.rows).toHaveLength(1);
      const firstRow = result.rows[0]!;
      expect(firstRow.class_name).toBe('1A');
      expect(firstRow.year_group).toBe('1st Year');
      expect(firstRow.enrolment_count).toBe(25);
    });

    it('should preview File D with DES mappings', async () => {
      mockPrisma.subject.findMany.mockResolvedValue([
        {
          name: 'Mathematics',
          reg_des_code_mappings: [{ des_code: '003', des_name: 'Mathematics', des_level: 'Leaving Certificate' }],
        },
      ]);

      const result: PreviewResult = await service.previewFile(TENANT_ID, 'file_d', ACADEMIC_YEAR);

      expect(result.file_type).toBe('file_d');
      expect(result.columns).toHaveLength(4);
      expect(result.rows).toHaveLength(1);
      const firstRow = result.rows[0]!;
      expect(firstRow.des_code).toBe('003');
      expect(firstRow.subject_name).toBe('Mathematics');
    });

    it('should preview File E with student data', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        {
          national_id: '1234567AB',
          first_name: 'Jane',
          last_name: 'Doe',
          date_of_birth: new Date('2010-05-15'),
          gender: 'female',
          nationality: 'Irish',
          entry_date: new Date('2023-09-01'),
        },
      ]);

      const result: PreviewResult = await service.previewFile(TENANT_ID, 'file_e', ACADEMIC_YEAR);

      expect(result.file_type).toBe('file_e');
      expect(result.columns).toHaveLength(7);
      expect(result.rows).toHaveLength(1);
      const firstRow = result.rows[0]!;
      expect(firstRow.ppsn).toBe('1234567AB');
      expect(firstRow.date_of_birth).toBe('2010-05-15');
      expect(firstRow.entry_date).toBe('2023-09-01');
      expect(result.validation_errors).toHaveLength(0);
    });

    it('should preview Form TL with teaching loads', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([
        {
          teacher_staff_id: 'staff-1',
          teacher: {
            id: 'staff-1',
            user: { first_name: 'Alice', last_name: 'Brown' },
          },
          class_entity: {
            subject: {
              id: 'subj-1',
              name: 'English',
              reg_des_code_mappings: [{ des_code: '002' }],
            },
          },
          start_time: new Date('1970-01-01T09:00:00Z'),
          end_time: new Date('1970-01-01T10:00:00Z'),
        },
        {
          teacher_staff_id: 'staff-1',
          teacher: {
            id: 'staff-1',
            user: { first_name: 'Alice', last_name: 'Brown' },
          },
          class_entity: {
            subject: {
              id: 'subj-1',
              name: 'English',
              reg_des_code_mappings: [{ des_code: '002' }],
            },
          },
          start_time: new Date('1970-01-01T11:00:00Z'),
          end_time: new Date('1970-01-01T12:00:00Z'),
        },
      ]);

      const result: PreviewResult = await service.previewFile(TENANT_ID, 'form_tl', ACADEMIC_YEAR);

      expect(result.file_type).toBe('form_tl');
      expect(result.columns).toHaveLength(4);
      expect(result.rows).toHaveLength(1);
      const firstRow = result.rows[0]!;
      expect(firstRow.teacher_name).toBe('Alice Brown');
      expect(firstRow.des_code).toBe('002');
      expect(firstRow.weekly_hours).toBe(2);
    });

    it('should return empty rows when academic year not found for File C', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);

      const result: PreviewResult = await service.previewFile(TENANT_ID, 'file_c', ACADEMIC_YEAR);

      expect(result.rows).toHaveLength(0);
      expect(result.record_count).toBe(0);
    });
  });

  // ─── generateFile ────────────────────────────────────────────────────────

  describe('generateFile', () => {
    it('should run full pipeline: collect, validate, format, export, upload, create submission', async () => {
      mockPrisma.staffProfile.findMany.mockResolvedValue([
        {
          id: 'staff-1',
          staff_number: 'T001',
          job_title: 'Teacher',
          employment_type: 'full_time',
          user: { first_name: 'John', last_name: 'Smith' },
        },
        {
          id: 'staff-2',
          staff_number: 'T002',
          job_title: 'Principal',
          employment_type: 'full_time',
          user: { first_name: 'Jane', last_name: 'Doe' },
        },
      ]);

      const result = await service.generateFile(TENANT_ID, USER_ID, 'file_a', ACADEMIC_YEAR) as GenerateResult;

      expect(result.id).toBe(SUBMISSION_ID);

      // Exporter was called
      expect(mockExporter.export).toHaveBeenCalledWith(
        'file_a',
        expect.arrayContaining([
          expect.objectContaining({ first_name: 'John', teacher_number: 'T001' }),
        ]),
        expect.arrayContaining([
          expect.objectContaining({ field: 'teacher_number' }),
        ]),
      );

      // S3 upload was called
      expect(mockS3.upload).toHaveBeenCalledWith(
        TENANT_ID,
        expect.stringContaining('regulatory/des/2025-2026/'),
        expect.any(Buffer),
        'application/json',
      );

      // Submission was created and updated
      expect(mockSubmissionService.create).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        expect.objectContaining({
          domain: 'des_september_returns',
          submission_type: 'file_a',
          academic_year: ACADEMIC_YEAR,
          status: 'in_progress',
          record_count: 2,
        }),
      );
      expect(mockSubmissionService.update).toHaveBeenCalledWith(
        TENANT_ID,
        SUBMISSION_ID,
        USER_ID,
        expect.objectContaining({
          file_key: expect.stringContaining(TENANT_ID),
          file_hash: expect.stringMatching(/^[a-f0-9]{32}$/),
        }),
      );
    });

    it('should generate File E with correct record count', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        {
          national_id: '1234567AB',
          first_name: 'Jane',
          last_name: 'Doe',
          date_of_birth: new Date('2010-05-15'),
          gender: 'female',
          nationality: 'Irish',
          entry_date: new Date('2023-09-01'),
        },
      ]);

      (mockExporter.export as jest.Mock).mockReturnValue({
        content: Buffer.from('file-e-content'),
        filename: 'des_file_e_stub.json',
        content_type: 'application/json',
        record_count: 1,
      });

      const result = await service.generateFile(TENANT_ID, USER_ID, 'file_e', ACADEMIC_YEAR) as GenerateResult;

      expect(result.id).toBe(SUBMISSION_ID);
      expect(mockSubmissionService.create).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        expect.objectContaining({
          submission_type: 'file_e',
          record_count: 1,
        }),
      );
    });
  });

  // ─── Validation ──────────────────────────────────────────────────────────

  describe('validateRows (via previewFile)', () => {
    it('should catch invalid PPSN format', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        {
          national_id: '12345',
          first_name: 'Bad',
          last_name: 'Ppsn',
          date_of_birth: new Date('2010-01-01'),
          gender: 'male',
          nationality: 'Irish',
          entry_date: new Date('2023-09-01'),
        },
      ]);

      const result: PreviewResult = await service.previewFile(TENANT_ID, 'file_e', ACADEMIC_YEAR);

      expect(result.validation_errors.length).toBeGreaterThan(0);
      const ppsnError = result.validation_errors.find((e) => e.field === 'ppsn');
      expect(ppsnError).toBeDefined();
      expect(ppsnError!.message).toContain('Invalid PPSN format');
    });

    it('should accept valid PPSN format', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        {
          national_id: '1234567AB',
          first_name: 'Good',
          last_name: 'Ppsn',
          date_of_birth: new Date('2010-01-01'),
          gender: 'male',
          nationality: 'Irish',
          entry_date: new Date('2023-09-01'),
        },
      ]);

      const result: PreviewResult = await service.previewFile(TENANT_ID, 'file_e', ACADEMIC_YEAR);

      const ppsnErrors = result.validation_errors.filter((e) => e.field === 'ppsn');
      expect(ppsnErrors).toHaveLength(0);
    });

    it('should catch missing date_of_birth and gender', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        {
          national_id: '1234567A',
          first_name: 'Missing',
          last_name: 'Fields',
          date_of_birth: null,
          gender: null,
          nationality: 'Irish',
          entry_date: null,
        },
      ]);

      const result: PreviewResult = await service.previewFile(TENANT_ID, 'file_e', ACADEMIC_YEAR);

      const dobError = result.validation_errors.find((e) => e.field === 'date_of_birth');
      const genderError = result.validation_errors.find((e) => e.field === 'gender');
      expect(dobError).toBeDefined();
      expect(genderError).toBeDefined();
    });

    it('should catch missing staff names in File A', async () => {
      mockPrisma.staffProfile.findMany.mockResolvedValue([
        {
          id: 'staff-1',
          staff_number: 'T001',
          job_title: 'Teacher',
          employment_type: 'full_time',
          user: null,
        },
      ]);

      const result: PreviewResult = await service.previewFile(TENANT_ID, 'file_a', ACADEMIC_YEAR);

      expect(result.validation_errors.length).toBeGreaterThan(0);
      const nameError = result.validation_errors.find((e) => e.field === 'first_name');
      expect(nameError).toBeDefined();
    });

    it('should warn when Form TL entry has no DES code', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([
        {
          teacher_staff_id: 'staff-1',
          teacher: {
            id: 'staff-1',
            user: { first_name: 'Alice', last_name: 'Brown' },
          },
          class_entity: {
            subject: {
              id: 'subj-1',
              name: 'Art',
              reg_des_code_mappings: [],
            },
          },
          start_time: new Date('1970-01-01T09:00:00Z'),
          end_time: new Date('1970-01-01T10:00:00Z'),
        },
      ]);

      const result: PreviewResult = await service.previewFile(TENANT_ID, 'form_tl', ACADEMIC_YEAR);

      const desCodeWarning = result.validation_errors.find(
        (e) => e.field === 'des_code' && e.severity === 'warning',
      );
      expect(desCodeWarning).toBeDefined();
    });
  });

  // ─── Error Cases ─────────────────────────────────────────────────────────

  describe('error cases', () => {
    it('should throw BadRequestException for file_b', async () => {
      await expect(service.previewFile(TENANT_ID, 'file_b', ACADEMIC_YEAR)).rejects.toThrow(
        BadRequestException,
      );

      await expect(service.generateFile(TENANT_ID, USER_ID, 'file_b', ACADEMIC_YEAR)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for invalid file type', async () => {
      await expect(
        service.previewFile(TENANT_ID, 'file_z' as 'file_a', ACADEMIC_YEAR),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle empty data gracefully', async () => {
      mockPrisma.staffProfile.findMany.mockResolvedValue([]);

      const result: PreviewResult = await service.previewFile(TENANT_ID, 'file_a', ACADEMIC_YEAR);

      expect(result.rows).toHaveLength(0);
      expect(result.record_count).toBe(0);
      expect(result.validation_errors).toHaveLength(0);
    });
  });
});
