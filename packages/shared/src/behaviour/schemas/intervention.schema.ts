import { z } from 'zod';

// ─── Enums ──────────────────────────────────────────────────────────────────

export const INTERVENTION_TYPE = [
  'behaviour_plan', 'mentoring', 'counselling_referral', 'restorative',
  'academic_support', 'parent_engagement', 'external_agency', 'other',
] as const;
export type InterventionTypeValue = (typeof INTERVENTION_TYPE)[number];

export const INTERVENTION_STATUS = [
  'planned', 'active', 'monitoring', 'completed', 'abandoned',
] as const;
export type InterventionStatusValue = (typeof INTERVENTION_STATUS)[number];

export const INTERVENTION_PROGRESS = [
  'on_track', 'some_progress', 'no_progress', 'regression',
] as const;
export type InterventionProgressValue = (typeof INTERVENTION_PROGRESS)[number];

export const INTERVENTION_OUTCOME = [
  'improved', 'no_change', 'deteriorated', 'inconclusive',
] as const;
export type InterventionOutcomeValue = (typeof INTERVENTION_OUTCOME)[number];

export const GOAL_UPDATE_STATUS = [
  'met', 'progressing', 'not_met', 'not_assessed',
] as const;
export type GoalUpdateStatusValue = (typeof GOAL_UPDATE_STATUS)[number];

// ─── JSONB Schemas ──────────────────────────────────────────────────────────

export const interventionGoalSchema = z.object({
  goal: z.string().min(1),
  measurable_target: z.string().min(1),
  deadline: z.string().nullable(),
});

export const interventionGoalsSchema = z.array(interventionGoalSchema).min(1);

export const interventionStrategySchema = z.object({
  strategy: z.string().min(1),
  responsible_staff_id: z.string().uuid(),
  frequency: z.string().min(1),
});

export const interventionStrategiesSchema = z.array(interventionStrategySchema).min(1);

export const goalUpdateSchema = z.object({
  goal: z.string(),
  status: z.enum(GOAL_UPDATE_STATUS),
  notes: z.string().nullable(),
});

export const goalUpdatesSchema = z.array(goalUpdateSchema);

// ─── Create ─────────────────────────────────────────────────────────────────

export const createInterventionSchema = z.object({
  student_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  type: z.enum(INTERVENTION_TYPE),
  trigger_description: z.string().min(1),
  goals: interventionGoalsSchema,
  strategies: interventionStrategiesSchema,
  assigned_to_id: z.string().uuid(),
  start_date: z.string().min(1), // ISO date YYYY-MM-DD
  target_end_date: z.string().nullable().optional(),
  review_frequency_days: z.number().int().min(1).max(365).default(14),
  send_aware: z.boolean().default(false),
  send_notes: z.string().nullable().optional(),
  incident_ids: z.array(z.string().uuid()).optional(),
});

export type CreateInterventionDto = z.infer<typeof createInterventionSchema>;

// ─── Update ─────────────────────────────────────────────────────────────────

export const updateInterventionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  goals: interventionGoalsSchema.optional(),
  strategies: interventionStrategiesSchema.optional(),
  target_end_date: z.string().nullable().optional(),
  review_frequency_days: z.number().int().min(1).max(365).optional(),
  send_aware: z.boolean().optional(),
  send_notes: z.string().nullable().optional(),
});

export type UpdateInterventionDto = z.infer<typeof updateInterventionSchema>;

// ─── Status Transition ──────────────────────────────────────────────────────

export const interventionStatusTransitionSchema = z.object({
  status: z.enum(INTERVENTION_STATUS),
  outcome: z.enum(INTERVENTION_OUTCOME).optional(),
  outcome_notes: z.string().optional(),
});

export type InterventionStatusTransitionDto = z.infer<typeof interventionStatusTransitionSchema>;

// ─── Complete ───────────────────────────────────────────────────────────────

export const completeInterventionSchema = z.object({
  outcome: z.enum(INTERVENTION_OUTCOME),
  outcome_notes: z.string().optional(),
});

export type CompleteInterventionDto = z.infer<typeof completeInterventionSchema>;

// ─── Review ─────────────────────────────────────────────────────────────────

export const createReviewSchema = z.object({
  review_date: z.string().min(1), // ISO date
  progress: z.enum(INTERVENTION_PROGRESS),
  goal_updates: goalUpdatesSchema,
  notes: z.string().min(1),
  next_review_date: z.string().nullable().optional(),
});

export type CreateReviewDto = z.infer<typeof createReviewSchema>;

// ─── List Query ─────────────────────────────────────────────────────────────

export const listInterventionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(INTERVENTION_STATUS).optional(),
  student_id: z.string().uuid().optional(),
  assigned_to_id: z.string().uuid().optional(),
  type: z.enum(INTERVENTION_TYPE).optional(),
});

export type ListInterventionsQuery = z.infer<typeof listInterventionsQuerySchema>;

export const outcomeAnalyticsQuerySchema = z.object({
  academic_year_id: z.string().uuid().optional(),
  year_group_id: z.string().uuid().optional(),
});

export type OutcomeAnalyticsQuery = z.infer<typeof outcomeAnalyticsQuerySchema>;
