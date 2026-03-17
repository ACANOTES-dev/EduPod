import { z } from 'zod';

// ─── Academic Year ────────────────────────────────────────────────────────────

export const createAcademicYearSchema = z.object({
  name: z.string().min(1).max(100),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  status: z.enum(['planned', 'active', 'closed']).default('planned'),
});

export type CreateAcademicYearDto = z.infer<typeof createAcademicYearSchema>;

export const updateAcademicYearSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
});

export type UpdateAcademicYearDto = z.infer<typeof updateAcademicYearSchema>;

export const updateAcademicYearStatusSchema = z.object({
  status: z.enum(['planned', 'active', 'closed']),
});

export type UpdateAcademicYearStatusDto = z.infer<typeof updateAcademicYearStatusSchema>;

// ─── Academic Period ──────────────────────────────────────────────────────────

export const createAcademicPeriodSchema = z.object({
  name: z.string().min(1).max(100),
  period_type: z.enum(['term', 'semester', 'quarter', 'custom']),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  status: z.enum(['planned', 'active', 'closed']).default('planned'),
});

export type CreateAcademicPeriodDto = z.infer<typeof createAcademicPeriodSchema>;

export const updateAcademicPeriodSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  period_type: z.enum(['term', 'semester', 'quarter', 'custom']).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
});

export type UpdateAcademicPeriodDto = z.infer<typeof updateAcademicPeriodSchema>;

export const updateAcademicPeriodStatusSchema = z.object({
  status: z.enum(['planned', 'active', 'closed']),
});

export type UpdateAcademicPeriodStatusDto = z.infer<typeof updateAcademicPeriodStatusSchema>;

// ─── Year Group ───────────────────────────────────────────────────────────────

export const createYearGroupSchema = z.object({
  name: z.string().min(1).max(100),
  display_order: z.number().int().min(0).default(0),
  next_year_group_id: z.string().uuid().nullable().optional(),
});

export type CreateYearGroupDto = z.infer<typeof createYearGroupSchema>;

export const updateYearGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  display_order: z.number().int().min(0).optional(),
  next_year_group_id: z.string().uuid().nullable().optional(),
});

export type UpdateYearGroupDto = z.infer<typeof updateYearGroupSchema>;

// ─── Subject ──────────────────────────────────────────────────────────────────

export const createSubjectSchema = z.object({
  name: z.string().min(1).max(150),
  code: z.string().max(50).nullable().optional(),
  subject_type: z.enum(['academic', 'supervision', 'duty', 'other']).default('academic'),
  active: z.boolean().default(true),
});

export type CreateSubjectDto = z.infer<typeof createSubjectSchema>;

export const updateSubjectSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  code: z.string().max(50).nullable().optional(),
  subject_type: z.enum(['academic', 'supervision', 'duty', 'other']).optional(),
  active: z.boolean().optional(),
});

export type UpdateSubjectDto = z.infer<typeof updateSubjectSchema>;

// ─── Query schemas ────────────────────────────────────────────────────────────

export const listAcademicYearsQuerySchema = z.object({
  status: z.enum(['planned', 'active', 'closed']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListAcademicYearsQuery = z.infer<typeof listAcademicYearsQuerySchema>;

export const listSubjectsQuerySchema = z.object({
  subject_type: z.enum(['academic', 'supervision', 'duty', 'other']).optional(),
  active: z.coerce.boolean().optional(),
});

export type ListSubjectsQuery = z.infer<typeof listSubjectsQuerySchema>;
