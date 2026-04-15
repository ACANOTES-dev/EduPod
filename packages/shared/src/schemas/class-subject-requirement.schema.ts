import { z } from 'zod';

// ─── Shared enums ────────────────────────────────────────────────────────────

const ROOM_TYPES = [
  'classroom',
  'lab',
  'gym',
  'auditorium',
  'library',
  'computer_lab',
  'art_room',
  'music_room',
  'outdoor',
  'science_lab',
] as const;

// Used for the fields we accept alongside periods_per_week on create + update.
// Kept lean — `preferred_periods_per_week`, `min/max_consecutive_periods`, and
// `spread_preference` live on the class-level `class_scheduling_requirements`;
// they're not re-exposed here because they rarely need to differ per-subject.
const requirementFields = {
  periods_per_week: z.number().int().min(0),
  max_periods_per_day: z.number().int().min(1).nullable().optional(),
  preferred_room_id: z.string().uuid().nullable().optional(),
  required_room_type: z.enum(ROOM_TYPES).nullable().optional(),
  requires_double_period: z.boolean().optional(),
  double_period_count: z.number().int().min(1).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
};

// ─── Create ──────────────────────────────────────────────────────────────────

export const createClassSubjectRequirementSchema = z
  .object({
    academic_year_id: z.string().uuid(),
    class_id: z.string().uuid(),
    subject_id: z.string().uuid(),
    ...requirementFields,
  })
  .refine(
    (d) => !d.requires_double_period || d.double_period_count == null || d.double_period_count > 0,
    {
      message: 'double_period_count must be > 0 when requires_double_period is true',
      path: ['double_period_count'],
    },
  );

export type CreateClassSubjectRequirementDto = z.infer<typeof createClassSubjectRequirementSchema>;

// ─── Update ──────────────────────────────────────────────────────────────────

export const updateClassSubjectRequirementSchema = z.object({
  periods_per_week: z.number().int().min(0).optional(),
  max_periods_per_day: z.number().int().min(1).nullable().optional(),
  preferred_room_id: z.string().uuid().nullable().optional(),
  required_room_type: z.enum(ROOM_TYPES).nullable().optional(),
  requires_double_period: z.boolean().optional(),
  double_period_count: z.number().int().min(1).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export type UpdateClassSubjectRequirementDto = z.infer<typeof updateClassSubjectRequirementSchema>;

// ─── List query ──────────────────────────────────────────────────────────────

export const listClassSubjectRequirementsQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
  class_id: z.string().uuid().optional(),
  subject_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListClassSubjectRequirementsQuery = z.infer<
  typeof listClassSubjectRequirementsQuerySchema
>;

// ─── Bulk upsert ─────────────────────────────────────────────────────────────

const bulkItemSchema = z
  .object({
    class_id: z.string().uuid(),
    subject_id: z.string().uuid(),
    ...requirementFields,
  })
  .refine(
    (d) => !d.requires_double_period || d.double_period_count == null || d.double_period_count > 0,
    {
      message: 'double_period_count must be > 0 when requires_double_period is true',
      path: ['double_period_count'],
    },
  );

export const bulkClassSubjectRequirementsSchema = z
  .object({
    academic_year_id: z.string().uuid(),
    requirements: z.array(bulkItemSchema).min(1),
  })
  .refine(
    (d) =>
      new Set(d.requirements.map((r) => `${r.class_id}::${r.subject_id}`)).size ===
      d.requirements.length,
    {
      message: 'Duplicate (class_id, subject_id) entries are not allowed in a single bulk request',
    },
  );

export type BulkClassSubjectRequirementsDto = z.infer<typeof bulkClassSubjectRequirementsSchema>;
