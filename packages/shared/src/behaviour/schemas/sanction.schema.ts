import { z } from 'zod';

export const SANCTION_TYPES = [
  'detention', 'suspension_internal', 'suspension_external', 'expulsion',
  'community_service', 'loss_of_privilege', 'restorative_meeting', 'other',
] as const;

export const SANCTION_STATUSES = [
  'pending_approval', 'scheduled', 'served', 'partially_served',
  'no_show', 'excused', 'cancelled', 'rescheduled', 'not_served_absent',
  'appealed', 'replaced', 'superseded',
] as const;

export const createSanctionSchema = z.object({
  incident_id: z.string().uuid(),
  student_id: z.string().uuid(),
  type: z.enum(SANCTION_TYPES),
  scheduled_date: z.string().min(1),
  scheduled_start_time: z.string().nullable().optional(),
  scheduled_end_time: z.string().nullable().optional(),
  scheduled_room_id: z.string().uuid().nullable().optional(),
  supervised_by_id: z.string().uuid().nullable().optional(),
  suspension_start_date: z.string().nullable().optional(),
  suspension_end_date: z.string().nullable().optional(),
  return_conditions: z.string().nullable().optional(),
  parent_meeting_required: z.boolean().optional().default(false),
  notes: z.string().max(5000).nullable().optional(),
  acknowledge_conflicts: z.boolean().optional().default(false),
});

export type CreateSanctionDto = z.infer<typeof createSanctionSchema>;

export const updateSanctionSchema = z.object({
  scheduled_date: z.string().optional(),
  scheduled_start_time: z.string().nullable().optional(),
  scheduled_end_time: z.string().nullable().optional(),
  scheduled_room_id: z.string().uuid().nullable().optional(),
  supervised_by_id: z.string().uuid().nullable().optional(),
  return_conditions: z.string().nullable().optional(),
  parent_meeting_required: z.boolean().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export type UpdateSanctionDto = z.infer<typeof updateSanctionSchema>;

export const sanctionStatusTransitionSchema = z.object({
  status: z.enum(SANCTION_STATUSES),
  reason: z.string().max(2000).optional(),
});

export type SanctionStatusTransitionDto = z.infer<typeof sanctionStatusTransitionSchema>;

export const bulkMarkServedSchema = z.object({
  sanction_ids: z.array(z.string().uuid()).min(1).max(100),
  served_at: z.string().optional(),
});

export type BulkMarkServedDto = z.infer<typeof bulkMarkServedSchema>;

export const recordParentMeetingSchema = z.object({
  parent_meeting_date: z.string().min(1),
  parent_meeting_notes: z.string().max(5000).optional(),
});

export type RecordParentMeetingDto = z.infer<typeof recordParentMeetingSchema>;

export const sanctionListQuerySchema = z.object({
  student_id: z.string().uuid().optional(),
  type: z.enum(SANCTION_TYPES).optional(),
  status: z.enum(SANCTION_STATUSES).optional(),
  supervised_by_id: z.string().uuid().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  incident_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type SanctionListQuery = z.infer<typeof sanctionListQuerySchema>;

export const sanctionCalendarQuerySchema = z.object({
  date_from: z.string().min(1),
  date_to: z.string().min(1),
});

export type SanctionCalendarQuery = z.infer<typeof sanctionCalendarQuerySchema>;
