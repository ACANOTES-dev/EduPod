import { z } from 'zod';

import { actionStatusSchema, agendaItemSourceSchema, sstMeetingStatusSchema } from '../enums';

// ─── SST Member ────────────────────────────────────────────────────────────

export const createSstMemberSchema = z.object({
  user_id: z.string().uuid(),
  role_description: z.string().max(100).optional(),
});

export type CreateSstMemberDto = z.infer<typeof createSstMemberSchema>;

export const updateSstMemberSchema = z.object({
  role_description: z.string().max(100).optional(),
  active: z.boolean().optional(),
});

export type UpdateSstMemberDto = z.infer<typeof updateSstMemberSchema>;

// ─── SST Meeting ───────────────────────────────────────────────────────────

export const createMeetingSchema = z.object({
  scheduled_at: z.string().datetime(),
  attendees: z.array(z.object({
    user_id: z.string().uuid(),
    name: z.string(),
    present: z.boolean().default(true),
  })).optional(),
  general_notes: z.string().optional(),
});

export type CreateMeetingDto = z.infer<typeof createMeetingSchema>;

export const updateMeetingSchema = z.object({
  scheduled_at: z.string().datetime().optional(),
  status: sstMeetingStatusSchema.optional(),
  attendees: z.array(z.object({
    user_id: z.string().uuid(),
    name: z.string(),
    present: z.boolean(),
  })).optional(),
  general_notes: z.string().optional(),
});

export type UpdateMeetingDto = z.infer<typeof updateMeetingSchema>;

// ─── Meeting Attendee sub-schema ───────────────────────────────────────────

export const meetingAttendeeSchema = z.object({
  user_id: z.string().uuid(),
  name: z.string(),
  present: z.boolean(),
});

export type MeetingAttendee = z.infer<typeof meetingAttendeeSchema>;

// ─── Agenda Item ───────────────────────────────────────────────────────────

export const createAgendaItemSchema = z.object({
  meeting_id: z.string().uuid(),
  source: agendaItemSourceSchema,
  student_id: z.string().uuid().optional(),
  case_id: z.string().uuid().optional(),
  concern_id: z.string().uuid().optional(),
  description: z.string().min(1),
  display_order: z.number().int().default(0),
});

export type CreateAgendaItemDto = z.infer<typeof createAgendaItemSchema>;

export const updateAgendaItemSchema = z.object({
  description: z.string().min(1).optional(),
  discussion_notes: z.string().optional(),
  decisions: z.string().optional(),
  display_order: z.number().int().optional(),
});

export type UpdateAgendaItemDto = z.infer<typeof updateAgendaItemSchema>;

// ─── Meeting Action ────────────────────────────────────────────────────────

export const createMeetingActionSchema = z.object({
  meeting_id: z.string().uuid(),
  agenda_item_id: z.string().uuid().optional(),
  student_id: z.string().uuid().optional(),
  case_id: z.string().uuid().optional(),
  description: z.string().min(1),
  assigned_to_user_id: z.string().uuid(),
  due_date: z.string(),
});

export type CreateMeetingActionDto = z.infer<typeof createMeetingActionSchema>;

export const updateMeetingActionSchema = z.object({
  description: z.string().min(1).optional(),
  assigned_to_user_id: z.string().uuid().optional(),
  due_date: z.string().optional(),
  status: actionStatusSchema.optional(),
});

export type UpdateMeetingActionDto = z.infer<typeof updateMeetingActionSchema>;

// ─── Filters ───────────────────────────────────────────────────────────────

export const meetingFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: sstMeetingStatusSchema.optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  sort: z.enum(['scheduled_at', 'created_at']).default('scheduled_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type MeetingFilters = z.infer<typeof meetingFiltersSchema>;

export const meetingActionFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  meeting_id: z.string().uuid().optional(),
  assigned_to_user_id: z.string().uuid().optional(),
  status: actionStatusSchema.optional(),
  sort: z.enum(['due_date', 'created_at', 'status']).default('due_date'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export type MeetingActionFilters = z.infer<typeof meetingActionFiltersSchema>;
