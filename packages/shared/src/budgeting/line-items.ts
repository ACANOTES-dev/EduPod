import { z } from 'zod';

/**
 * Mirrors the Prisma `FinancialModelLineItemSource` enum on
 * `financial_model_line_items.source`.
 *
 *  - driver_derived : computed by the engine from the model's drivers.
 *  - custom         : free-form line added by the user.
 *  - override       : a driver_derived line whose value the user
 *                     manually edited (or that was locked).
 *
 * See modeling/PLAN.md §6.
 */
export const FINANCIAL_MODEL_LINE_ITEM_SOURCES = ['driver_derived', 'custom', 'override'] as const;

export type FinancialModelLineItemSource = (typeof FINANCIAL_MODEL_LINE_ITEM_SOURCES)[number];

export const financialModelLineItemSourceSchema = z.enum(FINANCIAL_MODEL_LINE_ITEM_SOURCES);

/**
 * Mirrors the Prisma `FinancialModelLineItemCategory` enum on
 * `financial_model_line_items.category`. Top-level chart of accounts;
 * subcategories are free-form `VARCHAR(128)` strings.
 *
 * See modeling/PLAN.md §6.1 for the canonical subcategory tree.
 */
export const FINANCIAL_MODEL_LINE_ITEM_CATEGORIES = [
  'income',
  'staff_costs',
  'operations',
  'capital',
  'reserves_and_adjustments',
] as const;

export type FinancialModelLineItemCategory = (typeof FINANCIAL_MODEL_LINE_ITEM_CATEGORIES)[number];

export const financialModelLineItemCategorySchema = z.enum(FINANCIAL_MODEL_LINE_ITEM_CATEGORIES);

/**
 * Alias matching the Phase 04 spec wording. Same Zod enum as
 * `financialModelLineItemCategorySchema`; named to mirror the DTO field.
 */
export const lineItemCategorySchema = financialModelLineItemCategorySchema;

/**
 * Canonical subcategory list per category — mirrors PLAN.md §6.1.
 *
 * The runtime DTO does NOT pin subcategory to this list (schools use
 * domain-specific names for niche operations / capital lines), but the
 * UI uses it to suggest standard subcategories and to bucket rows in
 * the renderer / variance dashboard.
 */
export const lineItemSubcategoryByCategory = {
  income: ['tuition_gross', 'tuition_net', 'donations', 'grants', 'other_income'],
  staff_costs: [
    'teaching_salaries',
    'admin_salaries',
    'senior_leadership_salaries',
    'support_staff_salaries',
    'employer_contributions',
    'other_staff_costs',
  ],
  operations: [
    'utilities',
    'cleaning',
    'maintenance',
    'it',
    'insurance',
    'materials',
    'marketing',
    'trips_and_events_estimated',
    'other_operations',
  ],
  capital: ['building', 'equipment', 'it_infrastructure', 'other_capital'],
  reserves_and_adjustments: ['contingency', 'reserves_transfer', 'prior_year_adjustments'],
} as const satisfies Record<FinancialModelLineItemCategory, readonly string[]>;

// ─── Create / Update DTOs ─────────────────────────────────────────────────

/**
 * Create a custom line item on a financial model. The category is pinned
 * to one of the canonical buckets but `subcategory` accepts any
 * 1..128-char string so schools can invent their own labels.
 *
 * `scenario_id` (optional) tags the line to a specific alternative
 * scenario; when omitted the line is added to the base case
 * (`scenario_id IS NULL`). `references_event_budget_id` (optional) links
 * the line to an event-budget aggregate the line item represents.
 */
export const createLineItemSchema = z
  .object({
    category: lineItemCategorySchema,
    subcategory: z.string().min(1).max(128),
    name: z.string().min(1).max(255),
    fiscal_year: z.number().int().min(1).max(5),
    amount: z.number(),
    scenario_id: z.string().uuid().optional(),
    notes: z.string().max(1000).optional(),
    references_event_budget_id: z.string().uuid().optional(),
  })
  .strict();

export type CreateLineItemDto = z.infer<typeof createLineItemSchema>;

/**
 * Patch a line item.
 *
 *  - `amount` on a `driver_derived` row flips its source to `override`.
 *  - `is_locked = true` on a `driver_derived` row keeps the source
 *    (locks against engine recompute without touching the value).
 *  - `notes = null` clears notes.
 *
 * Refined to require at least one field — empty PATCH bodies are
 * rejected at the schema layer.
 */
export const updateLineItemSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    amount: z.number().optional(),
    is_locked: z.boolean().optional(),
    notes: z.string().max(1000).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateLineItemDto = z.infer<typeof updateLineItemSchema>;
