import { z } from 'zod';

// ─── Overall comment — create ───────────────────────────────────────────────
// Phase 1b — Option B: exactly one of `academic_period_id` or
// `academic_year_id` must be provided. Full-year comments are written with
// NULL period and `academic_year_id` set; they feed the full-year report
// card generation path in the worker.

export const createOverallCommentSchema = z
  .object({
    student_id: z.string().uuid(),
    class_id: z.string().uuid(),
    academic_period_id: z.string().uuid().nullable().optional(),
    academic_year_id: z.string().uuid().optional(),
    comment_text: z.string().min(1).max(8000),
  })
  .refine(
    (data) => {
      const hasPeriod = data.academic_period_id != null && data.academic_period_id !== '';
      const hasYear = data.academic_year_id != null && data.academic_year_id !== '';
      return hasPeriod || hasYear;
    },
    {
      message: 'Either academic_period_id or academic_year_id is required',
      path: ['academic_period_id'],
    },
  );

export type CreateOverallCommentDto = z.infer<typeof createOverallCommentSchema>;

// ─── Overall comment — update ───────────────────────────────────────────────

export const updateOverallCommentSchema = z.object({
  comment_text: z.string().min(1).max(8000),
});

export type UpdateOverallCommentDto = z.infer<typeof updateOverallCommentSchema>;

// ─── Overall comment — finalise ─────────────────────────────────────────────

export const finaliseOverallCommentSchema = z.object({}).strict();

export type FinaliseOverallCommentDto = z.infer<typeof finaliseOverallCommentSchema>;
