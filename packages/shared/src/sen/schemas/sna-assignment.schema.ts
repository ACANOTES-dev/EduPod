import { z } from 'zod';

import { snaAssignmentStatusSchema } from '../enums';

const timeRangePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export const senSnaTimeRangeSchema = z
  .object({
    start: z.string().regex(timeRangePattern, 'Start time must use HH:MM format'),
    end: z.string().regex(timeRangePattern, 'End time must use HH:MM format'),
  })
  .refine((value) => value.start < value.end, {
    message: 'End time must be after start time',
    path: ['end'],
  });

export const senSnaScheduleEntrySchema = z.array(senSnaTimeRangeSchema);

export const senSnaScheduleSchema = z.record(z.string(), senSnaScheduleEntrySchema);

export const senWeeklyScheduleSchema = z
  .object({
    monday: senSnaScheduleEntrySchema.default([]),
    tuesday: senSnaScheduleEntrySchema.default([]),
    wednesday: senSnaScheduleEntrySchema.default([]),
    thursday: senSnaScheduleEntrySchema.default([]),
    friday: senSnaScheduleEntrySchema.default([]),
  })
  .strict();

export const senDailyScheduleSchema = z.record(z.string(), senSnaScheduleEntrySchema);

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

export const endSnaAssignmentSchema = z.object({
  end_date: z.string().date(),
});

export type EndSnaAssignmentDto = z.infer<typeof endSnaAssignmentSchema>;
