import { z } from 'zod';

export const quickLogSchema = z.object({
  category_id: z.string().uuid(),
  student_ids: z.array(z.string().uuid()).min(1).max(1),
  description: z.string().min(3).max(2000).optional(),
  template_id: z.string().uuid().nullable().optional(),
  context_type: z.enum([
    'class', 'break', 'before_school', 'after_school', 'lunch',
    'transport', 'extra_curricular', 'off_site', 'online', 'other',
  ]).default('class'),
  schedule_entry_id: z.string().uuid().nullable().optional(),
  subject_id: z.string().uuid().nullable().optional(),
  room_id: z.string().uuid().nullable().optional(),
  idempotency_key: z.string().uuid(),
  academic_year_id: z.string().uuid(),
});

export type QuickLogDto = z.infer<typeof quickLogSchema>;

export const bulkPositiveSchema = z.object({
  category_id: z.string().uuid(),
  student_ids: z.array(z.string().uuid()).min(2).max(15),
  description: z.string().max(2000).optional(),
  template_id: z.string().uuid().nullable().optional(),
  context_type: z.enum([
    'class', 'break', 'before_school', 'after_school', 'lunch',
    'transport', 'extra_curricular', 'off_site', 'online', 'other',
  ]).default('class'),
  schedule_entry_id: z.string().uuid().nullable().optional(),
  academic_year_id: z.string().uuid(),
});

export type BulkPositiveDto = z.infer<typeof bulkPositiveSchema>;
