import { z } from 'zod';

export const createClassRequirementSchema = z.object({
  class_id: z.string().uuid(),
  academic_year_id: z.string().uuid(),
  periods_per_week: z.number().int().min(1).default(5),
  required_room_type: z.enum([
    'classroom', 'lab', 'gym', 'auditorium', 'library',
    'computer_lab', 'art_room', 'music_room', 'outdoor', 'other',
  ]).nullable().optional(),
  preferred_room_id: z.string().uuid().nullable().optional(),
  max_consecutive_periods: z.number().int().min(1).default(2),
  min_consecutive_periods: z.number().int().min(1).default(1),
  spread_preference: z.enum(['spread_evenly', 'cluster', 'no_preference']).default('spread_evenly'),
  student_count: z.number().int().nullable().optional(),
}).refine(
  (d) => (d.min_consecutive_periods ?? 1) <= (d.max_consecutive_periods ?? 2),
  { message: 'min_consecutive_periods must be <= max_consecutive_periods' },
);

export type CreateClassRequirementDto = z.infer<typeof createClassRequirementSchema>;

export const updateClassRequirementSchema = z.object({
  periods_per_week: z.number().int().min(1).optional(),
  required_room_type: z.enum([
    'classroom', 'lab', 'gym', 'auditorium', 'library',
    'computer_lab', 'art_room', 'music_room', 'outdoor', 'other',
  ]).nullable().optional(),
  preferred_room_id: z.string().uuid().nullable().optional(),
  max_consecutive_periods: z.number().int().min(1).optional(),
  min_consecutive_periods: z.number().int().min(1).optional(),
  spread_preference: z.enum(['spread_evenly', 'cluster', 'no_preference']).optional(),
  student_count: z.number().int().nullable().optional(),
});

export type UpdateClassRequirementDto = z.infer<typeof updateClassRequirementSchema>;

export const bulkClassRequirementsSchema = z.object({
  academic_year_id: z.string().uuid(),
  requirements: z.array(z.object({
    class_id: z.string().uuid(),
    periods_per_week: z.number().int().min(1).default(5),
    required_room_type: z.enum([
      'classroom', 'lab', 'gym', 'auditorium', 'library',
      'computer_lab', 'art_room', 'music_room', 'outdoor', 'other',
    ]).nullable().optional(),
    preferred_room_id: z.string().uuid().nullable().optional(),
    max_consecutive_periods: z.number().int().min(1).default(2),
    min_consecutive_periods: z.number().int().min(1).default(1),
    spread_preference: z.enum(['spread_evenly', 'cluster', 'no_preference']).default('spread_evenly'),
    student_count: z.number().int().nullable().optional(),
  }).refine(
    (d) => (d.min_consecutive_periods ?? 1) <= (d.max_consecutive_periods ?? 2),
    { message: 'min_consecutive_periods must be <= max_consecutive_periods' },
  )).min(1),
}).refine(
  (d) => new Set(d.requirements.map(r => r.class_id)).size === d.requirements.length,
  { message: 'Duplicate class_id entries not allowed in bulk request' },
);

export type BulkClassRequirementsDto = z.infer<typeof bulkClassRequirementsSchema>;
