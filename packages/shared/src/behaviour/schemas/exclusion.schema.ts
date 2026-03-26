import { z } from 'zod';

export const EXCLUSION_TYPE_VALUES = [
  'suspension_extended', 'expulsion', 'managed_move', 'permanent_exclusion',
] as const;
export const EXCLUSION_STATUS_VALUES = [
  'initiated', 'notice_issued', 'hearing_scheduled', 'hearing_held',
  'decision_made', 'appeal_window', 'finalised', 'overturned',
] as const;
export const EXCLUSION_DECISION_VALUES = [
  'exclusion_confirmed', 'exclusion_modified', 'exclusion_reversed', 'alternative_consequence',
] as const;

export const createExclusionCaseSchema = z.object({
  sanction_id: z.string().uuid(),
});

export type CreateExclusionCaseDto = z.infer<typeof createExclusionCaseSchema>;

export const updateExclusionCaseSchema = z.object({
  hearing_date: z.string().optional(),
  hearing_attendees: z.array(z.object({
    name: z.string(),
    role: z.string(),
    relationship: z.string().optional(),
  })).optional(),
  student_representation: z.string().max(2000).optional(),
  conditions_for_return: z.string().max(5000).optional(),
  conditions_for_transfer: z.string().max(5000).optional(),
});

export type UpdateExclusionCaseDto = z.infer<typeof updateExclusionCaseSchema>;

export const exclusionStatusTransitionSchema = z.object({
  status: z.enum(EXCLUSION_STATUS_VALUES),
  reason: z.string().max(2000).optional(),
});

export type ExclusionStatusTransitionDto = z.infer<typeof exclusionStatusTransitionSchema>;

export const recordExclusionDecisionSchema = z.object({
  decision: z.enum(EXCLUSION_DECISION_VALUES),
  decision_reasoning: z.string().min(10),
  decided_by_id: z.string().uuid(),
  conditions_for_return: z.string().optional(),
  conditions_for_transfer: z.string().optional(),
});

export type RecordExclusionDecisionDto = z.infer<typeof recordExclusionDecisionSchema>;

export const exclusionCaseListQuerySchema = z.object({
  status: z.enum(EXCLUSION_STATUS_VALUES).optional(),
  type: z.enum(EXCLUSION_TYPE_VALUES).optional(),
  student_id: z.string().uuid().optional(),
  has_appeal: z.coerce.boolean().optional(),
  appeal_deadline_before: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ExclusionCaseListQuery = z.infer<typeof exclusionCaseListQuerySchema>;

export const statutoryTimelineStepSchema = z.object({
  step: z.string(),
  required_by: z.string().nullable(),
  completed_at: z.string().nullable(),
  status: z.enum(['complete', 'pending', 'overdue', 'not_started']),
});

export type StatutoryTimelineStep = z.infer<typeof statutoryTimelineStepSchema>;
