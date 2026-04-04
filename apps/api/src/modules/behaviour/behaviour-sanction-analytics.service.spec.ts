import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, ConfigurationReadFacade } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourSanctionAnalyticsService } from './behaviour-sanction-analytics.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const PERMISSIONS = ['behaviour.view'];
const BASE_QUERY = { from: '2026-03-01', to: '2026-03-31', exposureNormalised: false };

// ─── Mock factories ─────────────────────────────────────────────────────────

const makeMockPrisma = () => ({
  behaviourSanction: {
    groupBy: jest.fn().mockResolvedValue([]),
  },
  behaviourIntervention: {
    groupBy: jest.fn().mockResolvedValue([]),
  },
  behaviourPolicyRule: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  behaviourPolicyEvaluation: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  behaviourTask: {
    groupBy: jest.fn().mockResolvedValue([]),
  },
  tenantSetting: {
    findFirst: jest.fn().mockResolvedValue(null),
  },
  $queryRaw: jest.fn().mockResolvedValue([]),
});

type MockPrisma = ReturnType<typeof makeMockPrisma>;

describe('BehaviourSanctionAnalyticsService', () => {
  let service: BehaviourSanctionAnalyticsService;
  let mockPrisma: MockPrisma;

  beforeEach(async () => {
    mockPrisma = makeMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        BehaviourSanctionAnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigurationReadFacade, useValue: { findSettingsJson: mockPrisma.tenantSetting.findFirst } },
      ],
    }).compile();

    service = module.get<BehaviourSanctionAnalyticsService>(BehaviourSanctionAnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getSanctions ──────────────────────────────────────────────────────

  describe('BehaviourSanctionAnalyticsService -- getSanctions', () => {
    it('should return empty entries when no sanctions exist', async () => {
      const result = await service.getSanctions(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.entries).toEqual([]);
      expect(result.data_quality).toBeDefined();
    });

    it('should aggregate by type with served/no_show counts', async () => {
      mockPrisma.behaviourSanction.groupBy.mockResolvedValue([
        { type: 'detention', status: 'served', _count: { _all: 5 } },
        { type: 'detention', status: 'no_show', _count: { _all: 2 } },
        { type: 'detention', status: 'pending_approval', _count: { _all: 1 } },
        { type: 'suspension', status: 'served', _count: { _all: 3 } },
      ]);

      const result = await service.getSanctions(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.entries).toHaveLength(2);
      const detention = result.entries.find((e) => e.sanction_type === 'detention');
      expect(detention?.total).toBe(8);
      expect(detention?.served).toBe(5);
      expect(detention?.no_show).toBe(2);

      const suspension = result.entries.find((e) => e.sanction_type === 'suspension');
      expect(suspension?.total).toBe(3);
      expect(suspension?.served).toBe(3);
    });
  });

  // ─── getInterventionOutcomes ───────────────────────────────────────────

  describe('BehaviourSanctionAnalyticsService -- getInterventionOutcomes', () => {
    it('should return empty entries when no interventions have outcomes', async () => {
      const result = await service.getInterventionOutcomes(TENANT_ID, BASE_QUERY);

      expect(result.entries).toEqual([]);
    });

    it('should split counts by SEND awareness', async () => {
      mockPrisma.behaviourIntervention.groupBy.mockResolvedValue([
        { outcome: 'improved', send_aware: true, _count: 4 },
        { outcome: 'improved', send_aware: false, _count: 6 },
        { outcome: 'no_change', send_aware: false, _count: 2 },
      ]);

      const result = await service.getInterventionOutcomes(TENANT_ID, BASE_QUERY);

      expect(result.entries).toHaveLength(2);
      const improved = result.entries.find((e) => e.outcome === 'improved');
      expect(improved?.count).toBe(10);
      expect(improved?.send_count).toBe(4);
      expect(improved?.non_send_count).toBe(6);
    });
  });

  // ─── getPolicyEffectiveness ────────────────────────────────────────────

  describe('BehaviourSanctionAnalyticsService -- getPolicyEffectiveness', () => {
    it('should return rules with zero evaluations when no evaluations exist', async () => {
      mockPrisma.behaviourPolicyRule.findMany.mockResolvedValue([
        { id: 'rule-1', name: 'Auto-detention' },
      ]);

      const result = await service.getPolicyEffectiveness(TENANT_ID, BASE_QUERY);

      expect(result.rules).toHaveLength(1);
      expect(result.rules[0]!.match_count).toBe(0);
      expect(result.rules[0]!.fire_rate).toBe(0);
    });

    it('should compute fire rate correctly', async () => {
      mockPrisma.behaviourPolicyRule.findMany.mockResolvedValue([
        { id: 'rule-1', name: 'Auto-detention' },
      ]);
      mockPrisma.behaviourPolicyEvaluation.findMany.mockResolvedValue([
        { evaluation_result: 'matched', rule_version: { rule_id: 'rule-1' } },
        { evaluation_result: 'not_matched', rule_version: { rule_id: 'rule-1' } },
        { evaluation_result: 'matched', rule_version: { rule_id: 'rule-1' } },
      ]);

      const result = await service.getPolicyEffectiveness(TENANT_ID, BASE_QUERY);

      expect(result.rules[0]!.match_count).toBe(3);
      expect(result.rules[0]!.fire_count).toBe(2);
      expect(result.rules[0]!.fire_rate).toBeCloseTo(2 / 3);
    });
  });

  // ─── getTaskCompletion ─────────────────────────────────────────────────

  describe('BehaviourSanctionAnalyticsService -- getTaskCompletion', () => {
    it('should return empty entries when no tasks exist', async () => {
      const result = await service.getTaskCompletion(TENANT_ID, BASE_QUERY);

      expect(result.entries).toEqual([]);
    });

    it('should compute completion rate and overdue counts', async () => {
      mockPrisma.behaviourTask.groupBy
        .mockResolvedValueOnce([
          { task_type: 'follow_up', status: 'completed', _count: 8 },
          { task_type: 'follow_up', status: 'pending', _count: 2 },
        ])
        .mockResolvedValueOnce([{ task_type: 'follow_up', _count: 1 }]);
      mockPrisma.$queryRaw.mockResolvedValue([{ task_type: 'follow_up', avg_days: 2.5 }]);

      const result = await service.getTaskCompletion(TENANT_ID, BASE_QUERY);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.total).toBe(10);
      expect(result.entries[0]!.completed).toBe(8);
      expect(result.entries[0]!.overdue).toBe(1);
      expect(result.entries[0]!.completion_rate).toBe(0.8);
      expect(result.entries[0]!.avg_days_to_complete).toBe(2.5);
    });
  });

  // ─── getBenchmarks ─────────────────────────────────────────────────────

  describe('BehaviourSanctionAnalyticsService -- getBenchmarks', () => {
    it('should return empty with benchmarking_enabled false when disabled', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue({
        behaviour: { cross_school_benchmarking_enabled: false },
      });

      const result = await service.getBenchmarks(TENANT_ID, { exposureNormalised: false });

      expect(result.benchmarking_enabled).toBe(false);
      expect(result.entries).toEqual([]);
    });

    it('should return benchmark rows when enabled and data available', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue({
        behaviour: { cross_school_benchmarking_enabled: true },
      });
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          benchmark_category: 'disruption',
          metric_name: 'rate_per_100',
          tenant_value: 12.5,
          etb_average: 15.2,
          percentile: 35,
          sample_size: BigInt(8),
        },
      ]);

      const result = await service.getBenchmarks(TENANT_ID, { exposureNormalised: false });

      expect(result.benchmarking_enabled).toBe(true);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.tenant_value).toBe(12.5);
      expect(result.entries[0]!.sample_size).toBe(8);
    });

    it('should return empty entries when MV query fails', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue({
        behaviour: { cross_school_benchmarking_enabled: true },
      });
      mockPrisma.$queryRaw.mockRejectedValue(new Error('MV not available'));

      const result = await service.getBenchmarks(TENANT_ID, { exposureNormalised: false });

      expect(result.benchmarking_enabled).toBe(true);
      expect(result.entries).toEqual([]);
    });
  });
});
