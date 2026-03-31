import { z } from 'zod';

import { supportPlanStatusSchema } from '../enums';

export const createSupportPlanSchema = z.object({
  sen_profile_id: z.string().uuid(),
  academic_year_id: z.string().uuid(),
  academic_period_id: z.string().uuid().optional(),
  parent_version_id: z.string().uuid().optional(),
  review_date: z.string().date().optional(),
  next_review_date: z.string().date().optional(),
  parent_input: z.string().max(10000).optional(),
  student_voice: z.string().max(10000).optional(),
  staff_notes: z.string().max(10000).optional(),
});

export type CreateSupportPlanDto = z.infer<typeof createSupportPlanSchema>;

export const updateSupportPlanSchema = z.object({
  academic_period_id: z.string().uuid().nullable().optional(),
  status: supportPlanStatusSchema.optional(),
  review_date: z.string().date().nullable().optional(),
  next_review_date: z.string().date().nullable().optional(),
  reviewed_by_user_id: z.string().uuid().nullable().optional(),
  review_notes: z.string().max(10000).nullable().optional(),
  parent_input: z.string().max(10000).nullable().optional(),
  student_voice: z.string().max(10000).nullable().optional(),
  staff_notes: z.string().max(10000).nullable().optional(),
});

export type UpdateSupportPlanDto = z.infer<typeof updateSupportPlanSchema>;

export const listSupportPlansQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sen_profile_id: z.string().uuid().optional(),
  academic_year_id: z.string().uuid().optional(),
  academic_period_id: z.string().uuid().optional(),
  status: supportPlanStatusSchema.optional(),
  next_review_before: z.string().date().optional(),
});

export type ListSupportPlansQuery = z.infer<typeof listSupportPlansQuerySchema>;
