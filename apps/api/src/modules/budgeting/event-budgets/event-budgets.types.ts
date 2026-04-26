import type { Prisma } from '@prisma/client';

import type {
  EventBudgetPaymentPlan,
  EventBudgetStatus,
  EventBudgetType,
  EventDrivers,
  EventEngineOutputs,
} from '@school/shared/budgeting';

/**
 * Internal representation of an `event_budgets` row used inside the
 * service. Mirrors the Prisma model but narrows the JSONB columns to the
 * shared Zod-derived shapes.
 */
export interface EventBudgetRow {
  id: string;
  tenant_id: string;
  name: string;
  event_type: EventBudgetType;
  event_date: Date | null;
  event_end_date: Date | null;
  class_id: string | null;
  year_group_id: string | null;
  participant_count: number;
  drivers: Prisma.JsonValue;
  status: EventBudgetStatus;
  household_share_pct: Prisma.Decimal | number;
  payment_plan: EventBudgetPaymentPlan;
  fee_generation_run_id: string | null;
  fee_structure_id: string | null;
  notes: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface EventBudgetScenarioRow {
  id: string;
  tenant_id: string;
  parent_event_budget_id: string;
  name: string;
  position: number;
  driver_overrides: Prisma.JsonValue;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface EventBudgetSummary {
  id: string;
  name: string;
  event_type: EventBudgetType;
  event_date: string | null;
  event_end_date: string | null;
  class_id: string | null;
  year_group_id: string | null;
  participant_count: number;
  status: EventBudgetStatus;
  household_share_pct: number;
  payment_plan: EventBudgetPaymentPlan;
  fee_generation_run_id: string | null;
  fee_structure_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventBudgetScenarioResponse {
  id: string;
  parent_event_budget_id: string;
  name: string;
  position: number;
  driver_overrides: Partial<EventDrivers>;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventBudgetScenarioComputed {
  scenario: EventBudgetScenarioResponse;
  output: EventEngineOutputs;
}

export interface PerHouseholdBreakdownRow {
  household_id: string;
  household_name: string;
  student_count: number;
  household_total: number;
}

export interface EventBudgetDetail extends EventBudgetSummary {
  drivers: EventDrivers;
  output: EventEngineOutputs;
  per_household_breakdown: PerHouseholdBreakdownRow[];
  scenarios: EventBudgetScenarioComputed[];
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export function toSummary(row: EventBudgetRow): EventBudgetSummary {
  return {
    id: row.id,
    name: row.name,
    event_type: row.event_type,
    event_date: row.event_date ? row.event_date.toISOString().slice(0, 10) : null,
    event_end_date: row.event_end_date ? row.event_end_date.toISOString().slice(0, 10) : null,
    class_id: row.class_id,
    year_group_id: row.year_group_id,
    participant_count: row.participant_count,
    status: row.status,
    household_share_pct: Number(row.household_share_pct),
    payment_plan: row.payment_plan,
    fee_generation_run_id: row.fee_generation_run_id,
    fee_structure_id: row.fee_structure_id,
    notes: row.notes,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export function toScenarioResponse(row: EventBudgetScenarioRow): EventBudgetScenarioResponse {
  return {
    id: row.id,
    parent_event_budget_id: row.parent_event_budget_id,
    name: row.name,
    position: row.position,
    driver_overrides: (row.driver_overrides ?? {}) as Partial<EventDrivers>,
    notes: row.notes,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
