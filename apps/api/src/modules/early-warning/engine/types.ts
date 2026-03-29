// ─── Re-exports from @school/shared (Phase 01) ─────────────────────────────

import type { EarlyWarningThresholds, EarlyWarningWeights, SignalDomain } from '@school/shared';
import { CROSS_DOMAIN_BOOST, SIGNAL_DOMAINS } from '@school/shared';

export type {
  DetectedSignal,
  DomainScores,
  RiskAssessment,
  RiskTier,
  SignalSeverity,
} from '@school/shared';

export type { SignalDomain } from '@school/shared';

export { DEFAULT_HYSTERESIS_BUFFER, DEFAULT_THRESHOLDS, DEFAULT_WEIGHTS } from '@school/shared';

// Re-export SignalResult — domain field uses SignalDomain (= DomainKey)
export type { SignalResult } from '@school/shared';

// ─── Engine-specific aliases ────────────────────────────────────────────────

export type DomainKey = SignalDomain;
export type WeightConfig = EarlyWarningWeights;
export type ThresholdConfig = EarlyWarningThresholds;

// ─── Engine-specific constants ──────────────────────────────────────────────

export const DOMAIN_KEYS = SIGNAL_DOMAINS;
export const DEFAULT_CROSS_DOMAIN_THRESHOLD = CROSS_DOMAIN_BOOST.DOMAIN_THRESHOLD;
