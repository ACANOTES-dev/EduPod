import { z } from 'zod';

import { senResourceSourceSchema } from '../enums';

const hoursSchema = z.number().min(0).multipleOf(0.01);

export const createResourceAllocationSchema = z.object({
  academic_year_id: z.string().uuid(),
  total_hours: hoursSchema,
  source: senResourceSourceSchema,
  notes: z.string().max(5000).optional(),
});

export type CreateResourceAllocationDto = z.infer<typeof createResourceAllocationSchema>;

export const updateResourceAllocationSchema = z.object({
  total_hours: hoursSchema.optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export type UpdateResourceAllocationDto = z.infer<typeof updateResourceAllocationSchema>;

export const listResourceAllocationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  academic_year_id: z.string().uuid().optional(),
  source: senResourceSourceSchema.optional(),
});

export type ListResourceAllocationsQuery = z.infer<typeof listResourceAllocationsQuerySchema>;

export const createSenStudentHoursSchema = z.object({
  resource_allocation_id: z.string().uuid(),
  student_id: z.string().uuid(),
  sen_profile_id: z.string().uuid(),
  allocated_hours: hoursSchema,
  notes: z.string().max(5000).optional(),
});

export type CreateSenStudentHoursDto = z.infer<typeof createSenStudentHoursSchema>;

export const updateSenStudentHoursSchema = z.object({
  allocated_hours: hoursSchema.optional(),
  used_hours: hoursSchema.optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export type UpdateSenStudentHoursDto = z.infer<typeof updateSenStudentHoursSchema>;

export const listSenStudentHoursQuerySchema = z.object({
  resource_allocation_id: z.string().uuid().optional(),
  student_id: z.string().uuid().optional(),
  sen_profile_id: z.string().uuid().optional(),
});

export type ListSenStudentHoursQuery = z.infer<typeof listSenStudentHoursQuerySchema>;

export const resourceUtilisationQuerySchema = z.object({
  academic_year_id: z.string().uuid().optional(),
});

export type ResourceUtilisationQuery = z.infer<typeof resourceUtilisationQuerySchema>;
