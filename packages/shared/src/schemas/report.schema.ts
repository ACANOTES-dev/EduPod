import { z } from 'zod';

export const promotionRolloverQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
});

export type PromotionRolloverQueryDto = z.infer<typeof promotionRolloverQuerySchema>;

export const feeGenerationRunsQuerySchema = z.object({
  academic_year_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type FeeGenerationRunsQueryDto = z.infer<typeof feeGenerationRunsQuerySchema>;

export const writeOffQuerySchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type WriteOffQueryDto = z.infer<typeof writeOffQuerySchema>;

export const notificationDeliveryQuerySchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  channel: z.enum(['email', 'whatsapp', 'in_app']).optional(),
  template_key: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type NotificationDeliveryQueryDto = z.infer<typeof notificationDeliveryQuerySchema>;

export const exportQuerySchema = z.object({
  format: z.enum(['csv', 'pdf']).default('csv'),
});

export type ExportQueryDto = z.infer<typeof exportQuerySchema>;
