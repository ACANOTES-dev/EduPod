import { z } from 'zod';

import { eventBudgetPaymentPlanSchema } from './event-budgets';

/**
 * Trip → Fee integration DTOs (Phase 10).
 *
 * The integration pushes a confirmed event budget's per-student cost
 * onto the household billing surface via the Finance module's
 * `FeeAssignmentsService` (the only sanctioned cross-module write
 * — see modeling/IMPLEMENTATION_LOG.md Rule 11). Every endpoint requires
 * the three-permission stack: `budgeting.view` AND `budgeting.generate_fees`
 * AND `finance.manage` (Rule 12). The frontend hides the button when
 * any is missing; the backend re-checks at request time.
 */

export const generateFeesBodySchema = z
  .object({
    confirm: z.literal(true),
    due_date: z.string().date().optional(),
  })
  .strict();
export type GenerateFeesBodyDto = z.infer<typeof generateFeesBodySchema>;

export type TripFeeMode = 'free' | 'cost_recovery' | 'subsidised' | 'payment_plan';

export interface GenerateFeesPreviewResponse {
  event_budget_id: string;
  mode: TripFeeMode;
  household_share_pct: number;
  payment_plan: z.infer<typeof eventBudgetPaymentPlanSchema>;
  totals: {
    total_to_invoice: number;
    total_school_subsidy: number;
    household_count: number;
    student_count: number;
  };
  households: Array<{
    household_id: string;
    household_name: string;
    students: Array<{ student_id: string; student_name: string }>;
    total_amount: number;
    payment_plan_dates: string[] | null;
  }>;
}

export interface GenerateFeesResponse {
  event_budget_id: string;
  status: 'fees_generated';
  fee_structure_id: string;
  fee_generation_run_id: string;
  total_invoiced: number;
  household_count: number;
  student_count: number;
}

export interface MarkSchoolFundedResponse {
  event_budget_id: string;
  status: 'fees_generated';
  reason: 'free_trip';
}
