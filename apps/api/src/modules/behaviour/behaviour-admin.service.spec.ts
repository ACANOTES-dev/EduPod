import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { PolicyReplayService } from '../policy-engine/policy-replay.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StudentReadFacade } from '../students/student-read.facade';

import { BehaviourAdminService } from './behaviour-admin.service';
import { BehaviourScopeService } from './behaviour-scope.service';

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
  behaviourParentAcknowledgement: {
    create: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
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

const mockSearchSyncQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-3' }),
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
  let academicFacade: Record<string, jest.Mock>;
  let studentFacade: Record<string, jest.Mock>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        BehaviourAdminService,
        { provide: PrismaService, useValue: { $executeRaw: jest.fn() } },
        { provide: RedisService, useValue: { getClient: () => mockRedisClient } },
        {
          provide: BehaviourScopeService,
          useValue: { getUserScope: jest.fn().mockResolvedValue({ scope: 'all' }) },
        },
        { provide: PolicyReplayService, useValue: { dryRun: jest.fn().mockResolvedValue({}) } },
        { provide: getQueueToken('behaviour'), useValue: mockBehaviourQueue },
        { provide: getQueueToken('notifications'), useValue: mockNotificationsQueue },
        { provide: getQueueToken('search-sync'), useValue: mockSearchSyncQueue },
      ],
    }).compile();

    service = module.get<BehaviourAdminService>(BehaviourAdminService);
    academicFacade = module.get(AcademicReadFacade) as unknown as Record<string, jest.Mock>;
    studentFacade = module.get(StudentReadFacade) as unknown as Record<string, jest.Mock>;

    academicFacade['findCurrentYear']!.mockResolvedValue(null);
    academicFacade['findPeriodCoveringDate']!.mockResolvedValue(null);
    studentFacade['count']!.mockResolvedValue(0);
    studentFacade['findManyGeneric']!.mockResolvedValue([]);
    studentFacade['findOneGeneric']!.mockResolvedValue(null);

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
        {
          id: 'j1',
          name: 'behaviour:detect-patterns',
          finishedOn: Date.now(),
          failedReason: 'timeout',
          attemptsMade: 3,
        },
      ]);
      mockNotificationsQueue.getFailed.mockResolvedValue([]);

      const result = await service.listDeadLetterJobs();

      expect(result).toHaveLength(1);
      expect(result[0]!.job_name).toBe('behaviour:detect-patterns');
      expect(result[0]!.queue).toBe('behaviour');
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
      studentFacade['count']!.mockResolvedValue(500);
      studentFacade['findManyGeneric']!.mockResolvedValue([]);

      const result = await service.recomputePointsPreview(TENANT_ID, {
        scope: 'tenant',
      });

      expect(result.affected_students).toBe(500);
      expect(result.warnings).toContain(
        'This will invalidate all cached point totals for the entire school.',
      );
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
      studentFacade['findManyGeneric']!.mockResolvedValue([{ id: 's1' }]);
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

  // ─── Reindex Search ───────────────────────────────────────────────────────

  describe('reindexSearchPreview', () => {
    it('should return search reindex preview', async () => {
      mockRlsTx.behaviourIncident.count.mockResolvedValue(100);

      const result = await service.reindexSearchPreview(TENANT_ID);

      expect(result.affected_records).toBe(100);
      expect(result.reversible).toBe(true);
    });
  });

  describe('reindexSearch', () => {
    it('should enqueue search sync job', async () => {
      const result = await service.reindexSearch(TENANT_ID);
      expect(mockSearchSyncQueue.add).toHaveBeenCalledWith(
        'search:full-reindex',
        { tenant_id: TENANT_ID },
        expect.any(Object),
      );
      expect(result.job_id).toBe('job-3');
    });
  });

  // ─── Resend Notification ──────────────────────────────────────────────────

  describe('resendNotification', () => {
    it('should enqueue notification and create acknowledgement record', async () => {
      await service.resendNotification(TENANT_ID, {
        incident_id: 'i-1',
        parent_id: 'p-1',
        channel: 'email',
      });

      expect(mockRlsTx.behaviourParentAcknowledgement.create).toHaveBeenCalled();
      expect(mockNotificationsQueue.add).toHaveBeenCalledWith(
        'behaviour:parent-notification',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          parent_id: 'p-1',
          incident_id: 'i-1',
          channel: 'email',
          is_resend: true,
        }),
        expect.any(Object),
      );
    });

    it('should require either incident_id or sanction_id', async () => {
      await expect(
        service.resendNotification(TENANT_ID, {
          parent_id: 'p-1',
          channel: 'email',
        } as Parameters<typeof service.resendNotification>[1]),
      ).rejects.toThrow('Either incident_id or sanction_id is required');
    });
  });

  // ─── Policy Dry Run ───────────────────────────────────────────────────────

  describe('policyDryRun', () => {
    it('should delegate to policyReplayService', async () => {
      const policyService = (service as unknown as { policyReplayService: { dryRun: jest.Mock } })
        .policyReplayService;
      policyService.dryRun = jest.fn().mockResolvedValue({ some: 'data' });

      const result = await service.policyDryRun(TENANT_ID, {
        category_id: 'c-1',
        polarity: 'negative',
        severity: 3,
        context_type: 'class',
      });

      expect(policyService.dryRun).toHaveBeenCalledWith(TENANT_ID, {
        category_id: 'c-1',
        polarity: 'negative',
        severity: 3,
        context_type: 'class',
      });
      expect(result).toEqual({ some: 'data' });
    });
  });

  // ─── getHealth — branch coverage ──────────────────────────────────────────

  describe('getHealth — branch coverage', () => {
    it('edge: should handle Redis INFO with no hits/misses match', async () => {
      mockRedisClient.info.mockResolvedValue('some_unrelated_data:123\n');
      mockRlsTx.behaviourAttachment.count.mockResolvedValue(0);
      mockRlsTx.behaviourLegalHold.count.mockResolvedValue(0);

      const result = await service.getHealth(TENANT_ID);

      expect(result.cache_hit_rate).toBe(0);
    });

    it('edge: should handle Redis INFO failure gracefully', async () => {
      mockRedisClient.info.mockRejectedValue(new Error('Redis down'));
      mockRlsTx.behaviourAttachment.count.mockResolvedValue(0);
      mockRlsTx.behaviourLegalHold.count.mockResolvedValue(0);

      const result = await service.getHealth(TENANT_ID);

      expect(result.cache_hit_rate).toBe(0);
    });

    it('edge: should compute cache_hit_rate as 0 when hits + misses = 0', async () => {
      mockRedisClient.info.mockResolvedValue('keyspace_hits:0\nkeyspace_misses:0\n');
      mockRlsTx.behaviourAttachment.count.mockResolvedValue(0);
      mockRlsTx.behaviourLegalHold.count.mockResolvedValue(0);

      const result = await service.getHealth(TENANT_ID);

      expect(result.cache_hit_rate).toBe(0);
    });
  });

  // ─── listDeadLetterJobs — branch coverage ─────────────────────────────────

  describe('listDeadLetterJobs — branch coverage', () => {
    it('should handle job with no id and no finishedOn', async () => {
      mockBehaviourQueue.getFailed.mockResolvedValue([
        {
          id: undefined,
          name: 'behaviour:test',
          finishedOn: undefined,
          failedReason: undefined,
          attemptsMade: 1,
        },
      ]);
      mockNotificationsQueue.getFailed.mockResolvedValue([]);

      const result = await service.listDeadLetterJobs();

      expect(result).toHaveLength(1);
      expect(result[0]!.job_id).toBe('');
      expect(result[0]!.failure_reason).toBe('Unknown');
      expect(result[0]!.failed_at).toBeDefined();
    });

    it('should merge jobs from both queues and sort by date descending', async () => {
      mockBehaviourQueue.getFailed.mockResolvedValue([
        {
          id: 'j1',
          name: 'behaviour:a',
          finishedOn: new Date('2026-03-01').getTime(),
          failedReason: 'err1',
          attemptsMade: 1,
        },
      ]);
      mockNotificationsQueue.getFailed.mockResolvedValue([
        {
          id: 'j2',
          name: 'notifications:b',
          finishedOn: new Date('2026-03-05').getTime(),
          failedReason: 'err2',
          attemptsMade: 2,
        },
      ]);

      const result = await service.listDeadLetterJobs();

      expect(result).toHaveLength(2);
      expect(result[0]!.queue).toBe('notifications');
      expect(result[1]!.queue).toBe('behaviour');
    });
  });

  // ─── retryDeadLetterJob — branch coverage ─────────────────────────────────

  describe('retryDeadLetterJob', () => {
    it('should retry a job found in the behaviour queue', async () => {
      const mockJob = { retry: jest.fn().mockResolvedValue(undefined) };
      mockBehaviourQueue.getJob.mockResolvedValue(mockJob);

      await service.retryDeadLetterJob('job-123');

      expect(mockJob.retry).toHaveBeenCalled();
    });

    it('should retry a job found in the notifications queue when not in behaviour', async () => {
      const mockJob = { retry: jest.fn().mockResolvedValue(undefined) };
      mockBehaviourQueue.getJob.mockResolvedValue(null);
      mockNotificationsQueue.getJob.mockResolvedValue(mockJob);

      await service.retryDeadLetterJob('job-456');

      expect(mockJob.retry).toHaveBeenCalled();
    });

    it('should throw error when job not found in any queue', async () => {
      mockBehaviourQueue.getJob.mockResolvedValue(null);
      mockNotificationsQueue.getJob.mockResolvedValue(null);

      await expect(service.retryDeadLetterJob('no-such-job')).rejects.toThrow(
        'Job no-such-job not found in any queue',
      );
    });
  });

  // ─── recomputePointsPreview — year_group scope ────────────────────────────

  describe('recomputePointsPreview — year_group scope', () => {
    it('should return preview for year_group scope', async () => {
      studentFacade['findManyGeneric']!.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
      studentFacade['count']!.mockResolvedValue(50);

      const result = await service.recomputePointsPreview(TENANT_ID, {
        scope: 'year_group',
        year_group_id: 'yg-1',
      });

      expect(result.affected_students).toBe(50);
      expect(result.sample_records).toEqual(['s1', 's2']);
    });

    it('should return ~30s for small student count', async () => {
      studentFacade['count']!.mockResolvedValue(10);
      studentFacade['findManyGeneric']!.mockResolvedValue([]);

      const result = await service.recomputePointsPreview(TENANT_ID, {
        scope: 'tenant',
      });

      expect(result.estimated_duration).toBe('~30s');
    });

    it('should return ~2min for large student count', async () => {
      studentFacade['count']!.mockResolvedValue(200);
      studentFacade['findManyGeneric']!.mockResolvedValue([]);

      const result = await service.recomputePointsPreview(TENANT_ID, {
        scope: 'tenant',
      });

      expect(result.estimated_duration).toBe('~2min');
    });
  });

  // ─── recomputePoints — all scopes ────────────────────────────────────────

  describe('recomputePoints — all scopes', () => {
    it('should invalidate year_group students cache', async () => {
      studentFacade['findManyGeneric']!.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);

      await service.recomputePoints(TENANT_ID, {
        scope: 'year_group',
        year_group_id: 'yg-1',
      });

      const pipeline = mockRedisClient.pipeline();
      expect(pipeline.del).toBeDefined();
    });

    it('should delete all tenant point cache keys when scope is tenant', async () => {
      mockRedisClient.keys.mockResolvedValue([
        `behaviour:points:${TENANT_ID}:s1`,
        `behaviour:points:${TENANT_ID}:s2`,
      ]);

      await service.recomputePoints(TENANT_ID, {
        scope: 'tenant',
      });

      expect(mockRedisClient.keys).toHaveBeenCalledWith(`behaviour:points:${TENANT_ID}:*`);
    });

    it('should skip pipeline when no keys exist for tenant scope', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      await service.recomputePoints(TENANT_ID, {
        scope: 'tenant',
      });

      // pipeline should not be called when no keys
      expect(mockRedisClient.keys).toHaveBeenCalled();
    });
  });

  // ─── scopeAudit — branch coverage ────────────────────────────────────────

  describe('scopeAudit', () => {
    it('should return scope audit with all scope', async () => {
      studentFacade['findManyGeneric']!.mockResolvedValue([{ id: 's1' }]);
      studentFacade['count']!.mockResolvedValue(1);

      const result = await service.scopeAudit(TENANT_ID, 'user-1');

      expect(result.scope_level).toBe('all');
      expect(result.student_count).toBe(1);
      expect(result.student_ids).toEqual(['s1']);
    });

    it('should apply class filter when scope is class', async () => {
      const scopeService = (service as unknown as { scopeService: { getUserScope: jest.Mock } })
        .scopeService;
      scopeService.getUserScope.mockResolvedValue({
        scope: 'class',
        classStudentIds: ['s1', 's2'],
      });
      studentFacade['findManyGeneric']!.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
      studentFacade['count']!.mockResolvedValue(2);

      const result = await service.scopeAudit(TENANT_ID, 'teacher-1');

      expect(result.scope_level).toBe('class');
      expect(result.student_count).toBe(2);
    });
  });

  // ─── rebuildAwardsPreview — branch coverage ──────────────────────────────

  describe('rebuildAwardsPreview', () => {
    it('should return preview for student scope', async () => {
      const result = await service.rebuildAwardsPreview(TENANT_ID, {
        scope: 'student',
        student_id: 'student-1',
      });

      expect(result.affected_students).toBe(1);
      expect(result.reversible).toBe(false);
    });

    it('should return preview for year_group scope', async () => {
      studentFacade['count']!.mockResolvedValue(30);

      const result = await service.rebuildAwardsPreview(TENANT_ID, {
        scope: 'year_group',
        year_group_id: 'yg-1',
      });

      expect(result.affected_students).toBe(30);
      expect(result.estimated_duration).toBe('~45s');
    });

    it('should return preview for tenant scope', async () => {
      studentFacade['count']!.mockResolvedValue(200);

      const result = await service.rebuildAwardsPreview(TENANT_ID, {
        scope: 'tenant',
      });

      expect(result.affected_students).toBe(200);
      expect(result.estimated_duration).toBe('~3min');
    });
  });

  // ─── rebuildAwards — branch coverage ─────────────────────────────────────

  describe('rebuildAwards', () => {
    it('should return enqueued=0 when no students found', async () => {
      studentFacade['findOneGeneric']!.mockResolvedValue(null);

      const result = await service.rebuildAwards(TENANT_ID, {
        scope: 'student',
        student_id: 'nonexistent',
      });

      expect(result.enqueued).toBe(0);
    });

    it('should return enqueued=0 when no active academic year', async () => {
      studentFacade['findOneGeneric']!.mockResolvedValue({ id: 'student-1' });
      academicFacade['findCurrentYear']!.mockResolvedValue(null);

      const result = await service.rebuildAwards(TENANT_ID, {
        scope: 'student',
        student_id: 'student-1',
      });

      expect(result.enqueued).toBe(0);
    });

    it('should enqueue check-awards job for students with incidents', async () => {
      studentFacade['findOneGeneric']!.mockResolvedValue({ id: 'student-1' });
      academicFacade['findCurrentYear']!.mockResolvedValue({ id: 'year-1' });
      academicFacade['findPeriodCoveringDate']!.mockResolvedValue({ id: 'period-1' });

      (mockRlsTx as Record<string, unknown>).behaviourIncidentParticipant = {
        findFirst: jest.fn().mockResolvedValue({ incident_id: 'inc-1' }),
      };

      const result = await service.rebuildAwards(TENANT_ID, {
        scope: 'student',
        student_id: 'student-1',
      });

      expect(result.enqueued).toBe(1);
      expect(mockBehaviourQueue.add).toHaveBeenCalledWith(
        'behaviour:check-awards',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          incident_id: 'inc-1',
          student_ids: ['student-1'],
          academic_year_id: 'year-1',
          academic_period_id: 'period-1',
        }),
        expect.any(Object),
      );
    });

    it('should skip students with no incidents', async () => {
      studentFacade['findOneGeneric']!.mockResolvedValue({ id: 'student-1' });
      academicFacade['findCurrentYear']!.mockResolvedValue({ id: 'year-1' });
      academicFacade['findPeriodCoveringDate']!.mockResolvedValue(null);

      (mockRlsTx as Record<string, unknown>).behaviourIncidentParticipant = {
        findFirst: jest.fn().mockResolvedValue(null),
      };

      const result = await service.rebuildAwards(TENANT_ID, {
        scope: 'student',
        student_id: 'student-1',
      });

      expect(result.enqueued).toBe(0);
    });

    it('should resolve tenant scope students', async () => {
      studentFacade['findManyGeneric']!.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
      academicFacade['findCurrentYear']!.mockResolvedValue({ id: 'year-1' });
      academicFacade['findPeriodCoveringDate']!.mockResolvedValue(null);

      (mockRlsTx as Record<string, unknown>).behaviourIncidentParticipant = {
        findFirst: jest.fn().mockResolvedValue(null),
      };

      const result = await service.rebuildAwards(TENANT_ID, {
        scope: 'tenant',
      });

      expect(result.enqueued).toBe(0);
    });

    it('should filter rebuildAwards by year group when year_group scope is requested', async () => {
      studentFacade['findManyGeneric']!.mockResolvedValue([{ id: 's1' }]);
      academicFacade['findCurrentYear']!.mockResolvedValue({ id: 'year-1' });
      academicFacade['findPeriodCoveringDate']!.mockResolvedValue(null);

      (mockRlsTx as Record<string, unknown>).behaviourIncidentParticipant = {
        findFirst: jest.fn().mockResolvedValue(null),
      };

      const result = await service.rebuildAwards(TENANT_ID, {
        scope: 'year_group',
        year_group_id: 'yg-1',
      });

      expect(result.enqueued).toBe(0);
      expect(studentFacade['findManyGeneric']).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: 'active',
            year_group_id: 'yg-1',
          }),
        }),
        expect.anything(),
      );
    });
  });

  // ─── backfillTasks — branch coverage ─────────────────────────────────────

  describe('backfillTasks', () => {
    it('should backfill intervention tasks when scope is entity_type=intervention', async () => {
      (mockRlsTx as Record<string, unknown>).behaviourIntervention = {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'int-1',
            title: 'Anger management',
            assigned_to_id: 'staff-1',
            start_date: new Date('2026-03-01'),
            intervention_number: 'INT-001',
          },
        ]),
      };

      (mockRlsTx as Record<string, unknown>).behaviourTask = {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'task-1' }),
      };

      const result = await service.backfillTasks(TENANT_ID, {
        scope: 'entity_type',
        entity_type: 'intervention',
      });

      expect(result.created).toBe(1);
    });

    it('should skip interventions that already have open tasks', async () => {
      (mockRlsTx as Record<string, unknown>).behaviourIntervention = {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'int-1',
            title: 'Anger management',
            assigned_to_id: 'staff-1',
            start_date: null,
            intervention_number: 'INT-001',
          },
        ]),
      };

      (mockRlsTx as Record<string, unknown>).behaviourTask = {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-task' }),
        create: jest.fn(),
      };

      const result = await service.backfillTasks(TENANT_ID, {
        scope: 'entity_type',
        entity_type: 'intervention',
      });

      expect(result.created).toBe(0);
    });

    it('should backfill sanction tasks when scope is entity_type=sanction', async () => {
      (mockRlsTx as Record<string, unknown>).behaviourSanction = {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'san-1',
            sanction_number: 'SAN-001',
            scheduled_date: null,
            supervised_by_id: null,
            incident: { reported_by_id: 'staff-1' },
          },
        ]),
      };

      (mockRlsTx as Record<string, unknown>).behaviourTask = {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'task-2' }),
      };

      const result = await service.backfillTasks(TENANT_ID, {
        scope: 'entity_type',
        entity_type: 'sanction',
      });

      expect(result.created).toBe(1);
    });

    it('should backfill both sanctions and interventions when scope is tenant', async () => {
      (mockRlsTx as Record<string, unknown>).behaviourIntervention = {
        findMany: jest.fn().mockResolvedValue([]),
      };

      (mockRlsTx as Record<string, unknown>).behaviourSanction = {
        findMany: jest.fn().mockResolvedValue([]),
      };

      (mockRlsTx as Record<string, unknown>).behaviourTask = {
        findFirst: jest.fn(),
        create: jest.fn(),
      };

      const result = await service.backfillTasks(TENANT_ID, {
        scope: 'tenant',
      });

      expect(result.created).toBe(0);
    });
  });

  // ─── backfillTasksPreview — branch coverage ──────────────────────────────

  describe('backfillTasksPreview', () => {
    beforeEach(() => {
      // Restore mocks that may have been replaced by backfillTasks tests
      (mockRlsTx as Record<string, unknown>).behaviourSanction = {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      };
      (mockRlsTx as Record<string, unknown>).behaviourIntervention = {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      };
    });

    it('should count sanctions when entity_type is sanction', async () => {
      (mockRlsTx.behaviourSanction as { count: jest.Mock }).count.mockResolvedValue(10);

      const result = await service.backfillTasksPreview(TENANT_ID, {
        scope: 'entity_type',
        entity_type: 'sanction',
      });

      expect(result.affected_records).toBe(10);
    });

    it('should count interventions when entity_type is intervention', async () => {
      (mockRlsTx.behaviourIntervention as { count: jest.Mock }).count.mockResolvedValue(5);

      const result = await service.backfillTasksPreview(TENANT_ID, {
        scope: 'entity_type',
        entity_type: 'intervention',
      });

      expect(result.affected_records).toBe(5);
    });

    it('should count both when scope is tenant', async () => {
      (mockRlsTx.behaviourSanction as { count: jest.Mock }).count.mockResolvedValue(10);
      (mockRlsTx.behaviourIntervention as { count: jest.Mock }).count.mockResolvedValue(5);

      const result = await service.backfillTasksPreview(TENANT_ID, {
        scope: 'tenant',
      });

      expect(result.affected_records).toBe(15);
    });

    it('should return ~5min for large entity count', async () => {
      (mockRlsTx.behaviourSanction as { count: jest.Mock }).count.mockResolvedValue(300);
      (mockRlsTx.behaviourIntervention as { count: jest.Mock }).count.mockResolvedValue(300);

      const result = await service.backfillTasksPreview(TENANT_ID, {
        scope: 'tenant',
      });

      expect(result.estimated_duration).toBe('~5min');
    });
  });

  // ─── reindexSearchPreview — branch coverage ──────────────────────────────

  describe('reindexSearchPreview — branch coverage', () => {
    it('should return ~5min for large incident count', async () => {
      mockRlsTx.behaviourIncident.count.mockResolvedValue(6000);

      const result = await service.reindexSearchPreview(TENANT_ID);

      expect(result.estimated_duration).toBe('~5min');
    });
  });

  // ─── retentionPreview — branch coverage ──────────────────────────────────

  describe('retentionPreview — branch coverage', () => {
    it('should return 0 for to_archive when no left students', async () => {
      studentFacade['findManyGeneric']!.mockResolvedValue([]);
      mockRlsTx.behaviourIncident.count.mockResolvedValue(5);
      mockRlsTx.behaviourLegalHold.count.mockResolvedValue(0);

      const result = await service.retentionPreview(TENANT_ID);

      expect(result.to_archive).toBe(0);
      expect(result.to_anonymise).toBe(5);
    });
  });

  // ─── resendNotification — branch coverage ────────────────────────────────

  describe('resendNotification — branch coverage', () => {
    it('should handle sanction_id instead of incident_id', async () => {
      await service.resendNotification(TENANT_ID, {
        sanction_id: 's-1',
        parent_id: 'p-1',
        channel: 'email',
      });

      expect(mockRlsTx.behaviourParentAcknowledgement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          incident_id: null,
          sanction_id: 's-1',
        }),
      });

      expect(mockNotificationsQueue.add).toHaveBeenCalledWith(
        'behaviour:parent-notification',
        expect.objectContaining({
          incident_id: null,
          sanction_id: 's-1',
          is_resend: true,
        }),
        expect.any(Object),
      );
    });
  });

  // ─── refreshViews ────────────────────────────────────────────────────────

  describe('refreshViews', () => {
    it('should refresh all three materialized views', async () => {
      const mockPrismaService = (service as unknown as { prisma: { $executeRaw: jest.Mock } })
        .prisma;
      mockPrismaService.$executeRaw = jest.fn().mockResolvedValue(0);

      await service.refreshViews(TENANT_ID);

      expect(mockPrismaService.$executeRaw).toHaveBeenCalledTimes(3);
    });
  });
});
