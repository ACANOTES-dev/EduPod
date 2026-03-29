import { HysteresisEvaluator } from './hysteresis.evaluator';
import { SummaryBuilder } from './summary.builder';
import type {
  DetectedSignal,
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
