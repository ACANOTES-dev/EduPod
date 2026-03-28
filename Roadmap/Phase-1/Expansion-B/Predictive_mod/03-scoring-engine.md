# Phase C — Scoring Engine

> **Spec:** `docs/superpowers/specs/2026-03-28-predictive-early-warning-design.md` (section: Scoring Engine)
> **Depends on:** Phase A (types only — `SignalResult`, `DetectedSignal` type definitions)
> **Can run in parallel with:** Phase B (signal collectors)

## What This Builds

Pure computation module that takes 5 signal results + tenant config and produces a `RiskAssessment`. No DB access. No NestJS dependency. No `@Injectable()`. Plain classes and functions, testable with plain Jest.

This is the ETB-portable core: the scoring engine can be extracted into a standalone package for cross-tenant aggregation without dragging in Prisma, NestJS, or any infrastructure dependency.

**Precedent:** `packages/shared/src/scheduler/` — the CSP solver follows the same "pure computation, no DB deps" pattern.

---

## Files to Create

```
apps/api/src/modules/early-warning/engine/
├── types.ts                        # RiskAssessment, WeightConfig, ThresholdConfig, RiskTier, DomainKey
├── scoring.engine.ts               # Main orchestrator: weights -> boost -> hysteresis -> summary -> RiskAssessment
├── scoring.engine.spec.ts          # Full test coverage for the pipeline
├── hysteresis.evaluator.ts         # Tier assignment with hysteresis logic
├── hysteresis.evaluator.spec.ts    # Hysteresis-specific tests
├── summary.builder.ts              # NL summary generation (template-based, deterministic)
└── summary.builder.spec.ts         # Summary generation tests
```

All files are plain TypeScript. No NestJS imports. No Prisma imports. No `@Injectable()` decorators.

---

## Step 1 — types.ts

**File:** `apps/api/src/modules/early-warning/engine/types.ts`

This file re-exports or defines all types consumed by the engine. Phase A will define `SignalResult` and `DetectedSignal` in `packages/shared/src/early-warning/types.ts`. The engine imports those plus defines its own.

If Phase A has not shipped yet, define all types here and migrate the shared ones later. The engine must not block on Phase A.

```typescript
// ─── Re-exports from shared (Phase A) ─────────────────────────────────────────

// These will come from @school/shared once Phase A ships.
// Until then, define locally and swap the import source later.

export type RiskTier = 'green' | 'yellow' | 'amber' | 'red';
export type DomainKey = 'attendance' | 'grades' | 'behaviour' | 'wellbeing' | 'engagement';
export type SignalSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface DetectedSignal {
  signalType: string;
  severity: SignalSeverity;
  scoreContribution: number;
  details: Record<string, unknown>;
  sourceEntityType: string;
  sourceEntityId: string;
  summaryFragment: string;
}

export interface SignalResult {
  domain: DomainKey;
  rawScore: number; // 0-100 normalised
  signals: DetectedSignal[];
  summaryFragments: string[];
}

// ─── Engine-specific types ────────────────────────────────────────────────────

export interface WeightConfig {
  attendance: number;
  grades: number;
  behaviour: number;
  wellbeing: number;
  engagement: number;
}

export interface ThresholdConfig {
  green: number;  // entry threshold (always 0)
  yellow: number; // default 30
  amber: number;  // default 50
  red: number;    // default 75
}

export interface DomainScores {
  attendance: number;
  grades: number;
  behaviour: number;
  wellbeing: number;
  engagement: number;
}

export interface RiskAssessment {
  compositeScore: number;
  riskTier: RiskTier;
  domainScores: DomainScores;
  crossDomainBoost: number; // 0, 5, 10, or 15
  signals: DetectedSignal[];
  summaryText: string;
  trendData: number[]; // last 30 daily composite scores (including today)
  tierChanged: boolean;
  previousTier: RiskTier | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_WEIGHTS: WeightConfig = {
  attendance: 25,
  grades: 25,
  behaviour: 20,
  wellbeing: 20,
  engagement: 10,
};

export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  green: 0,
  yellow: 30,
  amber: 50,
  red: 75,
};

export const DEFAULT_HYSTERESIS_BUFFER = 10;
export const DEFAULT_CROSS_DOMAIN_THRESHOLD = 40;

export const DOMAIN_KEYS: readonly DomainKey[] = [
  'attendance',
  'grades',
  'behaviour',
  'wellbeing',
  'engagement',
] as const;
```

**Key decisions:**
- `DomainScores` is a separate interface from `WeightConfig` even though they have the same shape, because they represent different things (computed scores vs configuration).
- Constants exported for reuse in tests and default config creation.
- `DOMAIN_KEYS` array enables iteration without hardcoding domain names in loops.

---

## Step 2 — hysteresis.evaluator.ts (tests first)

### Step 2a — hysteresis.evaluator.spec.ts

**File:** `apps/api/src/modules/early-warning/engine/hysteresis.evaluator.spec.ts`

```typescript
import { HysteresisEvaluator } from './hysteresis.evaluator';
import type { RiskTier, ThresholdConfig } from './types';
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
    it('should skip straight from red -> yellow if score is 20 (below amber hysteresis too)', () => {
      // Score 20 is <= 65 (red hysteresis) AND <= 40 (amber hysteresis)
      // but 20 is NOT <= 20 (yellow hysteresis) so it stays yellow... wait.
      // Actually 20 IS <= 20, so it should go to green.
      const result = evaluator.assignTier(20, 'red', thresholds, buffer);
      expect(result).toEqual({ tier: 'green', tierChanged: true });
    });

    it('should skip from red -> green if score is 10', () => {
      const result = evaluator.assignTier(10, 'red', thresholds, buffer);
      expect(result).toEqual({ tier: 'green', tierChanged: true });
    });

    it('should skip from red -> yellow if score is 25 (below amber buffer, above yellow buffer)', () => {
      // 25 <= 65 (pass red hysteresis) and 25 <= 40 (pass amber hysteresis)
      // but 25 > 20 (fail yellow hysteresis) and 25 >= 30 is false, so raw tier is green
      // Wait: 25 < 30, so raw tier is green. But we must check yellow hysteresis.
      // Previous is red. Check red downgrade: 25 <= 65 yes. Next check amber: 25 <= 40 yes.
      // Check yellow downgrade: 25 <= 20 no. So we stay at yellow.
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
    it('should use buffer of 5: red downgrade at 70 (75 - 5)', () => {
      const result = evaluator.assignTier(70, 'red', thresholds, 5);
      expect(result).toEqual({ tier: 'red', tierChanged: false });
    });

    it('should use buffer of 5: red downgrade at exactly 70', () => {
      const result = evaluator.assignTier(70, 'red', thresholds, 5);
      expect(result).toEqual({ tier: 'red', tierChanged: false });
    });

    it('should use buffer of 5: red downgrade below 70', () => {
      // 69 <= 75 - 5 = 70? No, 69 < 70, so... the check is score <= (threshold - buffer).
      // 69 <= 70? Yes. Wait: threshold is 75, buffer 5, so hysteresis line is 75 - 5 = 70.
      // score must be <= 70 to downgrade. 69 <= 70 is true.
      // But we also need to re-check: 70 itself. The spec says "must reach <= 65 to drop" for default.
      // So the formula is: score <= (threshold - buffer). 70 <= 70 is true.
      const result = evaluator.assignTier(69, 'red', thresholds, 5);
      expect(result).toEqual({ tier: 'amber', tierChanged: true });
    });

    it('should use buffer of 0: no hysteresis, immediate downgrade', () => {
      // With buffer 0: score 74 is below red threshold 75, immediate downgrade
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
```

### Step 2b — hysteresis.evaluator.ts

**File:** `apps/api/src/modules/early-warning/engine/hysteresis.evaluator.ts`

```typescript
import type { RiskTier, ThresholdConfig } from './types';

// ─── Tier ordering (green=0 lowest risk, red=3 highest risk) ──────────────────

const TIER_ORDER: Record<RiskTier, number> = {
  green: 0,
  yellow: 1,
  amber: 2,
  red: 3,
};

const TIERS_BY_ORDER: RiskTier[] = ['green', 'yellow', 'amber', 'red'];

export interface TierAssignment {
  tier: RiskTier;
  tierChanged: boolean;
}

export class HysteresisEvaluator {
  /**
   * Assigns a risk tier for the given composite score, applying hysteresis
   * to prevent oscillation on downgrade (improving) transitions.
   *
   * Upgrading (worsening): immediate — score crosses threshold, tier changes.
   * Downgrading (improving): score must drop hysteresisBuffer points below
   * the current tier's entry threshold.
   *
   * For multi-tier drops, hysteresis is checked at each tier boundary
   * from the current tier downward. The student drops to the lowest tier
   * whose hysteresis condition is satisfied.
   */
  assignTier(
    compositeScore: number,
    previousTier: RiskTier | null,
    thresholds: ThresholdConfig,
    hysteresisBuffer: number,
  ): TierAssignment {
    const rawTier = this.rawTierFromScore(compositeScore, thresholds);

    // First computation — no hysteresis, always a tier change
    if (previousTier === null) {
      return { tier: rawTier, tierChanged: true };
    }

    const rawOrder = TIER_ORDER[rawTier];
    const prevOrder = TIER_ORDER[previousTier];

    // Upgrading (worsening) — immediate
    if (rawOrder > prevOrder) {
      return { tier: rawTier, tierChanged: true };
    }

    // Same raw tier — no change
    if (rawOrder === prevOrder) {
      return { tier: previousTier, tierChanged: false };
    }

    // Downgrading (improving) — apply hysteresis at each tier boundary
    // Walk down from the tier just below the current tier, checking
    // if the score has cleared the hysteresis threshold at each level.
    const thresholdEntries = this.tierEntryThresholds(thresholds);
    let effectiveTier = previousTier;

    for (let order = prevOrder; order > 0; order--) {
      const tierAtOrder = TIERS_BY_ORDER[order];
      const entryThreshold = thresholdEntries[tierAtOrder];
      const hysteresisLine = entryThreshold - hysteresisBuffer;

      if (compositeScore <= hysteresisLine) {
        // Cleared this tier's hysteresis — can drop below it
        effectiveTier = TIERS_BY_ORDER[order - 1];
      } else {
        // Stuck at this tier — hysteresis holds
        break;
      }
    }

    const changed = effectiveTier !== previousTier;
    return { tier: effectiveTier, tierChanged: changed };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Determines the raw tier purely from score vs thresholds, no hysteresis.
   */
  private rawTierFromScore(score: number, thresholds: ThresholdConfig): RiskTier {
    if (score >= thresholds.red) return 'red';
    if (score >= thresholds.amber) return 'amber';
    if (score >= thresholds.yellow) return 'yellow';
    return 'green';
  }

  /**
   * Returns the entry threshold for each tier. Green's entry is 0 (always).
   */
  private tierEntryThresholds(thresholds: ThresholdConfig): Record<RiskTier, number> {
    return {
      green: thresholds.green,
      yellow: thresholds.yellow,
      amber: thresholds.amber,
      red: thresholds.red,
    };
  }
}
```

**Key decisions:**
- `rawTierFromScore` is the simple threshold comparison. `assignTier` wraps it with hysteresis.
- Downgrade walks tier-by-tier from the current tier downward, checking hysteresis at each boundary. This handles multi-tier skips correctly (e.g., red -> green if score drops far enough).
- The loop breaks as soon as a hysteresis check fails, so the student is "stuck" at the lowest tier they can't clear.
- `TierAssignment` is a plain return type, not the full `RiskAssessment`. The scoring engine composes it.

---

## Step 3 — summary.builder.ts (tests first)

### Step 3a — summary.builder.spec.ts

**File:** `apps/api/src/modules/early-warning/engine/summary.builder.spec.ts`

```typescript
import { SummaryBuilder } from './summary.builder';
import type { DetectedSignal } from './types';

describe('SummaryBuilder', () => {
  const builder = new SummaryBuilder();

  // ─── Trend sentence generation ──────────────────────────────────────────

  describe('buildSummary — trend sentence', () => {
    it('should report "increased" when score went up over past weeks', () => {
      // 14 days of history: first 7 averaging ~30, last 7 averaging ~50
      const trendHistory = [28, 29, 30, 31, 30, 32, 31, 45, 48, 50, 51, 50, 52, 51];
      const currentScore = 55;
      const signals: DetectedSignal[] = [];

      const result = builder.buildSummary(currentScore, trendHistory, signals);

      expect(result).toMatch(/^Risk score increased from \d+ to 55 over the past 2 weeks\./);
    });

    it('should report "decreased" when score went down', () => {
      const trendHistory = [70, 68, 65, 60, 55, 50, 45];
      const currentScore = 40;
      const signals: DetectedSignal[] = [];

      const result = builder.buildSummary(currentScore, trendHistory, signals);

      expect(result).toMatch(/^Risk score decreased from \d+ to 40 over the past 1 week\./);
    });

    it('should report "stable" when score has not changed significantly', () => {
      const trendHistory = [42, 43, 41, 42, 43, 42, 41];
      const currentScore = 42;
      const signals: DetectedSignal[] = [];

      const result = builder.buildSummary(currentScore, trendHistory, signals);

      expect(result).toMatch(/^Risk score stable at 42\./);
    });

    it('should handle empty trend history (first computation)', () => {
      const result = builder.buildSummary(35, [], []);

      expect(result).toBe('Risk score is 35.');
    });

    it('should handle single-entry trend history', () => {
      const result = builder.buildSummary(45, [35], []);

      expect(result).toMatch(/^Risk score increased from 35 to 45 over the past 1 week\./);
    });
  });

  // ─── Signal fragment inclusion ──────────────────────────────────────────

  describe('buildSummary — signal fragments', () => {
    const makeSignal = (fragment: string, contribution: number): DetectedSignal => ({
      signalType: 'test',
      severity: 'medium',
      scoreContribution: contribution,
      details: {},
      sourceEntityType: 'Test',
      sourceEntityId: 'test-id',
      summaryFragment: fragment,
    });

    it('should include top 5 signals sorted by scoreContribution descending', () => {
      const signals = [
        makeSignal('Signal A', 5),
        makeSignal('Signal B', 20),
        makeSignal('Signal C', 15),
        makeSignal('Signal D', 10),
        makeSignal('Signal E', 25),
        makeSignal('Signal F', 8),
        makeSignal('Signal G', 3),
      ];

      const result = builder.buildSummary(50, [], signals);

      // Should contain top 5: E(25), B(20), C(15), D(10), F(8)
      expect(result).toContain('Signal E');
      expect(result).toContain('Signal B');
      expect(result).toContain('Signal C');
      expect(result).toContain('Signal D');
      expect(result).toContain('Signal F');
      // Should NOT contain bottom 2: A(5), G(3)
      expect(result).not.toContain('Signal A');
      expect(result).not.toContain('Signal G');
    });

    it('should include all signals when fewer than 5', () => {
      const signals = [
        makeSignal('Only signal A', 10),
        makeSignal('Only signal B', 5),
      ];

      const result = builder.buildSummary(30, [], signals);

      expect(result).toContain('Only signal A');
      expect(result).toContain('Only signal B');
    });

    it('should handle zero signals gracefully', () => {
      const result = builder.buildSummary(0, [], []);

      expect(result).toBe('Risk score is 0.');
    });

    it('should join fragments with a space', () => {
      const signals = [
        makeSignal('Absent 3 consecutive days.', 20),
        makeSignal('Maths grade dropped from B+ to C-.', 15),
      ];

      const result = builder.buildSummary(50, [], signals);

      // Trend sentence followed by space-separated fragments
      expect(result).toContain('Absent 3 consecutive days. Maths grade dropped from B+ to C-.');
    });
  });

  // ─── Combined trend + signals ───────────────────────────────────────────

  describe('buildSummary — combined output', () => {
    const makeSignal = (fragment: string, contribution: number): DetectedSignal => ({
      signalType: 'test',
      severity: 'high',
      scoreContribution: contribution,
      details: {},
      sourceEntityType: 'Test',
      sourceEntityId: 'test-id',
      summaryFragment: fragment,
    });

    it('should produce trend sentence followed by signal fragments', () => {
      const trendHistory = [30, 35, 40, 45, 50, 55, 60, 65, 68, 70, 71, 72, 73, 74];
      const signals = [
        makeSignal('Absent 4 of last 10 school days.', 25),
        makeSignal('Two negative behaviour incidents in 14 days.', 15),
      ];

      const result = builder.buildSummary(75, trendHistory, signals);

      // Should start with trend sentence
      expect(result).toMatch(/^Risk score increased/);
      // Should end with signal fragments
      expect(result).toContain('Absent 4 of last 10 school days.');
      expect(result).toContain('Two negative behaviour incidents in 14 days.');
    });
  });

  // ─── Edge cases ─────────────────────────────────────────────────────────

  describe('buildSummary — edge cases', () => {
    it('should handle score of 0 with signals', () => {
      const signals: DetectedSignal[] = [{
        signalType: 'test',
        severity: 'low',
        scoreContribution: 0,
        details: {},
        sourceEntityType: 'Test',
        sourceEntityId: 'test-id',
        summaryFragment: 'No issues detected.',
      }];

      const result = builder.buildSummary(0, [], signals);

      expect(result).toContain('Risk score is 0.');
      expect(result).toContain('No issues detected.');
    });

    it('should handle score of 100', () => {
      const result = builder.buildSummary(100, [90, 95, 98], []);

      expect(result).toMatch(/Risk score increased from \d+ to 100/);
    });

    it('should skip signals with empty summaryFragment', () => {
      const signals: DetectedSignal[] = [
        {
          signalType: 'test',
          severity: 'medium',
          scoreContribution: 10,
          details: {},
          sourceEntityType: 'Test',
          sourceEntityId: 'test-id',
          summaryFragment: '',
        },
        {
          signalType: 'test2',
          severity: 'medium',
          scoreContribution: 5,
          details: {},
          sourceEntityType: 'Test',
          sourceEntityId: 'test-id-2',
          summaryFragment: 'Valid fragment.',
        },
      ];

      const result = builder.buildSummary(30, [], signals);

      expect(result).toContain('Valid fragment.');
      // Should not have double spaces from empty fragment
      expect(result).not.toContain('  ');
    });
  });
});
```

### Step 3b — summary.builder.ts

**File:** `apps/api/src/modules/early-warning/engine/summary.builder.ts`

```typescript
import type { DetectedSignal } from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_SIGNAL_FRAGMENTS = 5;
const DAYS_PER_WEEK = 7;

/**
 * Significance threshold for trend direction. If the absolute difference
 * between the earliest-week average and the current score is less than
 * this value, the score is considered "stable".
 */
const STABILITY_THRESHOLD = 5;

export class SummaryBuilder {
  /**
   * Builds a deterministic natural-language summary from the composite score,
   * trend history, and detected signals.
   *
   * Output format:
   *   "{trend sentence} {signal fragment 1} {signal fragment 2} ..."
   *
   * Trend sentence patterns:
   *   - "Risk score increased from X to Y over the past N weeks."
   *   - "Risk score decreased from X to Y over the past N weeks."
   *   - "Risk score stable at X."
   *   - "Risk score is X." (first computation, no history)
   *
   * Signal fragments: top 5 by scoreContribution descending, space-joined.
   */
  buildSummary(
    currentScore: number,
    trendHistory: number[],
    signals: DetectedSignal[],
  ): string {
    const parts: string[] = [];

    // 1. Trend sentence
    const trendSentence = this.buildTrendSentence(currentScore, trendHistory);
    parts.push(trendSentence);

    // 2. Top signal fragments sorted by contribution
    const fragments = this.topSignalFragments(signals);
    if (fragments.length > 0) {
      parts.push(fragments.join(' '));
    }

    return parts.join(' ');
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private buildTrendSentence(currentScore: number, history: number[]): string {
    const roundedScore = Math.round(currentScore);

    // No history — first computation
    if (history.length === 0) {
      return `Risk score is ${roundedScore}.`;
    }

    // Calculate the number of weeks the history spans
    // History entries are daily scores. We compare the average of the
    // earliest week with the current score.
    const totalDays = history.length;
    const weeks = Math.max(1, Math.ceil(totalDays / DAYS_PER_WEEK));

    // Earliest week average: take the first min(7, length) entries
    const earliestSlice = history.slice(0, Math.min(DAYS_PER_WEEK, totalDays));
    const earliestAvg = Math.round(
      earliestSlice.reduce((sum, val) => sum + val, 0) / earliestSlice.length,
    );

    const diff = roundedScore - earliestAvg;

    if (Math.abs(diff) < STABILITY_THRESHOLD) {
      return `Risk score stable at ${roundedScore}.`;
    }

    if (diff > 0) {
      return `Risk score increased from ${earliestAvg} to ${roundedScore} over the past ${weeks} week${weeks === 1 ? '' : 's'}.`;
    }

    return `Risk score decreased from ${earliestAvg} to ${roundedScore} over the past ${weeks} week${weeks === 1 ? '' : 's'}.`;
  }

  private topSignalFragments(signals: DetectedSignal[]): string[] {
    return signals
      .filter((s) => s.summaryFragment.length > 0)
      .sort((a, b) => b.scoreContribution - a.scoreContribution)
      .slice(0, MAX_SIGNAL_FRAGMENTS)
      .map((s) => s.summaryFragment);
  }
}
```

**Key decisions:**
- `STABILITY_THRESHOLD` of 5 points: if the score moved less than 5 points from the earliest-week average, it's "stable". Prevents noise like "increased from 42 to 43".
- Week count uses `Math.ceil(totalDays / 7)` with a minimum of 1.
- Earliest-week average uses the first 7 (or fewer) entries, not a single point, to smooth out daily noise.
- Empty `summaryFragment` strings are filtered out to prevent double-spacing.
- All scores are rounded to integers for display.

---

## Step 4 — scoring.engine.ts (tests first)

### Step 4a — scoring.engine.spec.ts

**File:** `apps/api/src/modules/early-warning/engine/scoring.engine.spec.ts`

```typescript
import { ScoringEngine } from './scoring.engine';
import type {
  DetectedSignal,
  RiskAssessment,
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
      // Total = 49, no cross-domain boost (only 2 domains >= 40: grades=40, behaviour=50, engagement=80 -> 3 domains)
      // Wait: attendance=60 >= 40, grades=40 >= 40, behaviour=50 >= 40, engagement=80 >= 40 -> 4 domains >= 40 -> +10
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
      // 15 + 10 + 10 + 6 + 8 = 49 (weighted) + 10 (cross-domain: 4 domains >= 40) = 59
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
      // Score = 70: weighted without boost. Let's engineer it.
      // attendance=70, grades=70, behaviour=70, wellbeing=70, engagement=70
      // weighted = 70. Boost: all 5 >= 40 -> +15 -> 85. That's red.
      // Let's use lower values to get into the buffer zone.
      // attendance=40, grades=40, behaviour=40, wellbeing=40, engagement=40
      // weighted = 40. Boost: all 5 >= 40 -> +15 -> 55. That's amber.

      // We need score in 66-74 range to test red hysteresis.
      // Let's set: att=70, grd=70, beh=70, well=70, eng=70 -> weighted=70, boost=15 -> 85 (red, not in buffer).
      // Try: att=68, grd=68, beh=68, well=68, eng=68 -> weighted=68, boost=15 -> 83. Still red.
      // Need score 66-74 with previousTier=red.
      // att=50, grd=50, beh=50, well=50, eng=50 -> weighted=50, boost=15 -> 65. Hmm, 65 is exactly the hysteresis line.
      // The spec says "must reach <= 65 to drop". So 65 should drop.
      // Let's test 66: we need weighted+boost = 66.
      // att=50, grd=50, beh=50, well=50, eng=60 -> 50*0.25+50*0.25+50*0.20+50*0.20+60*0.10 = 12.5+12.5+10+10+6 = 51.
      // Boost: all 5 >= 40 -> +15 -> 66.
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
      // Need composite <= 65 with previous red.
      // att=50, grd=50, beh=50, well=50, eng=50 -> weighted=50, boost=15 -> 65. Exactly <= 65.
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
      // Need composite >= 30 with previous green.
      // att=30, grd=30, beh=30, well=30, eng=30 -> weighted=30, boost=0 (<3 >= 40) -> 30.
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
      // No boost (<3 domains >= 40).
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
```

### Step 4b — scoring.engine.ts

**File:** `apps/api/src/modules/early-warning/engine/scoring.engine.ts`

```typescript
import { HysteresisEvaluator } from './hysteresis.evaluator';
import { SummaryBuilder } from './summary.builder';
import type {
  DetectedSignal,
  DomainKey,
  DomainScores,
  RiskAssessment,
  RiskTier,
  SignalResult,
  ThresholdConfig,
  WeightConfig,
} from './types';
import { DOMAIN_KEYS } from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_COMPOSITE_SCORE = 100;
const MAX_TREND_LENGTH = 30;

/**
 * Cross-domain boost tiers:
 *   3 domains above threshold -> +5
 *   4 domains above threshold -> +10
 *   5 domains above threshold -> +15
 */
const CROSS_DOMAIN_BOOST_MAP: Record<number, number> = {
  3: 5,
  4: 10,
  5: 15,
};

// ─── Scoring Engine ───────────────────────────────────────────────────────────

/**
 * Pure computation engine for the Predictive Early Warning System.
 *
 * Takes 5 signal results (one per domain) plus tenant configuration and
 * produces a RiskAssessment. No database access. No NestJS dependency.
 * ETB-portable.
 *
 * Pipeline:
 * 1. Extract domain raw scores
 * 2. Apply tenant weights -> weighted sum
 * 3. Calculate cross-domain correlation boost
 * 4. Assign tier with hysteresis
 * 5. Generate NL summary
 * 6. Build trend data
 * 7. Assemble RiskAssessment
 */
export class ScoringEngine {
  private readonly hysteresisEvaluator = new HysteresisEvaluator();
  private readonly summaryBuilder = new SummaryBuilder();

  computeRisk(
    signals: SignalResult[],
    weights: WeightConfig,
    thresholds: ThresholdConfig,
    hysteresisBuffer: number,
    previousTier: RiskTier | null,
    trendHistory: number[],
    crossDomainThreshold: number,
  ): RiskAssessment {
    // 1. Extract domain raw scores into a map
    const domainScores = this.extractDomainScores(signals);

    // 2. Apply tenant weights
    const weightedScore = this.applyWeights(domainScores, weights);

    // 3. Cross-domain correlation boost
    const crossDomainBoost = this.calculateCrossDomainBoost(
      domainScores,
      crossDomainThreshold,
    );

    // 4. Composite score (capped at 100)
    const compositeScore = Math.min(
      MAX_COMPOSITE_SCORE,
      Math.round(weightedScore + crossDomainBoost),
    );

    // 5. Tier assignment with hysteresis
    const { tier, tierChanged } = this.hysteresisEvaluator.assignTier(
      compositeScore,
      previousTier,
      thresholds,
      hysteresisBuffer,
    );

    // 6. Aggregate all detected signals from all domains
    const allSignals = this.aggregateSignals(signals);

    // 7. Build trend data (append current, trim to 30)
    const trendData = this.buildTrendData(trendHistory, compositeScore);

    // 8. Generate NL summary
    const summaryText = this.summaryBuilder.buildSummary(
      compositeScore,
      trendHistory, // pass the PREVIOUS history for trend comparison
      allSignals,
    );

    return {
      compositeScore,
      riskTier: tier,
      domainScores,
      crossDomainBoost,
      signals: allSignals,
      summaryText,
      trendData,
      tierChanged,
      previousTier,
    };
  }

  // ─── Private pipeline stages ────────────────────────────────────────────

  private extractDomainScores(signals: SignalResult[]): DomainScores {
    const scores: Partial<DomainScores> = {};

    for (const signal of signals) {
      scores[signal.domain] = signal.rawScore;
    }

    // Fill any missing domains with 0
    for (const key of DOMAIN_KEYS) {
      if (scores[key] === undefined) {
        scores[key] = 0;
      }
    }

    return scores as DomainScores;
  }

  private applyWeights(scores: DomainScores, weights: WeightConfig): number {
    let total = 0;

    for (const key of DOMAIN_KEYS) {
      total += scores[key] * (weights[key] / 100);
    }

    return total;
  }

  private calculateCrossDomainBoost(
    scores: DomainScores,
    threshold: number,
  ): number {
    let domainsAbove = 0;

    for (const key of DOMAIN_KEYS) {
      if (scores[key] >= threshold) {
        domainsAbove++;
      }
    }

    return CROSS_DOMAIN_BOOST_MAP[domainsAbove] ?? 0;
  }

  private aggregateSignals(signalResults: SignalResult[]): DetectedSignal[] {
    const all: DetectedSignal[] = [];

    for (const result of signalResults) {
      all.push(...result.signals);
    }

    return all;
  }

  private buildTrendData(history: number[], currentScore: number): number[] {
    const combined = [...history, currentScore];

    // Keep only the last MAX_TREND_LENGTH entries
    if (combined.length > MAX_TREND_LENGTH) {
      return combined.slice(combined.length - MAX_TREND_LENGTH);
    }

    return combined;
  }
}
```

**Key decisions:**
- `ScoringEngine` composes `HysteresisEvaluator` and `SummaryBuilder` internally. No constructor injection needed since these are plain classes with no dependencies.
- Weights divide by 100 (not multiply by fractional) to match the "weights sum to 100" invariant.
- Cross-domain boost uses a simple lookup map. Only values 3, 4, 5 produce a boost; anything else returns 0.
- Composite score is rounded to integer and capped at 100.
- Trend data: the `trendHistory` parameter is the previous daily scores (up to 29). The engine appends the current score, then trims to 30.
- Summary builder receives the PREVIOUS history (not including current score) so the trend sentence compares "where we were" vs "where we are now".

---

## Verification Checklist

| Check | Status |
|-------|--------|
| No `@Injectable()` decorator on any class | Must verify |
| No `import` from `@nestjs/*` | Must verify |
| No `import` from `@prisma/*` | Must verify |
| No `PrismaService` reference | Must verify |
| All files are plain TypeScript classes/functions | Must verify |
| All tests runnable with plain Jest (no `TestingModule`) | Must verify |
| `WeightConfig` values sum to 100 enforced at call site (not in engine) | Must verify |
| Composite score capped at 100 | Must verify |
| Hysteresis: upgrade immediate, downgrade delayed | Must verify |
| NL summary: trend sentence + top 5 fragments | Must verify |
| Trend data: max 30 entries, current appended | Must verify |

---

## Test Execution

```bash
# Run from repo root
cd apps/api
npx jest --testPathPattern='modules/early-warning/engine/' --verbose
```

All 6 files (3 source + 3 test) are self-contained. No NestJS testing module. No mocks of infrastructure. Pure unit tests.

---

## Phase A Types Dependency

The `types.ts` file in this phase defines `SignalResult`, `DetectedSignal`, `RiskTier`, `DomainKey`, and `SignalSeverity` locally. When Phase A ships and creates `packages/shared/src/early-warning/types.ts`, the imports in `types.ts` should be swapped to re-export from `@school/shared`:

```typescript
// After Phase A ships, replace local definitions with:
export type { DetectedSignal, SignalResult, DomainKey, RiskTier, SignalSeverity } from '@school/shared';
```

The engine's own types (`WeightConfig`, `ThresholdConfig`, `DomainScores`, `RiskAssessment`) stay in this file — they are engine-specific.
