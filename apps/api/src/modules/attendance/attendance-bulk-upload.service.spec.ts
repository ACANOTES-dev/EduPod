/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  AcademicReadFacade,
  ClassesReadFacade,
  StudentReadFacade,
} from '../../common/tests/mock-facades';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';

import { AttendanceFileParserService } from './attendance-file-parser.service';
import { DailySummaryService } from './daily-summary.service';

// ─── RLS mock ──────────────────────────────────────────────────────────────

const mockRlsTx = {
  attendanceSession: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  attendanceRecord: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

import { AttendanceBulkUploadService } from './attendance-bulk-upload.service';

// ─── Constants ─────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('AttendanceBulkUploadService', () => {
  let service: AttendanceBulkUploadService;
  let mockSettings: { getSettings: jest.Mock };
  let mockAcademicFacade: { findCurrentYearId: jest.Mock };
  let mockClassesFacade: {
    findActiveHomeroomClasses: jest.Mock;
    findEnrolledStudentsWithNumber: jest.Mock;
  };
  let mockStudentFacade: { findAllStudentNumbers: jest.Mock };
  let mockDailySummary: { recalculate: jest.Mock };

  beforeEach(async () => {
    mockSettings = {
      getSettings: jest.fn().mockResolvedValue({
        attendance: { workDays: [0, 1, 2, 3, 4, 5, 6] },
      }),
    };

    mockAcademicFacade = { findCurrentYearId: jest.fn().mockResolvedValue('ay-1') };
    mockClassesFacade = {
      findActiveHomeroomClasses: jest.fn().mockResolvedValue([]),
      findEnrolledStudentsWithNumber: jest.fn().mockResolvedValue([]),
    };
    mockStudentFacade = { findAllStudentNumbers: jest.fn().mockResolvedValue([]) };
    mockDailySummary = { recalculate: jest.fn().mockResolvedValue(null) };

    // Reset RLS mocks
    mockRlsTx.attendanceSession.findFirst.mockReset();
    mockRlsTx.attendanceSession.create.mockReset();
    mockRlsTx.attendanceSession.update.mockReset();
    mockRlsTx.attendanceRecord.findFirst.mockReset();
    mockRlsTx.attendanceRecord.create.mockReset();
    mockRlsTx.attendanceRecord.update.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AttendanceBulkUploadService,
        AttendanceFileParserService,
        { provide: PrismaService, useValue: {} },
        { provide: SettingsService, useValue: mockSettings },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: StudentReadFacade, useValue: mockStudentFacade },
        { provide: DailySummaryService, useValue: mockDailySummary },
      ],
    }).compile();

    service = module.get<AttendanceBulkUploadService>(AttendanceBulkUploadService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── generateTemplate ──────────────────────────────────────────────────

  describe('AttendanceBulkUploadService — generateTemplate', () => {
    it('should throw BadRequestException for invalid date format', async () => {
      await expect(service.generateTemplate(TENANT_ID, 'not-a-date')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when date is not a work day', async () => {
      // Configure only Monday (1) as work day
      mockSettings.getSettings.mockResolvedValue({
        attendance: { workDays: [1] }, // Monday only
      });

      // 2026-03-15 is Sunday (0)
      await expect(service.generateTemplate(TENANT_ID, '2026-03-15')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should generate a CSV template with headers and student rows', async () => {
      mockClassesFacade.findActiveHomeroomClasses.mockResolvedValue([
        { id: 'cls-1', name: 'Grade 1A' },
      ]);
      mockClassesFacade.findEnrolledStudentsWithNumber.mockResolvedValue([
        {
          student: {
            first_name: 'John',
            last_name: 'Doe',
            student_number: 'STU001',
          },
        },
        {
          student: {
            first_name: 'Jane',
            last_name: 'Doe',
            student_number: null,
          },
        },
      ]);

      // 2026-03-10 is Tuesday (2), which is in workDays [0,1,2,3,4,5,6]
      const csv = await service.generateTemplate(TENANT_ID, '2026-03-10');

      expect(csv).toContain('student_number,student_name,class_name,status');
      expect(csv).toContain('STU001');
      expect(csv).toContain('John Doe');
      expect(csv).toContain('Grade 1A');
      // student_number null should produce empty field
      expect(csv).toContain('Jane Doe');
    });

    it('should generate template with multiple classes', async () => {
      mockClassesFacade.findActiveHomeroomClasses.mockResolvedValue([
        { id: 'cls-1', name: 'Grade 1A' },
        { id: 'cls-2', name: 'Grade 1B' },
      ]);
      mockClassesFacade.findEnrolledStudentsWithNumber
        .mockResolvedValueOnce([
          { student: { first_name: 'John', last_name: 'Doe', student_number: 'STU001' } },
        ])
        .mockResolvedValueOnce([
          { student: { first_name: 'Jane', last_name: 'Doe', student_number: 'STU002' } },
        ]);

      const csv = await service.generateTemplate(TENANT_ID, '2026-03-10');

      expect(csv).toContain('Grade 1A');
      expect(csv).toContain('Grade 1B');
    });

    it('should generate empty template (just headers) when no classes exist', async () => {
      mockClassesFacade.findActiveHomeroomClasses.mockResolvedValue([]);

      const csv = await service.generateTemplate(TENANT_ID, '2026-03-10');

      const lines = csv.split('\n');
      // Comment lines + header, no data rows
      expect(lines.length).toBe(3); // 2 comment lines + header
    });
  });

  // ─── processUpload ────────────────────────────────────────────────────

  describe('AttendanceBulkUploadService — processUpload', () => {
    function buildCsvBuffer(rows: string[]): Buffer {
      const csv = ['student_number,student_name,class_name,status', ...rows].join('\n');
      return Buffer.from(csv, 'utf-8');
    }

    it('should throw BadRequestException for invalid date', async () => {
      const buf = Buffer.from('data');
      await expect(
        service.processUpload(TENANT_ID, USER_ID, buf, 'file.csv', 'invalid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when date is not a work day', async () => {
      mockSettings.getSettings.mockResolvedValue({
        attendance: { workDays: [1] },
      });

      const buf = buildCsvBuffer(['STU001,John,Grade 1A,P']);
      await expect(
        service.processUpload(TENANT_ID, USER_ID, buf, 'file.csv', '2026-03-15'), // Sunday
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for unsupported file type', async () => {
      const buf = Buffer.from('data');
      await expect(
        service.processUpload(TENANT_ID, USER_ID, buf, 'file.pdf', '2026-03-10'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for empty file', async () => {
      const buf = Buffer.from('student_number,student_name,class_name,status\n', 'utf-8');
      await expect(
        service.processUpload(TENANT_ID, USER_ID, buf, 'file.csv', '2026-03-10'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return validation failure when student_number is empty', async () => {
      mockStudentFacade.findAllStudentNumbers.mockResolvedValue([]);
      mockClassesFacade.findActiveHomeroomClasses.mockResolvedValue([
        { id: 'cls-1', name: 'Grade 1A' },
      ]);

      const csv = buildCsvBuffer([',John Doe,Grade 1A,P']);
      const result = await service.processUpload(TENANT_ID, USER_ID, csv, 'file.csv', '2026-03-10');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0]?.field).toBe('student_number');
      }
    });

    it('should return validation failure when class_name is empty', async () => {
      mockStudentFacade.findAllStudentNumbers.mockResolvedValue([
        { id: 'stu-1', student_number: 'STU001' },
      ]);
      mockClassesFacade.findActiveHomeroomClasses.mockResolvedValue([]);

      const csv = buildCsvBuffer(['STU001,John Doe,,P']);
      const result = await service.processUpload(TENANT_ID, USER_ID, csv, 'file.csv', '2026-03-10');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0]?.field).toBe('class_name');
      }
    });

    it('should return validation failure when class_name is not found', async () => {
      mockStudentFacade.findAllStudentNumbers.mockResolvedValue([
        { id: 'stu-1', student_number: 'STU001' },
      ]);
      mockClassesFacade.findActiveHomeroomClasses.mockResolvedValue([
        { id: 'cls-1', name: 'Grade 1A' },
      ]);

      const csv = buildCsvBuffer(['STU001,John Doe,NonexistentClass,P']);
      const result = await service.processUpload(TENANT_ID, USER_ID, csv, 'file.csv', '2026-03-10');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0]?.field).toBe('class_name');
      }
    });

    it('should return validation failure when status is empty', async () => {
      mockStudentFacade.findAllStudentNumbers.mockResolvedValue([
        { id: 'stu-1', student_number: 'STU001' },
      ]);
      mockClassesFacade.findActiveHomeroomClasses.mockResolvedValue([
        { id: 'cls-1', name: 'Grade 1A' },
      ]);

      const csv = buildCsvBuffer(['STU001,John Doe,Grade 1A,']);
      const result = await service.processUpload(TENANT_ID, USER_ID, csv, 'file.csv', '2026-03-10');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0]?.field).toBe('status');
      }
    });

    it('should return validation failure when status is invalid', async () => {
      mockStudentFacade.findAllStudentNumbers.mockResolvedValue([
        { id: 'stu-1', student_number: 'STU001' },
      ]);
      mockClassesFacade.findActiveHomeroomClasses.mockResolvedValue([
        { id: 'cls-1', name: 'Grade 1A' },
      ]);

      const csv = buildCsvBuffer(['STU001,John Doe,Grade 1A,INVALID']);
      const result = await service.processUpload(TENANT_ID, USER_ID, csv, 'file.csv', '2026-03-10');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0]?.field).toBe('status');
      }
    });

    it('should create sessions and records for valid CSV data', async () => {
      mockStudentFacade.findAllStudentNumbers.mockResolvedValue([
        { id: 'stu-1', student_number: 'STU001' },
      ]);
      mockClassesFacade.findActiveHomeroomClasses.mockResolvedValue([
        { id: 'cls-1', name: 'Grade 1A' },
      ]);

      // No existing session
      mockRlsTx.attendanceSession.findFirst.mockResolvedValue(null);
      mockRlsTx.attendanceSession.create.mockResolvedValue({ id: 'sess-1' });
      mockRlsTx.attendanceRecord.findFirst.mockResolvedValue(null);
      mockRlsTx.attendanceRecord.create.mockResolvedValue({ id: 'rec-1' });

      const csv = buildCsvBuffer(['STU001,John Doe,Grade 1A,P']);
      const result = await service.processUpload(TENANT_ID, USER_ID, csv, 'file.csv', '2026-03-10');

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.sessions_created).toBe(1);
        expect(result.records_created).toBe(1);
      }
    });

    it('should update existing record when one already exists for session + student', async () => {
      mockStudentFacade.findAllStudentNumbers.mockResolvedValue([
        { id: 'stu-1', student_number: 'STU001' },
      ]);
      mockClassesFacade.findActiveHomeroomClasses.mockResolvedValue([
        { id: 'cls-1', name: 'Grade 1A' },
      ]);

      // Session exists and is open
      mockRlsTx.attendanceSession.findFirst.mockResolvedValue({ id: 'sess-1', status: 'open' });
      // Record already exists
      mockRlsTx.attendanceRecord.findFirst.mockResolvedValue({ id: 'existing-rec' });
      mockRlsTx.attendanceRecord.update.mockResolvedValue({ id: 'existing-rec' });
      mockRlsTx.attendanceSession.update.mockResolvedValue({ id: 'sess-1' });

      const csv = buildCsvBuffer(['STU001,John Doe,Grade 1A,A']);
      const result = await service.processUpload(TENANT_ID, USER_ID, csv, 'file.csv', '2026-03-10');

      expect(result.valid).toBe(true);
      expect(mockRlsTx.attendanceRecord.update).toHaveBeenCalled();
    });

    it('should throw BadRequestException when session is already submitted or locked', async () => {
      mockStudentFacade.findAllStudentNumbers.mockResolvedValue([
        { id: 'stu-1', student_number: 'STU001' },
      ]);
      mockClassesFacade.findActiveHomeroomClasses.mockResolvedValue([
        { id: 'cls-1', name: 'Grade 1A' },
      ]);

      mockRlsTx.attendanceSession.findFirst.mockResolvedValue({
        id: 'sess-1',
        status: 'submitted',
      });

      const csv = buildCsvBuffer(['STU001,John Doe,Grade 1A,P']);
      await expect(
        service.processUpload(TENANT_ID, USER_ID, csv, 'file.csv', '2026-03-10'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should parse xlsx files when extension is xlsx', async () => {
      // We cannot easily create a valid XLSX buffer, so just verify the path detection.
      // An invalid xlsx buffer will throw from the xlsx library
      const buf = Buffer.from('not-real-xlsx');

      await expect(
        service.processUpload(TENANT_ID, USER_ID, buf, 'file.xlsx', '2026-03-10'),
      ).rejects.toThrow(); // xlsx library will throw on invalid data
    });

    it('should return validation failure when student_number is not found in database', async () => {
      mockStudentFacade.findAllStudentNumbers.mockResolvedValue([
        { id: 'stu-1', student_number: 'STU001' },
      ]);
      mockClassesFacade.findActiveHomeroomClasses.mockResolvedValue([
        { id: 'cls-1', name: 'Grade 1A' },
      ]);

      const csv = buildCsvBuffer(['UNKNOWN,John Doe,Grade 1A,P']);
      const result = await service.processUpload(TENANT_ID, USER_ID, csv, 'file.csv', '2026-03-10');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0]?.field).toBe('student_number');
        expect(result.errors[0]?.message).toContain('not found');
      }
    });

    it('should handle xls extension path for Excel parsing', async () => {
      // An invalid xls buffer will throw from the xlsx library
      const buf = Buffer.from('not-real-xls');

      await expect(
        service.processUpload(TENANT_ID, USER_ID, buf, 'file.xls', '2026-03-10'),
      ).rejects.toThrow(); // xlsx library will throw on invalid data
    });

    it('should throw BadRequestException when existing session status is locked', async () => {
      mockStudentFacade.findAllStudentNumbers.mockResolvedValue([
        { id: 'stu-1', student_number: 'STU001' },
      ]);
      mockClassesFacade.findActiveHomeroomClasses.mockResolvedValue([
        { id: 'cls-1', name: 'Grade 1A' },
      ]);

      mockRlsTx.attendanceSession.findFirst.mockResolvedValue({
        id: 'sess-1',
        status: 'locked',
      });

      const csv = buildCsvBuffer(['STU001,John Doe,Grade 1A,P']);
      await expect(
        service.processUpload(TENANT_ID, USER_ID, csv, 'file.csv', '2026-03-10'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should recalculate daily summary for each affected student', async () => {
      mockStudentFacade.findAllStudentNumbers.mockResolvedValue([
        { id: 'stu-1', student_number: 'STU001' },
        { id: 'stu-2', student_number: 'STU002' },
      ]);
      mockClassesFacade.findActiveHomeroomClasses.mockResolvedValue([
        { id: 'cls-1', name: 'Grade 1A' },
      ]);

      mockRlsTx.attendanceSession.findFirst.mockResolvedValue(null);
      mockRlsTx.attendanceSession.create.mockResolvedValue({ id: 'sess-1' });
      mockRlsTx.attendanceRecord.findFirst.mockResolvedValue(null);
      mockRlsTx.attendanceRecord.create.mockResolvedValue({ id: 'rec-1' });

      const csv = buildCsvBuffer(['STU001,John Doe,Grade 1A,P', 'STU002,Jane Doe,Grade 1A,A']);

      await service.processUpload(TENANT_ID, USER_ID, csv, 'file.csv', '2026-03-10');

      expect(mockDailySummary.recalculate).toHaveBeenCalledTimes(2);
    });
  });
});
