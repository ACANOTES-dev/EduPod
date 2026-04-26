import type { Prisma } from '@prisma/client';

import type {
  ComputedLineItem,
  Drivers,
  EngineWarning,
  FinancialModelLineItemCategory,
  FinancialModelLineItemSource,
  FinancialModelStatus,
  PerPupilEconomics,
  SourceDataSnapshot,
  YearTotals,
} from '@school/shared/budgeting';

/**
 * Internal Prisma row shape — kept loose because Prisma's strict
 * `Json` typing forces casts that pollute the service-method bodies.
 * Service casts to this on read; persistence-shaped writes use the
 * Prisma-generated input types directly.
 */
export interface FinancialModelRowSelected {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  fiscal_year_start: Date;
  fiscal_year_end: Date;
  horizon_years: number;
  drivers: Prisma.JsonValue;
  source_snapshot_json: Prisma.JsonValue;
  status: FinancialModelStatus;
  current_snapshot_id: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
}

export type LineItemSelected = {
  id: string;
  parent_model_id: string;
  scenario_id: string | null;
  category: FinancialModelLineItemCategory;
  subcategory: string;
  name: string;
  fiscal_year: number;
  source: FinancialModelLineItemSource;
  amount: Prisma.Decimal;
  is_locked: boolean;
  notes: string | null;
  references_event_budget_id: string | null;
};

export type ScenarioSelected = {
  id: string;
  name: string;
  position: number;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

// ─── API response shapes ───────────────────────────────────────────────────

export interface FinancialModelSummaryResponse {
  id: string;
  name: string;
  description: string | null;
  fiscal_year_start: string;
  fiscal_year_end: string;
  horizon_years: number;
  status: FinancialModelStatus;
  current_snapshot_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialModelDetailResponse {
  model: FinancialModelSummaryResponse & {
    drivers: Drivers;
    source_snapshot_json: SourceDataSnapshot;
    created_by: string;
  };
  scenarios: ScenarioSummaryResponse[];
  line_items: LineItemResponse[];
}

export interface ScenarioSummaryResponse {
  id: string;
  name: string;
  position: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LineItemResponse {
  id: string;
  parent_model_id: string;
  scenario_id: string | null;
  category: FinancialModelLineItemCategory;
  subcategory: string;
  name: string;
  fiscal_year: number;
  source: FinancialModelLineItemSource;
  amount: number;
  is_locked: boolean;
  notes: string | null;
  references_event_budget_id: string | null;
}

export interface EngineRunResponse {
  model: FinancialModelDetailResponse['model'];
  scenarios: ScenarioSummaryResponse[];
  line_items: LineItemResponse[];
  totals_by_year: YearTotals[];
  per_pupil_unit_economics: PerPupilEconomics[];
  warnings: EngineWarning[];
}

// ─── Pure shape helpers (no IO) ───────────────────────────────────────────

export function toSummary(row: FinancialModelRowSelected): FinancialModelSummaryResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    fiscal_year_start: row.fiscal_year_start.toISOString().slice(0, 10),
    fiscal_year_end: row.fiscal_year_end.toISOString().slice(0, 10),
    horizon_years: row.horizon_years,
    status: row.status,
    current_snapshot_id: row.current_snapshot_id,
    archived_at: row.archived_at ? row.archived_at.toISOString() : null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export function toDetail(row: FinancialModelRowSelected): FinancialModelDetailResponse['model'] {
  return {
    ...toSummary(row),
    drivers: row.drivers as unknown as Drivers,
    source_snapshot_json: row.source_snapshot_json as unknown as SourceDataSnapshot,
    created_by: row.created_by,
  };
}

export function toScenarioSummary(row: ScenarioSelected): ScenarioSummaryResponse {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    notes: row.notes,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export function toLineItemResponse(row: LineItemSelected): LineItemResponse {
  return {
    id: row.id,
    parent_model_id: row.parent_model_id,
    scenario_id: row.scenario_id,
    category: row.category,
    subcategory: row.subcategory,
    name: row.name,
    fiscal_year: row.fiscal_year,
    source: row.source,
    amount: Number(row.amount),
    is_locked: row.is_locked,
    notes: row.notes,
    references_event_budget_id: row.references_event_budget_id,
  };
}

// ─── Persistence shape ────────────────────────────────────────────────────

export function buildLineItemRow(
  tenantId: string,
  parentModelId: string,
  li: ComputedLineItem,
): {
  tenant_id: string;
  parent_model_id: string;
  scenario_id: null;
  category: FinancialModelLineItemCategory;
  subcategory: string;
  name: string;
  fiscal_year: number;
  source: 'driver_derived';
  amount: number;
  is_locked: false;
} {
  return {
    tenant_id: tenantId,
    parent_model_id: parentModelId,
    scenario_id: null,
    category: li.category,
    subcategory: li.subcategory,
    name: li.name,
    fiscal_year: li.fiscal_year,
    source: 'driver_derived',
    amount: li.amount,
    is_locked: false,
  };
}

// ─── Date helper ──────────────────────────────────────────────────────────

export function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setUTCFullYear(result.getUTCFullYear() + years);
  return result;
}
