import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';

import { BehaviourSideEffectsService } from './behaviour-side-effects.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const INCIDENT_ID = 'incident-1';
const SANCTION_ID = 'sanction-1';
const STUDENT_ID = 'student-1';

describe('BehaviourSideEffectsService', () => {
  let service: BehaviourSideEffectsService;
  let mockNotificationsQueue: { add: jest.Mock };
  let mockBehaviourQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockNotificationsQueue = { add: jest.fn().mockResolvedValue(undefined) };
    mockBehaviourQueue = { add: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourSideEffectsService,
        { provide: getQueueToken('notifications'), useValue: mockNotificationsQueue },
        { provide: getQueueToken('behaviour'), useValue: mockBehaviourQueue },
      ],
    }).compile();

    service = module.get<BehaviourSideEffectsService>(BehaviourSideEffectsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── emitParentNotification ────────────────────────────────────────────

  describe('BehaviourSideEffectsService -- emitParentNotification', () => {
    const payload = {
      tenant_id: TENANT_ID,
      incident_id: INCIDENT_ID,
      student_ids: [STUDENT_ID],
    };

    it('should enqueue a parent notification and return true', async () => {
      const result = await service.emitParentNotification(payload);

      expect(result).toBe(true);
      expect(mockNotificationsQueue.add).toHaveBeenCalledWith(
        'behaviour:parent-notification',
        payload,
      );
    });

    it('should return false when queue.add fails', async () => {
      mockNotificationsQueue.add.mockRejectedValue(new Error('Redis down'));

      const result = await service.emitParentNotification(payload);

      expect(result).toBe(false);
    });
  });

  // ─── emitPolicyEvaluation ──────────────────────────────────────────────

  describe('BehaviourSideEffectsService -- emitPolicyEvaluation', () => {
    const payload = {
      tenant_id: TENANT_ID,
      incident_id: INCIDENT_ID,
      trigger: 'incident_created' as const,
      triggered_at: '2026-04-01T10:00:00.000Z',
    };

    it('should enqueue a policy evaluation and return true', async () => {
      const result = await service.emitPolicyEvaluation(payload);

      expect(result).toBe(true);
      expect(mockBehaviourQueue.add).toHaveBeenCalledWith('behaviour:evaluate-policy', payload);
    });

    it('should return false when queue.add fails', async () => {
      mockBehaviourQueue.add.mockRejectedValue(new Error('Redis down'));

      const result = await service.emitPolicyEvaluation(payload);

      expect(result).toBe(false);
    });
  });

  // ─── emitCheckAwards ───────────────────────────────────────────────────

  describe('BehaviourSideEffectsService -- emitCheckAwards', () => {
    const payload = {
      tenant_id: TENANT_ID,
      incident_id: INCIDENT_ID,
      student_ids: [STUDENT_ID],
      academic_year_id: 'ay-1',
      academic_period_id: 'ap-1',
    };

    it('should enqueue a check-awards job and return true', async () => {
      const result = await service.emitCheckAwards(payload);

      expect(result).toBe(true);
      expect(mockBehaviourQueue.add).toHaveBeenCalledWith('behaviour:check-awards', payload);
    });

    it('should return false when queue.add fails', async () => {
      mockBehaviourQueue.add.mockRejectedValue(new Error('Redis down'));

      const result = await service.emitCheckAwards(payload);

      expect(result).toBe(false);
    });
  });

  // ─── emitSanctionParentNotification ────────────────────────────────────

  describe('BehaviourSideEffectsService -- emitSanctionParentNotification', () => {
    const payload = {
      tenant_id: TENANT_ID,
      sanction_id: SANCTION_ID,
      student_id: STUDENT_ID,
    };

    it('should enqueue a sanction parent notification', async () => {
      await service.emitSanctionParentNotification(payload);

      expect(mockNotificationsQueue.add).toHaveBeenCalledWith(
        'behaviour:sanction-parent-notification',
        payload,
      );
    });

    it('should not throw when queue.add fails', async () => {
      mockNotificationsQueue.add.mockRejectedValue(new Error('Redis down'));

      await expect(service.emitSanctionParentNotification(payload)).resolves.toBeUndefined();
    });
  });

  // ─── emitCreateExclusionCase ───────────────────────────────────────────

  describe('BehaviourSideEffectsService -- emitCreateExclusionCase', () => {
    const payload = {
      tenant_id: TENANT_ID,
      sanction_id: SANCTION_ID,
    };

    it('should enqueue a create-exclusion-case job', async () => {
      await service.emitCreateExclusionCase(payload);

      expect(mockBehaviourQueue.add).toHaveBeenCalledWith(
        'behaviour:create-exclusion-case',
        payload,
      );
    });

    it('should not throw when queue.add fails', async () => {
      mockBehaviourQueue.add.mockRejectedValue(new Error('Redis down'));

      await expect(service.emitCreateExclusionCase(payload)).resolves.toBeUndefined();
    });
  });
});
