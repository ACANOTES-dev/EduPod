import { z } from 'zod';

import { senCategorySchema, senSupportLevelSchema } from '../enums';

export const senCategoryArraySchema = z
  .array(senCategorySchema)
  .min(1)
  .refine((categories) => new Set(categories).size === categories.length, {
    message: 'SEN categories must be unique',
  });

export const createSenProfileSchema = z
  .object({
    student_id: z.string().uuid(),
    sen_coordinator_user_id: z.string().uuid().optional(),
    sen_categories: senCategoryArraySchema,
    primary_category: senCategorySchema,
    support_level: senSupportLevelSchema,
    diagnosis: z.string().max(255).optional(),
    diagnosis_date: z.string().date().optional(),
    diagnosis_source: z.string().max(255).optional(),
    assessment_notes: z.string().max(10000).optional(),
    is_active: z.boolean().default(true),
    flagged_date: z.string().date().optional(),
    unflagged_date: z.string().date().optional(),
  })
  .refine((data) => data.sen_categories.includes(data.primary_category), {
    message: 'Primary category must be present in sen_categories',
    path: ['primary_category'],
  });

export type CreateSenProfileDto = z.infer<typeof createSenProfileSchema>;

export const updateSenProfileSchema = z
  .object({
    sen_coordinator_user_id: z.string().uuid().nullable().optional(),
    sen_categories: senCategoryArraySchema.optional(),
    primary_category: senCategorySchema.optional(),
    support_level: senSupportLevelSchema.optional(),
    diagnosis: z.string().max(255).nullable().optional(),
    diagnosis_date: z.string().date().nullable().optional(),
    diagnosis_source: z.string().max(255).nullable().optional(),
    assessment_notes: z.string().max(10000).nullable().optional(),
    is_active: z.boolean().optional(),
    flagged_date: z.string().date().nullable().optional(),
    unflagged_date: z.string().date().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.primary_category && data.sen_categories) {
        return data.sen_categories.includes(data.primary_category);
      }
      return true;
    },
    {
      message: 'Primary category must be present in sen_categories',
      path: ['primary_category'],
    },
  );

export type UpdateSenProfileDto = z.infer<typeof updateSenProfileSchema>;

export const listSenProfilesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  student_id: z.string().uuid().optional(),
  primary_category: senCategorySchema.optional(),
  support_level: senSupportLevelSchema.optional(),
  sen_coordinator_user_id: z.string().uuid().optional(),
  is_active: z.coerce.boolean().optional(),
  search: z.string().max(200).optional(),
});

export type ListSenProfilesQuery = z.infer<typeof listSenProfilesQuerySchema>;
