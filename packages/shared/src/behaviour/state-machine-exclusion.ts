/**
 * Exclusion case lifecycle state machine.
 *
 * Uses Prisma enum names (not DB @map values):
 *   hearing_scheduled_exc -> DB "hearing_scheduled"
 */

export const EXCLUSION_STATUS = [
  'initiated', 'notice_issued', 'hearing_scheduled_exc', 'hearing_held',
  'decision_made', 'appeal_window', 'finalised', 'overturned',
] as const;
export type ExclusionStatusKey = (typeof EXCLUSION_STATUS)[number];

const VALID_TRANSITIONS: Record<string, string[]> = {
  initiated: ['notice_issued'],
  notice_issued: ['hearing_scheduled_exc'],
  hearing_scheduled_exc: ['hearing_held'],
  hearing_held: ['decision_made'],
  decision_made: ['appeal_window'],
  appeal_window: ['finalised', 'overturned'],
};

const TERMINAL_STATUSES: readonly string[] = ['finalised', 'overturned'];

export function isValidExclusionTransition(
  from: ExclusionStatusKey,
  to: ExclusionStatusKey,
): boolean {
  if (TERMINAL_STATUSES.includes(from)) return false;
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function getValidExclusionTransitions(
  from: ExclusionStatusKey,
): ExclusionStatusKey[] {
  return (VALID_TRANSITIONS[from] ?? []) as ExclusionStatusKey[];
}

export function isExclusionTerminal(status: ExclusionStatusKey): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Default statutory timeline steps for Irish exclusion cases */
export function buildStatutoryTimeline(
  caseType: string,
  noticeDeadline: string | null,
  hearingDeadline: string | null,
): Array<{
  step: string;
  required_by: string | null;
  completed_at: string | null;
  status: 'complete' | 'pending' | 'overdue' | 'not_started';
}> {
  return [
    {
      step: 'Written notice to parents',
      required_by: noticeDeadline,
      completed_at: null,
      status: 'pending',
    },
    {
      step: 'Hearing scheduled (minimum 5 school days notice to parents)',
      required_by: hearingDeadline,
      completed_at: null,
      status: 'not_started',
    },
    {
      step: 'Board pack assembled and distributed to attendees',
      required_by: hearingDeadline
        ? (new Date(new Date(hearingDeadline).getTime() - 86400000).toISOString().split('T')[0] ?? null)
        : null,
      completed_at: null,
      status: 'not_started',
    },
    {
      step: 'Hearing held',
      required_by: null,
      completed_at: null,
      status: 'not_started',
    },
    {
      step: 'Decision communicated to parents in writing',
      required_by: null,
      completed_at: null,
      status: 'not_started',
    },
    {
      step: 'Appeal window (15 school days from decision date)',
      required_by: null,
      completed_at: null,
      status: 'not_started',
    },
  ];
}

/** Compute current timeline step statuses dynamically */
export function computeTimelineStatuses(
  timeline: Array<{
    step: string;
    required_by: string | null;
    completed_at: string | null;
    status: string;
  }>,
  now: Date = new Date(),
): Array<{
  step: string;
  required_by: string | null;
  completed_at: string | null;
  status: 'complete' | 'pending' | 'overdue' | 'not_started';
}> {
  return timeline.map((entry) => {
    if (entry.completed_at) {
      return { ...entry, status: 'complete' as const };
    }
    if (!entry.required_by) {
      return { ...entry, status: 'not_started' as const };
    }
    const deadline = new Date(entry.required_by);
    if (deadline < now) {
      return { ...entry, status: 'overdue' as const };
    }
    return { ...entry, status: 'pending' as const };
  });
}
