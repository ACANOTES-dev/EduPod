/**
 * Sanction lifecycle state machine.
 *
 * Uses Prisma enum names (not DB @map values).
 * The full transition graph covers approval flow, service outcomes,
 * rescheduling (old → superseded), and appeal lifecycle.
 */

export const SANCTION_STATUS = [
  'pending_approval', 'scheduled', 'served', 'partially_served',
  'no_show', 'excused', 'cancelled', 'rescheduled', 'not_served_absent',
  'appealed', 'replaced', 'superseded',
] as const;
export type SanctionStatusKey = (typeof SANCTION_STATUS)[number];

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending_approval: ['scheduled', 'cancelled'],

  scheduled: [
    'served', 'partially_served', 'no_show', 'excused',
    'cancelled', 'superseded', 'not_served_absent', 'appealed',
  ],

  appealed: ['scheduled', 'cancelled', 'replaced'],

  no_show: ['superseded', 'cancelled'],
  excused: ['superseded', 'cancelled'],
  not_served_absent: ['superseded'],
};

const TERMINAL_STATUSES: readonly string[] = [
  'served', 'partially_served', 'cancelled', 'replaced', 'superseded',
];

export function isValidSanctionTransition(
  from: SanctionStatusKey,
  to: SanctionStatusKey,
): boolean {
  if (TERMINAL_STATUSES.includes(from)) return false;
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function getValidSanctionTransitions(
  from: SanctionStatusKey,
): SanctionStatusKey[] {
  return (VALID_TRANSITIONS[from] ?? []) as SanctionStatusKey[];
}

export function isSanctionTerminal(status: SanctionStatusKey): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Sanction types that trigger exclusion case auto-creation */
export const EXCLUSION_TRIGGER_TYPES = [
  'suspension_external', 'expulsion',
] as const;

/** Threshold for extended suspension → exclusion case (Irish Education Act) */
export const EXCLUSION_SUSPENSION_DAY_THRESHOLD = 5;

/** Types that require suspension date fields */
export const SUSPENSION_TYPES = [
  'suspension_internal', 'suspension_external', 'expulsion',
] as const;

/** Parent-visible fields on sanctions (amendment workflow triggers) */
export const SANCTION_PARENT_VISIBLE_FIELDS = [
  'type', 'scheduled_date', 'suspension_start_date', 'suspension_end_date',
] as const;
