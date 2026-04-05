import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  ClassesReadFacade,
  ConfigurationReadFacade,
} from '../../common/tests/mock-facades';
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
      ...MOCK_FACADE_PROVIDERS,
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
      {
        provide: ConfigurationReadFacade,
        useValue: overrides['ConfigurationReadFacade'] ?? {
          findSettingsJson: jest.fn().mockResolvedValue(null),
        },
      },
      ...(overrides['ClassesReadFacade']
        ? [{ provide: ClassesReadFacade, useValue: overrides['ClassesReadFacade'] }]
        : []),
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
  let mockConfigFacade: { findSettingsJson: jest.Mock };

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
    mockConfigFacade = { findSettingsJson: jest.fn().mockResolvedValue(null) };

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
      ConfigurationReadFacade: mockConfigFacade,
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
    mockConfigFacade.findSettingsJson.mockResolvedValue({ attendance: { autoLockAfterDays: 7 } });

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
  let mockClassesFacadeDP: { findEnrolledStudentIds: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      classEnrolment: { findMany: jest.fn() },
      attendanceSession: { findFirst: jest.fn() },
      attendanceRecord: { findMany: jest.fn().mockResolvedValue([]) },
      tenantSetting: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    mockClassesFacadeDP = { findEnrolledStudentIds: jest.fn().mockResolvedValue([]) };

    mockRlsTx.attendanceRecord.createMany.mockReset();
    mockRlsTx.attendanceRecord.createMany.mockResolvedValue({ count: 3 });

    const module: TestingModule = await buildModule(mockPrisma, {
      ClassesReadFacade: mockClassesFacadeDP,
    });

    service = module.get<AttendanceService>(AttendanceService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create present records for all enrolled students', async () => {
    mockClassesFacadeDP.findEnrolledStudentIds.mockResolvedValue([
      'student-1',
      'student-2',
      'student-3',
    ]);

    const count = await service.createDefaultPresentRecords(
      TENANT_ID,
      SESSION_ID,
      CLASS_ID,
      USER_ID,
    );

    expect(count).toBe(3);
    expect(mockClassesFacadeDP.findEnrolledStudentIds).toHaveBeenCalledWith(TENANT_ID, CLASS_ID);
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
    mockClassesFacadeDP.findEnrolledStudentIds.mockResolvedValue([]);

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
    mockClassesFacadeDP.findEnrolledStudentIds.mockResolvedValue(['student-1']);
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
  let mockClassesFacadeDP2: {
    findByIdWithAcademicYear: jest.Mock;
    isStaffAssignedToClass: jest.Mock;
    findEnrolledStudentIds: jest.Mock;
  };

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
    mockClassesFacadeDP2 = {
      findByIdWithAcademicYear: jest.fn().mockResolvedValue(baseClass),
      isStaffAssignedToClass: jest.fn().mockResolvedValue(true),
      findEnrolledStudentIds: jest.fn().mockResolvedValue([]),
    };

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
      ClassesReadFacade: mockClassesFacadeDP2,
    });

    service = module.get<AttendanceService>(AttendanceService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call createDefaultPresentRecords when dto.default_present is true', async () => {
    mockClassesFacadeDP2.findEnrolledStudentIds.mockResolvedValue(['student-1', 'student-2']);
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
    mockClassesFacadeDP2.findEnrolledStudentIds.mockResolvedValue(['student-1']);
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

// ─── P1: Session generation — creation, idempotency, work-day validation, academic year boundaries ───

describe('AttendanceService — createSession validation', () => {
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
          workDays: [1, 2, 3, 4, 5], // Mon–Fri
          defaultPresentEnabled: false,
        },
      }),
    };

    mockClosures = { isClosureDate: jest.fn().mockResolvedValue(false) };

    mockRlsTx.attendanceSession.findFirst.mockReset();
    mockRlsTx.attendanceSession.findFirst.mockResolvedValue(null);
    mockRlsTx.attendanceSession.create.mockReset();
    mockRlsTx.attendanceSession.create.mockResolvedValue({
      id: SESSION_ID,
      tenant_id: TENANT_ID,
      class_id: CLASS_ID,
      session_date: new Date('2026-03-10'),
      status: 'open',
    });
    mockRlsTx.attendanceRecord.createMany.mockReset();
    mockRlsTx.attendanceRecord.createMany.mockResolvedValue({ count: 0 });

    const mockClassesFacadeValidation = {
      findByIdWithAcademicYear: jest.fn().mockResolvedValue(baseClass),
      isStaffAssignedToClass: jest.fn().mockResolvedValue(true),
      findEnrolledStudentIds: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AttendanceService,
        AttendanceSessionService,
        AttendanceLockingService,
        AttendanceReportingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SchoolClosuresService, useValue: mockClosures },
        { provide: DailySummaryService, useValue: {} },
        { provide: SettingsService, useValue: mockSettings },
        {
          provide: AttendanceParentNotificationService,
          useValue: { triggerAbsenceNotification: jest.fn() },
        },
        { provide: ClassesReadFacade, useValue: mockClassesFacadeValidation },
        {
          provide: ConfigurationReadFacade,
          useValue: { findSettingsJson: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);

    // Store the mock for test manipulation
    (service as unknown as Record<string, unknown>).__classesReadFacade =
      mockClassesFacadeValidation;
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when class does not exist', async () => {
    (
      service as unknown as Record<string, Record<string, jest.Mock>>
    ).__classesReadFacade!.findByIdWithAcademicYear!.mockResolvedValue(null);

    await expect(
      service.createSession(
        TENANT_ID,
        USER_ID,
        { class_id: 'non-existent', session_date: '2026-03-10' },
        ['attendance.manage'],
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when session_date is not a work day (Saturday)', async () => {
    // 2026-03-14 is a Saturday (day 6), workDays=[1,2,3,4,5]
    await expect(
      service.createSession(
        TENANT_ID,
        USER_ID,
        { class_id: CLASS_ID, session_date: '2026-03-14' },
        ['attendance.manage'],
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when session_date is not a work day (Sunday)', async () => {
    // 2026-03-15 is a Sunday (day 0), workDays=[1,2,3,4,5]
    await expect(
      service.createSession(
        TENANT_ID,
        USER_ID,
        { class_id: CLASS_ID, session_date: '2026-03-15' },
        ['attendance.manage'],
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when session_date is before academic year start', async () => {
    // Academic year starts 2025-09-01, try 2025-08-01 (Friday = day 5, valid work day)
    await expect(
      service.createSession(
        TENANT_ID,
        USER_ID,
        { class_id: CLASS_ID, session_date: '2025-08-01' },
        ['attendance.manage'],
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when session_date is after academic year end', async () => {
    // Academic year ends 2026-06-30, try 2026-07-06 (Monday = day 1, valid work day)
    await expect(
      service.createSession(
        TENANT_ID,
        USER_ID,
        { class_id: CLASS_ID, session_date: '2026-07-06' },
        ['attendance.manage'],
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw ConflictException when session_date falls on a school closure (without override)', async () => {
    mockClosures.isClosureDate.mockResolvedValue(true);

    await expect(
      service.createSession(
        TENANT_ID,
        USER_ID,
        { class_id: CLASS_ID, session_date: '2026-03-10' },
        ['attendance.manage'],
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw ForbiddenException when override_closure is true but user lacks permission', async () => {
    mockClosures.isClosureDate.mockResolvedValue(true);

    await expect(
      service.createSession(
        TENANT_ID,
        USER_ID,
        {
          class_id: CLASS_ID,
          session_date: '2026-03-10',
          override_closure: true,
          override_reason: 'make-up day',
        },
        ['attendance.manage'], // no attendance.override_closure
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should throw BadRequestException when override_closure is true but override_reason is missing', async () => {
    mockClosures.isClosureDate.mockResolvedValue(true);

    await expect(
      service.createSession(
        TENANT_ID,
        USER_ID,
        { class_id: CLASS_ID, session_date: '2026-03-10', override_closure: true },
        ['attendance.manage', 'attendance.override_closure'],
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should create session successfully when override_closure is valid with reason and permission', async () => {
    mockClosures.isClosureDate.mockResolvedValue(true);

    await service.createSession(
      TENANT_ID,
      USER_ID,
      {
        class_id: CLASS_ID,
        session_date: '2026-03-10',
        override_closure: true,
        override_reason: 'Make-up day',
      },
      ['attendance.manage', 'attendance.override_closure'],
    );

    expect(mockRlsTx.attendanceSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          override_reason: 'Make-up day',
          status: 'open',
        }),
      }),
    );
  });

  it('should succeed for a valid work day within academic year', async () => {
    // 2026-03-10 is a Tuesday (day 2), within academic year
    await service.createSession(
      TENANT_ID,
      USER_ID,
      { class_id: CLASS_ID, session_date: '2026-03-10' },
      ['attendance.manage'],
    );

    expect(mockRlsTx.attendanceSession.create).toHaveBeenCalled();
  });

  it('edge: should accept the exact academic year start date', async () => {
    // 2025-09-01 is Monday (day 1), valid work day, start of academic year
    await service.createSession(
      TENANT_ID,
      USER_ID,
      { class_id: CLASS_ID, session_date: '2025-09-01' },
      ['attendance.manage'],
    );

    expect(mockRlsTx.attendanceSession.create).toHaveBeenCalled();
  });

  it('edge: should accept the exact academic year end date if work day', async () => {
    // 2026-06-30 is Tuesday (day 2), valid work day, end of academic year
    await service.createSession(
      TENANT_ID,
      USER_ID,
      { class_id: CLASS_ID, session_date: '2026-06-30' },
      ['attendance.manage'],
    );

    expect(mockRlsTx.attendanceSession.create).toHaveBeenCalled();
  });
});

// ─── P2: Mark/amend attendance — saveRecords, amendRecord, student enrollment validation ───

describe('AttendanceService — saveRecords', () => {
  let service: AttendanceService;
  let mockPrisma: {
    attendanceSession: { findFirst: jest.Mock };
    classEnrolment: { findMany: jest.Mock };
    attendanceRecord: { findMany: jest.Mock };
    tenantSetting: { findFirst: jest.Mock };
  };
  let mockDailySummary: { recalculate: jest.Mock };
  let mockParentNotification: { triggerAbsenceNotification: jest.Mock };

  const mockRlsRecordFindFirst = jest.fn();
  const mockRlsRecordCreate = jest.fn();
  const mockRlsRecordUpdate = jest.fn();

  beforeEach(async () => {
    mockPrisma = {
      attendanceSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: SESSION_ID,
          status: 'open',
          class_id: CLASS_ID,
          session_date: new Date('2026-03-10'),
        }),
      },
      classEnrolment: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ student_id: 'student-1' }, { student_id: 'student-2' }]),
      },
      attendanceRecord: { findMany: jest.fn().mockResolvedValue([]) },
      tenantSetting: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    mockDailySummary = { recalculate: jest.fn().mockResolvedValue(null) };
    mockParentNotification = { triggerAbsenceNotification: jest.fn().mockResolvedValue(undefined) };

    // For saveRecords, the RLS transaction delegates to a loop of findFirst/create/update
    // We need to mock the transaction to expose these inner operations
    mockRlsRecordFindFirst.mockReset();
    mockRlsRecordCreate.mockReset();
    mockRlsRecordUpdate.mockReset();

    // Override the global mockRlsTx to add attendanceRecord methods for the transaction
    mockRlsTx.attendanceRecord.createMany.mockReset();

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          attendanceSession: mockRlsTx.attendanceSession,
          attendanceRecord: {
            findFirst: mockRlsRecordFindFirst,
            create: mockRlsRecordCreate,
            update: mockRlsRecordUpdate,
            createMany: mockRlsTx.attendanceRecord.createMany,
          },
        });
      }),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AttendanceService,
        AttendanceSessionService,
        AttendanceLockingService,
        AttendanceReportingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SchoolClosuresService, useValue: {} },
        { provide: DailySummaryService, useValue: mockDailySummary },
        { provide: SettingsService, useValue: { getSettings: jest.fn() } },
        { provide: AttendanceParentNotificationService, useValue: mockParentNotification },
        {
          provide: ClassesReadFacade,
          useValue: {
            findEnrolledStudentIds: jest.fn().mockResolvedValue(['student-1', 'student-2']),
          },
        },
        {
          provide: ConfigurationReadFacade,
          useValue: { findSettingsJson: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when session does not exist', async () => {
    mockPrisma.attendanceSession.findFirst.mockResolvedValue(null);

    await expect(
      service.saveRecords(TENANT_ID, SESSION_ID, USER_ID, {
        records: [{ student_id: 'student-1', status: 'present' }],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException when session status is submitted', async () => {
    mockPrisma.attendanceSession.findFirst.mockResolvedValue({
      id: SESSION_ID,
      status: 'submitted',
      class_id: CLASS_ID,
      session_date: new Date('2026-03-10'),
    });

    await expect(
      service.saveRecords(TENANT_ID, SESSION_ID, USER_ID, {
        records: [{ student_id: 'student-1', status: 'present' }],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('edge: should throw ConflictException when session status is locked', async () => {
    mockPrisma.attendanceSession.findFirst.mockResolvedValue({
      id: SESSION_ID,
      status: 'locked',
      class_id: CLASS_ID,
      session_date: new Date('2026-03-10'),
    });

    await expect(
      service.saveRecords(TENANT_ID, SESSION_ID, USER_ID, {
        records: [{ student_id: 'student-1', status: 'present' }],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('edge: should throw ConflictException when session status is cancelled', async () => {
    mockPrisma.attendanceSession.findFirst.mockResolvedValue({
      id: SESSION_ID,
      status: 'cancelled',
      class_id: CLASS_ID,
      session_date: new Date('2026-03-10'),
    });

    await expect(
      service.saveRecords(TENANT_ID, SESSION_ID, USER_ID, {
        records: [{ student_id: 'student-1', status: 'present' }],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw BadRequestException when students are not enrolled in the class', async () => {
    mockPrisma.classEnrolment.findMany.mockResolvedValue([{ student_id: 'student-1' }]); // Only student-1 is enrolled

    await expect(
      service.saveRecords(TENANT_ID, SESSION_ID, USER_ID, {
        records: [
          { student_id: 'student-1', status: 'present' },
          { student_id: 'student-99', status: 'absent_unexcused' },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should create new records when none exist', async () => {
    mockRlsRecordFindFirst.mockResolvedValue(null); // No existing record
    mockRlsRecordCreate.mockResolvedValue({
      id: 'rec-1',
      student_id: 'student-1',
      status: 'present',
    });

    const result = await service.saveRecords(TENANT_ID, SESSION_ID, USER_ID, {
      records: [{ student_id: 'student-1', status: 'present' }],
    });

    expect(result.data).toHaveLength(1);
    expect(mockRlsRecordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          attendance_session_id: SESSION_ID,
          student_id: 'student-1',
          status: 'present',
          marked_by_user_id: USER_ID,
        }),
      }),
    );
  });

  it('should update existing records', async () => {
    mockRlsRecordFindFirst.mockResolvedValue({ id: 'existing-rec-1' });
    mockRlsRecordUpdate.mockResolvedValue({
      id: 'existing-rec-1',
      student_id: 'student-1',
      status: 'absent_excused',
    });

    const result = await service.saveRecords(TENANT_ID, SESSION_ID, USER_ID, {
      records: [{ student_id: 'student-1', status: 'absent_excused', reason: 'Doctor visit' }],
    });

    expect(result.data).toHaveLength(1);
    expect(mockRlsRecordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'existing-rec-1' },
        data: expect.objectContaining({
          status: 'absent_excused',
          reason: 'Doctor visit',
          marked_by_user_id: USER_ID,
        }),
      }),
    );
  });

  it('should trigger parent notification for non-present records', async () => {
    mockRlsRecordFindFirst.mockResolvedValue(null);
    mockRlsRecordCreate.mockResolvedValue({
      id: 'rec-1',
      student_id: 'student-1',
      status: 'absent_unexcused',
    });

    await service.saveRecords(TENANT_ID, SESSION_ID, USER_ID, {
      records: [{ student_id: 'student-1', status: 'absent_unexcused' }],
    });

    expect(mockParentNotification.triggerAbsenceNotification).toHaveBeenCalledWith(
      TENANT_ID,
      'student-1',
      'rec-1',
      'absent_unexcused',
      '2026-03-10',
    );
  });

  it('should not trigger parent notification for present records', async () => {
    mockRlsRecordFindFirst.mockResolvedValue(null);
    mockRlsRecordCreate.mockResolvedValue({
      id: 'rec-1',
      student_id: 'student-1',
      status: 'present',
    });

    await service.saveRecords(TENANT_ID, SESSION_ID, USER_ID, {
      records: [{ student_id: 'student-1', status: 'present' }],
    });

    expect(mockParentNotification.triggerAbsenceNotification).not.toHaveBeenCalled();
  });

  it('edge: should not fail when parent notification throws an error', async () => {
    mockRlsRecordFindFirst.mockResolvedValue(null);
    mockRlsRecordCreate.mockResolvedValue({
      id: 'rec-1',
      student_id: 'student-1',
      status: 'absent_unexcused',
    });
    // Notification throws — should be swallowed silently
    mockParentNotification.triggerAbsenceNotification.mockRejectedValue(
      new Error('Notification service down'),
    );

    const result = await service.saveRecords(TENANT_ID, SESSION_ID, USER_ID, {
      records: [{ student_id: 'student-1', status: 'absent_unexcused' }],
    });

    // Should still return the saved records despite notification failure
    expect(result.data).toHaveLength(1);
  });

  it('should set reason to null when no reason is provided', async () => {
    mockRlsRecordFindFirst.mockResolvedValue(null);
    mockRlsRecordCreate.mockResolvedValue({
      id: 'rec-1',
      student_id: 'student-1',
      status: 'present',
    });

    await service.saveRecords(TENANT_ID, SESSION_ID, USER_ID, {
      records: [{ student_id: 'student-1', status: 'present' }],
    });

    expect(mockRlsRecordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: null }),
      }),
    );
  });

  it('should handle multiple records with mixed create and update paths', async () => {
    // First record: existing -> update
    mockRlsRecordFindFirst
      .mockResolvedValueOnce({ id: 'existing-rec' })
      .mockResolvedValueOnce(null);
    mockRlsRecordUpdate.mockResolvedValue({
      id: 'existing-rec',
      student_id: 'student-1',
      status: 'late',
    });
    mockRlsRecordCreate.mockResolvedValue({
      id: 'new-rec',
      student_id: 'student-2',
      status: 'present',
    });

    const result = await service.saveRecords(TENANT_ID, SESSION_ID, USER_ID, {
      records: [
        { student_id: 'student-1', status: 'late' },
        { student_id: 'student-2', status: 'present' },
      ],
    });

    expect(result.data).toHaveLength(2);
    expect(mockRlsRecordUpdate).toHaveBeenCalledTimes(1);
    expect(mockRlsRecordCreate).toHaveBeenCalledTimes(1);
  });
});

describe('AttendanceService — amendRecord', () => {
  let service: AttendanceService;
  let mockPrisma: {
    attendanceRecord: { findFirst: jest.Mock; findMany: jest.Mock };
    attendanceSession: { findFirst: jest.Mock };
    tenantSetting: { findFirst: jest.Mock };
  };
  let mockDailySummary: { recalculate: jest.Mock };

  const mockRlsRecordUpdate = jest.fn();

  beforeEach(async () => {
    mockPrisma = {
      attendanceRecord: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      attendanceSession: { findFirst: jest.fn() },
      tenantSetting: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    mockDailySummary = { recalculate: jest.fn().mockResolvedValue(null) };
    mockRlsRecordUpdate.mockReset();

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          attendanceRecord: {
            update: mockRlsRecordUpdate,
          },
        });
      }),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AttendanceService,
        AttendanceSessionService,
        AttendanceLockingService,
        AttendanceReportingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SchoolClosuresService, useValue: {} },
        { provide: DailySummaryService, useValue: mockDailySummary },
        { provide: SettingsService, useValue: { getSettings: jest.fn() } },
        {
          provide: AttendanceParentNotificationService,
          useValue: { triggerAbsenceNotification: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when record does not exist', async () => {
    mockPrisma.attendanceRecord.findFirst.mockResolvedValue(null);

    await expect(
      service.amendRecord(TENANT_ID, 'non-existent-record', USER_ID, {
        status: 'absent_excused',
        amendment_reason: 'Medical cert received',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException when session status is open', async () => {
    mockPrisma.attendanceRecord.findFirst.mockResolvedValue({
      id: 'record-1',
      student_id: 'student-1',
      status: 'absent_unexcused',
      session: { id: SESSION_ID, status: 'open', session_date: new Date('2026-03-10') },
    });

    await expect(
      service.amendRecord(TENANT_ID, 'record-1', USER_ID, {
        status: 'absent_excused',
        amendment_reason: 'Medical cert received',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('edge: should throw ConflictException when session status is cancelled', async () => {
    mockPrisma.attendanceRecord.findFirst.mockResolvedValue({
      id: 'record-1',
      student_id: 'student-1',
      status: 'absent_unexcused',
      session: { id: SESSION_ID, status: 'cancelled', session_date: new Date('2026-03-10') },
    });

    await expect(
      service.amendRecord(TENANT_ID, 'record-1', USER_ID, {
        status: 'absent_excused',
        amendment_reason: 'Medical cert received',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should allow amending a record on a submitted session', async () => {
    mockPrisma.attendanceRecord.findFirst.mockResolvedValue({
      id: 'record-1',
      student_id: 'student-1',
      status: 'absent_unexcused',
      session: { id: SESSION_ID, status: 'submitted', session_date: new Date('2026-03-10') },
    });
    mockRlsRecordUpdate.mockResolvedValue({
      id: 'record-1',
      status: 'absent_excused',
      amended_from_status: 'absent_unexcused',
    });

    const result = await service.amendRecord(TENANT_ID, 'record-1', USER_ID, {
      status: 'absent_excused',
      amendment_reason: 'Medical cert received',
    });

    expect(result).toEqual(expect.objectContaining({ id: 'record-1', status: 'absent_excused' }));
    expect(mockRlsRecordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'record-1' },
        data: expect.objectContaining({
          amended_from_status: 'absent_unexcused',
          status: 'absent_excused',
          amendment_reason: 'Medical cert received',
          marked_by_user_id: USER_ID,
        }),
      }),
    );
  });

  it('should allow amending a record on a locked session', async () => {
    mockPrisma.attendanceRecord.findFirst.mockResolvedValue({
      id: 'record-1',
      student_id: 'student-1',
      status: 'late',
      session: { id: SESSION_ID, status: 'locked', session_date: new Date('2026-03-10') },
    });
    mockRlsRecordUpdate.mockResolvedValue({
      id: 'record-1',
      status: 'present',
      amended_from_status: 'late',
    });

    const result = await service.amendRecord(TENANT_ID, 'record-1', USER_ID, {
      status: 'present',
      amendment_reason: 'Arrived on time, recorded in error',
    });

    expect(result).toEqual(expect.objectContaining({ id: 'record-1', status: 'present' }));
  });

  it('should trigger daily summary recalculation after amendment', async () => {
    mockPrisma.attendanceRecord.findFirst.mockResolvedValue({
      id: 'record-1',
      student_id: 'student-1',
      status: 'absent_unexcused',
      session: { id: SESSION_ID, status: 'submitted', session_date: new Date('2026-03-10') },
    });
    mockRlsRecordUpdate.mockResolvedValue({
      id: 'record-1',
      status: 'absent_excused',
    });

    await service.amendRecord(TENANT_ID, 'record-1', USER_ID, {
      status: 'absent_excused',
      amendment_reason: 'Late cert',
    });

    expect(mockDailySummary.recalculate).toHaveBeenCalledWith(
      TENANT_ID,
      'student-1',
      new Date('2026-03-10'),
    );
  });
});

// ─── P3: Auto-lock — lockExpiredSessions, threshold computation ───

describe('AttendanceService — lockExpiredSessions', () => {
  let service: AttendanceService;
  let mockPrisma: {
    attendanceSession: { findFirst: jest.Mock };
    attendanceRecord: { findMany: jest.Mock };
    tenantSetting: { findFirst: jest.Mock };
  };
  let mockConfigFacadeLock: { findSettingsJson: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      attendanceSession: { findFirst: jest.fn() },
      attendanceRecord: { findMany: jest.fn().mockResolvedValue([]) },
      tenantSetting: { findFirst: jest.fn() },
    };
    mockConfigFacadeLock = { findSettingsJson: jest.fn().mockResolvedValue(null) };

    mockRlsTx.attendanceSession.updateMany.mockReset();
    mockRlsTx.attendanceSession.updateMany.mockResolvedValue({ count: 0 });

    // Restore default RLS mock for updateMany-based tests
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AttendanceService,
        AttendanceSessionService,
        AttendanceLockingService,
        AttendanceReportingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SchoolClosuresService, useValue: {} },
        { provide: DailySummaryService, useValue: {} },
        { provide: SettingsService, useValue: { getSettings: jest.fn() } },
        {
          provide: AttendanceParentNotificationService,
          useValue: { triggerAbsenceNotification: jest.fn() },
        },
        { provide: ConfigurationReadFacade, useValue: mockConfigFacadeLock },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return locked_count: 0 when autoLockAfterDays is not configured', async () => {
    mockConfigFacadeLock.findSettingsJson.mockResolvedValue(null);

    const result = await service.lockExpiredSessions(TENANT_ID);

    expect(result).toEqual({ locked_count: 0 });
    expect(mockRlsTx.attendanceSession.updateMany).not.toHaveBeenCalled();
  });

  it('should return locked_count: 0 when settings exist but autoLockAfterDays is undefined', async () => {
    mockConfigFacadeLock.findSettingsJson.mockResolvedValue({ attendance: {} });

    const result = await service.lockExpiredSessions(TENANT_ID);

    expect(result).toEqual({ locked_count: 0 });
    expect(mockRlsTx.attendanceSession.updateMany).not.toHaveBeenCalled();
  });

  it('should lock submitted sessions older than autoLockAfterDays', async () => {
    mockConfigFacadeLock.findSettingsJson.mockResolvedValue({
      attendance: { autoLockAfterDays: 3 },
    });
    mockRlsTx.attendanceSession.updateMany.mockResolvedValue({ count: 5 });

    const result = await service.lockExpiredSessions(TENANT_ID);

    expect(result).toEqual({ locked_count: 5 });
    const updateCall = mockRlsTx.attendanceSession.updateMany.mock.calls[0]![0] as {
      where: { tenant_id: string; status: string; session_date: { lte: Date } };
      data: { status: string };
    };
    expect(updateCall.where.tenant_id).toBe(TENANT_ID);
    expect(updateCall.where.status).toBe('submitted');
    expect(updateCall.data.status).toBe('locked');

    // Verify cutoff date is approximately autoLockAfterDays ago
    const cutoff = updateCall.where.session_date.lte;
    const expectedCutoff = new Date();
    expectedCutoff.setDate(expectedCutoff.getDate() - 3);
    const diffMs = Math.abs(cutoff.getTime() - expectedCutoff.getTime());
    expect(diffMs).toBeLessThan(5000); // Within 5 seconds
  });

  it('should use the correct autoLockAfterDays value from settings', async () => {
    mockConfigFacadeLock.findSettingsJson.mockResolvedValue({
      attendance: { autoLockAfterDays: 14 },
    });
    mockRlsTx.attendanceSession.updateMany.mockResolvedValue({ count: 0 });

    await service.lockExpiredSessions(TENANT_ID);

    const updateCall = mockRlsTx.attendanceSession.updateMany.mock.calls[0]![0] as {
      where: { session_date: { lte: Date } };
    };
    const cutoff = updateCall.where.session_date.lte;
    const expectedCutoff = new Date();
    expectedCutoff.setDate(expectedCutoff.getDate() - 14);
    const diffMs = Math.abs(cutoff.getTime() - expectedCutoff.getTime());
    expect(diffMs).toBeLessThan(5000);
  });

  it('edge: should return locked_count: 0 when no sessions match the criteria', async () => {
    mockConfigFacadeLock.findSettingsJson.mockResolvedValue({
      attendance: { autoLockAfterDays: 7 },
    });
    mockRlsTx.attendanceSession.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.lockExpiredSessions(TENANT_ID);

    expect(result).toEqual({ locked_count: 0 });
  });
});

// ─── P4: Teacher permissions — class assignment filtering, ForbiddenException ───

describe('AttendanceService — teacher permission filtering', () => {
  let service: AttendanceService;
  let mockPrisma: {
    class: { findFirst: jest.Mock };
    classStaff: { findFirst: jest.Mock; findMany: jest.Mock };
    classEnrolment: { findMany: jest.Mock };
    attendanceSession: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    attendanceRecord: { findMany: jest.Mock };
    tenantSetting: { findFirst: jest.Mock };
  };
  let mockSettings: { getSettings: jest.Mock };
  let mockClosures: { isClosureDate: jest.Mock };
  let mockClassesFacade: {
    findByIdWithAcademicYear: jest.Mock;
    isStaffAssignedToClass: jest.Mock;
    findClassIdsByStaff: jest.Mock;
    findEnrolledStudentIds: jest.Mock;
  };

  const STAFF_PROFILE_ID = 'staff-profile-1';

  const baseClass = {
    id: CLASS_ID,
    academic_year_id: 'ay-1',
    year_group_id: null,
    academic_year: {
      start_date: new Date('2025-09-01'),
      end_date: new Date('2026-06-30'),
    },
  };

  beforeEach(async () => {
    mockPrisma = {
      class: { findFirst: jest.fn().mockResolvedValue(baseClass) },
      classStaff: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      classEnrolment: { findMany: jest.fn().mockResolvedValue([]) },
      attendanceSession: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      attendanceRecord: { findMany: jest.fn().mockResolvedValue([]) },
      tenantSetting: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    mockClassesFacade = {
      findByIdWithAcademicYear: jest.fn().mockResolvedValue(baseClass),
      isStaffAssignedToClass: jest.fn().mockResolvedValue(false),
      findClassIdsByStaff: jest.fn().mockResolvedValue(null),
      findEnrolledStudentIds: jest.fn().mockResolvedValue([]),
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

    mockRlsTx.attendanceSession.findFirst.mockReset();
    mockRlsTx.attendanceSession.findFirst.mockResolvedValue(null);
    mockRlsTx.attendanceSession.create.mockReset();
    mockRlsTx.attendanceSession.create.mockResolvedValue({
      id: SESSION_ID,
      tenant_id: TENANT_ID,
      class_id: CLASS_ID,
      session_date: new Date('2026-03-10'),
      status: 'open',
    });
    mockRlsTx.attendanceRecord.createMany.mockReset();

    // Restore default RLS mock
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AttendanceService,
        AttendanceSessionService,
        AttendanceLockingService,
        AttendanceReportingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SchoolClosuresService, useValue: mockClosures },
        { provide: DailySummaryService, useValue: {} },
        { provide: SettingsService, useValue: mockSettings },
        {
          provide: AttendanceParentNotificationService,
          useValue: { triggerAbsenceNotification: jest.fn() },
        },
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        {
          provide: ConfigurationReadFacade,
          useValue: { findSettingsJson: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw ForbiddenException when teacher is not assigned to class', async () => {
    mockClassesFacade.isStaffAssignedToClass.mockResolvedValue(false);

    await expect(
      service.createSession(
        TENANT_ID,
        USER_ID,
        { class_id: CLASS_ID, session_date: '2026-03-10' },
        ['attendance.take'], // has take but NOT manage
        STAFF_PROFILE_ID,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should allow session creation when teacher is assigned to class', async () => {
    mockClassesFacade.isStaffAssignedToClass.mockResolvedValue(true);

    await service.createSession(
      TENANT_ID,
      USER_ID,
      { class_id: CLASS_ID, session_date: '2026-03-10' },
      ['attendance.take'],
      STAFF_PROFILE_ID,
    );

    expect(mockRlsTx.attendanceSession.create).toHaveBeenCalled();
  });

  it('should skip class assignment check when user has attendance.manage', async () => {
    // isStaffAssignedToClass should never be called for admin users
    await service.createSession(
      TENANT_ID,
      USER_ID,
      { class_id: CLASS_ID, session_date: '2026-03-10' },
      ['attendance.manage'],
      STAFF_PROFILE_ID,
    );

    expect(mockClassesFacade.isStaffAssignedToClass).not.toHaveBeenCalled();
    expect(mockRlsTx.attendanceSession.create).toHaveBeenCalled();
  });

  it('should filter sessions by teacher assigned classes in findAllSessions', async () => {
    mockClassesFacade.findClassIdsByStaff.mockResolvedValue([
      'assigned-class-1',
      'assigned-class-2',
    ]);
    mockPrisma.attendanceSession.findMany.mockResolvedValue([]);
    mockPrisma.attendanceSession.count.mockResolvedValue(0);

    await service.findAllSessions(
      TENANT_ID,
      { page: 1, pageSize: 20 },
      STAFF_PROFILE_ID, // teacher's staff profile
    );

    // Should fetch the teacher's class assignments
    expect(mockClassesFacade.findClassIdsByStaff).toHaveBeenCalledWith(TENANT_ID, STAFF_PROFILE_ID);

    // Should filter by assigned class IDs
    expect(mockPrisma.attendanceSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          class_id: { in: ['assigned-class-1', 'assigned-class-2'] },
        }),
      }),
    );
  });

  it('should return empty result when teacher requests non-assigned class', async () => {
    mockClassesFacade.findClassIdsByStaff.mockResolvedValue(['assigned-class-1']);

    const result = await service.findAllSessions(
      TENANT_ID,
      { page: 1, pageSize: 20, class_id: 'non-assigned-class' },
      STAFF_PROFILE_ID,
    );

    expect(result).toEqual({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
  });

  it('should not filter sessions when no staffProfileId is provided (admin)', async () => {
    mockPrisma.attendanceSession.findMany.mockResolvedValue([]);
    mockPrisma.attendanceSession.count.mockResolvedValue(0);

    await service.findAllSessions(
      TENANT_ID,
      { page: 1, pageSize: 20 },
      undefined, // No staff profile = admin
    );

    expect(mockClassesFacade.findClassIdsByStaff).not.toHaveBeenCalled();
  });
});

// ─── P5: Edge cases — submitSession additional coverage ───

describe('AttendanceService — submitSession', () => {
  let service: AttendanceService;
  let mockPrisma: {
    attendanceSession: { findFirst: jest.Mock };
    attendanceRecord: { findMany: jest.Mock };
    tenantSetting: { findFirst: jest.Mock };
  };
  let mockDailySummary: { recalculate: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      attendanceSession: { findFirst: jest.fn() },
      attendanceRecord: { findMany: jest.fn().mockResolvedValue([]) },
      tenantSetting: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    mockDailySummary = { recalculate: jest.fn().mockResolvedValue(null) };

    mockRlsTx.attendanceSession.update.mockReset();
    mockRlsTx.attendanceSession.update.mockResolvedValue({
      id: SESSION_ID,
      status: 'submitted',
    });

    // Restore default RLS mock
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AttendanceService,
        AttendanceSessionService,
        AttendanceLockingService,
        AttendanceReportingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SchoolClosuresService, useValue: {} },
        { provide: DailySummaryService, useValue: mockDailySummary },
        { provide: SettingsService, useValue: { getSettings: jest.fn() } },
        {
          provide: AttendanceParentNotificationService,
          useValue: { triggerAbsenceNotification: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when session does not exist', async () => {
    mockPrisma.attendanceSession.findFirst.mockResolvedValue(null);

    await expect(service.submitSession(TENANT_ID, 'non-existent', USER_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should trigger daily summary recalculation for each student', async () => {
    mockPrisma.attendanceSession.findFirst.mockResolvedValue({
      id: SESSION_ID,
      status: 'open',
      session_date: new Date('2026-03-10'),
    });
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      { student_id: 'student-1' },
      { student_id: 'student-2' },
      { student_id: 'student-1' }, // duplicate
    ]);

    await service.submitSession(TENANT_ID, SESSION_ID, USER_ID);

    // Should deduplicate student IDs
    expect(mockDailySummary.recalculate).toHaveBeenCalledTimes(2);
    expect(mockDailySummary.recalculate).toHaveBeenCalledWith(
      TENANT_ID,
      'student-1',
      new Date('2026-03-10'),
    );
    expect(mockDailySummary.recalculate).toHaveBeenCalledWith(
      TENANT_ID,
      'student-2',
      new Date('2026-03-10'),
    );
  });

  it('should set submitted_by_user_id and submitted_at on the session', async () => {
    mockPrisma.attendanceSession.findFirst.mockResolvedValue({
      id: SESSION_ID,
      status: 'open',
      session_date: new Date('2026-03-10'),
    });

    await service.submitSession(TENANT_ID, SESSION_ID, USER_ID);

    expect(mockRlsTx.attendanceSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SESSION_ID },
        data: expect.objectContaining({
          status: 'submitted',
          submitted_by_user_id: USER_ID,
        }),
      }),
    );

    // Verify submitted_at is set to a recent Date
    const updateCall = mockRlsTx.attendanceSession.update.mock.calls[0]![0] as {
      data: { submitted_at: Date };
    };
    const submittedAt = updateCall.data.submitted_at;
    expect(submittedAt).toBeInstanceOf(Date);
    expect(Date.now() - submittedAt.getTime()).toBeLessThan(5000);
  });
});

// ─── P5: Edge cases — cancelSession additional coverage ───

describe('AttendanceService — cancelSession', () => {
  let service: AttendanceService;
  let mockPrisma: {
    attendanceSession: { findFirst: jest.Mock };
    attendanceRecord: { findMany: jest.Mock };
    tenantSetting: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      attendanceSession: { findFirst: jest.fn() },
      attendanceRecord: { findMany: jest.fn().mockResolvedValue([]) },
      tenantSetting: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    mockRlsTx.attendanceSession.update.mockReset();
    mockRlsTx.attendanceSession.update.mockResolvedValue({
      id: SESSION_ID,
      status: 'cancelled',
    });

    // Restore default RLS mock
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AttendanceService,
        AttendanceSessionService,
        AttendanceLockingService,
        AttendanceReportingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SchoolClosuresService, useValue: {} },
        { provide: DailySummaryService, useValue: {} },
        { provide: SettingsService, useValue: { getSettings: jest.fn() } },
        {
          provide: AttendanceParentNotificationService,
          useValue: { triggerAbsenceNotification: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when session does not exist', async () => {
    mockPrisma.attendanceSession.findFirst.mockResolvedValue(null);

    await expect(service.cancelSession(TENANT_ID, 'non-existent')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should successfully cancel an open session', async () => {
    mockPrisma.attendanceSession.findFirst.mockResolvedValue({
      id: SESSION_ID,
      status: 'open',
    });

    await service.cancelSession(TENANT_ID, SESSION_ID);

    expect(mockRlsTx.attendanceSession.update).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: { status: 'cancelled' },
    });
  });
});
