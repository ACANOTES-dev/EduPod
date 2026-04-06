import type { PulseDimension } from '@school/shared/behaviour';

import { PrismaService } from '../prisma/prisma.service';
import { RbacReadFacade } from '../rbac/rbac-read.facade';
import { RedisService } from '../redis/redis.service';
import { StudentReadFacade } from '../students/student-read.facade';

import { BehaviourPulseService } from './behaviour-pulse.service';

describe('BehaviourPulseService', () => {
  let service: BehaviourPulseService;

  beforeEach(() => {
    // Create service with mocked dependencies for pure function tests
    service = new BehaviourPulseService(
      {} as never, // PrismaService (not needed for computeComposite)
      {} as never as RedisService, // RedisService (not needed for computeComposite)
      {} as never as StudentReadFacade, // StudentReadFacade (not needed for computeComposite)
      {} as never as RbacReadFacade, // RbacReadFacade (not needed for computeComposite)
    );
  });

  describe('computeComposite', () => {
    const makeDimensions = (
      overrides: Partial<Record<string, number | null>> = {},
    ): PulseDimension[] => [
      {
        name: 'positive_ratio',
        value: 'positive_ratio' in overrides ? overrides.positive_ratio! : 0.8,
        weight: 0.2,
        label: 'Positive Ratio',
      },
      {
        name: 'severity_index',
        value: 'severity_index' in overrides ? overrides.severity_index! : 0.9,
        weight: 0.25,
        label: 'Severity Index',
      },
      {
        name: 'serious_incidents',
        value: 'serious_incidents' in overrides ? overrides.serious_incidents! : 1.0,
        weight: 0.25,
        label: 'Serious Incidents',
      },
      {
        name: 'resolution_rate',
        value: 'resolution_rate' in overrides ? overrides.resolution_rate! : 0.7,
        weight: 0.15,
        label: 'Resolution Rate',
      },
      {
        name: 'reporting_confidence',
        value: 'reporting_confidence' in overrides ? overrides.reporting_confidence! : 0.6,
        weight: 0.15,
        label: 'Reporting Confidence',
      },
    ];

    it('should return composite = null when reporting_confidence < 0.50', () => {
      const dims = makeDimensions({ reporting_confidence: 0.4 });
      expect(service.computeComposite(dims)).toBeNull();
    });

    it('should return composite score when reporting_confidence >= 0.50', () => {
      const dims = makeDimensions({ reporting_confidence: 0.6 });
      const result = service.computeComposite(dims);
      expect(result).not.toBeNull();
      expect(typeof result).toBe('number');
    });

    it('should return null when any dimension is null', () => {
      const dims = makeDimensions({ positive_ratio: null });
      expect(service.computeComposite(dims)).toBeNull();
    });

    it('should apply weights 20/25/25/15/15 to composite', () => {
      // All dimensions = 1.0 → composite should be 1.0
      const dims = makeDimensions({
        positive_ratio: 1.0,
        severity_index: 1.0,
        serious_incidents: 1.0,
        resolution_rate: 1.0,
        reporting_confidence: 1.0,
      });
      const result = service.computeComposite(dims);
      expect(result).toBeCloseTo(1.0, 5);
    });

    it('should compute weighted average correctly', () => {
      const dims = makeDimensions({
        positive_ratio: 0.5, // 0.5 * 0.20 = 0.10
        severity_index: 0.8, // 0.8 * 0.25 = 0.20
        serious_incidents: 0.6, // 0.6 * 0.25 = 0.15
        resolution_rate: 1.0, // 1.0 * 0.15 = 0.15
        reporting_confidence: 0.7, // 0.7 * 0.15 = 0.105
      });
      const result = service.computeComposite(dims);
      // Total: 0.10 + 0.20 + 0.15 + 0.15 + 0.105 = 0.705
      expect(result).toBeCloseTo(0.705, 5);
    });

    it('should return composite = null when reporting_confidence is null', () => {
      const dims = makeDimensions({ reporting_confidence: null });
      expect(service.computeComposite(dims)).toBeNull();
    });

    it('should return composite = null when reporting_confidence is exactly 0.50 - epsilon', () => {
      const dims = makeDimensions({ reporting_confidence: 0.499 });
      expect(service.computeComposite(dims)).toBeNull();
    });

    it('should return composite when reporting_confidence is exactly 0.50', () => {
      const dims = makeDimensions({ reporting_confidence: 0.5 });
      const result = service.computeComposite(dims);
      expect(result).not.toBeNull();
    });
  });

  describe('serious incident rate scoring (graduated decay)', () => {
    // Test the graduated decay curve logic
    // This is implemented in computeSeriousIncidentRate but we can test the scoring formula

    function scoreRate(rate: number): number {
      if (rate === 0) return 1.0;
      if (rate <= 0.5) return 1.0 - (rate / 0.5) * 0.2;
      if (rate <= 2.0) return 0.8 - ((rate - 0.5) / 1.5) * 0.4;
      if (rate <= 5.0) return 0.4 - ((rate - 2.0) / 3.0) * 0.3;
      return 0.0;
    }

    it('should return 1.0 when rate = 0', () => {
      expect(scoreRate(0)).toBe(1.0);
    });

    it('should return 0.8 when rate = 0.5', () => {
      expect(scoreRate(0.5)).toBeCloseTo(0.8, 5);
    });

    it('should return 0.4 when rate = 2.0', () => {
      expect(scoreRate(2.0)).toBeCloseTo(0.4, 5);
    });

    it('should return 0.1 when rate = 5.0', () => {
      expect(scoreRate(5.0)).toBeCloseTo(0.1, 5);
    });

    it('should return 0.0 when rate > 5.0', () => {
      expect(scoreRate(10.0)).toBe(0.0);
    });

    it('should handle mid-range value (rate = 1.0)', () => {
      // rate 1.0: 0.8 - ((1.0-0.5)/1.5) * 0.4 = 0.8 - 0.1333 = 0.6667
      expect(scoreRate(1.0)).toBeCloseTo(0.6667, 3);
    });
  });

  // ─── Dimension computations (Prisma-mocked) ─────────────────────────────

  describe('dimension computations', () => {
    let dimService: BehaviourPulseService;
    let mockPrisma: {
      behaviourIncident: {
        groupBy: jest.Mock;
        aggregate: jest.Mock;
        count: jest.Mock;
        findMany: jest.Mock;
      };
      tenantMembership: { count: jest.Mock };
      student: { count: jest.Mock };
    };

    const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const FROM = new Date('2026-03-19T00:00:00Z');
    const TO = new Date('2026-03-26T00:00:00Z');

    beforeEach(() => {
      mockPrisma = {
        behaviourIncident: {
          groupBy: jest.fn().mockResolvedValue([]),
          aggregate: jest.fn().mockResolvedValue({ _avg: { severity: null }, _count: 0 }),
          count: jest.fn().mockResolvedValue(0),
          findMany: jest.fn().mockResolvedValue([]),
        },
        tenantMembership: { count: jest.fn().mockResolvedValue(0) },
        student: { count: jest.fn().mockResolvedValue(0) },
      };

      dimService = new BehaviourPulseService(
        mockPrisma as unknown as PrismaService,
        {} as never as RedisService, // RedisService (not needed for dimension methods)
        { count: jest.fn().mockResolvedValue(0) } as unknown as StudentReadFacade,
        {
          countMembershipsWithPermission: jest.fn().mockResolvedValue(0),
        } as unknown as RbacReadFacade,
      );
    });

    afterEach(() => jest.clearAllMocks());

    it('should compute positive_ratio as positive / (positive + negative)', async () => {
      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([
        { polarity: 'positive', _count: 3 },
        { polarity: 'negative', _count: 7 },
      ]);

      const result = await dimService.computePositiveRatio(TENANT, FROM, TO);

      expect(result).toBeCloseTo(0.3, 5);
    });

    it('should return positive_ratio = null when zero positive+negative incidents', async () => {
      mockPrisma.behaviourIncident.groupBy.mockResolvedValue([]);

      const result = await dimService.computePositiveRatio(TENANT, FROM, TO);

      expect(result).toBeNull();
    });

    it('should compute severity_index = 1.0 when no negative incidents', async () => {
      mockPrisma.behaviourIncident.aggregate.mockResolvedValue({
        _avg: { severity: null },
        _count: 0,
      });

      const result = await dimService.computeSeverityIndex(TENANT, FROM, TO);

      expect(result).toBe(1.0);
    });

    it('should compute severity_index from weighted average severity', async () => {
      // avg severity = 5, count = 10 => 1 - (5-1)/9 = 1 - 4/9 = 0.5556
      mockPrisma.behaviourIncident.aggregate.mockResolvedValue({
        _avg: { severity: 5 },
        _count: 10,
      });

      const result = await dimService.computeSeverityIndex(TENANT, FROM, TO);

      expect(result).toBeCloseTo(1 - (5 - 1) / 9, 4); // ~0.5556
    });

    it('should compute resolution_rate = 1.0 when zero follow_ups_required', async () => {
      mockPrisma.behaviourIncident.count.mockResolvedValue(0);

      const result = await dimService.computeResolutionRate(TENANT, FROM, TO);

      expect(result).toBe(1.0);
    });

    it('should compute resolution_rate as resolved / required', async () => {
      mockPrisma.behaviourIncident.count
        .mockResolvedValueOnce(10) // followUpsRequired
        .mockResolvedValueOnce(7); // resolvedCount

      const result = await dimService.computeResolutionRate(TENANT, FROM, TO);

      expect(result).toBeCloseTo(0.7, 5);
    });

    it('should return reporting_confidence = null when total staff is 0', async () => {
      // distinctReporters query returns some rows but staff = 0
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([{ reported_by_id: 'user-1' }]);

      const result = await dimService.computeReportingConfidence(TENANT, FROM, TO);

      expect(result).toBeNull();
    });

    it('should compute reporting_confidence as reporters / totalStaff', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([
        { reported_by_id: 'user-1' },
        { reported_by_id: 'user-2' },
      ]);

      // Override rbac facade to return 10 staff
      const rbacFacade = (
        dimService as unknown as { rbacReadFacade: { countMembershipsWithPermission: jest.Mock } }
      ).rbacReadFacade;
      rbacFacade.countMembershipsWithPermission.mockResolvedValue(10);

      const result = await dimService.computeReportingConfidence(TENANT, FROM, TO);

      expect(result).toBeCloseTo(0.2, 5); // 2/10
    });

    it('should compute serious incident rate = 1.0 when enrolled = 0', async () => {
      const studentFacade = (dimService as unknown as { studentReadFacade: { count: jest.Mock } })
        .studentReadFacade;

      mockPrisma.behaviourIncident.count.mockResolvedValue(5); // seriousCount
      studentFacade.count.mockResolvedValue(0); // enrolledCount

      const result = await dimService.computeSeriousIncidentRate(TENANT, FROM, TO);

      expect(result).toBe(1.0);
    });

    it('should return 1.0 when serious count is 0', async () => {
      const studentFacade = (dimService as unknown as { studentReadFacade: { count: jest.Mock } })
        .studentReadFacade;

      mockPrisma.behaviourIncident.count.mockResolvedValue(0); // seriousCount
      studentFacade.count.mockResolvedValue(100); // enrolledCount

      const result = await dimService.computeSeriousIncidentRate(TENANT, FROM, TO);

      expect(result).toBe(1.0);
    });

    it('should apply graduated decay for rate <= 0.5', async () => {
      const studentFacade = (dimService as unknown as { studentReadFacade: { count: jest.Mock } })
        .studentReadFacade;

      // rate = (1/400)*100 = 0.25 -> 1.0 - (0.25/0.5)*0.2 = 0.9
      mockPrisma.behaviourIncident.count.mockResolvedValue(1);
      studentFacade.count.mockResolvedValue(400);

      const result = await dimService.computeSeriousIncidentRate(TENANT, FROM, TO);

      expect(result).toBeCloseTo(0.9, 2);
    });

    it('should apply graduated decay for rate in (0.5, 2.0]', async () => {
      const studentFacade = (dimService as unknown as { studentReadFacade: { count: jest.Mock } })
        .studentReadFacade;

      // rate = (1/100)*100 = 1.0 -> 0.8 - ((1.0-0.5)/1.5)*0.4 = 0.6667
      mockPrisma.behaviourIncident.count.mockResolvedValue(1);
      studentFacade.count.mockResolvedValue(100);

      const result = await dimService.computeSeriousIncidentRate(TENANT, FROM, TO);

      expect(result).toBeCloseTo(0.6667, 2);
    });

    it('should apply graduated decay for rate in (2.0, 5.0]', async () => {
      const studentFacade = (dimService as unknown as { studentReadFacade: { count: jest.Mock } })
        .studentReadFacade;

      // rate = (3/100)*100 = 3.0 -> 0.4 - ((3.0-2.0)/3.0)*0.3 = 0.3
      mockPrisma.behaviourIncident.count.mockResolvedValue(3);
      studentFacade.count.mockResolvedValue(100);

      const result = await dimService.computeSeriousIncidentRate(TENANT, FROM, TO);

      expect(result).toBeCloseTo(0.3, 2);
    });

    it('should return 0.0 for rate > 5.0', async () => {
      const studentFacade = (dimService as unknown as { studentReadFacade: { count: jest.Mock } })
        .studentReadFacade;

      // rate = (10/100)*100 = 10.0 -> 0.0
      mockPrisma.behaviourIncident.count.mockResolvedValue(10);
      studentFacade.count.mockResolvedValue(100);

      const result = await dimService.computeSeriousIncidentRate(TENANT, FROM, TO);

      expect(result).toBe(0.0);
    });
  });

  // ─── getPulse (cache + composition) ─────────────────────────────────────

  describe('getPulse', () => {
    let pulseService: BehaviourPulseService;
    let pulsePrisma: {
      behaviourIncident: {
        groupBy: jest.Mock;
        aggregate: jest.Mock;
        count: jest.Mock;
        findMany: jest.Mock;
      };
    };
    let mockRedisClient: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

    const PULSE_TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    beforeEach(() => {
      pulsePrisma = {
        behaviourIncident: {
          groupBy: jest.fn().mockResolvedValue([]),
          aggregate: jest.fn().mockResolvedValue({ _avg: { severity: null }, _count: 0 }),
          count: jest.fn().mockResolvedValue(0),
          findMany: jest.fn().mockResolvedValue([]),
        },
      };

      mockRedisClient = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
      };

      pulseService = new BehaviourPulseService(
        pulsePrisma as unknown as PrismaService,
        { getClient: () => mockRedisClient } as unknown as RedisService,
        { count: jest.fn().mockResolvedValue(100) } as unknown as StudentReadFacade,
        {
          countMembershipsWithPermission: jest.fn().mockResolvedValue(10),
        } as unknown as RbacReadFacade,
      );
    });

    it('should return cached result when available', async () => {
      const cached = {
        dimensions: [],
        composite: 0.8,
        composite_available: true,
        gate_reason: null,
        cached_at: new Date().toISOString(),
        pulse_enabled: true,
      };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cached));

      const result = await pulseService.getPulse(PULSE_TENANT);

      expect(result).toEqual(cached);
      // Should NOT call any Prisma methods when cache hit
      expect(pulsePrisma.behaviourIncident.groupBy).not.toHaveBeenCalled();
    });

    it('should compute fresh result and cache it on miss', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await pulseService.getPulse(PULSE_TENANT);

      expect(result.dimensions).toHaveLength(5);
      expect(result.pulse_enabled).toBe(true);
      expect(result.cached_at).toBeDefined();
      // Should set cache
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `behaviour:pulse:${PULSE_TENANT}`,
        expect.any(String),
        'EX',
        300,
      );
    });

    it('should set gate_reason when reporting_confidence < 0.5', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      // reportingConfidence will be null because findMany returns [] and staff returns 10
      // -> 0/10 = 0.0 which is < 0.5

      const result = await pulseService.getPulse(PULSE_TENANT);

      expect(result.gate_reason).toContain('50%');
      expect(result.composite).toBeNull();
      expect(result.composite_available).toBe(false);
    });
  });

  // ─── invalidateCache ──────────────────────────────────────────────────────

  describe('invalidateCache', () => {
    it('should delete the cache key for the tenant', async () => {
      const mockDel = jest.fn().mockResolvedValue(1);
      const cacheService = new BehaviourPulseService(
        {} as unknown as PrismaService,
        { getClient: () => ({ del: mockDel }) } as unknown as RedisService,
        {} as unknown as StudentReadFacade,
        {} as unknown as RbacReadFacade,
      );

      await cacheService.invalidateCache('tenant-123');

      expect(mockDel).toHaveBeenCalledWith('behaviour:pulse:tenant-123');
    });
  });
});
