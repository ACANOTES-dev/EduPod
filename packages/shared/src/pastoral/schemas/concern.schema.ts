import { z } from 'zod';

import { concernSeveritySchema, parentShareLevelSchema } from '../enums';

const uniqueStudentIds = (studentIds: string[]) => new Set(studentIds).size === studentIds.length;

// ─── Witness sub-schema ────────────────────────────────────────────────────

export const witnessSchema = z.object({
  type: z.enum(['staff', 'student']),
  id: z.string().uuid(),
  name: z.string(),
});

export type Witness = z.infer<typeof witnessSchema>;

// ─── Students Involved sub-schemas ─────────────────────────────────────────

export const concernInvolvedStudentInputSchema = z.object({
  student_id: z.string().uuid(),
});

export type ConcernInvolvedStudentInput = z.infer<typeof concernInvolvedStudentInputSchema>;

export const concernInvolvedStudentResponseSchema = concernInvolvedStudentInputSchema.extend({
  student_name: z.string(),
  added_at: z.string().datetime(),
});

export type ConcernInvolvedStudentResponse = z.infer<typeof concernInvolvedStudentResponseSchema>;

const studentsInvolvedArraySchema = z
  .array(concernInvolvedStudentInputSchema)
  .superRefine((students, ctx) => {
    const studentIds = students.map((student) => student.student_id);
    if (!uniqueStudentIds(studentIds)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'students_involved cannot contain duplicate students',
      });
    }
  });

// ─── Create ────────────────────────────────────────────────────────────────

export const createConcernSchema = z
  .object({
    student_id: z.string().uuid(),
    category: z.string().min(1).max(50),
    severity: concernSeveritySchema,
    narrative: z.string().min(10).max(10000),
    occurred_at: z.string().datetime(),
    location: z.string().max(255).nullable().optional(),
    students_involved: studentsInvolvedArraySchema.optional(),
    witnesses: z.array(witnessSchema).optional(),
    actions_taken: z.string().max(5000).nullable().optional(),
    follow_up_needed: z.boolean().default(false),
    follow_up_suggestion: z.string().max(2000).nullable().optional(),
    case_id: z.string().uuid().nullable().optional(),
    behaviour_incident_id: z.string().uuid().nullable().optional(),
    author_masked: z.boolean().default(false),
    tier: z.number().int().min(1).max(3).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.students_involved?.some((student) => student.student_id === value.student_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'students_involved cannot include the primary student',
        path: ['students_involved'],
      });
    }
  });

export type CreateConcernDto = z.infer<typeof createConcernSchema>;

// ─── Update Metadata ───────────────────────────────────────────────────────

export const updateConcernMetadataSchema = z.object({
  severity: concernSeveritySchema.optional(),
  follow_up_needed: z.boolean().optional(),
  follow_up_suggestion: z.string().max(2000).nullable().optional(),
  case_id: z.string().uuid().nullable().optional(),
  students_involved: studentsInvolvedArraySchema.optional(),
});

export type UpdateConcernMetadataDto = z.infer<typeof updateConcernMetadataSchema>;

// ─── Escalate Tier ─────────────────────────────────────────────────────────

export const escalateConcernTierSchema = z.object({
  new_tier: z.number().int().min(2).max(3),
  reason: z.string().min(1).max(2000),
});

export type EscalateConcernTierDto = z.infer<typeof escalateConcernTierSchema>;

// ─── Share with Parent ─────────────────────────────────────────────────────

export const shareConcernWithParentSchema = z.object({
  share_level: parentShareLevelSchema.optional(),
  notify_parent: z.boolean().default(false),
});

export type ShareConcernWithParentDto = z.infer<typeof shareConcernWithParentSchema>;

// ─── List Query ────────────────────────────────────────────────────────────

export const listConcernsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  student_id: z.string().uuid().optional(),
  category: z.string().optional(),
  severity: concernSeveritySchema.optional(),
  tier: z.coerce.number().int().min(1).max(3).optional(),
  case_id: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sort: z.enum(['occurred_at', 'created_at', 'severity']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type ListConcernsQuery = z.infer<typeof listConcernsQuerySchema>;
