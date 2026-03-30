import { z } from 'zod';

// ─── Enum value arrays ────────────────────────────────────────────────────────

export const HOMEWORK_TYPE_VALUES = [
  'written', 'reading', 'research', 'revision', 'project_work', 'online_activity',
] as const;

export const HOMEWORK_STATUS_VALUES = ['draft', 'published', 'archived'] as const;

export const COMPLETION_STATUS_VALUES = ['not_started', 'in_progress', 'completed'] as const;

export const RECURRENCE_FREQUENCY_VALUES = ['daily', 'weekly', 'custom'] as const;

// ─── Zod enum schemas ─────────────────────────────────────────────────────────

export const homeworkTypeSchema = z.enum(HOMEWORK_TYPE_VALUES);
export const homeworkStatusSchema = z.enum(HOMEWORK_STATUS_VALUES);
export const completionStatusSchema = z.enum(COMPLETION_STATUS_VALUES);
export const recurrenceFrequencySchema = z.enum(RECURRENCE_FREQUENCY_VALUES);

// ─── Homework CRUD schemas ────────────────────────────────────────────────────

export const createHomeworkSchema = z.object({
  title: z.string().min(1).max(255),
  class_id: z.string().uuid(),
  subject_id: z.string().uuid().optional(),
  academic_year_id: z.string().uuid(),
  academic_period_id: z.string().uuid().optional(),
  homework_type: homeworkTypeSchema,
  due_date: z.string().min(1),
  due_time: z.string().optional(),
  description: z.string().optional(),
  max_points: z.number().int().min(0).max(100).optional(),
  copied_from_id: z.string().uuid().optional(),
  recurrence_rule_id: z.string().uuid().optional(),
});

export const updateHomeworkSchema = createHomeworkSchema.partial();

export const listHomeworkSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  class_id: z.string().uuid().optional(),
  subject_id: z.string().uuid().optional(),
  academic_year_id: z.string().uuid().optional(),
  academic_period_id: z.string().uuid().optional(),
  status: homeworkStatusSchema.optional(),
  homework_type: homeworkTypeSchema.optional(),
  due_date_from: z.string().optional(),
  due_date_to: z.string().optional(),
  assigned_by_user_id: z.string().uuid().optional(),
  sort: z.enum(['due_date', 'created_at', 'title']).default('due_date'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

// ─── Completion schemas ───────────────────────────────────────────────────────

export const markCompletionSchema = z.object({
  status: completionStatusSchema,
  notes: z.string().optional(),
  points_awarded: z.number().int().min(0).optional(),
});

export const bulkMarkCompletionSchema = z.object({
  completions: z.array(
    z.object({
      student_id: z.string().uuid(),
      status: completionStatusSchema,
      notes: z.string().optional(),
      points_awarded: z.number().int().min(0).optional(),
    }),
  ).min(1),
});

// ─── Homework settings schema (for tenant settings) ─────────────────────────

export const homeworkSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  allow_student_self_report: z.boolean().default(true),
  require_teacher_verification: z.boolean().default(false),
  default_due_time: z.string().default('09:00'),
  overdue_notification_enabled: z.boolean().default(true),
  parent_digest_include_homework: z.boolean().default(true),
  max_attachment_size_mb: z.number().default(10),
  max_attachments_per_assignment: z.number().default(5),
  completion_reminder_enabled: z.boolean().default(true),
}).default({});

// ─── Diary / parent note schemas ──────────────────────────────────────────────

export const createDiaryNoteSchema = z.object({
  note_date: z.string().min(1),
  content: z.string().min(1).max(5000),
});

export const createParentNoteSchema = z.object({
  student_id: z.string().uuid(),
  note_date: z.string().min(1),
  content: z.string().min(1).max(5000),
});
