import { z } from 'zod';

export const updateTaskSchema = z.object({
  assigned_to_id: z.string().uuid().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  due_date: z.string().optional(),
  description: z.string().max(2000).optional(),
});

export type UpdateTaskDto = z.infer<typeof updateTaskSchema>;

export const completeTaskSchema = z.object({
  completion_notes: z.string().max(2000).optional(),
});

export type CompleteTaskDto = z.infer<typeof completeTaskSchema>;

export const cancelTaskSchema = z.object({
  reason: z.string().min(1).max(2000),
});

export type CancelTaskDto = z.infer<typeof cancelTaskSchema>;

export const listTasksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled', 'overdue']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assigned_to_id: z.string().uuid().optional(),
  entity_type: z.enum([
    'incident', 'sanction', 'intervention', 'safeguarding_concern',
    'appeal', 'break_glass_grant', 'exclusion_case', 'guardian_restriction',
  ]).optional(),
  entity_id: z.string().uuid().optional(),
  overdue_only: z.coerce.boolean().optional(),
});

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
