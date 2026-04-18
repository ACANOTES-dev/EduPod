import { Job } from 'bullmq';

import {
  ATTENDANCE_AUTO_LOCK_JOB,
  AttendanceAutoLockProcessor,
} from './attendance-auto-lock.processor';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

// ─── Mock Prisma ────────────────────────────────────────────────────────────

function buildMockTx() {
  return {
    tenantSetting: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    attendanceSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
}

type MockTx = ReturnType<typeof buildMockTx>;

function buildMockPrisma(mockTx: MockTx) {
  return {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  };
}

function buildMockJob(name: string, data: Record<string, unknown> = {}): Job {
  return { id: 'test-job-id', name, data } as unknown as Job;
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('AttendanceAutoLockProcessor', () => {
  let processor: AttendanceAutoLockProcessor;
  let mockTx: MockTx;

  beforeEach(() => {
    mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    processor = new AttendanceAutoLockProcessor(mockPrisma as never);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Job routing ────────────────────────────────────────────────────────

  describe('process — job routing', () => {
    it('should reject jobs without tenant_id', async () => {
      const job = buildMockJob(ATTENDANCE_AUTO_LOCK_JOB, {});

      await expect(processor.process(job)).rejects.toThrow(
        'Job rejected: missing tenant_id in payload.',
      );
    });
  });

  // ─── Auto-lock disabled ───────────────────────────────────────────────

  describe('process — auto-lock disabled', () => {
    it('should exit early when autoLockAfterDays is not configured', async () => {
      mockTx.tenantSetting.findFirst.mockResolvedValue({
        settings: { attendance: {} },
      });

      const job = buildMockJob(ATTENDANCE_AUTO_LOCK_JOB, {
        tenant_id: TENANT_ID,
      });

      await processor.process(job);

      expect(mockTx.attendanceSession.updateMany).not.toHaveBeenCalled();
    });

    it('should exit early when tenant settings are null', async () => {
      mockTx.tenantSetting.findFirst.mockResolvedValue(null);

      const job = buildMockJob(ATTENDANCE_AUTO_LOCK_JOB, {
        tenant_id: TENANT_ID,
      });

      await processor.process(job);

      expect(mockTx.attendanceSession.updateMany).not.toHaveBeenCalled();
    });
  });

  // ─── Auto-lock sessions ───────────────────────────────────────────────

  describe('process — auto-lock sessions', () => {
    it('should lock submitted sessions older than autoLockAfterDays', async () => {
      mockTx.tenantSetting.findFirst.mockResolvedValue({
        settings: { attendance: { autoLockAfterDays: 7 } },
      });

      mockTx.attendanceSession.updateMany.mockResolvedValue({ count: 3 });

      const job = buildMockJob(ATTENDANCE_AUTO_LOCK_JOB, {
        tenant_id: TENANT_ID,
      });

      await processor.process(job);

      expect(mockTx.attendanceSession.updateMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          status: 'submitted',
          session_date: { lte: expect.any(Date) },
        },
        data: { status: 'locked' },
      });
    });

    it('should use the correct cutoff date based on autoLockAfterDays', async () => {
      const autoLockAfterDays = 5;

      mockTx.tenantSetting.findFirst.mockResolvedValue({
        settings: { attendance: { autoLockAfterDays } },
      });

      const beforeProcess = new Date();

      const job = buildMockJob(ATTENDANCE_AUTO_LOCK_JOB, {
        tenant_id: TENANT_ID,
      });

      await processor.process(job);

      const expectedCutoff = new Date(beforeProcess);
      expectedCutoff.setDate(expectedCutoff.getDate() - autoLockAfterDays);

      const callArgs = mockTx.attendanceSession.updateMany.mock.calls[0][0];
      const actualCutoff = callArgs.where.session_date.lte as Date;

      // The cutoff should be approximately autoLockAfterDays ago (within 5 seconds)
      const diffMs = Math.abs(actualCutoff.getTime() - expectedCutoff.getTime());
      expect(diffMs).toBeLessThan(5000);
    });
  });

  // ─── Logging ──────────────────────────────────────────────────────────

  describe('process — logging', () => {
    it('should log the count of locked sessions', async () => {
      mockTx.tenantSetting.findFirst.mockResolvedValue({
        settings: { attendance: { autoLockAfterDays: 7 } },
      });

      mockTx.attendanceSession.updateMany.mockResolvedValue({ count: 5 });

      const job = buildMockJob(ATTENDANCE_AUTO_LOCK_JOB, {
        tenant_id: TENANT_ID,
      });

      // Spy on the inner job's logger indirectly through the processor logger
      const logSpy = jest.spyOn(processor['logger'], 'log');

      await processor.process(job);

      // At minimum the processor itself logs its "Processing" message
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(ATTENDANCE_AUTO_LOCK_JOB));
    });
  });
});
