/**
 * Wire shapes for the variance dashboard. Mirrors `VarianceListResponse`
 * from apps/api/src/modules/budgeting/variance/variance.service.ts (the
 * service returns `{ data, meta }` paginated-shape so apiClient leaves it
 * un-unwrapped).
 *
 * `available_periods` and `is_refreshing` are NOT returned by impl 06 —
 * the dashboard derives the period list from the row payload (distinct
 * `period_label` values per `period_type`) and tracks "refreshing" state
 * locally by remembering the `refreshed_at` value at refresh-trigger
 * time and polling until it advances.
 */

import type { VarianceCachePeriodType, VarianceRow } from '@school/shared/budgeting';

export type VariancePeriodType = VarianceCachePeriodType;

export interface VarianceMeta {
  snapshot_id: string | null;
  refreshed_at: string | null;
  period_type: VariancePeriodType;
  period_label: string | null;
  is_empty: boolean;
}

export interface VarianceListResponse {
  data: VarianceRow[];
  meta: VarianceMeta;
}

export type { VarianceRow };

export interface PeriodOption {
  type: VariancePeriodType;
  label: string;
}

/**
 * Categorical bands per the spec § 4. Income vs cost polarity flips
 * inside variance-table so a colour token doesn't need to encode it.
 */
export type VarianceBand = 'green' | 'amber' | 'red' | 'neutral';

export const COST_CATEGORIES = new Set<string>([
  'staff_costs',
  'operations',
  'capital',
  'reserves_and_adjustments',
]);
