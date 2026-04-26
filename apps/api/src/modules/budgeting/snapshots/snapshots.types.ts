import type { Prisma } from '@prisma/client';

import type {
  Drivers,
  FinancialModelLineItemCategory,
  FinancialModelLineItemSource,
  PartialDrivers,
  PerPupilEconomics,
  SnapshotPayload,
  SourceDataSnapshot,
  YearTotals,
} from '@school/shared/budgeting';

import type { ParentModelRow, ScenarioRow } from '../scenarios/scenarios.service';
import type { ScenariosService } from '../scenarios/scenarios.service';

// ─── Selected DB row shapes ───────────────────────────────────────────────

export interface ModelRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  fiscal_year_start: Date;
  fiscal_year_end: Date;
  horizon_years: number;
  drivers: Prisma.JsonValue;
  source_snapshot_json: Prisma.JsonValue;
  status: 'draft' | 'published' | 'archived';
  current_snapshot_id: string | null;
  archived_at: Date | null;
}

export interface LineItemRow {
  id: string;
  parent_model_id: string;
  scenario_id: string | null;
  category: FinancialModelLineItemCategory;
  subcategory: string;
  name: string;
  fiscal_year: number;
  source: FinancialModelLineItemSource;
  amount: Prisma.Decimal | number;
  is_locked: boolean;
  notes: string | null;
  references_event_budget_id: string | null;
}

export interface SnapshotRow {
  id: string;
  tenant_id: string;
  parent_model_id: string;
  version_number: number;
  payload: Prisma.JsonValue;
  executive_summary: string | null;
  published_at: Date;
  published_by: string;
  pdf_object_key: string | null;
  excel_object_key: string | null;
  rendered_at: Date | null;
}

// ─── API response shapes ──────────────────────────────────────────────────

export interface SnapshotSummary {
  id: string;
  parent_model_id: string;
  version_number: number;
  executive_summary: string | null;
  published_at: string;
  published_by: string;
  pdf_object_key: string | null;
  excel_object_key: string | null;
  rendered_at: string | null;
}

export interface SnapshotWithSignedUrls extends SnapshotSummary {
  payload: SnapshotPayload;
  pdf_signed_url: string | null;
  excel_signed_url: string | null;
}

// ─── Pure helpers (no IO) ─────────────────────────────────────────────────

interface BuildPayloadInput {
  parent: ModelRow;
  baseLineItems: LineItemRow[];
  scenarios: ScenarioRow[];
  scenariosService: ScenariosService;
  executiveSummary: string;
  publishedBy: { user_id: string; name: string | null };
}

/**
 * Compose the immutable snapshot payload from the live model state.
 *
 * Base-case totals + per-pupil come from `aggregateLiveLineItems` so
 * locked / override / custom values flow through unchanged. Scenarios
 * use the engine-computed numbers because we don't materialise
 * scenario-specific line items in the live DB.
 */
export function buildSnapshotPayload(input: BuildPayloadInput): SnapshotPayload {
  const { parent, baseLineItems, scenarios, scenariosService, executiveSummary, publishedBy } =
    input;

  const baseDrivers = parent.drivers as unknown as Drivers;
  const sourceSnapshot = parent.source_snapshot_json as unknown as SourceDataSnapshot;

  const { totals_by_year: baseTotals, per_pupil_unit_economics: basePerPupil } =
    aggregateLiveLineItems(baseLineItems, sourceSnapshot, parent.horizon_years);

  const parentForEngine = {
    id: parent.id,
    tenant_id: parent.tenant_id,
    drivers: parent.drivers,
    source_snapshot_json: parent.source_snapshot_json,
    horizon_years: parent.horizon_years,
  } satisfies ParentModelRow;

  const scenariosPayload = scenarios.map((scenario) => {
    const merged = scenariosService.resolveMergedDrivers(parentForEngine, scenario);
    const computed = scenariosService.runEngineForScenario(parentForEngine, scenario);
    return {
      id: scenario.id,
      name: scenario.name,
      position: scenario.position,
      driver_overrides: scenario.driver_overrides as unknown as PartialDrivers,
      merged_drivers: merged,
      notes: scenario.notes,
      computed: {
        line_items: computed.line_items.map((li) => ({
          category: li.category,
          subcategory: li.subcategory,
          name: li.name,
          fiscal_year: li.fiscal_year,
          amount: li.amount,
        })),
        totals_by_year: computed.totals_by_year,
        per_pupil_unit_economics: computed.per_pupil_unit_economics,
      },
    };
  });

  return {
    schema_version: 1,
    model: {
      id: parent.id,
      name: parent.name,
      description: parent.description,
      fiscal_year_start: parent.fiscal_year_start.toISOString().slice(0, 10),
      fiscal_year_end: parent.fiscal_year_end.toISOString().slice(0, 10),
      horizon_years: parent.horizon_years,
      drivers: baseDrivers,
    },
    scenarios: scenariosPayload,
    base_case: {
      line_items: baseLineItems.map((li) => ({
        id: li.id,
        category: li.category,
        subcategory: li.subcategory,
        name: li.name,
        fiscal_year: li.fiscal_year,
        source: li.source,
        amount: Number(li.amount),
        is_locked: li.is_locked,
        notes: li.notes,
        references_event_budget_id: li.references_event_budget_id,
      })),
      totals_by_year: baseTotals,
      per_pupil_unit_economics: basePerPupil,
    },
    source_snapshot: sourceSnapshot,
    executive_summary: executiveSummary,
    published_at: new Date().toISOString(),
    published_by: publishedBy,
  };
}

/**
 * Aggregate live (stored) line items into per-year totals + per-pupil
 * unit economics. We use the stored amounts so locked / override /
 * custom rows participate in the published totals — running a fresh
 * engine here would replace overrides with their derived values.
 *
 * Per-pupil math uses the snapshot's `total_active_students` /
 * `total_active_households` as the divisor for every year (engineering
 * trade-off: we don't fan growth across the horizon at snapshot time;
 * see modeling/PLAN.md §7.4).
 */
function aggregateLiveLineItems(
  lineItems: LineItemRow[],
  source: SourceDataSnapshot,
  horizonYears: number,
): { totals_by_year: YearTotals[]; per_pupil_unit_economics: PerPupilEconomics[] } {
  const totals: Map<number, { revenue: number; expenditure: number }> = new Map();
  for (let y = 1; y <= horizonYears; y++) {
    totals.set(y, { revenue: 0, expenditure: 0 });
  }
  for (const li of lineItems) {
    const slot = totals.get(li.fiscal_year);
    if (!slot) continue;
    const amount = Number(li.amount);
    if (li.category === 'income') {
      // Revenue uses tuition_net (not gross) to avoid double-counting
      // — same convention as the engine.
      if (li.subcategory === 'tuition_gross') continue;
      slot.revenue += amount;
    } else {
      slot.expenditure += amount;
    }
  }

  const totals_by_year: YearTotals[] = [];
  const per_pupil_unit_economics: PerPupilEconomics[] = [];
  const students = source.total_active_students || 0;
  const households = source.total_active_households || 0;
  const round2 = (n: number): number => Math.round(n * 100) / 100;
  for (let y = 1; y <= horizonYears; y++) {
    const slot = totals.get(y) ?? { revenue: 0, expenditure: 0 };
    const net = slot.revenue - slot.expenditure;
    totals_by_year.push({
      fiscal_year: y,
      revenue: round2(slot.revenue),
      expenditure: round2(slot.expenditure),
      net_result: round2(net),
    });
    per_pupil_unit_economics.push({
      fiscal_year: y,
      revenue_per_student: students > 0 ? round2(slot.revenue / students) : 0,
      expenditure_per_student: students > 0 ? round2(slot.expenditure / students) : 0,
      net_per_student: students > 0 ? round2(net / students) : 0,
      revenue_per_household: households > 0 ? round2(slot.revenue / households) : 0,
      breakeven_students: null,
    });
  }
  return { totals_by_year, per_pupil_unit_economics };
}

export function formatUserName(firstName: string | null, lastName: string | null): string | null {
  const first = firstName?.trim() ?? '';
  const last = lastName?.trim() ?? '';
  const combined = `${first} ${last}`.trim();
  return combined.length > 0 ? combined : null;
}

// ─── Response shapers ─────────────────────────────────────────────────────

export function toSummary(row: {
  id: string;
  parent_model_id: string;
  version_number: number;
  executive_summary: string | null;
  published_at: Date;
  published_by: string;
  pdf_object_key: string | null;
  excel_object_key: string | null;
  rendered_at: Date | null;
}): SnapshotSummary {
  return {
    id: row.id,
    parent_model_id: row.parent_model_id,
    version_number: row.version_number,
    executive_summary: row.executive_summary,
    published_at: row.published_at.toISOString(),
    published_by: row.published_by,
    pdf_object_key: row.pdf_object_key,
    excel_object_key: row.excel_object_key,
    rendered_at: row.rendered_at ? row.rendered_at.toISOString() : null,
  };
}
