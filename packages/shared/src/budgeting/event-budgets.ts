import { z } from 'zod';

import { eventDriversSchema } from './event-engine';

/**
 * Mirrors the Prisma `EventBudgetType` enum on `event_budgets.event_type`.
 *
 * See modeling/PLAN.md §9.
 */
export const EVENT_BUDGET_TYPES = [
  'trip',
  'fundraiser',
  'sports_day',
  'performance',
  'capital_purchase',
  'other',
] as const;

export type EventBudgetType = (typeof EVENT_BUDGET_TYPES)[number];

export const eventBudgetTypeSchema = z.enum(EVENT_BUDGET_TYPES);

/**
 * Mirrors the Prisma `EventBudgetStatus` enum on `event_budgets.status`.
 *
 *   draft → confirmed → fees_generated → completed
 *           └→ cancelled (terminal)
 *
 * See modeling/PLAN.md §9.3.
 */
export const EVENT_BUDGET_STATUSES = [
  'draft',
  'confirmed',
  'fees_generated',
  'completed',
  'cancelled',
] as const;

export type EventBudgetStatus = (typeof EVENT_BUDGET_STATUSES)[number];

export const eventBudgetStatusSchema = z.enum(EVENT_BUDGET_STATUSES);

/**
 * Mirrors the Prisma `EventBudgetPaymentPlan` enum on
 * `event_budgets.payment_plan`. Drives how the trip→fee integration
 * splits per-student costs across installments via the existing
 * Finance module's `FeeAssignmentsService`.
 *
 * See modeling/PLAN.md §10.2.
 */
export const EVENT_BUDGET_PAYMENT_PLANS = [
  'one_off',
  'two_payments',
  'three_payments',
  'four_payments',
] as const;

export type EventBudgetPaymentPlan = (typeof EVENT_BUDGET_PAYMENT_PLANS)[number];

export const eventBudgetPaymentPlanSchema = z.enum(EVENT_BUDGET_PAYMENT_PLANS);

// ─── DTO schemas (Phase 07) ───────────────────────────────────────────────────

const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

/**
 * Body for POST /v1/budgeting/event-budgets — create a new event budget.
 *
 * Either `class_id`, `year_group_id`, or an explicit `participant_count` must
 * eventually be provided; the service derives a default participant count
 * when scope (class / year-group) is set. Drivers are validated; defaults
 * are filled in when not supplied.
 */
export const createEventBudgetSchema = z
  .object({
    name: z.string().min(1).max(255),
    event_type: eventBudgetTypeSchema,
    event_date: isoDateString.optional(),
    event_end_date: isoDateString.optional(),
    class_id: z.string().uuid().optional(),
    year_group_id: z.string().uuid().optional(),
    participant_count: z.number().int().min(0).optional(),
    drivers: eventDriversSchema.optional(),
    household_share_pct: z.number().min(0).max(100).default(100),
    payment_plan: eventBudgetPaymentPlanSchema.default('one_off'),
    notes: z.string().max(2000).optional(),
  })
  .strict();
export type CreateEventBudgetDto = z.infer<typeof createEventBudgetSchema>;

/**
 * Body for PATCH /v1/budgeting/event-budgets/:id — partial update.
 *
 * Only allowed when the row is in `draft` status (the service enforces this).
 * `event_type` is intentionally NOT patchable — once a trip/fundraiser is
 * categorised, its taxonomy is fixed. Re-create the budget if you need to
 * change the type.
 */
export const updateEventBudgetSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    event_date: isoDateString.nullable().optional(),
    event_end_date: isoDateString.nullable().optional(),
    participant_count: z.number().int().min(0).optional(),
    drivers: eventDriversSchema.optional(),
    household_share_pct: z.number().min(0).max(100).optional(),
    payment_plan: eventBudgetPaymentPlanSchema.optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateEventBudgetDto = z.infer<typeof updateEventBudgetSchema>;

/**
 * Querystring for GET /v1/budgeting/event-budgets.
 */
export const eventBudgetQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: eventBudgetStatusSchema.optional(),
  event_type: eventBudgetTypeSchema.optional(),
  date_from: isoDateString.optional(),
  date_to: isoDateString.optional(),
  search: z.string().max(255).optional(),
});
export type EventBudgetQueryDto = z.infer<typeof eventBudgetQuerySchema>;

// ─── Event budget scenarios ───────────────────────────────────────────────────

/**
 * Body for POST /v1/budgeting/event-budgets/:id/scenarios.
 *
 * `driver_overrides` accepts a partial of the parent's drivers — overrides
 * are merged on top at engine run time. The service caps the number of
 * scenarios per parent at 3 (matches the annual-model contract).
 */
export const createEventBudgetScenarioSchema = z
  .object({
    name: z.string().min(1).max(64),
    driver_overrides: eventDriversSchema.partial().optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();
export type CreateEventBudgetScenarioDto = z.infer<typeof createEventBudgetScenarioSchema>;

export const updateEventBudgetScenarioSchema = z
  .object({
    name: z.string().min(1).max(64).optional(),
    driver_overrides: eventDriversSchema.partial().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateEventBudgetScenarioDto = z.infer<typeof updateEventBudgetScenarioSchema>;
