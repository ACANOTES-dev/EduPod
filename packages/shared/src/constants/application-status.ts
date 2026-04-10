// ─── Application Status ──────────────────────────────────────────────────────
//
// Canonical list of admissions Application statuses used across the new
// financially-gated admissions pipeline. Matches the Prisma enum
// `ApplicationStatus` exactly. Legacy values (draft, under_review,
// pending_acceptance_approval, accepted) have been removed — the
// data migration remaps existing rows to the new set.

export const APPLICATION_STATUSES = [
  'submitted',
  'waiting_list',
  'ready_to_admit',
  'conditional_approval',
  'approved',
  'rejected',
  'withdrawn',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_WAITING_LIST_SUBSTATUSES = ['awaiting_year_setup'] as const;
export type ApplicationWaitingListSubstatus = (typeof APPLICATION_WAITING_LIST_SUBSTATUSES)[number];

export const ADMISSION_OVERRIDE_TYPES = [
  'full_waiver',
  'partial_waiver',
  'deferred_payment',
] as const;
export type AdmissionOverrideType = (typeof ADMISSION_OVERRIDE_TYPES)[number];

// States that still live inside the admissions pipeline and can be acted on.
export const ACTIVE_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  'submitted',
  'waiting_list',
  'ready_to_admit',
  'conditional_approval',
];

// Terminal states — no further transitions allowed.
export const TERMINAL_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  'approved',
  'rejected',
  'withdrawn',
];
