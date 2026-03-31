import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolClosuresService } from '../school-closures/school-closures.service';

import { AttendanceLockingService } from './attendance-locking.service';
import { AttendanceParentNotificationService } from './attendance-parent-notification.service';
import { AttendanceReportingService } from './attendance-reporting.service';
import { AttendanceSessionService } from './attendance-session.service';
import { AttendanceService } from './attendance.service';
import { DailySummaryService } from './daily-summary.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SESSION_ID = 'session-1';
const USER_ID = 'user-1';
const CLASS_ID = 'class-1';

// Mock the RLS middleware
const mockRlsTx = {
  attendanceSession: {
    update: jest.fn(),
    updateMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  attendanceRecord: {
    createMany: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helper: build a full testing module ─────────────────────────────────────

function buildModule(mockPrisma: object, overrides: Record<string, object> = {}) {
  return Test.createTestingModule({
    providers: [
      AttendanceService,
      AttendanceSessionService,
      AttendanceLockingService,
      AttendanceReportingService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: SchoolClosuresService, useValue: overrides['SchoolClosuresService'] ?? {} },
      {
        provide: DailySummaryService,
        useValue: overrides['DailySummaryService'] ?? {
          recalculate: jest.fn().mockResolvedValue(null),
        },
      },
      {
        provide: SettingsService,
        useValue: overrides['SettingsService'] ?? {
          getSettings: jest.fn().mockResolvedValue({
            attendance: { workDays: [1, 2, 3, 4, 5], defaultPresentEnabled: false },
          }),
        },
      },
      {
        provide: AttendanceParentNotificationService,
        useValue: overrides['AttendanceParentNotificationService'] ?? {
          triggerAbsenceNotification: jest.fn(),
        },
      },
    ],
  }).compile();
}

// ─── State machine tests ──────────────────────────────────────────────────────

describe('AttendanceService — state machine', () => {
  let service: AttendanceService;
  let mockPrisma: {
    attendanceSession: { findFirst: jest.Mock };
    attendanceRecord: { findMany: jest.Mock };
    tenantSetting: { findFirst: jest.Mock };
  };
  let mockDailySummary: { recalculate: jest.Mock };
  let mockSettings: { getSettings: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      attendanceSession: { findFirst: jest.fn() },
      attendanceRecord: { findMany: jest.fn().mockResolvedValue([]) },
      tenantSetting: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    mockDailySummary = { recalculate: jest.fn().mockResolvedValue(null) };
    mockSettings = {
      getSettings: jest.fn().mockResolvedValue({
        attendance: {
          workDays: [1, 2, 3, 4, 5],
          defaultPresentEnabled: false,
        },
      }),
    };

    mockRlsTx.attendanceSession.update.mockReset();
    mockRlsTx.attendanceSession.update.mockResolvedValue({
      id: SESSION_ID,
      status: 'updated',
    });
    mockRlsTx.attendanceSession.updateMany.mockReset();
    mockRlsTx.attendanceSession.updateMany.mockResolvedValue({ count: 1 });

    const module: TestingModule = await buildModule(mockPrisma, {
      DailySummaryService: mockDailySummary,
      SettingsService: mockSettings,
    });

    service = module.get<AttendanceService>(AttendanceService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── 1. open -> submitted (submitSession) ──────────────────────────────
  it('should allow open -> submitted (submitSession)', async () => {
    mockPrisma.attendanceSession.findFirst.mockResolvedValue({
      id: SESSION_ID,
      status: 'open',
      session_date: new Date('2026-03-10'),
    });
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);

    await service.submitSession(TENANT_ID, SESSION_ID, USER_ID);

    expect(mockRlsTx.attendanceSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SESSION_ID },
        data: expect.objectContaining({ status: 'submitted' }),
      }),
    );
  });

  // ─── 2. open -> cancelled (cancelSession) ─────────────────────────────
  it('should allow open -> cancelled (cancelSession)', async () => {
    mockPrisma.attendanceSession.findFirst.mockResolvedValue({
      id: SESSION_ID,
      status: 'open',
    });

    await service.cancelSession(TENANT_ID, SESSION_ID);

    expect(mockRlsTx.attendanceSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SESSION_ID },
        data: { status: 'cancelled' },
      }),
    );
  });

  // ─── 3. submitted -> locked (lockExpiredSessions) ─────────────────────
  it('should allow submitted -> locked (lockExpiredSessions)', async () => {
    mockPrisma.tenantSetting.findFirst.mockResolvedValue({
      settings: { attendance: { autoLockAfterDays: 7 } },
    });

    await service.lockExpiredSessions(TENANT_ID);

    expect(mockRlsTx.attendanceSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          status: 'submitted',
        }),
        data: { status: 'locked' },
      }),
    );
  });

  // ─── 4. submitted -> open blocked (cancelSession rejects non-open) ────
  it('should block submitted -> open (cancelSession rejects non-open)', async () => {
    mockPrisma.attendanceSession.findFirst.mockResolvedValue({
      id: SESSION_ID,
      status: 'submitted',
    });

    await expect(service.cancelSession(TENANT_ID, SESSION_ID)).rejects.toThrow(ConflictException);
  });

  // ─── 5. locked -> any state blocked ────────────────────────────────────
  it('should block locked -> any state (cancelSession and submitSession reject locked)', async () => {
    // cancelSession with locked session
    mockPrisma.attendanceSession.findFirst.mockResolvedValue({
      id: SESSION_ID,
      status: 'locked',
    });

    await expect(service.cancelSession(TENANT_ID, SESSION_ID)).rejects.toThrow(ConflictException);

    // submitSession with locked session
    mockPrisma.attendanceSession.findFirst.mockResolvedValue({
      id: SESSION_ID,
      status: 'locked',
      session_date: new Date('2026-03-10'),
    });

    await expect(service.submitSession(TENANT_ID, SESSION_ID, USER_ID)).rejects.toThrow(
      ConflictException,
    );
  });

  // ─── 6. cancelled -> any state blocked ─────────────────────────────────
  it('should block cancelled -> any state (submitSession and cancelSession reject cancelled)', async () => {
    // submitSession with cancelled session
    mockPrisma.attendanceSession.findFirst.mockResolvedValue({
      id: SESSION_ID,
      status: 'cancelled',
      session_date: new Date('2026-03-10'),
    });

    await expect(service.submitSession(TENANT_ID, SESSION_ID, USER_ID)).rejects.toThrow(
      ConflictException,
    );

    // cancelSession with cancelled session
    mockPrisma.attendanceSession.findFirst.mockResolvedValue({
      id: SESSION_ID,
      status: 'cancelled',
    });

    await expect(service.cancelSession(TENANT_ID, SESSION_ID)).rejects.toThrow(ConflictException);
  });
});

// ─── createDefaultPresentRecords tests ───────────────────────────────────────

describe('AttendanceService — createDefaultPresentRecords', () => {
  let service: AttendanceService;
  let mockPrisma: {
    classEnrolment: { findMany: jest.Mock };
    attendanceSession: { findFirst: jest.Mock };
    attendanceRecord: { findMany: jest.Mock };
    tenantSetting: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      classEnrolment: { findMany: jest.fn() },
      attendanceSession: { findFirst: jest.fn() },
      attendanceRecord: { findMany: jest.fn().mockResolvedValue([]) },
      tenantSetting: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    mockRlsTx.attendanceRecord.createMany.mockReset();
    mockRlsTx.attendanceRecord.createMany.mockResolvedValue({ count: 3 });

    const module: TestingModule = await buildModule(mockPrisma);

    service = module.get<AttendanceService>(AttendanceService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create present records for all enrolled students', async () => {
    const enrolledStudents = [
      { student_id: 'student-1' },
      { student_id: 'student-2' },
      { student_id: 'student-3' },
    ];
    mockPrisma.classEnrolment.findMany.mockResolvedValue(enrolledStudents);

    const count = await service.createDefaultPresentRecords(
      TENANT_ID,
      SESSION_ID,
      CLASS_ID,
      USER_ID,
    );

    expect(count).toBe(3);
    expect(mockPrisma.classEnrolment.findMany).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        class_id: CLASS_ID,
        status: 'active',
      },
      select: { student_id: true },
    });
    expect(mockRlsTx.attendanceRecord.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          tenant_id: TENANT_ID,
          attendance_session_id: SESSION_ID,
          student_id: 'student-1',
          status: 'present',
          marked_by_user_id: USER_ID,
        }),
        expect.objectContaining({
          tenant_id: TENANT_ID,
          attendance_session_id: SESSION_ID,
          student_id: 'student-2',
          status: 'present',
          marked_by_user_id: USER_ID,
        }),
        expect.objectContaining({
          tenant_id: TENANT_ID,
          attendance_session_id: SESSION_ID,
          student_id: 'student-3',
          status: 'present',
          marked_by_user_id: USER_ID,
        }),
      ]),
      skipDuplicates: true,
    });
  });

  it('should return 0 and skip createMany when no students are enrolled', async () => {
    mockPrisma.classEnrolment.findMany.mockResolvedValue([]);

    const count = await service.createDefaultPresentRecords(
      TENANT_ID,
      SESSION_ID,
      CLASS_ID,
      USER_ID,
    );

    expect(count).toBe(0);
    expect(mockRlsTx.attendanceRecord.createMany).not.toHaveBeenCalled();
  });

  it('should use skipDuplicates to handle concurrent inserts', async () => {
    mockPrisma.classEnrolment.findMany.mockResolvedValue([{ student_id: 'student-1' }]);
    mockRlsTx.attendanceRecord.createMany.mockResolvedValue({ count: 0 });

    const count = await service.createDefaultPresentRecords(
      TENANT_ID,
      SESSION_ID,
      CLASS_ID,
      USER_ID,
    );

    expect(count).toBe(0);
    expect(mockRlsTx.attendanceRecord.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });
});

// ─── createSession default_present tests ─────────────────────────────────────

describe('AttendanceService — createSession default_present', () => {
  let service: AttendanceService;
  let mockPrisma: {
    class: { findFirst: jest.Mock };
    classStaff: { findFirst: jest.Mock };
    classEnrolment: { findMany: jest.Mock };
    attendanceSession: { findFirst: jest.Mock };
    attendanceRecord: { findMany: jest.Mock };
    tenantSetting: { findFirst: jest.Mock };
  };
  let mockSettings: { getSettings: jest.Mock };
  let mockClosures: { isClosureDate: jest.Mock };

  const baseClass = {
    id: CLASS_ID,
    academic_year_id: 'ay-1',
    year_group_id: null,
    academic_year: {
      start_date: new Date('2025-09-01'),
      end_date: new Date('2026-06-30'),
    },
  };

  const baseDto = {
    class_id: CLASS_ID,
    session_date: '2026-03-10', // Tuesday
  };

  const createdSession = {
    id: SESSION_ID,
    tenant_id: TENANT_ID,
    class_id: CLASS_ID,
    session_date: new Date('2026-03-10'),
    status: 'open',
    default_present: null,
  };

  beforeEach(async () => {
    mockPrisma = {
      class: { findFirst: jest.fn().mockResolvedValue(baseClass) },
      classStaff: { findFirst: jest.fn() },
      classEnrolment: { findMany: jest.fn().mockResolvedValue([]) },
      attendanceSession: { findFirst: jest.fn() },
      attendanceRecord: { findMany: jest.fn().mockResolvedValue([]) },
      tenantSetting: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    mockSettings = {
      getSettings: jest.fn().mockResolvedValue({
        attendance: {
          workDays: [0, 1, 2, 3, 4, 5, 6],
          defaultPresentEnabled: false,
        },
      }),
    };

    mockClosures = { isClosureDate: jest.fn().mockResolvedValue(false) };

    // Reset RLS tx mocks
    mockRlsTx.attendanceSession.findFirst.mockReset();
    mockRlsTx.attendanceSession.findFirst.mockResolvedValue(null); // No existing session
    mockRlsTx.attendanceSession.create.mockReset();
    mockRlsTx.attendanceSession.create.mockResolvedValue(createdSession);
    mockRlsTx.attendanceRecord.createMany.mockReset();
    mockRlsTx.attendanceRecord.createMany.mockResolvedValue({ count: 0 });

    const module: TestingModule = await buildModule(mockPrisma, {
      SchoolClosuresService: mockClosures,
      SettingsService: mockSettings,
    });

    service = module.get<AttendanceService>(AttendanceService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call createDefaultPresentRecords when dto.default_present is true', async () => {
    const enrolledStudents = [{ student_id: 'student-1' }, { student_id: 'student-2' }];
    mockPrisma.classEnrolment.findMany.mockResolvedValue(enrolledStudents);
    mockRlsTx.attendanceRecord.createMany.mockResolvedValue({ count: 2 });

    await service.createSession(TENANT_ID, USER_ID, { ...baseDto, default_present: true }, [
      'attendance.manage',
    ]);

    // Session should be created with default_present: true
    expect(mockRlsTx.attendanceSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          default_present: true,
        }),
      }),
    );

    // Should have created present records
    expect(mockRlsTx.attendanceRecord.createMany).toHaveBeenCalled();
  });

  it('should NOT call createDefaultPresentRecords when dto.default_present is false', async () => {
    await service.createSession(TENANT_ID, USER_ID, { ...baseDto, default_present: false }, [
      'attendance.manage',
    ]);

    expect(mockRlsTx.attendanceSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          default_present: false,
        }),
      }),
    );

    expect(mockRlsTx.attendanceRecord.createMany).not.toHaveBeenCalled();
  });

  it('should fall back to tenant settings when dto.default_present is undefined', async () => {
    mockSettings.getSettings.mockResolvedValue({
      attendance: {
        workDays: [0, 1, 2, 3, 4, 5, 6],
        defaultPresentEnabled: true,
      },
    });
    mockPrisma.classEnrolment.findMany.mockResolvedValue([{ student_id: 'student-1' }]);
    mockRlsTx.attendanceRecord.createMany.mockResolvedValue({ count: 1 });

    await service.createSession(TENANT_ID, USER_ID, baseDto, ['attendance.manage']);

    // Session should be created with default_present: true (from tenant settings)
    expect(mockRlsTx.attendanceSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          default_present: true,
        }),
      }),
    );

    // Should have created present records
    expect(mockRlsTx.attendanceRecord.createMany).toHaveBeenCalled();
  });

  it('should store null when tenant setting is false and dto.default_present is undefined', async () => {
    mockSettings.getSettings.mockResolvedValue({
      attendance: {
        workDays: [0, 1, 2, 3, 4, 5, 6],
        defaultPresentEnabled: false,
      },
    });

    await service.createSession(TENANT_ID, USER_ID, baseDto, ['attendance.manage']);

    expect(mockRlsTx.attendanceSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          default_present: null,
        }),
      }),
    );

    expect(mockRlsTx.attendanceRecord.createMany).not.toHaveBeenCalled();
  });

  it('should NOT create records when session already exists', async () => {
    // Simulate existing session found inside transaction
    mockRlsTx.attendanceSession.findFirst.mockResolvedValue({
      id: 'existing-session',
      tenant_id: TENANT_ID,
      class_id: CLASS_ID,
      status: 'open',
    });

    await service.createSession(TENANT_ID, USER_ID, { ...baseDto, default_present: true }, [
      'attendance.manage',
    ]);

    // create should NOT have been called since the session already existed
    expect(mockRlsTx.attendanceSession.create).not.toHaveBeenCalled();
    // Should NOT create attendance records for an existing session
    expect(mockRlsTx.attendanceRecord.createMany).not.toHaveBeenCalled();
  });
});
