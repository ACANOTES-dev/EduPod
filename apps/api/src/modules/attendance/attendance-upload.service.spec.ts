import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StudentReadFacade } from '../students/student-read.facade';

import { AttendanceBulkUploadService } from './attendance-bulk-upload.service';
import { AttendanceExceptionsService } from './attendance-exceptions.service';
import { AttendanceFileParserService } from './attendance-file-parser.service';
import { AttendanceParentNotificationService } from './attendance-parent-notification.service';
import { AttendanceUploadService } from './attendance-upload.service';
import { DailySummaryService } from './daily-summary.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';

// ─── RLS middleware mock ────────────────────────────────────────────────────

const mockRlsTx = {
  attendanceSession: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  attendanceRecord: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
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

// ─── Redis mock ─────────────────────────────────────────────────────────────

const mockRedisClient = {
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn(),
  del: jest.fn().mockResolvedValue(1),
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildCsvBuffer(rows: string[]): Buffer {
  const csv = ['student_number,student_name,class_name,status', ...rows].join('\n');
  return Buffer.from(csv, 'utf-8');
}

// ─── Shared provider factories ──────────────────────────────────────────────

function buildBaseProviders(overrides: {
  prisma?: unknown;
  settings?: unknown;
  dailySummary?: unknown;
  redis?: unknown;
  parentNotification?: unknown;
  academicReadFacade?: unknown;
  classesReadFacade?: unknown;
  studentReadFacade?: unknown;
}) {
  return [
    AttendanceFileParserService,
    AttendanceBulkUploadService,
    AttendanceExceptionsService,
    AttendanceUploadService,
    { provide: PrismaService, useValue: overrides.prisma ?? {} },
    { provide: SettingsService, useValue: overrides.settings ?? {} },
    {
      provide: DailySummaryService,
      useValue: overrides.dailySummary ?? { recalculate: jest.fn().mockResolvedValue(null) },
    },
    {
      provide: RedisService,
      useValue: overrides.redis ?? { getClient: () => mockRedisClient },
    },
    {
      provide: AttendanceParentNotificationService,
      useValue: overrides.parentNotification ?? {
        triggerAbsenceNotification: jest.fn().mockResolvedValue(undefined),
      },
    },
    {
      provide: AcademicReadFacade,
      useValue: overrides.academicReadFacade ?? { findCurrentYearId: jest.fn() },
    },
    {
      provide: ClassesReadFacade,
      useValue: overrides.classesReadFacade ?? {
        findActiveHomeroomClasses: jest.fn(),
        findEnrolledStudentsWithNumber: jest.fn(),
      },
    },
    {
      provide: StudentReadFacade,
      useValue: overrides.studentReadFacade ?? { findAllStudentNumbers: jest.fn() },
    },
  ];
}

describe('AttendanceUploadService — generateTemplate', () => {
  let service: AttendanceUploadService;
  let mockSettings: { getSettings: jest.Mock };
  let mockAcademicReadFacade: { findCurrentYearId: jest.Mock };
  let mockClassesReadFacade: {
    findActiveHomeroomClasses: jest.Mock;
    findEnrolledStudentsWithNumber: jest.Mock;
  };

  beforeEach(async () => {
    mockSettings = {
      getSettings: jest.fn().mockResolvedValue({
        attendance: { workDays: [0, 1, 2, 3, 4, 5, 6] },
      }),
    };
    mockAcademicReadFacade = { findCurrentYearId: jest.fn().mockResolvedValue('ay-1') };
    mockClassesReadFacade = {
      findActiveHomeroomClasses: jest.fn().mockResolvedValue([]),
      findEnrolledStudentsWithNumber: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: buildBaseProviders({
        settings: mockSettings,
        academicReadFacade: mockAcademicReadFacade,
        classesReadFacade: mockClassesReadFacade,
      }),
    }).compile();

    service = module.get<AttendanceUploadService>(AttendanceUploadService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should delegate to bulk upload service and return CSV', async () => {
    mockClassesReadFacade.findActiveHomeroomClasses.mockResolvedValue([
      { id: 'cls-1', name: 'Grade 1A' },
    ]);
    mockClassesReadFacade.findEnrolledStudentsWithNumber.mockResolvedValue([
      { student: { first_name: 'John', last_name: 'Doe', student_number: 'STU001' } },
    ]);

    const csv = await service.generateTemplate(TENANT_ID, '2026-03-10');

    expect(csv).toContain('student_number,student_name,class_name,status');
    expect(csv).toContain('STU001');
  });
});

describe('AttendanceUploadService — parseQuickMarkText', () => {
  let service: AttendanceUploadService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: buildBaseProviders({}),
    }).compile();

    service = module.get<AttendanceUploadService>(AttendanceUploadService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should parse a single absent entry', () => {
    const entries = service.parseQuickMarkText('STU001 A');

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      student_number: 'STU001',
      status: 'absent_unexcused',
      reason: undefined,
    });
  });

  it('should parse absent_excused (AE) status', () => {
    const entries = service.parseQuickMarkText('STU002 AE');

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      student_number: 'STU002',
      status: 'absent_excused',
    });
  });

  it('should parse late (L) and left_early (LE) entries together', () => {
    const entries = service.parseQuickMarkText('STU001 L\nSTU002 LE');

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ student_number: 'STU001', status: 'late' });
    expect(entries[1]).toMatchObject({ student_number: 'STU002', status: 'left_early' });
  });

  it('should capture an optional reason after the status code', () => {
    const entries = service.parseQuickMarkText('STU003 AE medical appointment');

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      student_number: 'STU003',
      status: 'absent_excused',
      reason: 'medical appointment',
    });
  });

  it('should be case-insensitive for status codes', () => {
    const entries = service.parseQuickMarkText('STU001 ae');

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ status: 'absent_excused' });
  });

  it('should skip blank lines and parse remaining entries', () => {
    const entries = service.parseQuickMarkText('STU001 A\n\nSTU002 L');

    expect(entries).toHaveLength(2);
  });

  it('should throw BadRequestException for a line missing the status code', () => {
    expect(() => service.parseQuickMarkText('STU001')).toThrow(BadRequestException);
  });

  it('should throw BadRequestException for an unrecognised status code', () => {
    expect(() => service.parseQuickMarkText('STU001 P')).toThrow(BadRequestException);
  });
});

// ─── processExceptionsUpload ────────────────────────────────────────────────

describe('AttendanceUploadService — processExceptionsUpload', () => {
  let service: AttendanceUploadService;
  let mockStudentReadFacade: { findAllStudentNumbers: jest.Mock };

  beforeEach(async () => {
    mockStudentReadFacade = {
      findAllStudentNumbers: jest.fn(),
    };

    mockRlsTx.attendanceRecord.findMany = jest.fn();
    mockRlsTx.attendanceRecord.update = jest.fn().mockResolvedValue({});
    mockRedisClient.set.mockResolvedValue('OK');

    const module: TestingModule = await Test.createTestingModule({
      providers: buildBaseProviders({
        studentReadFacade: mockStudentReadFacade,
      }),
    }).compile();

    service = module.get<AttendanceUploadService>(AttendanceUploadService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should reject an invalid date string', async () => {
    mockStudentReadFacade.findAllStudentNumbers.mockResolvedValue([]);

    await expect(
      service.processExceptionsUpload(TENANT_ID, USER_ID, 'not-a-date', []),
    ).rejects.toThrow(BadRequestException);
  });

  it('should record an error row when student_number is not found', async () => {
    mockStudentReadFacade.findAllStudentNumbers.mockResolvedValue([]);

    const result = await service.processExceptionsUpload(TENANT_ID, USER_ID, '2026-03-10', [
      { student_number: 'UNKNOWN', status: 'absent_unexcused' },
    ]);

    expect(result.success).toBe(false);
    expect(result.updated).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ row: 1 });
  });

  it('should record an error row for an invalid exception status', async () => {
    mockStudentReadFacade.findAllStudentNumbers.mockResolvedValue([
      { id: 'stu-1', student_number: 'STU001' },
    ]);

    const result = await service.processExceptionsUpload(
      TENANT_ID,
      USER_ID,
      '2026-03-10',
      [{ student_number: 'STU001', status: 'present' }], // 'present' not allowed here
    );

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it('should store undo data in Redis with 5-minute TTL and return a batch_id', async () => {
    mockStudentReadFacade.findAllStudentNumbers.mockResolvedValue([
      { id: 'stu-1', student_number: 'STU001' },
    ]);
    (mockRlsTx.attendanceRecord.findMany as jest.Mock).mockResolvedValue([
      { id: 'rec-1', status: 'present', attendance_session_id: 'sess-1' },
    ]);

    const result = await service.processExceptionsUpload(TENANT_ID, USER_ID, '2026-03-10', [
      { student_number: 'STU001', status: 'absent_unexcused' },
    ]);

    expect(result.updated).toBe(1);
    expect(result.batch_id).toBeDefined();
    expect(mockRedisClient.set).toHaveBeenCalledWith(
      expect.stringContaining('attendance:undo:'),
      expect.any(String),
      'EX',
      300,
    );
  });

  it('should report success:false when some rows error and some succeed', async () => {
    mockStudentReadFacade.findAllStudentNumbers.mockResolvedValue([
      { id: 'stu-1', student_number: 'STU001' },
    ]);
    (mockRlsTx.attendanceRecord.findMany as jest.Mock).mockResolvedValueOnce([]); // no records for STU001 → error

    const result = await service.processExceptionsUpload(TENANT_ID, USER_ID, '2026-03-10', [
      { student_number: 'STU001', status: 'absent_unexcused' },
    ]);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it('should handle student with null student_number in the lookup map', async () => {
    mockStudentReadFacade.findAllStudentNumbers.mockResolvedValue([
      { id: 'stu-1', student_number: null }, // null student_number — should be skipped in map
      { id: 'stu-2', student_number: 'STU002' },
    ]);
    (mockRlsTx.attendanceRecord.findMany as jest.Mock).mockResolvedValue([
      { id: 'rec-1', status: 'present', attendance_session_id: 'sess-1' },
    ]);

    const result = await service.processExceptionsUpload(TENANT_ID, USER_ID, '2026-03-10', [
      { student_number: 'STU002', status: 'absent_unexcused' },
    ]);

    expect(result.updated).toBe(1);
  });
});

// ─── processExceptionsUpload — notification failure ────────────────────────

describe('AttendanceUploadService — processExceptionsUpload notification failure', () => {
  let service: AttendanceUploadService;
  let mockStudentReadFacade: { findAllStudentNumbers: jest.Mock };
  let mockParentNotification: { triggerAbsenceNotification: jest.Mock };

  beforeEach(async () => {
    mockStudentReadFacade = {
      findAllStudentNumbers: jest.fn(),
    };
    mockParentNotification = {
      triggerAbsenceNotification: jest
        .fn()
        .mockRejectedValue(new Error('Notification service down')),
    };

    mockRlsTx.attendanceRecord.findMany = jest.fn();
    mockRlsTx.attendanceRecord.update = jest.fn().mockResolvedValue({});
    mockRedisClient.set.mockResolvedValue('OK');

    const module: TestingModule = await Test.createTestingModule({
      providers: buildBaseProviders({
        studentReadFacade: mockStudentReadFacade,
        parentNotification: mockParentNotification,
      }),
    }).compile();

    service = module.get<AttendanceUploadService>(AttendanceUploadService);
  });

  afterEach(() => jest.clearAllMocks());

  it('edge: should continue operation when parent notification throws an error', async () => {
    mockStudentReadFacade.findAllStudentNumbers.mockResolvedValue([
      { id: 'stu-1', student_number: 'STU001' },
    ]);
    (mockRlsTx.attendanceRecord.findMany as jest.Mock).mockResolvedValue([
      { id: 'rec-1', status: 'present', attendance_session_id: 'sess-1' },
    ]);

    const result = await service.processExceptionsUpload(TENANT_ID, USER_ID, '2026-03-10', [
      { student_number: 'STU001', status: 'absent_unexcused' },
    ]);

    // Should still succeed despite notification failure
    expect(result.updated).toBe(1);
    expect(result.success).toBe(true);
    expect(mockParentNotification.triggerAbsenceNotification).toHaveBeenCalled();
  });

  it('edge: should handle non-Error throw in notification catch block', async () => {
    mockParentNotification.triggerAbsenceNotification.mockRejectedValue('string error');
    mockStudentReadFacade.findAllStudentNumbers.mockResolvedValue([
      { id: 'stu-1', student_number: 'STU001' },
    ]);
    (mockRlsTx.attendanceRecord.findMany as jest.Mock).mockResolvedValue([
      { id: 'rec-1', status: 'present', attendance_session_id: 'sess-1' },
    ]);

    const result = await service.processExceptionsUpload(TENANT_ID, USER_ID, '2026-03-10', [
      { student_number: 'STU001', status: 'absent_unexcused' },
    ]);

    expect(result.updated).toBe(1);
    expect(result.success).toBe(true);
  });
});

// ─── undoUpload ─────────────────────────────────────────────────────────────

describe('AttendanceUploadService — undoUpload', () => {
  let service: AttendanceUploadService;

  beforeEach(async () => {
    mockRlsTx.attendanceSession.findFirst = jest.fn();
    mockRlsTx.attendanceRecord.update = jest.fn().mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: buildBaseProviders({}),
    }).compile();

    service = module.get<AttendanceUploadService>(AttendanceUploadService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw BadRequestException when batch_id does not exist in Redis', async () => {
    mockRedisClient.get.mockResolvedValue(null);

    await expect(service.undoUpload(TENANT_ID, USER_ID, 'nonexistent-batch')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw BadRequestException when tenant_id does not match', async () => {
    const payload = JSON.stringify({
      tenant_id: 'other-tenant',
      user_id: USER_ID,
      entries: [],
      session_date: '2026-03-10',
    });
    mockRedisClient.get.mockResolvedValue(payload);

    await expect(service.undoUpload(TENANT_ID, USER_ID, 'batch-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw BadRequestException when user_id does not match', async () => {
    const payload = JSON.stringify({
      tenant_id: TENANT_ID,
      user_id: 'different-user',
      entries: [],
      session_date: '2026-03-10',
    });
    mockRedisClient.get.mockResolvedValue(payload);

    await expect(service.undoUpload(TENANT_ID, USER_ID, 'batch-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should skip records whose session is no longer open', async () => {
    const payload = JSON.stringify({
      tenant_id: TENANT_ID,
      user_id: USER_ID,
      session_date: '2026-03-10',
      entries: [
        {
          record_id: 'rec-1',
          previous_status: 'present',
          student_id: 'stu-1',
          session_id: 'sess-1',
        },
      ],
    });
    mockRedisClient.get.mockResolvedValue(payload);
    // Session is NOT open (e.g. submitted)
    (mockRlsTx.attendanceSession.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await service.undoUpload(TENANT_ID, USER_ID, 'batch-1');

    expect(result.reverted).toBe(0);
    expect(mockRlsTx.attendanceRecord.update).not.toHaveBeenCalled();
  });

  it('should revert records and delete the Redis key when session is open', async () => {
    const payload = JSON.stringify({
      tenant_id: TENANT_ID,
      user_id: USER_ID,
      session_date: '2026-03-10',
      entries: [
        {
          record_id: 'rec-1',
          previous_status: 'present',
          student_id: 'stu-1',
          session_id: 'sess-1',
        },
      ],
    });
    mockRedisClient.get.mockResolvedValue(payload);
    (mockRlsTx.attendanceSession.findFirst as jest.Mock).mockResolvedValue({ id: 'sess-1' });

    const result = await service.undoUpload(TENANT_ID, USER_ID, 'batch-1');

    expect(result.reverted).toBe(1);
    expect(mockRlsTx.attendanceRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rec-1' },
        data: expect.objectContaining({ status: 'present', amended_from_status: null }),
      }),
    );
    expect(mockRedisClient.del).toHaveBeenCalledWith('attendance:undo:batch-1');
  });
});

// ─── CSV parsing (via processUpload) ────────────────────────────────────────

describe('AttendanceUploadService — CSV parsing', () => {
  let service: AttendanceUploadService;
  let mockAcademicReadFacade: { findCurrentYearId: jest.Mock };
  let mockStudentReadFacade: { findAllStudentNumbers: jest.Mock };
  let mockClassesReadFacade: {
    findActiveHomeroomClasses: jest.Mock;
    findEnrolledStudentsWithNumber: jest.Mock;
  };
  let mockSettings: { getSettings: jest.Mock };

  beforeEach(async () => {
    mockAcademicReadFacade = {
      findCurrentYearId: jest.fn(),
    };
    mockStudentReadFacade = {
      findAllStudentNumbers: jest.fn(),
    };
    mockClassesReadFacade = {
      findActiveHomeroomClasses: jest.fn(),
      findEnrolledStudentsWithNumber: jest.fn(),
    };
    mockSettings = {
      getSettings: jest.fn().mockResolvedValue({
        attendance: { workDays: [0, 1, 2, 3, 4, 5, 6] },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: buildBaseProviders({
        settings: mockSettings,
        academicReadFacade: mockAcademicReadFacade,
        studentReadFacade: mockStudentReadFacade,
        classesReadFacade: mockClassesReadFacade,
      }),
    }).compile();

    service = module.get<AttendanceUploadService>(AttendanceUploadService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return validation failure when a student_number is not found', async () => {
    mockAcademicReadFacade.findCurrentYearId.mockResolvedValue('ay-1');
    mockStudentReadFacade.findAllStudentNumbers.mockResolvedValue([]);
    mockClassesReadFacade.findActiveHomeroomClasses.mockResolvedValue([
      { id: 'cls-1', name: 'Grade 1A' },
    ]);

    const csv = buildCsvBuffer(['STU999,John Doe,Grade 1A,P']);
    const result = await service.processUpload(
      TENANT_ID,
      USER_ID,
      csv,
      'attendance.csv',
      '2026-03-10',
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({ field: 'student_number' });
    }
  });

  it('should throw BadRequestException for unsupported file extension', async () => {
    const buf = Buffer.from('data');
    await expect(
      service.processUpload(TENANT_ID, USER_ID, buf, 'attendance.pdf', '2026-03-10'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should return validation failure for an invalid status code', async () => {
    mockAcademicReadFacade.findCurrentYearId.mockResolvedValue('ay-1');
    mockStudentReadFacade.findAllStudentNumbers.mockResolvedValue([
      { id: 'stu-1', student_number: 'STU001' },
    ]);
    mockClassesReadFacade.findActiveHomeroomClasses.mockResolvedValue([
      { id: 'cls-1', name: 'Grade 1A' },
    ]);

    const csv = buildCsvBuffer(['STU001,John Doe,Grade 1A,X']);
    const result = await service.processUpload(
      TENANT_ID,
      USER_ID,
      csv,
      'attendance.csv',
      '2026-03-10',
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0]).toMatchObject({ field: 'status' });
    }
  });
});
