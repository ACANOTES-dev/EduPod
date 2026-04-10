import { z } from 'zod';

// ─── Enums ──────────────────────────────────────────────────────────────────

export const COMMENT_WINDOW_STATUSES = ['scheduled', 'open', 'closed'] as const;

export const commentWindowStatusSchema = z.enum(COMMENT_WINDOW_STATUSES);

export type CommentWindowStatus = z.infer<typeof commentWindowStatusSchema>;

// ─── Create ─────────────────────────────────────────────────────────────────
// Phase 1b — Option B: a window is either per-period or full-year. Exactly
// one of `academic_period_id` or `academic_year_id` must be provided. When
// full-year, teachers write brand-new comments during the window with
// (student, year) + NULL period.

export const createCommentWindowSchema = z
  .object({
    academic_period_id: z.string().uuid().nullable().optional(),
    academic_year_id: z.string().uuid().optional(),
    opens_at: z.string().datetime(),
    closes_at: z.string().datetime(),
    instructions: z.string().max(2000).nullable().optional(),
  })
  .refine((data) => new Date(data.closes_at) > new Date(data.opens_at), {
    message: 'closes_at must be strictly after opens_at',
    path: ['closes_at'],
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

export type CreateCommentWindowDto = z.infer<typeof createCommentWindowSchema>;

// ─── Update (close / reschedule / edit instructions) ────────────────────────
// All fields optional; cross-field rule still enforced when both opens_at
// and closes_at are present.

export const updateCommentWindowSchema = z
  .object({
    opens_at: z.string().datetime().optional(),
    closes_at: z.string().datetime().optional(),
    instructions: z.string().max(2000).nullable().optional(),
  })
  .refine(
    (data) =>
      data.opens_at === undefined ||
      data.closes_at === undefined ||
      new Date(data.closes_at) > new Date(data.opens_at),
    {
      message: 'closes_at must be strictly after opens_at',
      path: ['closes_at'],
    },
  );

export type UpdateCommentWindowDto = z.infer<typeof updateCommentWindowSchema>;

// ─── Close window ───────────────────────────────────────────────────────────

export const closeCommentWindowSchema = z.object({
  closed_at: z.string().datetime().optional(),
});

export type CloseCommentWindowDto = z.infer<typeof closeCommentWindowSchema>;
