import { z } from 'zod';

import { exportPurposeSchema } from '../enums';

// ─── Report Filters ──────────────────────────────────────────────────────
export const reportFilterSchema = z.object({
  from_date: z.string().date().optional(),
  to_date: z.string().date().optional(),
  year_group_id: z.string().uuid().optional(),
});
export type ReportFilterDto = z.infer<typeof reportFilterSchema>;

// ─── Student Summary Options ─────────────────────────────────────────────
export const studentSummaryOptionsSchema = reportFilterSchema.extend({
  include_resolved: z.coerce.boolean().default(false),
});
export type StudentSummaryOptionsDto = z.infer<typeof studentSummaryOptionsSchema>;

// ─── Init Tier 3 Export ──────────────────────────────────────────────────
export const initTier3ExportSchema = z
  .object({
    purpose: exportPurposeSchema,
    purpose_other: z.string().max(500).optional(),
    student_id: z.string().uuid().optional(),
    from_date: z.string().date().optional(),
    to_date: z.string().date().optional(),
  })
  .refine(
    (data) =>
      data.purpose !== 'other' ||
      (data.purpose_other && data.purpose_other.trim().length > 0),
    {
      message: 'purpose_other required when purpose is "other"',
      path: ['purpose_other'],
    },
  );
export type InitTier3ExportDto = z.infer<typeof initTier3ExportSchema>;

// ─── Export Scope ────────────────────────────────────────────────────────
export const exportScopeSchema = z.object({
  student_id: z.string().uuid().optional(),
  report_type: z.string().optional(),
});
export type ExportScope = z.infer<typeof exportScopeSchema>;
