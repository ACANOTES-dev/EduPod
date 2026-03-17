import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const createScheduleSchema = z.object({
  class_id: z.string().uuid(),
  room_id: z.string().uuid().nullable().optional(),
  teacher_staff_id: z.string().uuid().nullable().optional(),
  weekday: z.number().int().min(0).max(6),
  start_time: z.string().regex(timeRegex, 'Must be HH:mm format'),
  end_time: z.string().regex(timeRegex, 'Must be HH:mm format'),
  effective_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  effective_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format').nullable().optional(),
  override_conflicts: z.boolean().optional(),
  override_reason: z.string().optional(),
}).refine(
  (d) => d.end_time > d.start_time,
  { message: 'end_time must be after start_time', path: ['end_time'] },
);

export type CreateScheduleDto = z.infer<typeof createScheduleSchema>;

export const updateScheduleSchema = z.object({
  room_id: z.string().uuid().nullable().optional(),
  teacher_staff_id: z.string().uuid().nullable().optional(),
  weekday: z.number().int().min(0).max(6).optional(),
  start_time: z.string().regex(timeRegex, 'Must be HH:mm format').optional(),
  end_time: z.string().regex(timeRegex, 'Must be HH:mm format').optional(),
  effective_start_date: z.string().optional(),
  effective_end_date: z.string().nullable().optional(),
  is_pinned: z.boolean().optional(),
  pin_reason: z.string().optional(),
  override_conflicts: z.boolean().optional(),
  override_reason: z.string().optional(),
});

export type UpdateScheduleDto = z.infer<typeof updateScheduleSchema>;

export const pinScheduleSchema = z.object({
  pin_reason: z.string().optional(),
});

export type PinScheduleDto = z.infer<typeof pinScheduleSchema>;

export const bulkPinSchema = z.object({
  schedule_ids: z.array(z.string().uuid()).min(1),
  pin_reason: z.string().optional(),
});

export type BulkPinDto = z.infer<typeof bulkPinSchema>;
