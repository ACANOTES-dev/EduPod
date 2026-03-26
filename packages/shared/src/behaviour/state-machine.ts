import type { IncidentStatus } from './enums';

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['active', 'withdrawn'],
  active: ['investigating', 'under_review', 'escalated', 'resolved', 'withdrawn'],
  investigating: [
    'awaiting_approval', 'awaiting_parent_meeting', 'resolved',
    'escalated', 'converted_to_safeguarding',
  ],
  awaiting_approval: ['active', 'resolved'],
  awaiting_parent_meeting: ['resolved', 'escalated'],
  under_review: ['active', 'escalated', 'resolved', 'withdrawn'],
  escalated: ['investigating', 'resolved'],
  resolved: ['closed_after_appeal', 'superseded'],
};

const TERMINAL_STATUSES: readonly string[] = [
  'withdrawn', 'closed_after_appeal', 'superseded', 'converted_to_safeguarding',
];

export function isValidTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  if (TERMINAL_STATUSES.includes(from) && from !== 'resolved') {
    return false;
  }
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function getValidTransitions(from: IncidentStatus): IncidentStatus[] {
  return (VALID_TRANSITIONS[from] ?? []) as IncidentStatus[];
}

export function isTerminalStatus(status: IncidentStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function projectIncidentStatus(
  status: IncidentStatus,
  userHasSafeguardingView: boolean,
): IncidentStatus | 'closed' {
  if (status === 'converted_to_safeguarding' && !userHasSafeguardingView) {
    return 'closed';
  }
  return status;
}
