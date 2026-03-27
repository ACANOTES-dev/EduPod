import { z } from 'zod';

// ─── Create NEPS Visit ───────────────────────────────────────────────────
export const createNepsVisitSchema = z.object({
  visit_date: z.string().date(),
  psychologist_name: z.string().min(2).max(200),
  notes: z.string().max(5000).optional(),
});
export type CreateNepsVisitDto = z.infer<typeof createNepsVisitSchema>;

// ─── Update NEPS Visit ───────────────────────────────────────────────────
export const updateNepsVisitSchema = z.object({
  visit_date: z.string().date().optional(),
  psychologist_name: z.string().min(2).max(200).optional(),
  notes: z.string().max(5000).optional(),
});
export type UpdateNepsVisitDto = z.infer<typeof updateNepsVisitSchema>;

// ─── NEPS Visit Filters ──────────────────────────────────────────────────
export const nepsVisitFiltersSchema = z.object({
  from_date: z.string().date().optional(),
  to_date: z.string().date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type NepsVisitFilters = z.infer<typeof nepsVisitFiltersSchema>;

// ─── Add Student to Visit ────────────────────────────────────────────────
export const addStudentToVisitSchema = z.object({
  student_id: z.string().uuid(),
  referral_id: z.string().uuid().optional(),
});
export type AddStudentToVisitDto = z.infer<typeof addStudentToVisitSchema>;

// ─── Update Visit Student ────────────────────────────────────────────────
export const updateVisitStudentSchema = z.object({
  outcome: z.string().max(2000).optional(),
});
export type UpdateVisitStudentDto = z.infer<typeof updateVisitStudentSchema>;
