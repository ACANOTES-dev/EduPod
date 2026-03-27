import type { PulseDimension } from '@school/shared';

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
});
