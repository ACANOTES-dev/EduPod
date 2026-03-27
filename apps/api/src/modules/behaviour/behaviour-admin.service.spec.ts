import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { BehaviourAdminService } from './behaviour-admin.service';
import { BehaviourScopeService } from './behaviour-scope.service';
import { PolicyReplayService } from './policy/policy-replay.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  student: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  behaviourIncident: {
    count: jest.fn(),
  },
  behaviourSanction: {
    count: jest.fn(),
  },
  behaviourIntervention: {
    count: jest.fn(),
  },
  behaviourAttachment: {
    count: jest.fn(),
  },
  behaviourLegalHold: {
    count: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Queue mocks ──────────────────────────────────────────────────────────────

const mockBehaviourQueue = {
  getWaitingCount: jest.fn().mockResolvedValue(0),
  getActiveCount: jest.fn().mockResolvedValue(0),
  getFailedCount: jest.fn().mockResolvedValue(0),
  getFailed: jest.fn().mockResolvedValue([]),
  getJob: jest.fn().mockResolvedValue(null),
  add: jest.fn().mockResolvedValue({ id: 'job-1' }),
};

const mockNotificationsQueue = {
  getWaitingCount: jest.fn().mockResolvedValue(0),
  getActiveCount: jest.fn().mockResolvedValue(0),
  getFailedCount: jest.fn().mockResolvedValue(0),
  getFailed: jest.fn().mockResolvedValue([]),
  getJob: jest.fn().mockResolvedValue(null),
  add: jest.fn().mockResolvedValue({ id: 'job-2' }),
};

// ─── Redis mock ───────────────────────────────────────────────────────────────

const mockRedisClient = {
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
  pipeline: jest.fn().mockReturnValue({ del: jest.fn(), exec: jest.fn().mockResolvedValue([]) }),
  info: jest.fn().mockResolvedValue('keyspace_hits:1000\nkeyspace_misses:100\n'),
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('BehaviourAdminService', () => {
  let service: BehaviourAdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourAdminService,
        { provide: PrismaService, useValue: { $executeRaw: jest.fn() } },
        { provide: RedisService, useValue: { getClient: () => mockRedisClient } },
        { provide: BehaviourScopeService, useValue: { getUserScope: jest.fn().mockResolvedValue({ scope: 'all' }) } },
        { provide: PolicyReplayService, useValue: { dryRun: jest.fn().mockResolvedValue({}) } },
        { provide: getQueueToken('behaviour'), useValue: mockBehaviourQueue },
        { provide: getQueueToken('notifications'), useValue: mockNotificationsQueue },
      ],
    }).compile();

    service = module.get<BehaviourAdminService>(BehaviourAdminService);

    // Reset mocks
    Object.values(mockRlsTx).forEach((model) =>
      Object.values(model).forEach((fn) => fn.mockReset()),
    );
    jest.clearAllMocks();
  });

  // ─── Health ───────────────────────────────────────────────────────────────

  describe('getHealth', () => {
    it('should return health data with correct shape', async () => {
      mockBehaviourQueue.getWaitingCount.mockResolvedValue(5);
      mockNotificationsQueue.getWaitingCount.mockResolvedValue(2);
      mockBehaviourQueue.getActiveCount.mockResolvedValue(1);
      mockNotificationsQueue.getActiveCount.mockResolvedValue(0);
      mockBehaviourQueue.getFailedCount.mockResolvedValue(3);
      mockNotificationsQueue.getFailedCount.mockResolvedValue(0);
      mockRlsTx.behaviourAttachment.count.mockResolvedValue(1);
      mockRlsTx.behaviourLegalHold.count.mockResolvedValue(2);

      const result = await service.getHealth(TENANT_ID);

      expect(result.queue_depths).toBeDefined();
      expect(result.dead_letter_depth).toBe(3);
      expect(result.cache_hit_rate).toBeDefined();
      expect(result.view_freshness).toHaveLength(3);
      expect(result.scan_backlog).toBe(1);
      expect(result.legal_holds_active).toBe(2);
    });
  });

  // ─── Dead Letter ──────────────────────────────────────────────────────────

  describe('listDeadLetterJobs', () => {
    it('should return failed jobs sorted by date', async () => {
      mockBehaviourQueue.getFailed.mockResolvedValue([
        { id: 'j1', name: 'behaviour:detect-patterns', finishedOn: Date.now(), failedReason: 'timeout', attemptsMade: 3 },
      ]);
      mockNotificationsQueue.getFailed.mockResolvedValue([]);

      const result = await service.listDeadLetterJobs();

      expect(result).toHaveLength(1);
      expect(result[0].job_name).toBe('behaviour:detect-patterns');
      expect(result[0].queue).toBe('behaviour');
    });

    it('should return empty array when no failed jobs', async () => {
      mockBehaviourQueue.getFailed.mockResolvedValue([]);
      mockNotificationsQueue.getFailed.mockResolvedValue([]);

      const result = await service.listDeadLetterJobs();
      expect(result).toHaveLength(0);
    });
  });

  // ─── Recompute Points ─────────────────────────────────────────────────────

  describe('recomputePointsPreview', () => {
    it('should return preview for student scope', async () => {
      const result = await service.recomputePointsPreview(TENANT_ID, {
        scope: 'student',
        student_id: 'student-1',
      });

      expect(result.affected_students).toBe(1);
      expect(result.reversible).toBe(true);
    });

    it('should return preview for tenant scope with warning', async () => {
      mockRlsTx.student.count.mockResolvedValue(500);
      mockRlsTx.student.findMany.mockResolvedValue([]);

      const result = await service.recomputePointsPreview(TENANT_ID, {
        scope: 'tenant',
      });

      expect(result.affected_students).toBe(500);
      expect(result.warnings).toContain('This will invalidate all cached point totals for the entire school.');
    });
  });

  describe('recomputePoints', () => {
    it('should delete Redis cache for a single student', async () => {
      await service.recomputePoints(TENANT_ID, {
        scope: 'student',
        student_id: 'student-1',
      });

      expect(mockRedisClient.del).toHaveBeenCalledWith(`behaviour:points:${TENANT_ID}:student-1`);
    });
  });

  // ─── Recompute Pulse ──────────────────────────────────────────────────────

  describe('recomputePulse', () => {
    it('should invalidate pulse cache key', async () => {
      await service.recomputePulse(TENANT_ID);

      expect(mockRedisClient.del).toHaveBeenCalledWith(`behaviour:pulse:${TENANT_ID}`);
    });
  });

  // ─── Retention Preview ────────────────────────────────────────────────────

  describe('retentionPreview', () => {
    it('should return retention counts', async () => {
      mockRlsTx.student.findMany.mockResolvedValue([{ id: 's1' }]);
      mockRlsTx.behaviourIncident.count.mockResolvedValue(10);
      mockRlsTx.behaviourLegalHold.count.mockResolvedValue(2);

      const result = await service.retentionPreview(TENANT_ID);

      expect(result.to_archive).toBe(10);
      expect(result.held_by_legal_hold).toBe(2);
    });
  });

  // ─── Retention Execute ────────────────────────────────────────────────────

  describe('retentionExecute', () => {
    it('should enqueue retention job', async () => {
      const result = await service.retentionExecute(TENANT_ID);

      expect(mockBehaviourQueue.add).toHaveBeenCalledWith(
        'behaviour:retention-check',
        { tenant_id: TENANT_ID, dry_run: false },
        expect.any(Object),
      );
      expect(result.job_id).toBe('job-1');
    });
  });
});
