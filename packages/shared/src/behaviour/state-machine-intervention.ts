/**
 * Intervention plan lifecycle state machine.
 *
 * Uses Prisma enum names (not DB @map values):
 *   active_intervention -> DB "active"
 *   completed_intervention -> DB "completed"
 */

export type InterventionStatusKey =
  | 'planned'
  | 'active_intervention'
  | 'monitoring'
  | 'completed_intervention'
  | 'abandoned';

const VALID_TRANSITIONS: Record<string, string[]> = {
  planned: ['active_intervention', 'abandoned'],
  active_intervention: ['monitoring', 'completed_intervention', 'abandoned'],
  monitoring: ['completed_intervention', 'active_intervention'],
};

const TERMINAL_STATUSES: readonly string[] = ['completed_intervention', 'abandoned'];

export function isValidInterventionTransition(
  from: InterventionStatusKey,
  to: InterventionStatusKey,
): boolean {
  if (TERMINAL_STATUSES.includes(from)) {
    return false;
  }
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function getValidInterventionTransitions(
  from: InterventionStatusKey,
): InterventionStatusKey[] {
  return (VALID_TRANSITIONS[from] ?? []) as InterventionStatusKey[];
}

export function isTerminalInterventionStatus(status: InterventionStatusKey): boolean {
  return TERMINAL_STATUSES.includes(status);
}
