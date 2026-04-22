/**
 * Pure helpers for the safeguarding concerns surfaces — enum literal lists for
 * dropdowns + pure-function badge style maps + a consistent detail payload
 * shape that matches `mapConcernDetail` on the backend. Keeping these out of
 * the JSX lets the list/new/detail pages stay focussed on rendering while
 * sharing the same single source of truth for what a "concern type" is.
 */

export const CONCERN_TYPES = [
  'physical_abuse',
  'emotional_abuse',
  'sexual_abuse',
  'neglect',
  'self_harm',
  'bullying',
  'online_safety',
  'domestic_violence',
  'substance_abuse',
  'mental_health',
  'radicalisation',
  'other',
] as const;
export type ConcernType = (typeof CONCERN_TYPES)[number];

export const CONCERN_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type ConcernSeverity = (typeof CONCERN_SEVERITIES)[number];

export const CONCERN_STATUSES = [
  'reported',
  'acknowledged',
  'under_investigation',
  'referred',
  'monitoring',
  'resolved',
  'sealed',
] as const;
export type ConcernStatus = (typeof CONCERN_STATUSES)[number];

export const SLA_FILTER_VALUES = ['all', 'overdue', 'due_soon', 'on_track'] as const;
export type SlaFilter = (typeof SLA_FILTER_VALUES)[number];

// ─── Status transitions (mirror isValidSafeguardingTransition in shared) ─────
//
// Keeping a lightweight FE-side copy avoids an extra backend round-trip to
// enumerate next-states when rendering the status transition menu. The
// canonical check still happens on the API — this is purely for UX gating.

export const VALID_STATUS_TRANSITIONS: Record<ConcernStatus, ConcernStatus[]> = {
  reported: ['acknowledged', 'under_investigation', 'referred', 'resolved'],
  acknowledged: ['under_investigation', 'referred', 'monitoring', 'resolved'],
  under_investigation: ['referred', 'monitoring', 'resolved'],
  referred: ['monitoring', 'resolved'],
  monitoring: ['under_investigation', 'resolved'],
  resolved: [],
  // `sealed` is terminal — mutations blocked server-side.
  sealed: [],
};

// ─── Style maps ─────────────────────────────────────────────────────────────

export const SEVERITY_BADGE_STYLES: Record<ConcernSeverity | 'unknown', string> = {
  critical: 'bg-danger-100 text-danger-700 border border-danger-200',
  high: 'bg-warning-100 text-warning-700 border border-warning-200',
  medium: 'bg-info-100 text-info-700 border border-info-200',
  low: 'bg-surface-secondary text-text-secondary border border-border',
  unknown: 'bg-surface-secondary text-text-secondary border border-border',
};

export const STATUS_BADGE_STYLES: Record<ConcernStatus | 'unknown', string> = {
  reported: 'bg-rose-100 text-rose-800 border border-rose-200',
  acknowledged: 'bg-sky-100 text-sky-800 border border-sky-200',
  under_investigation: 'bg-amber-100 text-amber-800 border border-amber-200',
  referred: 'bg-violet-100 text-violet-800 border border-violet-200',
  monitoring: 'bg-indigo-100 text-indigo-800 border border-indigo-200',
  resolved: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  sealed: 'bg-zinc-200 text-zinc-800 border border-zinc-300',
  unknown: 'bg-surface-secondary text-text-secondary border border-border',
};

// ─── Detail shape (mirrors SafeguardingConcernsService.mapConcernDetail) ─────

export interface ConcernActionRow {
  id: string;
  action_type: string;
  description: string;
  metadata: unknown;
  due_date: string | null;
  is_overdue: boolean;
  created_at: string;
  action_by: { id: string; name: string } | null;
}

export interface ConcernDetail {
  id: string;
  concern_number: string;
  concern_type: string;
  severity: string;
  status: string;
  description: string;
  immediate_actions_taken: string | null;
  is_tusla_referral: boolean;
  tusla_reference_number: string | null;
  tusla_referred_at: string | null;
  tusla_outcome: string | null;
  is_garda_referral: boolean;
  garda_reference_number: string | null;
  garda_referred_at: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  sla_first_response_due: string | null;
  sla_first_response_met_at: string | null;
  sla_breached: boolean;
  sealed_at: string | null;
  sealed_reason: string | null;
  retention_until: string | null;
  created_at: string;
  updated_at: string;
  student: { id: string; name: string; date_of_birth: string | null } | null;
  reported_by: { id: string; name: string } | null;
  designated_liaison: { id: string; name: string } | null;
  assigned_to: { id: string; name: string } | null;
  sealed_by: { id: string; name: string } | null;
  seal_approved_by: { id: string; name: string } | null;
  actions_count: number;
  linked_incidents_count: number;
}

export interface SealStatusPayload {
  concern_id: string;
  state: 'not_initiated' | 'pending_approval' | 'sealed';
  initiated_by_id: string | null;
  initiated_reason: string | null;
  approved_by_id: string | null;
  sealed_at: string | null;
}
