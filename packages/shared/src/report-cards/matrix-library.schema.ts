import { z } from 'zod';

// ─── Matrix query ───────────────────────────────────────────────────────────
// The class-first matrix endpoint accepts either a concrete academic period
// UUID or the literal string "all" to request a full-year aggregation.

export const classMatrixQuerySchema = z
  .object({
    academic_period_id: z.union([z.string().uuid(), z.literal('all')]).default('all'),
  })
  .strict();

export type ClassMatrixQuery = z.infer<typeof classMatrixQuerySchema>;

// ─── Library listing query ──────────────────────────────────────────────────
// The library endpoint lists the current (non-superseded) report cards the
// caller is allowed to see. Optional filters narrow by class, year group,
// academic period, and language.
//
// Pagination: offset (`page` / `pageSize`) by default. Large datasets
// should use keyset pagination by passing a `cursor` (opaque string
// returned as `meta.next_cursor` on the previous page). When `cursor` is
// provided, `page` is ignored. Bug RC-C038.
//
// Cursor format: base64url("<ISO created_at>::<id>") — both fields
// together uniquely order the row even when many rows share a
// millisecond. Clients should treat the value as opaque and not parse it.
//
// Phase 1b — Option B:
//   - `academic_period_id` filters per-period report cards by UUID
//   - `academic_period_id=full_year` filters to full-year (NULL period) rows
//   - `academic_year_id` further narrows full-year filtering to a specific
//     academic year when combined with `academic_period_id=full_year`

export const listReportCardLibraryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
    class_id: z.string().uuid().optional(),
    year_group_id: z.string().uuid().optional(),
    academic_period_id: z.union([z.string().uuid(), z.literal('full_year')]).optional(),
    academic_year_id: z.string().uuid().optional(),
    language: z.string().min(1).max(10).optional(),
  })
  .strict();

export type ListReportCardLibraryQuery = z.infer<typeof listReportCardLibraryQuerySchema>;
