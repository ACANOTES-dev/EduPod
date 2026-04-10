import { z } from 'zod';

// ─── Subject comment — create ───────────────────────────────────────────────
// Server resolves author_user_id from auth context. tenant_id from RLS.
//
// Phase 1b — Option B: exactly one of `academic_period_id` or
// `academic_year_id` must be provided.

export const createSubjectCommentSchema = z
  .object({
    student_id: z.string().uuid(),
    subject_id: z.string().uuid(),
    class_id: z.string().uuid(),
    academic_period_id: z.string().uuid().nullable().optional(),
    academic_year_id: z.string().uuid().optional(),
    comment_text: z.string().min(1).max(4000),
    is_ai_draft: z.boolean().optional(),
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

export type CreateSubjectCommentDto = z.infer<typeof createSubjectCommentSchema>;

// ─── Subject comment — update (typing) ──────────────────────────────────────

export const updateSubjectCommentSchema = z.object({
  comment_text: z.string().min(1).max(4000),
  is_ai_draft: z.boolean().optional(),
});

export type UpdateSubjectCommentDto = z.infer<typeof updateSubjectCommentSchema>;

// ─── Subject comment — finalise ─────────────────────────────────────────────
// No payload; the controller writes finalised_at and finalised_by_user_id.

export const finaliseSubjectCommentSchema = z.object({}).strict();

export type FinaliseSubjectCommentDto = z.infer<typeof finaliseSubjectCommentSchema>;

// ─── AI draft request ───────────────────────────────────────────────────────
// Used by the comment editor to request a new AI seed for an existing
// (student, subject, period) cell.

export const requestSubjectCommentAiDraftSchema = z.object({
  student_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  academic_period_id: z.string().uuid(),
});

export type RequestSubjectCommentAiDraftDto = z.infer<typeof requestSubjectCommentAiDraftSchema>;
