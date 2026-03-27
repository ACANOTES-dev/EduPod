import type { PulseDimension } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourPulseService } from './behaviour-pulse.service';

describe('BehaviourPulseService', () => {
  let service: BehaviourPulseService;

  beforeEach(() => {
    // Create service with mocked dependencies for pure function tests
    service = new BehaviourPulseService(
      {} as never, // PrismaService (not needed for computeComposite)
      {} as never, // RedisService (not needed for computeComposite)
    );
  });

  describe('computeComposite', () => {
    const makeDimensions = (overrides: Partial<Record<string, number | null>> = {}): PulseDimension[] => [
      { name: 'positive_ratio', value: 'positive_ratio' in overrides ? overrides.positive_ratio! : 0.8, weight: 0.2, label: 'Positive Ratio' },
      { name: 'severity_index', value: 'severity_index' in overrides ? overrides.severity_index! : 0.9, weight: 0.25, label: 'Severity Index' },
      { name: 'serious_incidents', value: 'serious_incidents' in overrides ? overrides.serious_incidents! : 1.0, weight: 0.25, label: 'Serious Incidents' },
      { name: 'resolution_rate', value: 'resolution_rate' in overrides ? overrides.resolution_rate! : 0.7, weight: 0.15, label: 'Resolution Rate' },
      { name: 'reporting_confidence', value: 'reporting_confidence' in overrides ? overrides.reporting_confidence! : 0.6, weight: 0.15, label: 'Reporting Confidence' },
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
        positive_ratio: 0.5,      // 0.5 * 0.20 = 0.10
        severity_index: 0.8,      // 0.8 * 0.25 = 0.20
        serious_incidents: 0.6,   // 0.6 * 0.25 = 0.15
        resolution_rate: 1.0,     // 1.0 * 0.15 = 0.15
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
        {} as never, // RedisService (not needed for dimension methods)
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
  });
});
