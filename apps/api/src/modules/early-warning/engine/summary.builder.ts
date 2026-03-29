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
