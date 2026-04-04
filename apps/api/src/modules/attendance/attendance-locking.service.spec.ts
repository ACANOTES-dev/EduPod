/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, ConfigurationReadFacade } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// ─── Mock RLS Transaction ────────────────────────────────────────────────────

const mockRlsTx = {
  attendanceSession: {
    updateMany: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

import { AttendanceLockingService } from './attendance-locking.service';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AttendanceLockingService', () => {
  let service: AttendanceLockingService;
  let mockPrisma: {
    tenantSetting: { findFirst: jest.Mock };
  };
  let mockConfigFacade: { findSettingsJson: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      tenantSetting: { findFirst: jest.fn() },
    };

    mockConfigFacade = { findSettingsJson: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AttendanceLockingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigurationReadFacade, useValue: mockConfigFacade },
      ],
    }).compile();

    service = module.get<AttendanceLockingService>(AttendanceLockingService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── lockExpiredSessions ──────────────────────────────────────────────────

  describe('AttendanceLockingService — lockExpiredSessions', () => {
    it('should return locked_count 0 when autoLockAfterDays is not configured', async () => {
      mockConfigFacade.findSettingsJson.mockResolvedValue(null);

      const result = await service.lockExpiredSessions(TENANT_ID);

      expect(result).toEqual({ locked_count: 0 });
      expect(mockRlsTx.attendanceSession.updateMany).not.toHaveBeenCalled();
    });

    it('should return locked_count 0 when attendance settings exist but autoLockAfterDays is absent', async () => {
      mockConfigFacade.findSettingsJson.mockResolvedValue({ attendance: {} });

      const result = await service.lockExpiredSessions(TENANT_ID);

      expect(result).toEqual({ locked_count: 0 });
      expect(mockRlsTx.attendanceSession.updateMany).not.toHaveBeenCalled();
    });

    it('should lock submitted sessions older than the configured threshold', async () => {
      mockConfigFacade.findSettingsJson.mockResolvedValue({ attendance: { autoLockAfterDays: 7 } });
      mockRlsTx.attendanceSession.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.lockExpiredSessions(TENANT_ID);

      expect(result).toEqual({ locked_count: 5 });
      expect(mockRlsTx.attendanceSession.updateMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          status: 'submitted',
          session_date: { lte: expect.any(Date) },
        },
        data: { status: 'locked' },
      });
    });

    it('should compute correct cutoff date from autoLockAfterDays', async () => {
      const autoLockDays = 14;
      mockConfigFacade.findSettingsJson.mockResolvedValue({ attendance: { autoLockAfterDays: autoLockDays } });
      mockRlsTx.attendanceSession.updateMany.mockResolvedValue({ count: 0 });

      const beforeCall = new Date();
      beforeCall.setDate(beforeCall.getDate() - autoLockDays);

      await service.lockExpiredSessions(TENANT_ID);

      const callArgs = mockRlsTx.attendanceSession.updateMany.mock.calls[0]?.[0] as {
        where: { session_date: { lte: Date } };
      };
      const cutoffUsed = callArgs.where.session_date.lte;

      // The cutoff should be approximately autoLockDays days ago (within 2 seconds tolerance)
      const diffMs = Math.abs(cutoffUsed.getTime() - beforeCall.getTime());
      expect(diffMs).toBeLessThan(2000);
    });

    it('should return locked_count 0 when no sessions match the criteria', async () => {
      mockConfigFacade.findSettingsJson.mockResolvedValue({ attendance: { autoLockAfterDays: 7 } });
      mockRlsTx.attendanceSession.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.lockExpiredSessions(TENANT_ID);

      expect(result).toEqual({ locked_count: 0 });
    });

    it('should read tenant settings with correct query', async () => {
      mockConfigFacade.findSettingsJson.mockResolvedValue(null);

      await service.lockExpiredSessions(TENANT_ID);

      expect(mockConfigFacade.findSettingsJson).toHaveBeenCalledWith(TENANT_ID);
    });
  });
});
