import { z } from 'zod';

import { snaAssignmentStatusSchema } from '../enums';

export const senSnaScheduleSchema = z.record(z.string(), z.unknown());

export const createSnaAssignmentSchema = z.object({
  sna_staff_profile_id: z.string().uuid(),
  student_id: z.string().uuid(),
  sen_profile_id: z.string().uuid(),
  schedule: senSnaScheduleSchema,
  start_date: z.string().date(),
  end_date: z.string().date().optional(),
  notes: z.string().max(5000).optional(),
});

export type CreateSnaAssignmentDto = z.infer<typeof createSnaAssignmentSchema>;

export const updateSnaAssignmentSchema = z.object({
  schedule: senSnaScheduleSchema.optional(),
  status: snaAssignmentStatusSchema.optional(),
  start_date: z.string().date().optional(),
  end_date: z.string().date().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export type UpdateSnaAssignmentDto = z.infer<typeof updateSnaAssignmentSchema>;

export const listSnaAssignmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sna_staff_profile_id: z.string().uuid().optional(),
  student_id: z.string().uuid().optional(),
  sen_profile_id: z.string().uuid().optional(),
  status: snaAssignmentStatusSchema.optional(),
});

export type ListSnaAssignmentsQuery = z.infer<typeof listSnaAssignmentsQuerySchema>;
