/**
 * Appeal lifecycle state machine.
 *
 * Uses Prisma enum names (not DB @map values):
 *   withdrawn_appeal -> DB "withdrawn"
 */

export const APPEAL_STATUS = [
  'submitted', 'under_review', 'hearing_scheduled', 'decided', 'withdrawn_appeal',
] as const;
export type AppealStatusKey = (typeof APPEAL_STATUS)[number];

const VALID_TRANSITIONS: Record<string, string[]> = {
  submitted: ['under_review', 'withdrawn_appeal'],
  under_review: ['hearing_scheduled', 'decided', 'withdrawn_appeal'],
  hearing_scheduled: ['decided', 'withdrawn_appeal'],
};

const TERMINAL_STATUSES: readonly string[] = ['decided', 'withdrawn_appeal'];

export function isValidAppealTransition(
  from: AppealStatusKey,
  to: AppealStatusKey,
): boolean {
  if (TERMINAL_STATUSES.includes(from)) return false;
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function getValidAppealTransitions(
  from: AppealStatusKey,
): AppealStatusKey[] {
  return (VALID_TRANSITIONS[from] ?? []) as AppealStatusKey[];
}

export function isAppealTerminal(status: AppealStatusKey): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export const APPEAL_ENTITY_TYPES = ['incident', 'sanction'] as const;
export type AppealEntityType = (typeof APPEAL_ENTITY_TYPES)[number];

export const APPELLANT_TYPES = ['parent', 'student', 'staff'] as const;
export type AppellantTypeValue = (typeof APPELLANT_TYPES)[number];

export const GROUNDS_CATEGORIES = [
  'factual_inaccuracy', 'disproportionate_consequence', 'procedural_error',
  'mitigating_circumstances', 'mistaken_identity', 'other',
] as const;
export type GroundsCategoryValue = (typeof GROUNDS_CATEGORIES)[number];

export const APPEAL_DECISIONS = ['upheld_original', 'modified', 'overturned'] as const;
export type AppealDecisionValue = (typeof APPEAL_DECISIONS)[number];

export const AMENDMENT_TYPES = ['correction', 'supersession', 'retraction'] as const;
export type AmendmentTypeValue = (typeof AMENDMENT_TYPES)[number];
