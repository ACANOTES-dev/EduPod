import type { DetectedSignal, SignalSeverity } from '@school/shared/early-warning';

// ─── Severity Mapper ────────────────────────────────────────────────────────

export function mapSeverity(score: number): SignalSeverity {
  if (score <= 10) return 'low';
  if (score <= 20) return 'medium';
  if (score <= 30) return 'high';
  return 'critical';
}

// ─── Signal Builder ─────────────────────────────────────────────────────────

export function buildSignal(params: {
  signalType: string;
  scoreContribution: number;
  details: Record<string, unknown>;
  sourceEntityType: string;
  sourceEntityId: string;
  summaryFragment: string;
}): DetectedSignal {
  return {
    ...params,
    severity: mapSeverity(params.scoreContribution),
  };
}
