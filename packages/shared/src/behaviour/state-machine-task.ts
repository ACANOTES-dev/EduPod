/**
 * Task lifecycle state machine.
 *
 * Statuses: pending, in_progress, completed, cancelled, overdue
 *
 * Transitions:
 *   pending     -> in_progress, completed, cancelled, overdue
 *   in_progress -> completed, cancelled, overdue
 *   overdue     -> in_progress, completed, cancelled
 *   completed   -> (terminal)
 *   cancelled   -> (terminal)
 */

import type { BehaviourTaskStatus } from './enums';

const VALID_TASK_TRANSITIONS: Record<string, string[]> = {
  pending: ['in_progress', 'completed', 'cancelled', 'overdue'],
  in_progress: ['completed', 'cancelled', 'overdue'],
  overdue: ['in_progress', 'completed', 'cancelled'],
};

const TERMINAL_TASK_STATUSES: readonly string[] = ['completed', 'cancelled'];

export function isValidTaskTransition(
  from: BehaviourTaskStatus,
  to: BehaviourTaskStatus,
): boolean {
  if (TERMINAL_TASK_STATUSES.includes(from)) return false;
  const allowed = VALID_TASK_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function getValidTaskTransitions(
  from: BehaviourTaskStatus,
): BehaviourTaskStatus[] {
  if (TERMINAL_TASK_STATUSES.includes(from)) return [];
  return (VALID_TASK_TRANSITIONS[from] ?? []) as BehaviourTaskStatus[];
}

export function isTerminalTaskStatus(status: BehaviourTaskStatus): boolean {
  return TERMINAL_TASK_STATUSES.includes(status);
}
