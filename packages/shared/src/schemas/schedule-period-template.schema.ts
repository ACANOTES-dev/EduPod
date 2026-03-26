import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const createPeriodTemplateSchema = z.object({
  academic_year_id: z.string().uuid(),
  year_group_id: z.string().uuid(),
  weekday: z.number().int().min(0).max(6),
  period_name: z.string().min(1).max(50),
  period_name_ar: z.string().max(50).nullable().optional(),
  period_order: z.number().int().min(0),
  start_time: z.string().regex(timeRegex, 'Must be HH:mm format'),
  end_time: z.string().regex(timeRegex, 'Must be HH:mm format'),
  schedule_period_type: z.enum(['teaching', 'break_supervision', 'assembly', 'lunch_duty', 'free']).default('teaching'),
  supervision_mode: z.enum(['none', 'yard', 'classroom_previous', 'classroom_next']).default('none').optional(),
  break_group_id: z.string().uuid().nullable().optional(),
});

export type CreatePeriodTemplateDto = z.infer<typeof createPeriodTemplateSchema>;

export const updatePeriodTemplateSchema = z.object({
  period_name: z.string().min(1).max(50).optional(),
  period_name_ar: z.string().max(50).nullable().optional(),
  period_order: z.number().int().min(0).optional(),
  start_time: z.string().regex(timeRegex, 'Must be HH:mm format').optional(),
  end_time: z.string().regex(timeRegex, 'Must be HH:mm format').optional(),
  schedule_period_type: z.enum(['teaching', 'break_supervision', 'assembly', 'lunch_duty', 'free']).optional(),
  supervision_mode: z.enum(['none', 'yard', 'classroom_previous', 'classroom_next']).optional(),
  break_group_id: z.string().uuid().nullable().optional(),
});

export type UpdatePeriodTemplateDto = z.infer<typeof updatePeriodTemplateSchema>;

export const copyDaySchema = z.object({
  academic_year_id: z.string().uuid(),
  year_group_id: z.string().uuid(),
  source_weekday: z.number().int().min(0).max(6),
  target_weekdays: z.array(z.number().int().min(0).max(6)).min(1),
});

export type CopyDayDto = z.infer<typeof copyDaySchema>;

const replaceDayPeriodSchema = z.object({
  period_name: z.string().min(1).max(50),
  start_time: z.string().regex(timeRegex, 'Must be HH:mm format'),
  end_time: z.string().regex(timeRegex, 'Must be HH:mm format'),
  schedule_period_type: z.enum(['teaching', 'break_supervision', 'assembly', 'lunch_duty', 'free']),
});

export const replaceDaySchema = z.object({
  academic_year_id: z.string().uuid(),
  year_group_id: z.string().uuid(),
  weekday: z.number().int().min(0).max(6),
  periods: z.array(replaceDayPeriodSchema).min(1),
});

export type ReplaceDayDto = z.infer<typeof replaceDaySchema>;

export const copyYearGroupSchema = z.object({
  academic_year_id: z.string().uuid(),
  source_year_group_id: z.string().uuid(),
  target_year_group_ids: z.array(z.string().uuid()).min(1),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).optional(),
});

export type CopyYearGroupDto = z.infer<typeof copyYearGroupSchema>;
