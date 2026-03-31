import type { SenGoalStatus, SupportPlanStatus } from './enums';

export const SUPPORT_PLAN_TRANSITIONS: Partial<Record<SupportPlanStatus, SupportPlanStatus[]>> = {
  draft: ['active'],
  active: ['under_review', 'closed'],
  under_review: ['active', 'closed'],
  closed: ['archived'],
};

export const TERMINAL_SUPPORT_PLAN_STATUSES: readonly SupportPlanStatus[] = ['archived'];

export function isValidSupportPlanTransition(
  from: SupportPlanStatus,
  to: SupportPlanStatus,
): boolean {
  if (TERMINAL_SUPPORT_PLAN_STATUSES.includes(from)) {
    return false;
  }

  return SUPPORT_PLAN_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getValidSupportPlanTransitions(from: SupportPlanStatus): SupportPlanStatus[] {
  return SUPPORT_PLAN_TRANSITIONS[from] ?? [];
}

export function isTerminalSupportPlanStatus(status: SupportPlanStatus): boolean {
  return TERMINAL_SUPPORT_PLAN_STATUSES.includes(status);
}

export const GOAL_STATUS_TRANSITIONS: Partial<Record<SenGoalStatus, SenGoalStatus[]>> = {
  not_started: ['in_progress'],
  in_progress: ['partially_achieved', 'achieved', 'discontinued'],
  partially_achieved: ['in_progress', 'achieved', 'discontinued'],
};

export const TERMINAL_GOAL_STATUSES: readonly SenGoalStatus[] = ['achieved', 'discontinued'];

export function isValidGoalStatusTransition(from: SenGoalStatus, to: SenGoalStatus): boolean {
  if (TERMINAL_GOAL_STATUSES.includes(from)) {
    return false;
  }

  return GOAL_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getValidGoalStatusTransitions(from: SenGoalStatus): SenGoalStatus[] {
  return GOAL_STATUS_TRANSITIONS[from] ?? [];
}

export function isTerminalGoalStatus(status: SenGoalStatus): boolean {
  return TERMINAL_GOAL_STATUSES.includes(status);
}
