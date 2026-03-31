import { z } from 'zod';

import { senGoalStatusSchema } from '../enums';

export const createSenGoalSchema = z.object({
  support_plan_id: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  target: z.string().min(1).max(5000),
  baseline: z.string().min(1).max(5000),
  current_level: z.string().max(5000).optional(),
  target_date: z.string().date(),
  status: senGoalStatusSchema.default('not_started'),
  display_order: z.number().int().min(0).max(32767).default(0),
});

export type CreateSenGoalDto = z.infer<typeof createSenGoalSchema>;

export const updateSenGoalSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  target: z.string().min(1).max(5000).optional(),
  baseline: z.string().min(1).max(5000).optional(),
  current_level: z.string().max(5000).nullable().optional(),
  target_date: z.string().date().optional(),
  status: senGoalStatusSchema.optional(),
  display_order: z.number().int().min(0).max(32767).optional(),
});

export type UpdateSenGoalDto = z.infer<typeof updateSenGoalSchema>;

export const listSenGoalsQuerySchema = z.object({
  support_plan_id: z.string().uuid().optional(),
  status: senGoalStatusSchema.optional(),
});

export type ListSenGoalsQuery = z.infer<typeof listSenGoalsQuerySchema>;

export const createSenGoalStrategySchema = z.object({
  goal_id: z.string().uuid(),
  description: z.string().min(1).max(5000),
  responsible_user_id: z.string().uuid().optional(),
  frequency: z.string().max(100).optional(),
  is_active: z.boolean().default(true),
});

export type CreateSenGoalStrategyDto = z.infer<typeof createSenGoalStrategySchema>;

export const updateSenGoalStrategySchema = z.object({
  description: z.string().min(1).max(5000).optional(),
  responsible_user_id: z.string().uuid().nullable().optional(),
  frequency: z.string().max(100).nullable().optional(),
  is_active: z.boolean().optional(),
});

export type UpdateSenGoalStrategyDto = z.infer<typeof updateSenGoalStrategySchema>;

export const createSenGoalProgressSchema = z.object({
  goal_id: z.string().uuid(),
  note: z.string().min(1).max(5000),
  current_level: z.string().max(5000).optional(),
});

export type CreateSenGoalProgressDto = z.infer<typeof createSenGoalProgressSchema>;

export const listSenGoalProgressQuerySchema = z.object({
  goal_id: z.string().uuid(),
});

export type ListSenGoalProgressQuery = z.infer<typeof listSenGoalProgressQuerySchema>;
