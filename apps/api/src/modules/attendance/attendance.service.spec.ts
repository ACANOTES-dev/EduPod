import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { SchoolClosuresService } from '../school-closures/school-closures.service';

import { AttendanceService } from './attendance.service';
import { DailySummaryService } from './daily-summary.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SESSION_ID = 'session-1';
const USER_ID = 'user-1';

// Mock the RLS middleware
const mockRlsTx = {
  attendanceSession: {
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

describe('AttendanceService — state machine', () => {
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
      status: 'updated',
    });
    mockRlsTx.attendanceSession.updateMany.mockReset();
    mockRlsTx.attendanceSession.updateMany.mockResolvedValue({ count: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SchoolClosuresService, useValue: {} },
        { provide: DailySummaryService, useValue: mockDailySummary },
      ],
    }).compile();

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

    await expect(
      service.cancelSession(TENANT_ID, SESSION_ID),
    ).rejects.toThrow(ConflictException);
  });

  // ─── 5. locked -> any state blocked ────────────────────────────────────
  it('should block locked -> any state (cancelSession and submitSession reject locked)', async () => {
    // cancelSession with locked session
    mockPrisma.attendanceSession.findFirst.mockResolvedValue({
      id: SESSION_ID,
      status: 'locked',
    });

    await expect(
      service.cancelSession(TENANT_ID, SESSION_ID),
    ).rejects.toThrow(ConflictException);

    // submitSession with locked session
    mockPrisma.attendanceSession.findFirst.mockResolvedValue({
      id: SESSION_ID,
      status: 'locked',
      session_date: new Date('2026-03-10'),
    });

    await expect(
      service.submitSession(TENANT_ID, SESSION_ID, USER_ID),
    ).rejects.toThrow(ConflictException);
  });

  // ─── 6. cancelled -> any state blocked ─────────────────────────────────
  it('should block cancelled -> any state (submitSession and cancelSession reject cancelled)', async () => {
    // submitSession with cancelled session
    mockPrisma.attendanceSession.findFirst.mockResolvedValue({
      id: SESSION_ID,
      status: 'cancelled',
      session_date: new Date('2026-03-10'),
    });

    await expect(
      service.submitSession(TENANT_ID, SESSION_ID, USER_ID),
    ).rejects.toThrow(ConflictException);

    // cancelSession with cancelled session
    mockPrisma.attendanceSession.findFirst.mockResolvedValue({
      id: SESSION_ID,
      status: 'cancelled',
    });

    await expect(
      service.cancelSession(TENANT_ID, SESSION_ID),
    ).rejects.toThrow(ConflictException);
  });
});
