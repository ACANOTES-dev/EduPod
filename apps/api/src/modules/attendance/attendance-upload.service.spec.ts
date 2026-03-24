import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

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
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockRlsTx),
      ),
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
  const csv = [
    'student_number,student_name,class_name,status',
    ...rows,
  ].join('\n');
  return Buffer.from(csv, 'utf-8');
}

describe('AttendanceUploadService — parseQuickMarkText', () => {
  let service: AttendanceUploadService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceUploadService,
        { provide: PrismaService, useValue: {} },
        { provide: SettingsService, useValue: {} },
        { provide: DailySummaryService, useValue: {} },
        { provide: RedisService, useValue: { getClient: () => mockRedisClient } },
        {
          provide: AttendanceParentNotificationService,
          useValue: { triggerAbsenceNotification: jest.fn() },
        },
      ],
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
  let mockPrisma: {
    student: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      student: { findMany: jest.fn() },
    };

    mockRlsTx.attendanceRecord.findMany = jest.fn();
    mockRlsTx.attendanceRecord.update = jest.fn().mockResolvedValue({});
    mockRedisClient.set.mockResolvedValue('OK');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceUploadService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: {} },
        {
          provide: DailySummaryService,
          useValue: { recalculate: jest.fn().mockResolvedValue(null) },
        },
        { provide: RedisService, useValue: { getClient: () => mockRedisClient } },
        {
          provide: AttendanceParentNotificationService,
          useValue: { triggerAbsenceNotification: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<AttendanceUploadService>(AttendanceUploadService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should reject an invalid date string', async () => {
    mockPrisma.student.findMany.mockResolvedValue([]);

    await expect(
      service.processExceptionsUpload(TENANT_ID, USER_ID, 'not-a-date', []),
    ).rejects.toThrow(BadRequestException);
  });

  it('should record an error row when student_number is not found', async () => {
    mockPrisma.student.findMany.mockResolvedValue([]);

    const result = await service.processExceptionsUpload(
      TENANT_ID,
      USER_ID,
      '2026-03-10',
      [{ student_number: 'UNKNOWN', status: 'absent_unexcused' }],
    );

    expect(result.success).toBe(false);
    expect(result.updated).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ row: 1 });
  });

  it('should record an error row for an invalid exception status', async () => {
    mockPrisma.student.findMany.mockResolvedValue([
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
    mockPrisma.student.findMany.mockResolvedValue([
      { id: 'stu-1', student_number: 'STU001' },
    ]);
    (mockRlsTx.attendanceRecord.findMany as jest.Mock).mockResolvedValue([
      { id: 'rec-1', status: 'present', attendance_session_id: 'sess-1' },
    ]);

    const result = await service.processExceptionsUpload(
      TENANT_ID,
      USER_ID,
      '2026-03-10',
      [{ student_number: 'STU001', status: 'absent_unexcused' }],
    );

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
    mockPrisma.student.findMany.mockResolvedValue([
      { id: 'stu-1', student_number: 'STU001' },
    ]);
    (mockRlsTx.attendanceRecord.findMany as jest.Mock)
      .mockResolvedValueOnce([]) // no records for STU001 → error
    ;

    const result = await service.processExceptionsUpload(
      TENANT_ID,
      USER_ID,
      '2026-03-10',
      [{ student_number: 'STU001', status: 'absent_unexcused' }],
    );

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
  });
});

// ─── undoUpload ─────────────────────────────────────────────────────────────

describe('AttendanceUploadService — undoUpload', () => {
  let service: AttendanceUploadService;

  beforeEach(async () => {
    mockRlsTx.attendanceSession.findFirst = jest.fn();
    mockRlsTx.attendanceRecord.update = jest.fn().mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceUploadService,
        { provide: PrismaService, useValue: { student: { findMany: jest.fn() } } },
        { provide: SettingsService, useValue: {} },
        {
          provide: DailySummaryService,
          useValue: { recalculate: jest.fn().mockResolvedValue(null) },
        },
        { provide: RedisService, useValue: { getClient: () => mockRedisClient } },
        {
          provide: AttendanceParentNotificationService,
          useValue: { triggerAbsenceNotification: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AttendanceUploadService>(AttendanceUploadService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw BadRequestException when batch_id does not exist in Redis', async () => {
    mockRedisClient.get.mockResolvedValue(null);

    await expect(
      service.undoUpload(TENANT_ID, USER_ID, 'nonexistent-batch'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when tenant_id does not match', async () => {
    const payload = JSON.stringify({
      tenant_id: 'other-tenant',
      user_id: USER_ID,
      entries: [],
      session_date: '2026-03-10',
    });
    mockRedisClient.get.mockResolvedValue(payload);

    await expect(
      service.undoUpload(TENANT_ID, USER_ID, 'batch-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when user_id does not match', async () => {
    const payload = JSON.stringify({
      tenant_id: TENANT_ID,
      user_id: 'different-user',
      entries: [],
      session_date: '2026-03-10',
    });
    mockRedisClient.get.mockResolvedValue(payload);

    await expect(
      service.undoUpload(TENANT_ID, USER_ID, 'batch-1'),
    ).rejects.toThrow(BadRequestException);
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
  let mockPrisma: {
    academicYear: { findFirst: jest.Mock };
    student: { findMany: jest.Mock };
    class: { findMany: jest.Mock };
  };
  let mockSettings: { getSettings: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      academicYear: { findFirst: jest.fn() },
      student: { findMany: jest.fn() },
      class: { findMany: jest.fn() },
    };

    mockSettings = {
      getSettings: jest.fn().mockResolvedValue({
        attendance: { workDays: [0, 1, 2, 3, 4, 5, 6] },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceUploadService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettings },
        {
          provide: DailySummaryService,
          useValue: { recalculate: jest.fn().mockResolvedValue(null) },
        },
        { provide: RedisService, useValue: { getClient: () => mockRedisClient } },
        {
          provide: AttendanceParentNotificationService,
          useValue: { triggerAbsenceNotification: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AttendanceUploadService>(AttendanceUploadService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return validation failure when a student_number is not found', async () => {
    mockPrisma.academicYear.findFirst.mockResolvedValue({ id: 'ay-1' });
    mockPrisma.student.findMany.mockResolvedValue([]);
    mockPrisma.class.findMany.mockResolvedValue([{ id: 'cls-1', name: 'Grade 1A' }]);

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
    mockPrisma.academicYear.findFirst.mockResolvedValue({ id: 'ay-1' });
    mockPrisma.student.findMany.mockResolvedValue([]);
    mockPrisma.class.findMany.mockResolvedValue([]);

    const buf = Buffer.from('data');
    await expect(
      service.processUpload(TENANT_ID, USER_ID, buf, 'attendance.pdf', '2026-03-10'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should return validation failure for an invalid status code', async () => {
    mockPrisma.academicYear.findFirst.mockResolvedValue({ id: 'ay-1' });
    mockPrisma.student.findMany.mockResolvedValue([
      { id: 'stu-1', student_number: 'STU001' },
    ]);
    mockPrisma.class.findMany.mockResolvedValue([{ id: 'cls-1', name: 'Grade 1A' }]);

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
