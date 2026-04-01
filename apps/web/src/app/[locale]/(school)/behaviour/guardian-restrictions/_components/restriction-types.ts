// ─── Shared types and constants for guardian-restrictions ────────────────────

export interface RestrictionRow {
  id: string;
  restriction_type: string;
  legal_basis: string | null;
  reason: string;
  effective_from: string;
  effective_until: string | null;
  review_date: string | null;
  status: string;
  revoke_reason: string | null;
  revoked_at: string | null;
  created_at: string;
  student: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  parent: {
    id: string;
    first_name: string;
    last_name: string;
    user?: {
      id: string;
      first_name: string;
      last_name: string;
    } | null;
  } | null;
  set_by?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  approved_by?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  revoked_by?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  history?: HistoryEntry[];
}

export interface HistoryEntry {
  id: string;
  action: string;
  performed_by_id: string;
  previous_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

export interface RestrictionsResponse {
  data: RestrictionRow[];
  meta: { page: number; pageSize: number; total: number };
}

export interface StudentOption {
  id: string;
  first_name: string;
  last_name: string;
}

export interface ParentOption {
  id: string;
  first_name: string;
  last_name: string;
  relationship_label?: string | null;
}

export interface StudentDetailResponse {
  data: {
    id: string;
    student_parents: Array<{
      relationship_label: string | null;
      parent: {
        id: string;
        first_name: string;
        last_name: string;
      };
    }>;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const RESTRICTION_TYPE_LABELS: Record<string, string> = {
  no_behaviour_visibility: 'No Behaviour Visibility',
  no_behaviour_notifications: 'No Behaviour Notifications',
  no_portal_access: 'No Portal Access',
  no_communications: 'No Communications',
};

export const STATUS_LABELS: Record<string, string> = {
  active_restriction: 'Active',
  active: 'Active',
  expired: 'Expired',
  revoked: 'Revoked',
  superseded_restriction: 'Superseded',
  superseded: 'Superseded',
};

export const STATUS_BADGE_CLASSES: Record<string, string> = {
  active_restriction: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  active: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  expired: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  revoked: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  superseded_restriction: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
  superseded: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};

export const TYPE_BADGE_CLASSES: Record<string, string> = {
  no_behaviour_visibility:
    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  no_behaviour_notifications:
    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  no_portal_access: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  no_communications: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

export const DEFAULT_TYPE_BADGE = 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';

export const RESTRICTION_TYPES = [
  'no_behaviour_visibility',
  'no_behaviour_notifications',
  'no_portal_access',
  'no_communications',
] as const;

// ─── Shared helper components ─────────────────────────────────────────────────

export function getParentDisplayName(parent: RestrictionRow['parent']): string {
  if (!parent) return '\u2014';
  if (parent.user) {
    return `${parent.user.first_name} ${parent.user.last_name}`;
  }
  return `${parent.first_name} ${parent.last_name}`;
}
