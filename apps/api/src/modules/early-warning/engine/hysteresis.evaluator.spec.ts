import { HysteresisEvaluator } from './hysteresis.evaluator';
import type { ThresholdConfig } from './types';
import { DEFAULT_HYSTERESIS_BUFFER, DEFAULT_THRESHOLDS } from './types';

describe('HysteresisEvaluator', () => {
  const evaluator = new HysteresisEvaluator();
  const thresholds = DEFAULT_THRESHOLDS;
  const buffer = DEFAULT_HYSTERESIS_BUFFER;

  // ─── First computation (no previous tier) ─────────────────────────────────

  describe('assignTier — first computation (previousTier = null)', () => {
    it('should assign green for score 0', () => {
      const result = evaluator.assignTier(0, null, thresholds, buffer);
      expect(result).toEqual({ tier: 'green', tierChanged: true });
    });

    it('should assign green for score 29', () => {
      const result = evaluator.assignTier(29, null, thresholds, buffer);
      expect(result).toEqual({ tier: 'green', tierChanged: true });
    });

    it('should assign yellow for score 30', () => {
      const result = evaluator.assignTier(30, null, thresholds, buffer);
      expect(result).toEqual({ tier: 'yellow', tierChanged: true });
    });

    it('should assign yellow for score 49', () => {
      const result = evaluator.assignTier(49, null, thresholds, buffer);
      expect(result).toEqual({ tier: 'yellow', tierChanged: true });
    });

    it('should assign amber for score 50', () => {
      const result = evaluator.assignTier(50, null, thresholds, buffer);
      expect(result).toEqual({ tier: 'amber', tierChanged: true });
    });

    it('should assign amber for score 74', () => {
      const result = evaluator.assignTier(74, null, thresholds, buffer);
      expect(result).toEqual({ tier: 'amber', tierChanged: true });
    });

    it('should assign red for score 75', () => {
      const result = evaluator.assignTier(75, null, thresholds, buffer);
      expect(result).toEqual({ tier: 'red', tierChanged: true });
    });

    it('should assign red for score 100', () => {
      const result = evaluator.assignTier(100, null, thresholds, buffer);
      expect(result).toEqual({ tier: 'red', tierChanged: true });
    });
  });

  // ─── Upgrading (worsening) — immediate ───────────────────────────────────

  describe('assignTier — upgrading (worsening) is immediate', () => {
    it('should upgrade green -> yellow at exactly 30', () => {
      const result = evaluator.assignTier(30, 'green', thresholds, buffer);
      expect(result).toEqual({ tier: 'yellow', tierChanged: true });
    });

    it('should upgrade green -> amber at 50', () => {
      const result = evaluator.assignTier(50, 'green', thresholds, buffer);
      expect(result).toEqual({ tier: 'amber', tierChanged: true });
    });

    it('should upgrade green -> red at 75', () => {
      const result = evaluator.assignTier(75, 'green', thresholds, buffer);
      expect(result).toEqual({ tier: 'red', tierChanged: true });
    });

    it('should upgrade yellow -> amber at exactly 50', () => {
      const result = evaluator.assignTier(50, 'yellow', thresholds, buffer);
      expect(result).toEqual({ tier: 'amber', tierChanged: true });
    });

    it('should upgrade yellow -> red at 75', () => {
      const result = evaluator.assignTier(75, 'yellow', thresholds, buffer);
      expect(result).toEqual({ tier: 'red', tierChanged: true });
    });

    it('should upgrade amber -> red at exactly 75', () => {
      const result = evaluator.assignTier(75, 'amber', thresholds, buffer);
      expect(result).toEqual({ tier: 'red', tierChanged: true });
    });
  });

  // ─── Downgrading (improving) — delayed by hysteresis ─────────────────────

  describe('assignTier — downgrading (improving) requires hysteresis buffer', () => {
    it('should NOT downgrade red -> amber at 66 (buffer zone: need <= 65)', () => {
      const result = evaluator.assignTier(66, 'red', thresholds, buffer);
      expect(result).toEqual({ tier: 'red', tierChanged: false });
    });

    it('should downgrade red -> amber at exactly 65', () => {
      const result = evaluator.assignTier(65, 'red', thresholds, buffer);
      expect(result).toEqual({ tier: 'amber', tierChanged: true });
    });

    it('should downgrade red -> amber at 50 (below buffer, lands in amber range)', () => {
      const result = evaluator.assignTier(50, 'red', thresholds, buffer);
      expect(result).toEqual({ tier: 'amber', tierChanged: true });
    });

    it('should NOT downgrade amber -> yellow at 41 (buffer zone: need <= 40)', () => {
      const result = evaluator.assignTier(41, 'amber', thresholds, buffer);
      expect(result).toEqual({ tier: 'amber', tierChanged: false });
    });

    it('should downgrade amber -> yellow at exactly 40', () => {
      const result = evaluator.assignTier(40, 'amber', thresholds, buffer);
      expect(result).toEqual({ tier: 'yellow', tierChanged: true });
    });

    it('should NOT downgrade yellow -> green at 21 (buffer zone: need <= 20)', () => {
      const result = evaluator.assignTier(21, 'yellow', thresholds, buffer);
      expect(result).toEqual({ tier: 'yellow', tierChanged: false });
    });

    it('should downgrade yellow -> green at exactly 20', () => {
      const result = evaluator.assignTier(20, 'yellow', thresholds, buffer);
      expect(result).toEqual({ tier: 'green', tierChanged: true });
    });

    it('should downgrade yellow -> green at 0', () => {
      const result = evaluator.assignTier(0, 'yellow', thresholds, buffer);
      expect(result).toEqual({ tier: 'green', tierChanged: true });
    });
  });

  // ─── Multi-tier skip on downgrade ────────────────────────────────────────

  describe('assignTier — multi-tier downgrade with hysteresis', () => {
    it('should skip straight from red -> green if score is 20 (clears all hysteresis)', () => {
      const result = evaluator.assignTier(20, 'red', thresholds, buffer);
      expect(result).toEqual({ tier: 'green', tierChanged: true });
    });

    it('should skip from red -> green if score is 10', () => {
      const result = evaluator.assignTier(10, 'red', thresholds, buffer);
      expect(result).toEqual({ tier: 'green', tierChanged: true });
    });

    it('should skip from red -> yellow if score is 25 (below amber buffer, above yellow buffer)', () => {
      // 25 <= 65 (pass red hysteresis) and 25 <= 40 (pass amber hysteresis)
      // but 25 > 20 (fail yellow hysteresis) so lands at yellow
      const result = evaluator.assignTier(25, 'red', thresholds, buffer);
      expect(result).toEqual({ tier: 'yellow', tierChanged: true });
    });

    it('should skip from amber -> green if score is 15', () => {
      // 15 <= 40 (pass amber hysteresis) and 15 <= 20 (pass yellow hysteresis)
      const result = evaluator.assignTier(15, 'amber', thresholds, buffer);
      expect(result).toEqual({ tier: 'green', tierChanged: true });
    });
  });

  // ─── Same tier — no change ───────────────────────────────────────────────

  describe('assignTier — same tier, no change', () => {
    it('should stay green when score is still in green range', () => {
      const result = evaluator.assignTier(15, 'green', thresholds, buffer);
      expect(result).toEqual({ tier: 'green', tierChanged: false });
    });

    it('should stay yellow when score is in yellow range', () => {
      const result = evaluator.assignTier(40, 'yellow', thresholds, buffer);
      expect(result).toEqual({ tier: 'yellow', tierChanged: false });
    });

    it('should stay amber when score is in amber range', () => {
      const result = evaluator.assignTier(60, 'amber', thresholds, buffer);
      expect(result).toEqual({ tier: 'amber', tierChanged: false });
    });

    it('should stay red when score is in red range', () => {
      const result = evaluator.assignTier(85, 'red', thresholds, buffer);
      expect(result).toEqual({ tier: 'red', tierChanged: false });
    });
  });

  // ─── Custom thresholds ──────────────────────────────────────────────────

  describe('assignTier — custom thresholds', () => {
    const custom: ThresholdConfig = { green: 0, yellow: 20, amber: 40, red: 60 };

    it('should use custom thresholds for tier assignment', () => {
      const result = evaluator.assignTier(25, null, custom, buffer);
      expect(result).toEqual({ tier: 'yellow', tierChanged: true });
    });

    it('should use custom thresholds for hysteresis (red downgrade: 60 - 10 = 50)', () => {
      const result = evaluator.assignTier(51, 'red', custom, buffer);
      expect(result).toEqual({ tier: 'red', tierChanged: false });
    });

    it('should downgrade red at custom threshold minus buffer (50)', () => {
      const result = evaluator.assignTier(50, 'red', custom, buffer);
      expect(result).toEqual({ tier: 'amber', tierChanged: true });
    });
  });

  // ─── Custom buffer ─────────────────────────────────────────────────────

  describe('assignTier — custom hysteresis buffer', () => {
    it('should NOT downgrade red at 71 with buffer of 5 (buffer zone: need <= 70)', () => {
      // hysteresisLine = 75 - 5 = 70. Score 71 > 70 → stays red.
      const result = evaluator.assignTier(71, 'red', thresholds, 5);
      expect(result).toEqual({ tier: 'red', tierChanged: false });
    });

    it('should downgrade red -> amber at exactly 70 with buffer of 5 (70 <= 70)', () => {
      // hysteresisLine = 75 - 5 = 70. Score 70 <= 70 → clears red hysteresis.
      const result = evaluator.assignTier(70, 'red', thresholds, 5);
      expect(result).toEqual({ tier: 'amber', tierChanged: true });
    });

    it('should downgrade red -> amber at 69 with buffer of 5', () => {
      const result = evaluator.assignTier(69, 'red', thresholds, 5);
      expect(result).toEqual({ tier: 'amber', tierChanged: true });
    });

    it('should use buffer of 0: no hysteresis, immediate downgrade', () => {
      // With buffer 0: hysteresisLine = 75 - 0 = 75. Score 74 <= 75 → downgrade.
      const result = evaluator.assignTier(74, 'red', thresholds, 0);
      expect(result).toEqual({ tier: 'amber', tierChanged: true });
    });
  });

  // ─── Edge cases ─────────────────────────────────────────────────────────

  describe('assignTier — edge cases', () => {
    it('should handle score of exactly 0', () => {
      const result = evaluator.assignTier(0, null, thresholds, buffer);
      expect(result).toEqual({ tier: 'green', tierChanged: true });
    });

    it('should handle score of exactly 100', () => {
      const result = evaluator.assignTier(100, null, thresholds, buffer);
      expect(result).toEqual({ tier: 'red', tierChanged: true });
    });

    it('should cap score above 100 to red', () => {
      const result = evaluator.assignTier(115, null, thresholds, buffer);
      expect(result).toEqual({ tier: 'red', tierChanged: true });
    });
  });
});
