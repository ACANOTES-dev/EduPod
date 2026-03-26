import { z } from 'zod';

export const APPEAL_ENTITY_TYPE_VALUES = ['incident', 'sanction'] as const;
export const APPELLANT_TYPE_VALUES = ['parent', 'student', 'staff'] as const;
export const GROUNDS_CATEGORY_VALUES = [
  'factual_inaccuracy', 'disproportionate_consequence', 'procedural_error',
  'mitigating_circumstances', 'mistaken_identity', 'other',
] as const;
export const APPEAL_DECISION_VALUES = ['upheld_original', 'modified', 'overturned'] as const;
export const APPEAL_STATUS_VALUES = [
  'submitted', 'under_review', 'hearing_scheduled', 'decided', 'withdrawn',
] as const;

export const submitAppealSchema = z.object({
  entity_type: z.enum(APPEAL_ENTITY_TYPE_VALUES),
  incident_id: z.string().uuid(),
  sanction_id: z.string().uuid().optional(),
  student_id: z.string().uuid(),
  appellant_type: z.enum(APPELLANT_TYPE_VALUES),
  appellant_parent_id: z.string().uuid().optional(),
  appellant_staff_id: z.string().uuid().optional(),
  grounds: z.string().min(20),
  grounds_category: z.enum(GROUNDS_CATEGORY_VALUES),
});

export type SubmitAppealDto = z.infer<typeof submitAppealSchema>;

export const updateAppealSchema = z.object({
  reviewer_id: z.string().uuid().optional(),
  hearing_date: z.string().optional(),
  hearing_attendees: z.array(z.object({
    name: z.string(),
    role: z.string(),
  })).optional(),
});

export type UpdateAppealDto = z.infer<typeof updateAppealSchema>;

export const recordAppealDecisionSchema = z.object({
  decision: z.enum(APPEAL_DECISION_VALUES),
  decision_reasoning: z.string().min(10),
  hearing_notes: z.string().optional(),
  hearing_attendees: z.array(z.object({
    name: z.string(),
    role: z.string(),
  })).optional(),
  amendments: z.array(z.object({
    entity_type: z.enum(['incident', 'sanction']),
    entity_id: z.string().uuid(),
    field: z.string(),
    new_value: z.string(),
  })).optional(),
});

export type RecordAppealDecisionDto = z.infer<typeof recordAppealDecisionSchema>;

export const withdrawAppealSchema = z.object({
  reason: z.string().min(5).max(2000),
});

export type WithdrawAppealDto = z.infer<typeof withdrawAppealSchema>;

export const appealListQuerySchema = z.object({
  status: z.enum(APPEAL_STATUS_VALUES).optional(),
  grounds_category: z.enum(GROUNDS_CATEGORY_VALUES).optional(),
  student_id: z.string().uuid().optional(),
  entity_type: z.enum(APPEAL_ENTITY_TYPE_VALUES).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  reviewer_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type AppealListQuery = z.infer<typeof appealListQuerySchema>;
