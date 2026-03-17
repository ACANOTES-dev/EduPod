import { z } from 'zod';

export const promotionPreviewQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
});

export type PromotionPreviewQueryDto = z.infer<typeof promotionPreviewQuerySchema>;

const promotionActionSchema = z
  .object({
    student_id: z.string().uuid(),
    action: z.enum(['promote', 'hold_back', 'skip', 'graduate', 'withdraw']),
    target_year_group_id: z.string().uuid().optional(),
    reason: z.string().max(500).optional(),
  })
  .refine(
    (data) => {
      if (data.action === 'promote' || data.action === 'skip') {
        return !!data.target_year_group_id;
      }
      return true;
    },
    {
      message: 'target_year_group_id is required when action is promote or skip',
      path: ['target_year_group_id'],
    },
  )
  .refine(
    (data) => {
      if (data.action === 'withdraw') {
        return !!data.reason && data.reason.trim().length > 0;
      }
      return true;
    },
    {
      message: 'reason is required when action is withdraw',
      path: ['reason'],
    },
  );

export const promotionCommitSchema = z.object({
  academic_year_id: z.string().uuid(),
  actions: z.array(promotionActionSchema).min(1, 'At least one promotion action is required'),
});

export type PromotionCommitDto = z.infer<typeof promotionCommitSchema>;
