import { z } from 'zod';

import { driversSchema, partialDriversSchema } from './drivers';
import { sourceDataSnapshotSchema } from './source-data';

/**
 * Mirrors the Prisma `FinancialModelStatus` enum on
 * `financial_models.status`.
 *
 *  - draft     : editable working surface.
 *  - published : immutable; editing creates a new draft superseding it.
 *  - archived  : hidden from default lists; data retained.
 *
 * See modeling/PLAN.md §7.
 */
export const FINANCIAL_MODEL_STATUSES = ['draft', 'published', 'archived'] as const;

export type FinancialModelStatus = (typeof FINANCIAL_MODEL_STATUSES)[number];

export const financialModelStatusSchema = z.enum(FINANCIAL_MODEL_STATUSES);

// ─── Publish DTO ────────────────────────────────────────────────────────────

/**
 * Payload for `POST /v1/budgeting/financial-models/:id/snapshots/publish`.
 * The executive summary is the school's narrative for the board pack —
 * we cap it generously at 20k chars so users can paste full memos.
 */
export const publishSnapshotSchema = z
  .object({
    executive_summary: z.string().min(1).max(20_000),
  })
  .strict();

export type PublishSnapshotDto = z.infer<typeof publishSnapshotSchema>;

// ─── List query ────────────────────────────────────────────────────────────

export const listSnapshotsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListSnapshotsQueryDto = z.infer<typeof listSnapshotsQuerySchema>;

// ─── Snapshot payload ──────────────────────────────────────────────────────

/**
 * The immutable state blob persisted to
 * `financial_model_snapshots.payload`. Self-contained — the renderer
 * (Phase 09) reads ONLY this blob, no live DB joins.
 *
 * `category` is a free-form string here (not the enum) so the payload
 * shape is forward-compatible with future categories without requiring
 * a snapshot-version bump on every renderer evolution.
 */
const computedLineItemSchema = z.object({
  category: z.string(),
  subcategory: z.string(),
  name: z.string(),
  fiscal_year: z.number().int(),
  amount: z.number(),
});

const totalsByYearSchema = z.object({
  fiscal_year: z.number().int(),
  revenue: z.number(),
  expenditure: z.number(),
  net_result: z.number(),
});

const perPupilEconomicsSchema = z.object({
  fiscal_year: z.number().int(),
  revenue_per_student: z.number(),
  expenditure_per_student: z.number(),
  net_per_student: z.number(),
  revenue_per_household: z.number(),
  breakeven_students: z.number().nullable(),
});

const baseCaseLineItemSchema = z.object({
  id: z.string().uuid(),
  category: z.string(),
  subcategory: z.string(),
  name: z.string(),
  fiscal_year: z.number().int(),
  source: z.enum(['driver_derived', 'custom', 'override']),
  amount: z.number(),
  is_locked: z.boolean(),
  notes: z.string().nullable(),
  references_event_budget_id: z.string().uuid().nullable(),
});

export const snapshotPayloadSchema = z.object({
  schema_version: z.literal(1),
  model: z.object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    fiscal_year_start: z.string(),
    fiscal_year_end: z.string(),
    horizon_years: z.number().int().min(1).max(5),
    drivers: driversSchema,
  }),
  scenarios: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      position: z.number().int(),
      driver_overrides: partialDriversSchema,
      merged_drivers: driversSchema,
      notes: z.string().nullable(),
      computed: z.object({
        line_items: z.array(computedLineItemSchema),
        totals_by_year: z.array(totalsByYearSchema),
        per_pupil_unit_economics: z.array(perPupilEconomicsSchema),
      }),
    }),
  ),
  base_case: z.object({
    line_items: z.array(baseCaseLineItemSchema),
    totals_by_year: z.array(totalsByYearSchema),
    per_pupil_unit_economics: z.array(perPupilEconomicsSchema),
  }),
  source_snapshot: sourceDataSnapshotSchema,
  executive_summary: z.string(),
  published_at: z.string().datetime(),
  published_by: z.object({
    user_id: z.string().uuid(),
    name: z.string().nullable(),
  }),
});

export type SnapshotPayload = z.infer<typeof snapshotPayloadSchema>;
