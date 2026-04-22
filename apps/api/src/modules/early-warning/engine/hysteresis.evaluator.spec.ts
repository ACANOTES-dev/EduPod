import { HysteresisEvaluator } from './hysteresis.evaluator';
import type { ThresholdConfig } from './types';
import { DEFAULT_HYSTERESIS_BUFFER, DEFAULT_THRESHOLDS } from './types';

// Default thresholds tier boundaries (from packages/shared/early-warning/constants.ts):
//   green: 0–7   yellow: 8–17   amber: 18–31   red: 32+
// Default hysteresis buffer: 10
//   red → amber requires score ≤ 32 - 10 = 22
//   amber → yellow requires score ≤ 18 - 10 = 8
//   yellow → green requires score ≤ 8 - 10 = -2 (impossible under defaults;
//     tenants needing a downgrade path set a smaller buffer in settings)

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

    it('should assign green for score 7 (just below yellow threshold)', () => {
      const result = evaluator.assignTier(7, null, thresholds, buffer);
      expect(result).toEqual({ tier: 'green', tierChanged: true });
    });

    it('should assign yellow for score 8 (at yellow threshold)', () => {
      const result = evaluator.assignTier(8, null, thresholds, buffer);
      expect(result).toEqual({ tier: 'yellow', tierChanged: true });
    });

    it('should assign yellow for score 17 (just below amber threshold)', () => {
      const result = evaluator.assignTier(17, null, thresholds, buffer);
      expect(result).toEqual({ tier: 'yellow', tierChanged: true });
    });

    it('should assign amber for score 18 (at amber threshold)', () => {
      const result = evaluator.assignTier(18, null, thresholds, buffer);
      expect(result).toEqual({ tier: 'amber', tierChanged: true });
    });

    it('should assign amber for score 31 (just below red threshold)', () => {
      const result = evaluator.assignTier(31, null, thresholds, buffer);
      expect(result).toEqual({ tier: 'amber', tierChanged: true });
    });

    it('should assign red for score 32 (at red threshold)', () => {
      const result = evaluator.assignTier(32, null, thresholds, buffer);
      expect(result).toEqual({ tier: 'red', tierChanged: true });
    });

    it('should assign red for score 100', () => {
      const result = evaluator.assignTier(100, null, thresholds, buffer);
      expect(result).toEqual({ tier: 'red', tierChanged: true });
    });
  });

  // ─── Upgrading (worsening) — immediate ───────────────────────────────────

  describe('assignTier — upgrading (worsening) is immediate', () => {
    it('should upgrade green -> yellow at exactly 8', () => {
      const result = evaluator.assignTier(8, 'green', thresholds, buffer);
      expect(result).toEqual({ tier: 'yellow', tierChanged: true });
    });

    it('should upgrade green -> amber at 18', () => {
      const result = evaluator.assignTier(18, 'green', thresholds, buffer);
      expect(result).toEqual({ tier: 'amber', tierChanged: true });
    });

    it('should upgrade green -> red at 32', () => {
      const result = evaluator.assignTier(32, 'green', thresholds, buffer);
      expect(result).toEqual({ tier: 'red', tierChanged: true });
    });

    it('should upgrade yellow -> amber at exactly 18', () => {
      const result = evaluator.assignTier(18, 'yellow', thresholds, buffer);
      expect(result).toEqual({ tier: 'amber', tierChanged: true });
    });

    it('should upgrade yellow -> red at 32', () => {
      const result = evaluator.assignTier(32, 'yellow', thresholds, buffer);
      expect(result).toEqual({ tier: 'red', tierChanged: true });
    });

    it('should upgrade amber -> red at exactly 32', () => {
      const result = evaluator.assignTier(32, 'amber', thresholds, buffer);
      expect(result).toEqual({ tier: 'red', tierChanged: true });
    });
  });

  // ─── Downgrading (improving) — delayed by hysteresis ─────────────────────

  describe('assignTier — downgrading (improving) requires hysteresis buffer', () => {
    it('should NOT downgrade red -> amber at 23 (buffer zone: need <= 22)', () => {
      const result = evaluator.assignTier(23, 'red', thresholds, buffer);
      expect(result).toEqual({ tier: 'red', tierChanged: false });
    });

    it('should downgrade red -> amber at exactly 22', () => {
      const result = evaluator.assignTier(22, 'red', thresholds, buffer);
      expect(result).toEqual({ tier: 'amber', tierChanged: true });
    });

    it('should downgrade red -> amber at 18 (below buffer, lands in amber range)', () => {
      const result = evaluator.assignTier(18, 'red', thresholds, buffer);
      expect(result).toEqual({ tier: 'amber', tierChanged: true });
    });

    it('should NOT downgrade amber -> yellow at 9 (buffer zone: need <= 8)', () => {
      const result = evaluator.assignTier(9, 'amber', thresholds, buffer);
      expect(result).toEqual({ tier: 'amber', tierChanged: false });
    });

    it('should downgrade amber -> yellow at exactly 8', () => {
      const result = evaluator.assignTier(8, 'amber', thresholds, buffer);
      expect(result).toEqual({ tier: 'yellow', tierChanged: true });
    });

    it('should NOT downgrade yellow -> green under default buffer (line = -2, impossible)', () => {
      // Yellow threshold 8 − buffer 10 = −2. No valid score ≤ −2, so yellow
      // is sticky under defaults — even score 0 stays yellow once assigned.
      const result = evaluator.assignTier(0, 'yellow', thresholds, buffer);
      expect(result).toEqual({ tier: 'yellow', tierChanged: false });
    });
  });

  // ─── Multi-tier skip on downgrade ────────────────────────────────────────

  describe('assignTier — multi-tier downgrade with hysteresis', () => {
    it('should skip from red -> yellow at score 8 (clears red+amber, stuck at yellow)', () => {
      // 8 <= 22 (pass red), 8 <= 8 (pass amber), 8 > -2 (fail yellow→green).
      const result = evaluator.assignTier(8, 'red', thresholds, buffer);
      expect(result).toEqual({ tier: 'yellow', tierChanged: true });
    });

    it('should skip from red -> yellow at score 0 (lowest reachable from red under defaults)', () => {
      const result = evaluator.assignTier(0, 'red', thresholds, buffer);
      expect(result).toEqual({ tier: 'yellow', tierChanged: true });
    });

    it('should stop at amber from red when score 15 (passes red but not amber buffer)', () => {
      // 15 <= 22 (pass red→amber), 15 > 8 (fail amber→yellow), stays amber.
      const result = evaluator.assignTier(15, 'red', thresholds, buffer);
      expect(result).toEqual({ tier: 'amber', tierChanged: true });
    });

    it('should skip from amber -> yellow at 5 (passes amber buffer, stuck at yellow)', () => {
      // 5 <= 8 (pass amber→yellow), 5 > -2 (fail yellow→green), stays yellow.
      const result = evaluator.assignTier(5, 'amber', thresholds, buffer);
      expect(result).toEqual({ tier: 'yellow', tierChanged: true });
    });
  });

  // ─── Same tier — no change ───────────────────────────────────────────────

  describe('assignTier — same tier, no change', () => {
    it('should stay green when score is still in green range', () => {
      const result = evaluator.assignTier(5, 'green', thresholds, buffer);
      expect(result).toEqual({ tier: 'green', tierChanged: false });
    });

    it('should stay yellow when score is in yellow range', () => {
      const result = evaluator.assignTier(12, 'yellow', thresholds, buffer);
      expect(result).toEqual({ tier: 'yellow', tierChanged: false });
    });

    it('should stay amber when score is in amber range', () => {
      const result = evaluator.assignTier(25, 'amber', thresholds, buffer);
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
    it('should NOT downgrade red at 28 with buffer of 5 (need <= 27)', () => {
      // hysteresisLine = 32 - 5 = 27. Score 28 > 27 → stays red.
      const result = evaluator.assignTier(28, 'red', thresholds, 5);
      expect(result).toEqual({ tier: 'red', tierChanged: false });
    });

    it('should downgrade red -> amber at exactly 27 with buffer of 5 (27 <= 27)', () => {
      const result = evaluator.assignTier(27, 'red', thresholds, 5);
      expect(result).toEqual({ tier: 'amber', tierChanged: true });
    });

    it('should downgrade red -> amber at 26 with buffer of 5', () => {
      const result = evaluator.assignTier(26, 'red', thresholds, 5);
      expect(result).toEqual({ tier: 'amber', tierChanged: true });
    });

    it('should use buffer of 0: no hysteresis, immediate downgrade', () => {
      // With buffer 0: hysteresisLine = 32. Score 31 <= 32 → downgrade.
      const result = evaluator.assignTier(31, 'red', thresholds, 0);
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
