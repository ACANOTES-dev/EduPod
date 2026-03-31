import { z } from 'zod';

// ─── Generate Time Slots ──────────────────────────────────────────────────────

export const generateTimeSlotsSchema = z.object({
  date: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  slot_duration_minutes: z.number().int().min(5).max(60),
  buffer_minutes: z.number().int().min(0).max(15).default(2),
  teacher_ids: z.array(z.string().uuid()).min(1),
});

export type GenerateTimeSlotsDto = z.infer<typeof generateTimeSlotsSchema>;

// ─── Create Booking ───────────────────────────────────────────────────────────

export const bookingTypeEnum = z.enum(['parent_booked', 'admin_booked', 'walk_in']);

export const createBookingSchema = z.object({
  time_slot_id: z.string().uuid(),
  student_id: z.string().uuid(),
  booking_type: bookingTypeEnum.default('parent_booked'),
  video_call_link: z.string().url().max(500).optional(),
  notes: z.string().optional(),
});

export type CreateBookingDto = z.infer<typeof createBookingSchema>;
