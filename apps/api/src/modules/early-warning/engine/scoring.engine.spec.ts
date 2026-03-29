import { ScoringEngine } from './scoring.engine';
import type {
  DetectedSignal,
  SignalResult,
  ThresholdConfig,
  WeightConfig,
} from './types';
import {
  DEFAULT_CROSS_DOMAIN_THRESHOLD,
  DEFAULT_HYSTERESIS_BUFFER,
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
} from './types';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeSignal(overrides: Partial<DetectedSignal> = {}): DetectedSignal {
  return {
    signalType: 'test_signal',
    severity: 'medium',
    scoreContribution: 10,
    details: {},
    sourceEntityType: 'TestEntity',
    sourceEntityId: 'test-entity-id',
    summaryFragment: 'Test signal detected.',
    ...overrides,
  };
}

function makeSignalResult(
  domain: SignalResult['domain'],
  rawScore: number,
  signals: DetectedSignal[] = [],
): SignalResult {
  return {
    domain,
    rawScore,
    signals: signals.length > 0 ? signals : (rawScore > 0 ? [makeSignal({ scoreContribution: rawScore })] : []),
    summaryFragments: signals.length > 0
      ? signals.map((s) => s.summaryFragment)
      : (rawScore > 0 ? ['Test signal detected.'] : []),
  };
}

function makeAllSignalResults(scores: {
  attendance?: number;
  grades?: number;
  behaviour?: number;
  wellbeing?: number;
  engagement?: number;
}): SignalResult[] {
  return [
    makeSignalResult('attendance', scores.attendance ?? 0),
    makeSignalResult('grades', scores.grades ?? 0),
    makeSignalResult('behaviour', scores.behaviour ?? 0),
    makeSignalResult('wellbeing', scores.wellbeing ?? 0),
    makeSignalResult('engagement', scores.engagement ?? 0),
  ];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ScoringEngine', () => {
  const engine = new ScoringEngine();
  const weights = DEFAULT_WEIGHTS;
  const thresholds = DEFAULT_THRESHOLDS;
  const buffer = DEFAULT_HYSTERESIS_BUFFER;
  const crossThreshold = DEFAULT_CROSS_DOMAIN_THRESHOLD;

  // ─── Weight application ───────────────────────────────────────────────

  describe('computeRisk — weight application', () => {
    it('should compute weighted composite from 5 domain scores using default weights', () => {
      // attendance=60 * 0.25 = 15, grades=40 * 0.25 = 10, behaviour=50 * 0.20 = 10,
      // wellbeing=30 * 0.20 = 6, engagement=80 * 0.10 = 8
      // Total = 49. Cross-domain: attendance=60, grades=40, behaviour=50, engagement=80 -> 4 domains >= 40 -> +10
      // Total = 49 + 10 = 59
      const signals = makeAllSignalResults({
        attendance: 60,
        grades: 40,
        behaviour: 50,
        wellbeing: 30,
        engagement: 80,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, null, [], crossThreshold,
      );

      expect(result.domainScores).toEqual({
        attendance: 60,
        grades: 40,
        behaviour: 50,
        wellbeing: 30,
        engagement: 80,
      });
      expect(result.compositeScore).toBe(59);
    });

    it('should apply custom weights correctly', () => {
      const customWeights: WeightConfig = {
        attendance: 40,
        grades: 30,
        behaviour: 10,
        wellbeing: 10,
        engagement: 10,
      };

      const signals = makeAllSignalResults({
        attendance: 100,
        grades: 0,
        behaviour: 0,
        wellbeing: 0,
        engagement: 0,
      });

      const result = engine.computeRisk(
        signals, customWeights, thresholds, buffer, null, [], crossThreshold,
      );

      // 100 * 0.40 = 40, rest = 0. Cross-domain: only 1 domain >= 40 -> +0
      expect(result.compositeScore).toBe(40);
    });

    it('should store raw domain scores (not weighted) in domainScores', () => {
      const signals = makeAllSignalResults({
        attendance: 80,
        grades: 60,
        behaviour: 40,
        wellbeing: 20,
        engagement: 10,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, null, [], crossThreshold,
      );

      // domainScores should be the RAW scores, not weighted
      expect(result.domainScores).toEqual({
        attendance: 80,
        grades: 60,
        behaviour: 40,
        wellbeing: 20,
        engagement: 10,
      });
    });
  });

  // ─── Cross-domain boost ───────────────────────────────────────────────

  describe('computeRisk — cross-domain correlation boost', () => {
    it('should add +0 when fewer than 3 domains >= threshold', () => {
      // Only 2 domains >= 40: attendance=50, grades=60
      const signals = makeAllSignalResults({
        attendance: 50,
        grades: 60,
        behaviour: 10,
        wellbeing: 5,
        engagement: 0,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, null, [], crossThreshold,
      );

      expect(result.crossDomainBoost).toBe(0);
    });

    it('should add +5 when exactly 3 domains >= threshold', () => {
      // 3 domains >= 40: attendance=50, grades=60, behaviour=45
      const signals = makeAllSignalResults({
        attendance: 50,
        grades: 60,
        behaviour: 45,
        wellbeing: 10,
        engagement: 0,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, null, [], crossThreshold,
      );

      expect(result.crossDomainBoost).toBe(5);
    });

    it('should add +10 when exactly 4 domains >= threshold', () => {
      // 4 domains >= 40
      const signals = makeAllSignalResults({
        attendance: 50,
        grades: 60,
        behaviour: 45,
        wellbeing: 40,
        engagement: 10,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, null, [], crossThreshold,
      );

      expect(result.crossDomainBoost).toBe(10);
    });

    it('should add +15 when all 5 domains >= threshold', () => {
      const signals = makeAllSignalResults({
        attendance: 50,
        grades: 60,
        behaviour: 45,
        wellbeing: 40,
        engagement: 40,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, null, [], crossThreshold,
      );

      expect(result.crossDomainBoost).toBe(15);
    });

    it('should use custom cross-domain threshold', () => {
      // With threshold 60, only 1 domain >= 60: grades=60
      const signals = makeAllSignalResults({
        attendance: 50,
        grades: 60,
        behaviour: 45,
        wellbeing: 55,
        engagement: 40,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, null, [], 60,
      );

      expect(result.crossDomainBoost).toBe(0);
    });

    it('should count domains at exactly the threshold', () => {
      // All 5 domains at exactly 40 (>= 40)
      const signals = makeAllSignalResults({
        attendance: 40,
        grades: 40,
        behaviour: 40,
        wellbeing: 40,
        engagement: 40,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, null, [], crossThreshold,
      );

      expect(result.crossDomainBoost).toBe(15);
    });
  });

  // ─── Composite score capping ──────────────────────────────────────────

  describe('computeRisk — composite score capping', () => {
    it('should cap composite score at 100 even with cross-domain boost', () => {
      // All domains at 100: weighted = 100, boost = +15 -> 115 -> capped at 100
      const signals = makeAllSignalResults({
        attendance: 100,
        grades: 100,
        behaviour: 100,
        wellbeing: 100,
        engagement: 100,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, null, [], crossThreshold,
      );

      expect(result.compositeScore).toBe(100);
      expect(result.crossDomainBoost).toBe(15);
    });
  });

  // ─── Tier assignment ──────────────────────────────────────────────────

  describe('computeRisk — tier thresholds', () => {
    it('should assign green for low composite score', () => {
      const signals = makeAllSignalResults({
        attendance: 10,
        grades: 10,
        behaviour: 10,
        wellbeing: 10,
        engagement: 10,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, null, [], crossThreshold,
      );

      // 10*0.25 + 10*0.25 + 10*0.20 + 10*0.20 + 10*0.10 = 10. No boost (<3 domains >= 40)
      expect(result.compositeScore).toBe(10);
      expect(result.riskTier).toBe('green');
    });

    it('should assign red for high composite score', () => {
      const signals = makeAllSignalResults({
        attendance: 80,
        grades: 80,
        behaviour: 80,
        wellbeing: 80,
        engagement: 80,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, null, [], crossThreshold,
      );

      // 80*1.0 = 80 + 15 (all 5 >= 40) = 95. Red.
      expect(result.compositeScore).toBe(95);
      expect(result.riskTier).toBe('red');
    });
  });

  // ─── Hysteresis integration ───────────────────────────────────────────

  describe('computeRisk — hysteresis integration', () => {
    it('should apply hysteresis on downgrade (red -> still red in buffer zone)', () => {
      // att=50, grd=50, beh=50, well=50, eng=60 -> weighted=51, boost=15 -> 66
      const signals = makeAllSignalResults({
        attendance: 50,
        grades: 50,
        behaviour: 50,
        wellbeing: 50,
        engagement: 60,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, 'red', [], crossThreshold,
      );

      // Composite = 66. Previously red. Hysteresis: need <= 65. 66 > 65 -> stays red.
      expect(result.compositeScore).toBe(66);
      expect(result.riskTier).toBe('red');
      expect(result.tierChanged).toBe(false);
      expect(result.previousTier).toBe('red');
    });

    it('should downgrade when below hysteresis buffer', () => {
      // att=50, grd=50, beh=50, well=50, eng=50 -> weighted=50, boost=15 -> 65
      const signals = makeAllSignalResults({
        attendance: 50,
        grades: 50,
        behaviour: 50,
        wellbeing: 50,
        engagement: 50,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, 'red', [], crossThreshold,
      );

      expect(result.compositeScore).toBe(65);
      expect(result.riskTier).toBe('amber');
      expect(result.tierChanged).toBe(true);
      expect(result.previousTier).toBe('red');
    });

    it('should upgrade immediately (green -> yellow)', () => {
      // att=30, grd=30, beh=30, well=30, eng=30 -> weighted=30, boost=0 -> 30
      const signals = makeAllSignalResults({
        attendance: 30,
        grades: 30,
        behaviour: 30,
        wellbeing: 30,
        engagement: 30,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, 'green', [], crossThreshold,
      );

      expect(result.compositeScore).toBe(30);
      expect(result.riskTier).toBe('yellow');
      expect(result.tierChanged).toBe(true);
      expect(result.previousTier).toBe('green');
    });
  });

  // ─── Trend data ───────────────────────────────────────────────────────

  describe('computeRisk — trend data', () => {
    it('should append current composite score to trend history', () => {
      const history = [20, 25, 30];
      const signals = makeAllSignalResults({
        attendance: 40,
        grades: 40,
        behaviour: 40,
        wellbeing: 40,
        engagement: 40,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, null, history, crossThreshold,
      );

      // weighted = 40, boost = 15 -> 55
      expect(result.trendData).toEqual([20, 25, 30, 55]);
    });

    it('should trim trend data to last 30 entries', () => {
      const history = Array.from({ length: 29 }, (_, i) => i + 1); // 1..29
      const signals = makeAllSignalResults({
        attendance: 50,
        grades: 50,
        behaviour: 50,
        wellbeing: 50,
        engagement: 50,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, null, history, crossThreshold,
      );

      // 29 entries + 1 current = 30. All fit.
      expect(result.trendData).toHaveLength(30);
      expect(result.trendData[29]).toBe(65); // 50 weighted + 15 boost
    });

    it('should drop oldest entries when trend exceeds 30', () => {
      const history = Array.from({ length: 30 }, (_, i) => i + 1); // 1..30
      const signals = makeAllSignalResults({
        attendance: 0,
        grades: 0,
        behaviour: 0,
        wellbeing: 0,
        engagement: 0,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, null, history, crossThreshold,
      );

      // 30 + 1 = 31 -> trimmed to 30. Oldest (1) dropped.
      expect(result.trendData).toHaveLength(30);
      expect(result.trendData[0]).toBe(2); // oldest is now 2
      expect(result.trendData[29]).toBe(0); // current score
    });
  });

  // ─── Signals passthrough ──────────────────────────────────────────────

  describe('computeRisk — signals aggregation', () => {
    it('should aggregate all signals from all domains into a flat list', () => {
      const sigA = makeSignal({ signalType: 'attendance_decline', scoreContribution: 20 });
      const sigB = makeSignal({ signalType: 'grade_drop', scoreContribution: 15 });
      const sigC = makeSignal({ signalType: 'incident_freq', scoreContribution: 10 });

      const signals: SignalResult[] = [
        makeSignalResult('attendance', 50, [sigA]),
        makeSignalResult('grades', 40, [sigB]),
        makeSignalResult('behaviour', 30, [sigC]),
        makeSignalResult('wellbeing', 0),
        makeSignalResult('engagement', 0),
      ];

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, null, [], crossThreshold,
      );

      expect(result.signals).toHaveLength(3);
      expect(result.signals).toEqual(expect.arrayContaining([sigA, sigB, sigC]));
    });
  });

  // ─── Summary text ─────────────────────────────────────────────────────

  describe('computeRisk — summary text', () => {
    it('should generate a non-empty summary string', () => {
      const signals = makeAllSignalResults({
        attendance: 50,
        grades: 50,
        behaviour: 50,
        wellbeing: 50,
        engagement: 50,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, null, [], crossThreshold,
      );

      expect(result.summaryText.length).toBeGreaterThan(0);
      expect(result.summaryText).toContain('Risk score');
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────────

  describe('computeRisk — edge cases', () => {
    it('should handle all zeros (no risk)', () => {
      const signals = makeAllSignalResults({
        attendance: 0,
        grades: 0,
        behaviour: 0,
        wellbeing: 0,
        engagement: 0,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, null, [], crossThreshold,
      );

      expect(result.compositeScore).toBe(0);
      expect(result.riskTier).toBe('green');
      expect(result.crossDomainBoost).toBe(0);
      expect(result.domainScores).toEqual({
        attendance: 0,
        grades: 0,
        behaviour: 0,
        wellbeing: 0,
        engagement: 0,
      });
    });

    it('should handle all 100s (maximum risk)', () => {
      const signals = makeAllSignalResults({
        attendance: 100,
        grades: 100,
        behaviour: 100,
        wellbeing: 100,
        engagement: 100,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, null, [], crossThreshold,
      );

      // 100 weighted + 15 boost = 115 -> capped at 100
      expect(result.compositeScore).toBe(100);
      expect(result.riskTier).toBe('red');
      expect(result.crossDomainBoost).toBe(15);
    });

    it('should handle single domain high, rest zero', () => {
      const signals = makeAllSignalResults({
        attendance: 100,
        grades: 0,
        behaviour: 0,
        wellbeing: 0,
        engagement: 0,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, null, [], crossThreshold,
      );

      // 100 * 0.25 = 25. No boost (only 1 domain >= 40). Score = 25.
      expect(result.compositeScore).toBe(25);
      expect(result.riskTier).toBe('green');
      expect(result.crossDomainBoost).toBe(0);
    });

    it('should handle first computation with no previous tier and no history', () => {
      const signals = makeAllSignalResults({
        attendance: 50,
        grades: 50,
        behaviour: 50,
        wellbeing: 50,
        engagement: 50,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, null, [], crossThreshold,
      );

      expect(result.previousTier).toBeNull();
      expect(result.tierChanged).toBe(true);
      expect(result.trendData).toHaveLength(1);
      expect(result.trendData[0]).toBe(result.compositeScore);
    });

    it('should return previousTier in the result even when tier did not change', () => {
      const signals = makeAllSignalResults({
        attendance: 10,
        grades: 10,
        behaviour: 10,
        wellbeing: 10,
        engagement: 10,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, 'green', [10], crossThreshold,
      );

      expect(result.previousTier).toBe('green');
      expect(result.tierChanged).toBe(false);
    });
  });

  // ─── Composite score precision ────────────────────────────────────────

  describe('computeRisk — numeric precision', () => {
    it('should round composite score to nearest integer', () => {
      // att=33, grd=33, beh=33, well=33, eng=33
      // 33*0.25 + 33*0.25 + 33*0.20 + 33*0.20 + 33*0.10 = 8.25+8.25+6.6+6.6+3.3 = 33
      const signals = makeAllSignalResults({
        attendance: 33,
        grades: 33,
        behaviour: 33,
        wellbeing: 33,
        engagement: 33,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, null, [], crossThreshold,
      );

      expect(Number.isInteger(result.compositeScore)).toBe(true);
      expect(result.compositeScore).toBe(33);
    });

    it('should round correctly when weights produce fractional result', () => {
      // att=37, grd=43, beh=51, well=29, eng=63
      // 37*0.25 + 43*0.25 + 51*0.20 + 29*0.20 + 63*0.10
      // = 9.25 + 10.75 + 10.2 + 5.8 + 6.3 = 42.3
      // Domains >= 40: grades=43, behaviour=51, engagement=63 -> 3 domains -> +5
      // 42.3 + 5 = 47.3 -> rounded to 47
      const signals = makeAllSignalResults({
        attendance: 37,
        grades: 43,
        behaviour: 51,
        wellbeing: 29,
        engagement: 63,
      });

      const result = engine.computeRisk(
        signals, weights, thresholds, buffer, null, [], crossThreshold,
      );

      expect(result.compositeScore).toBe(47);
    });
  });
});
