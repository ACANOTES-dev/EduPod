// ─── Re-exports from @school/shared/early-warning ──────────────────────────

import {
  type EarlyWarningThresholds,
  type EarlyWarningWeights,
  type SignalDomain,
  CROSS_DOMAIN_BOOST,
  SIGNAL_DOMAINS,
} from '@school/shared/early-warning';

export type {
  DetectedSignal,
  DomainScores,
  RiskAssessment,
  RiskTier,
  SignalDomain,
  SignalSeverity,
  SignalResult,
} from '@school/shared/early-warning';

export { DEFAULT_HYSTERESIS_BUFFER, DEFAULT_THRESHOLDS, DEFAULT_WEIGHTS } from '@school/shared/early-warning';

// ─── Engine-specific aliases ────────────────────────────────────────────────

export type DomainKey = SignalDomain;
export type WeightConfig = EarlyWarningWeights;
export type ThresholdConfig = EarlyWarningThresholds;

// ─── Engine-specific constants ──────────────────────────────────────────────

export const DOMAIN_KEYS = SIGNAL_DOMAINS;
export const DEFAULT_CROSS_DOMAIN_THRESHOLD = CROSS_DOMAIN_BOOST.DOMAIN_THRESHOLD;
