import { z } from 'zod';

import { reportCardContentScopeSchema } from './content-scope.schema';
import { PERSONAL_INFO_FIELDS, personalInfoFieldSchema } from './tenant-settings.schema';

// ─── Generation scope ────────────────────────────────────────────────────────
// The wizard supports three scope modes. Each mode carries its own list of
// target IDs; a non-empty list is required. The scope is resolved at submit
// time into a concrete array of student IDs (tenant-scoped).

export const GENERATION_SCOPE_MODES = ['year_group', 'class', 'individual'] as const;

export const generationScopeModeSchema = z.enum(GENERATION_SCOPE_MODES);

export type GenerationScopeMode = z.infer<typeof generationScopeModeSchema>;

export const generationScopeSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('year_group'),
      year_group_ids: z.array(z.string().uuid()).min(1),
    })
    .strict(),
  z
    .object({
      mode: z.literal('class'),
      class_ids: z.array(z.string().uuid()).min(1),
    })
    .strict(),
  z
    .object({
      mode: z.literal('individual'),
      student_ids: z.array(z.string().uuid()).min(1),
    })
    .strict(),
]);

export type GenerationScope = z.infer<typeof generationScopeSchema>;

// ─── Dry-run request ─────────────────────────────────────────────────────────
// The wizard calls this before submit to preview the comment gate status.

export const dryRunGenerationCommentGateSchema = z
  .object({
    scope: generationScopeSchema,
    academic_period_id: z.string().uuid(),
    content_scope: reportCardContentScopeSchema.default('grades_only'),
  })
  .strict();

export type DryRunGenerationCommentGateDto = z.infer<typeof dryRunGenerationCommentGateSchema>;

// ─── Start generation run ────────────────────────────────────────────────────

export const startGenerationRunSchema = z
  .object({
    scope: generationScopeSchema,
    academic_period_id: z.string().uuid(),
    content_scope: reportCardContentScopeSchema.default('grades_only'),
    /**
     * Per-run override for the personal-info field set. If omitted the
     * service falls back to the tenant default from
     * report_card_tenant_settings.settings_json.default_personal_info_fields.
     */
    personal_info_fields: z.array(personalInfoFieldSchema).optional(),
    /**
     * When true and `allow_admin_force_generate` is enabled on the tenant
     * settings, bypass the comment gate even if comments are missing or
     * unfinalised.
     */
    override_comment_gate: z.boolean().default(false),
  })
  .strict();

export type StartGenerationRunDto = z.infer<typeof startGenerationRunSchema>;

// ─── Dry-run response ────────────────────────────────────────────────────────

export interface CommentGateDryRunResult {
  students_total: number;
  languages_preview: {
    en: number;
    ar: number;
  };
  missing_subject_comments: Array<{
    student_id: string;
    student_name: string;
    subject_id: string;
    subject_name: string;
  }>;
  unfinalised_subject_comments: Array<{
    student_id: string;
    student_name: string;
    subject_id: string;
    subject_name: string;
  }>;
  missing_overall_comments: Array<{
    student_id: string;
    student_name: string;
  }>;
  unfinalised_overall_comments: Array<{
    student_id: string;
    student_name: string;
  }>;
  require_finalised_comments: boolean;
  allow_admin_force_generate: boolean;
  would_block: boolean;
}

// ─── Generation run query ────────────────────────────────────────────────────

export const listGenerationRunsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type ListGenerationRunsQuery = z.infer<typeof listGenerationRunsQuerySchema>;

// ─── Render payload (contract between API ↔ worker ↔ renderer) ──────────────
// The worker processor builds one of these per (student, locale) target and
// hands it to the injected `ReportCardRenderer`. Impl 11 implements the real
// PDF layout; impl 04 ships the placeholder.

export type PersonalInfoFieldKey = (typeof PERSONAL_INFO_FIELDS)[number];

export interface ReportCardRenderPayload {
  tenant: {
    id: string;
    name: string;
    logo_storage_key: string | null;
    principal_name: string | null;
    principal_signature_storage_key: string | null;
    address: string | null;
  };
  language: 'en' | 'ar';
  direction: 'ltr' | 'rtl';
  template: {
    id: string;
    content_scope: 'grades_only';
  };
  student: {
    id: string;
    personal_info: Partial<Record<PersonalInfoFieldKey, string | null>>;
    rank_badge: 1 | 2 | 3 | null;
  };
  academic_period: {
    id: string;
    name: string;
    academic_year_name: string;
  };
  grades: {
    subjects: Array<{
      subject_id: string;
      subject_name: string;
      teacher_name: string | null;
      score: number | null;
      grade: string | null;
      subject_comment: string;
    }>;
    overall: {
      weighted_average: number | null;
      overall_grade: string | null;
      overall_comment: string;
    };
    grading_scale: Array<{ label: string; min: number; max: number }>;
  };
  issued_at: string;
}
