/**
 * Shared break-glass types + pure helpers. Extracted from the page so the
 * helpers can be exercised with plain TypeScript Jest (`testRegex: .spec.ts`).
 *
 * The backend shape lives in
 * `apps/api/src/modules/safeguarding/safeguarding-break-glass.service.ts`;
 * this file mirrors those DTOs plus the derived review-status buckets.
 */

export interface BreakGlassGrantRow {
  id: string;
  granted_to: { id: string; name: string };
  granted_by: { id: string; name: string };
  reason: string;
  scope: 'all_concerns' | 'specific_concerns';
  granted_at: string;
  expires_at: string;
  active: boolean;
  review_completed_at: string | null;
  review_overdue: boolean;
}

export interface BreakGlassGrantDetail {
  id: string;
  granted_to: { id: string; name: string };
  granted_by: { id: string; name: string };
  reason: string;
  scope: 'all_concerns' | 'specific_concerns';
  scoped_concern_ids: string[];
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  active: boolean;
  after_action_review: {
    required: boolean;
    completed_at: string | null;
    completed_by: { id: string; name: string } | null;
    notes: string | null;
    overdue: boolean;
  };
}

export interface BreakGlassAccessLogEntry {
  id: string;
  concern_id: string;
  actor_id: string;
  action: string;
  description: string;
  at: string;
}

export interface BreakGlassAccessLog {
  grant_id: string;
  granted_to_id: string;
  window: { from: string; to: string };
  entries: BreakGlassAccessLogEntry[];
}

export type ReviewStatus = 'filed' | 'overdue' | 'not_yet_due' | 'not_required';

export function deriveReviewStatus(grant: {
  active: boolean;
  review_completed_at: string | null;
  review_overdue: boolean;
  expires_at: string;
}): ReviewStatus {
  if (grant.review_completed_at) return 'filed';
  if (grant.review_overdue) return 'overdue';
  if (grant.active) return 'not_yet_due';
  // Expired grant, not yet overdue (within 7-day window)
  const expired = new Date(grant.expires_at).getTime();
  const now = Date.now();
  if (expired < now) return 'not_yet_due';
  return 'not_required';
}

export function formatRemaining(expiresAtIso: string, nowMs: number = Date.now()): string {
  const expires = new Date(expiresAtIso).getTime();
  const remaining = expires - nowMs;
  if (remaining <= 0) return 'expired';
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
