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
      const tierAtOrder = TIERS_BY_ORDER[order] as RiskTier; // Safe: order is 1–3
      const entryThreshold = thresholdEntries[tierAtOrder];
      const hysteresisLine = entryThreshold - hysteresisBuffer;

      if (compositeScore <= hysteresisLine) {
        // Cleared this tier's hysteresis — can drop below it
        effectiveTier = TIERS_BY_ORDER[order - 1] as RiskTier; // Safe: order > 0
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
