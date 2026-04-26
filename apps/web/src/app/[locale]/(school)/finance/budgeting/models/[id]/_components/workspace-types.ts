/**
 * Shared types for the financial-model workspace UI.
 *
 * Mirrors `FinancialModelDetailResponse` / `EngineRunResponse` from
 * apps/api/src/modules/budgeting/financial-models/financial-models.types.ts.
 * Defined client-side to avoid taking a runtime import on the server-side
 * Nest types — the wire shape is the contract.
 */

import type {
  Drivers,
  EngineWarning,
  PartialDrivers,
  PerPupilEconomics,
  SourceDataSnapshot,
  YearTotals,
} from '@school/shared/budgeting';

export type ModelStatus = 'draft' | 'published' | 'archived';
export type LineItemCategory =
  | 'income'
  | 'staff_costs'
  | 'operations'
  | 'capital'
  | 'reserves_and_adjustments';
export type LineItemSource = 'driver_derived' | 'custom' | 'override';

export interface ModelSummary {
  id: string;
  name: string;
  description: string | null;
  fiscal_year_start: string;
  fiscal_year_end: string;
  horizon_years: 1 | 3 | 5;
  status: ModelStatus;
  current_snapshot_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  drivers: Drivers;
  source_snapshot_json: SourceDataSnapshot;
}

export interface ScenarioSummary {
  id: string;
  name: string;
  position: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Full scenario shape returned by `GET /financial-models/:id/scenarios` */
export interface ScenarioDetail extends ScenarioSummary {
  driver_overrides: PartialDrivers;
}

export interface LineItemRow {
  id: string;
  parent_model_id: string;
  scenario_id: string | null;
  category: LineItemCategory;
  subcategory: string;
  name: string;
  fiscal_year: number;
  source: LineItemSource;
  amount: number;
  is_locked: boolean;
  notes: string | null;
  references_event_budget_id: string | null;
}

export interface DetailResponse {
  model: ModelSummary;
  scenarios: ScenarioSummary[];
  line_items: LineItemRow[];
}

export interface EngineRun {
  totals_by_year: YearTotals[];
  per_pupil_unit_economics: PerPupilEconomics[];
  warnings: EngineWarning[];
}

export const CATEGORY_ORDER: LineItemCategory[] = [
  'income',
  'staff_costs',
  'operations',
  'capital',
  'reserves_and_adjustments',
];
