/**
 * Wire shapes for the public shareable-link route (impl 19).
 *
 * Mirrors `PublicShareResponse` from
 * apps/api/src/modules/budgeting/shareable-links/shareable-links.types.ts.
 *
 * The `payload` field is the sanitised projection of the snapshot's
 * `payload` JSONB column — backend's `filterPayloadForPublic` drops
 * `households` / `students` / `staff` / `individual_payroll` arrays,
 * strips per-row arrays from `source_data_snapshot` / `source_snapshot`,
 * and removes `computed_from` from line items. The frontend treats the
 * payload as `Record<string, unknown>` and reads only the safe keys
 * documented below.
 */

export interface PublicShareResponse {
  tenant_name: string;
  currency_code: string;
  model_id: string;
  model_name: string;
  version_number: number;
  published_at: string;
  fiscal_year_label: string;
  payload: Record<string, unknown>;
}

/**
 * Subset of safe keys we read out of `payload`. The renderer is defensive
 * — every field is read with a typeof check, so the public page degrades
 * gracefully if the engine ever changes its serialisation.
 */
export interface SafePayloadShape {
  executive_summary?: string;
  drivers?: Record<string, unknown>;
  totals_by_year?: Array<{
    fiscal_year: number;
    revenue: number;
    expenditure: number;
    net_result: number;
  }>;
  per_pupil_unit_economics?: Array<{
    fiscal_year: number;
    revenue_per_student: number;
    expenditure_per_student: number;
    net_per_student: number;
    breakeven_students?: number;
  }>;
  base_case?: {
    line_items?: Array<{
      category?: string;
      subcategory?: string;
      name?: string;
      fiscal_year?: number;
      amount?: number;
    }>;
    totals_by_year?: Array<{
      fiscal_year: number;
      revenue: number;
      expenditure: number;
      net_result: number;
    }>;
    per_pupil_unit_economics?: Array<{
      fiscal_year: number;
      revenue_per_student: number;
      expenditure_per_student: number;
      net_per_student: number;
      breakeven_students?: number;
    }>;
  };
  line_items?: Array<{
    category?: string;
    subcategory?: string;
    name?: string;
    fiscal_year?: number;
    amount?: number;
  }>;
  scenarios?: Array<{
    name?: string;
    driver_overrides?: Record<string, unknown>;
    line_items?: Array<{
      category?: string;
      subcategory?: string;
      name?: string;
      fiscal_year?: number;
      amount?: number;
    }>;
    totals_by_year?: Array<{
      fiscal_year: number;
      revenue: number;
      expenditure: number;
      net_result: number;
    }>;
  }>;
}

export type PublicTab = 'summary' | 'scenarios' | 'lineItems' | 'assumptions';

export const PUBLIC_TABS: PublicTab[] = ['summary', 'scenarios', 'lineItems', 'assumptions'];

export function readSafePayload(raw: Record<string, unknown>): SafePayloadShape {
  return raw as SafePayloadShape;
}
