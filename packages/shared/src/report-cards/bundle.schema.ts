import { z } from 'zod';

// ─── Bundle PDF request ──────────────────────────────────────────────────────
// The library lets admins download a merged PDF of every report card in a
// scope instead of fetching them one by one. Two modes:
//
//  - `single`: concatenate every matching report card into one PDF. Use for
//    a one-class bundle or a cross-class export the admin wants to print as
//    a single stream.
//  - `per_class`: return a ZIP with one PDF per class. Use when the admin
//    wants to hand each homeroom teacher their own stack without further
//    sorting.
//
// The selection is scoped by `class_ids` (required) plus an optional period
// filter. `report_card_ids` can be supplied when the admin has an explicit
// multi-select in the frontend; it wins over the class_ids filter.
// `academic_period_id` accepts either a UUID or the `'full_year'` literal.
// `locale` defaults to `'en'` so a mixed-locale bundle is never accidental.

// Express's default query parser returns a string when a repeated param has
// a single value (`?class_ids=<uuid>`) and an array only when it has two or
// more. We coerce singles to length-1 arrays so the validator works with
// either shape.
const uuidArray = (max: number) =>
  z
    .preprocess(
      (val) => (typeof val === 'string' ? [val] : val),
      z.array(z.string().uuid()).max(max),
    )
    .optional();

export const reportCardBundlePdfQuerySchema = z
  .object({
    class_ids: uuidArray(100),
    report_card_ids: uuidArray(500),
    academic_period_id: z
      .union([z.string().uuid(), z.literal('full_year')])
      .nullable()
      .optional(),
    academic_year_id: z.string().uuid().optional(),
    locale: z.string().min(1).max(10).default('en'),
    merge_mode: z.enum(['single', 'per_class']).default('single'),
  })
  .strict()
  .refine(
    (val) => {
      const hasIds = Boolean(val.report_card_ids && val.report_card_ids.length > 0);
      const hasClasses = Boolean(val.class_ids && val.class_ids.length > 0);
      return hasIds || hasClasses;
    },
    {
      message: 'Provide either report_card_ids[] or class_ids[] — a bundle cannot be unscoped.',
      path: ['class_ids'],
    },
  );

export type ReportCardBundlePdfQuery = z.infer<typeof reportCardBundlePdfQuerySchema>;
