import { z } from 'zod';

import { actionStatusSchema, sstMeetingStatusSchema } from '../enums';

// ─── Roster ───────────────────────────────────────────────────────────────

export const addSstMemberSchema = z.object({
  user_id: z.string().uuid(),
  role_description: z.string().max(100).optional(),
});

export type AddSstMemberDto = z.infer<typeof addSstMemberSchema>;

export const updateSstMemberSchema = z.object({
  role_description: z.string().max(100).optional(),
  active: z.boolean().optional(),
});

export type UpdateSstMemberDto = z.infer<typeof updateSstMemberSchema>;

// ─── Meetings ─────────────────────────────────────────────────────────────

export const createMeetingSchema = z.object({
  scheduled_at: z.string().datetime(),
});

export type CreateMeetingDto = z.infer<typeof createMeetingSchema>;

export const meetingFilterSchema = z.object({
  status: sstMeetingStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type MeetingFilterDto = z.infer<typeof meetingFilterSchema>;

export const meetingAttendeeSchema = z.object({
  user_id: z.string().uuid(),
  name: z.string(),
  present: z.boolean().nullable(),
});

export type MeetingAttendeeDto = z.infer<typeof meetingAttendeeSchema>;

export const updateMeetingNotesSchema = z.object({
  general_notes: z.string(),
});

export type UpdateMeetingNotesDto = z.infer<typeof updateMeetingNotesSchema>;

// ─── Agenda ───────────────────────────────────────────────────────────────

export const createManualAgendaItemSchema = z.object({
  description: z.string().min(1),
  student_id: z.string().uuid().optional(),
  case_id: z.string().uuid().optional(),
  display_order: z.number().int().optional(),
});

export type CreateManualAgendaItemDto = z.infer<typeof createManualAgendaItemSchema>;

export const updateAgendaItemSchema = z.object({
  discussion_notes: z.string().optional(),
  decisions: z.string().optional(),
  display_order: z.number().int().optional(),
});

export type UpdateAgendaItemDto = z.infer<typeof updateAgendaItemSchema>;

// ─── Actions ──────────────────────────────────────────────────────────────

export const createMeetingActionSchema = z.object({
  agenda_item_id: z.string().uuid().optional(),
  student_id: z.string().uuid().optional(),
  case_id: z.string().uuid().optional(),
  description: z.string().min(1),
  assigned_to_user_id: z.string().uuid(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type CreateMeetingActionDto = z.infer<typeof createMeetingActionSchema>;

export const updateMeetingActionSchema = z.object({
  description: z.string().min(1).optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type UpdateMeetingActionDto = z.infer<typeof updateMeetingActionSchema>;

export const actionFilterSchema = z.object({
  status: actionStatusSchema.optional(),
  assigned_to_user_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ActionFilterDto = z.infer<typeof actionFilterSchema>;

// ─── Attendees JSONB schema ───────────────────────────────────────────────

export const meetingAttendeesJsonSchema = z.array(meetingAttendeeSchema);

export type MeetingAttendeesJson = z.infer<typeof meetingAttendeesJsonSchema>;
