export const SAFEGUARDING_STATUS = [
  'reported', 'acknowledged', 'under_investigation', 'referred',
  'monitoring', 'resolved', 'sealed',
] as const;
export type SafeguardingStatus = (typeof SAFEGUARDING_STATUS)[number];

const VALID_TRANSITIONS: Record<string, string[]> = {
  reported: ['acknowledged'],
  acknowledged: ['under_investigation'],
  under_investigation: ['referred', 'monitoring', 'resolved'],
  referred: ['monitoring', 'resolved'],
  monitoring: ['resolved'],
  resolved: ['sealed'],
};

const TERMINAL_STATUSES: readonly string[] = ['sealed'];

export function isValidSafeguardingTransition(
  from: SafeguardingStatus,
  to: SafeguardingStatus,
): boolean {
  if (TERMINAL_STATUSES.includes(from)) return false;
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function getValidSafeguardingTransitions(
  from: SafeguardingStatus,
): SafeguardingStatus[] {
  return (VALID_TRANSITIONS[from] ?? []) as SafeguardingStatus[];
}

export function isSafeguardingTerminal(status: SafeguardingStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export const SAFEGUARDING_CONCERN_TYPE = [
  'physical_abuse', 'emotional_abuse', 'sexual_abuse', 'neglect',
  'self_harm', 'bullying', 'online_safety', 'domestic_violence',
  'substance_abuse', 'mental_health', 'radicalisation', 'other',
] as const;
export type SafeguardingConcernType = (typeof SAFEGUARDING_CONCERN_TYPE)[number];

export const SAFEGUARDING_SEVERITY = ['low', 'medium', 'high', 'critical'] as const;
export type SafeguardingSeverity = (typeof SAFEGUARDING_SEVERITY)[number];

export const SAFEGUARDING_ACTION_TYPE = [
  'note_added', 'status_changed', 'assigned', 'meeting_held',
  'parent_contacted', 'agency_contacted', 'tusla_referred',
  'garda_referred', 'document_uploaded', 'document_downloaded',
  'review_completed',
] as const;
export type SafeguardingActionType = (typeof SAFEGUARDING_ACTION_TYPE)[number];

export const REPORTER_ACK_STATUS = ['received', 'assigned', 'under_review'] as const;
export type ReporterAckStatus = (typeof REPORTER_ACK_STATUS)[number];

export const BREAK_GLASS_SCOPE = ['all_concerns', 'specific_concerns'] as const;
export type BreakGlassScope = (typeof BREAK_GLASS_SCOPE)[number];
