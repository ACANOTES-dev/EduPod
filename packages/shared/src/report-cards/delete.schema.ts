import { z } from 'zod';

// ─── Bulk delete request ─────────────────────────────────────────────────────
// Accepts either an explicit list of report card ids OR a scope filter.
// The scope filter is validated by the backend at least-one-of level: an
// unscoped request (every field empty) is refused with 409 so admins can
// never accidentally nuke every report card in a tenant with a blank POST.
//
// `academic_period_id` accepts either a per-period UUID or the literal
// `'full_year'` sentinel to target Phase 1b — Option B rows (where
// academic_period_id IS NULL in the DB).

export const bulkDeleteReportCardsSchema = z
  .object({
    report_card_ids: z.array(z.string().uuid()).max(500).optional(),
    class_ids: z.array(z.string().uuid()).max(100).optional(),
    year_group_ids: z.array(z.string().uuid()).max(50).optional(),
    academic_period_id: z
      .union([z.string().uuid(), z.literal('full_year')])
      .nullable()
      .optional(),
    academic_year_id: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    (val) => {
      const hasIds = Boolean(val.report_card_ids && val.report_card_ids.length > 0);
      const hasClassScope = Boolean(val.class_ids && val.class_ids.length > 0);
      const hasYearGroupScope = Boolean(val.year_group_ids && val.year_group_ids.length > 0);
      const hasPeriod = val.academic_period_id !== undefined && val.academic_period_id !== null;
      const hasFullYearSentinel = val.academic_period_id === 'full_year';
      const hasAcademicYear = Boolean(val.academic_year_id);
      return (
        hasIds ||
        hasClassScope ||
        hasYearGroupScope ||
        hasPeriod ||
        hasFullYearSentinel ||
        hasAcademicYear
      );
    },
    {
      message:
        'At least one of report_card_ids, class_ids, year_group_ids, academic_period_id or academic_year_id must be supplied.',
      path: ['report_card_ids'],
    },
  );

export type BulkDeleteReportCardsDto = z.infer<typeof bulkDeleteReportCardsSchema>;
