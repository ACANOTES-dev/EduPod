/**
 * Wire shapes for the event-budget workspace.
 *
 * Mirrors `EventBudgetDetail` from
 * apps/api/src/modules/budgeting/event-budgets/event-budgets.types.ts.
 * The detail endpoint returns the full event with embedded drivers,
 * computed engine output, per-household breakdown, and scenarios with
 * their own computed outputs.
 */

import type {
  EventBudgetPaymentPlan,
  EventBudgetStatus,
  EventBudgetType,
  EventDrivers,
  EventEngineOutputs,
} from '@school/shared/budgeting';

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
