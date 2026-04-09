import { z } from 'zod';

// ─── Enums ──────────────────────────────────────────────────────────────────

export const COMMENT_WINDOW_STATUSES = ['scheduled', 'open', 'closed'] as const;

export const commentWindowStatusSchema = z.enum(COMMENT_WINDOW_STATUSES);

export type CommentWindowStatus = z.infer<typeof commentWindowStatusSchema>;

// ─── Create ─────────────────────────────────────────────────────────────────

export const createCommentWindowSchema = z
  .object({
    academic_period_id: z.string().uuid(),
    opens_at: z.string().datetime(),
    closes_at: z.string().datetime(),
    instructions: z.string().max(2000).nullable().optional(),
  })
  .refine((data) => new Date(data.closes_at) > new Date(data.opens_at), {
    message: 'closes_at must be strictly after opens_at',
    path: ['closes_at'],
  });

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
