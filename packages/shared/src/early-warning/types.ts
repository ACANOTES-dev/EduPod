import type { RiskTier, SignalDomain, SignalSeverity } from './constants';

// ─── Signal Collector Output ─────────────────────────────────────────────────

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
  domain: SignalDomain;
  rawScore: number;
  signals: DetectedSignal[];
  summaryFragments: string[];
}

// ─── Scoring Engine Output ───────────────────────────────────────────────────

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
  crossDomainBoost: number;
  signals: DetectedSignal[];
  summaryText: string;
  trendData: number[];
  tierChanged: boolean;
  previousTier: RiskTier | null;
}

// ─── Config Types ────────────────────────────────────────────────────────────

export interface EarlyWarningWeights {
  attendance: number;
  grades: number;
  behaviour: number;
  wellbeing: number;
  engagement: number;
}

export interface EarlyWarningThresholds {
  green: number;
  yellow: number;
  amber: number;
  red: number;
}

export interface RoutingRuleSingle {
  role: string;
}

export interface RoutingRuleMultiple {
  roles: string[];
}

export interface EarlyWarningRoutingRules {
  yellow: RoutingRuleSingle;
  amber: RoutingRuleSingle;
  red: RoutingRuleMultiple;
}

// ─── Signal Summary Shape (stored in signal_summary_json) ────────────────────

export interface SignalSummaryJson {
  summaryText: string;
  topSignals: Array<{
    signalType: string;
    domain: SignalDomain;
    severity: SignalSeverity;
    scoreContribution: number;
    summaryFragment: string;
  }>;
}

// ─── Trend Shape (stored in trend_json) ──────────────────────────────────────

export interface TrendJson {
  dailyScores: number[];
}

// ─── Trigger Signals Shape (stored in trigger_signals_json) ──────────────────

export interface TriggerSignalsJson {
  signals: Array<{
    signalType: string;
    domain: SignalDomain;
    severity: SignalSeverity;
    scoreContribution: number;
  }>;
}

// ─── Worker Job Payloads ─────────────────────────────────────────────────────

export interface ComputeDailyJobPayload {
  tenant_id: string;
}

export interface ComputeStudentJobPayload {
  tenant_id: string;
  student_id: string;
  trigger_event: string;
}

export interface WeeklyDigestJobPayload {
  tenant_id: string;
}
