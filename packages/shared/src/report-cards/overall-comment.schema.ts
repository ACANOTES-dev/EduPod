import { z } from 'zod';

// ─── Overall comment — create ───────────────────────────────────────────────

export const createOverallCommentSchema = z.object({
  student_id: z.string().uuid(),
  class_id: z.string().uuid(),
  academic_period_id: z.string().uuid(),
  comment_text: z.string().min(1).max(8000),
});

export type CreateOverallCommentDto = z.infer<typeof createOverallCommentSchema>;

// ─── Overall comment — update ───────────────────────────────────────────────

export const updateOverallCommentSchema = z.object({
  comment_text: z.string().min(1).max(8000),
});

export type UpdateOverallCommentDto = z.infer<typeof updateOverallCommentSchema>;

// ─── Overall comment — finalise ─────────────────────────────────────────────

export const finaliseOverallCommentSchema = z.object({}).strict();

export type FinaliseOverallCommentDto = z.infer<typeof finaliseOverallCommentSchema>;
