import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const createPeriodTemplateSchema = z.object({
  academic_year_id: z.string().uuid(),
  weekday: z.number().int().min(0).max(6),
  period_name: z.string().min(1).max(50),
  period_name_ar: z.string().max(50).nullable().optional(),
  period_order: z.number().int().min(0),
  start_time: z.string().regex(timeRegex, 'Must be HH:mm format'),
  end_time: z.string().regex(timeRegex, 'Must be HH:mm format'),
  schedule_period_type: z.enum(['teaching', 'break_supervision', 'assembly', 'lunch_duty', 'free']).default('teaching'),
});

export type CreatePeriodTemplateDto = z.infer<typeof createPeriodTemplateSchema>;

export const updatePeriodTemplateSchema = z.object({
  period_name: z.string().min(1).max(50).optional(),
  period_name_ar: z.string().max(50).nullable().optional(),
  period_order: z.number().int().min(0).optional(),
  start_time: z.string().regex(timeRegex, 'Must be HH:mm format').optional(),
  end_time: z.string().regex(timeRegex, 'Must be HH:mm format').optional(),
  schedule_period_type: z.enum(['teaching', 'break_supervision', 'assembly', 'lunch_duty', 'free']).optional(),
});

export type UpdatePeriodTemplateDto = z.infer<typeof updatePeriodTemplateSchema>;

export const copyDaySchema = z.object({
  academic_year_id: z.string().uuid(),
  source_weekday: z.number().int().min(0).max(6),
  target_weekdays: z.array(z.number().int().min(0).max(6)).min(1),
});

export type CopyDayDto = z.infer<typeof copyDaySchema>;
