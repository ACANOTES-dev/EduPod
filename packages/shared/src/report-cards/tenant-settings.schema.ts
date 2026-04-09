import { z } from 'zod';

// ─── Personal-info field keys ────────────────────────────────────────────────
// The fields a tenant can choose to render on the report card PDF. The list
// is closed: any new field must be added here.

export const PERSONAL_INFO_FIELDS = [
  'full_name',
  'student_number',
  'date_of_birth',
  'sex',
  'nationality',
  'national_id',
  'admission_date',
  'photo',
  'homeroom_teacher',
  'year_group',
  'class_name',
] as const;

export const personalInfoFieldSchema = z.enum(PERSONAL_INFO_FIELDS);
export type PersonalInfoField = z.infer<typeof personalInfoFieldSchema>;

// ─── Matrix display mode ─────────────────────────────────────────────────────

export const MATRIX_DISPLAY_MODES = ['score', 'grade'] as const;
export const matrixDisplayModeSchema = z.enum(MATRIX_DISPLAY_MODES);
export type MatrixDisplayMode = z.infer<typeof matrixDisplayModeSchema>;

// ─── Tenant settings JSONB payload ───────────────────────────────────────────
// Single source of truth for what's stored in
// `report_card_tenant_settings.settings_json`.

export const reportCardTenantSettingsPayloadSchema = z
  .object({
    matrix_display_mode: matrixDisplayModeSchema.default('grade'),
    show_top_rank_badge: z.boolean().default(false),
    default_personal_info_fields: z.array(personalInfoFieldSchema).default([]),
    require_finalised_comments: z.boolean().default(true),
    allow_admin_force_generate: z.boolean().default(true),
    principal_signature_storage_key: z.string().min(1).nullable().default(null),
    principal_name: z.string().min(1).nullable().default(null),
    grade_threshold_set_id: z.string().uuid().nullable().default(null),
    default_template_id: z.string().uuid().nullable().default(null),
  })
  .strict()
  .refine(
    (data) => {
      // Either both signature fields are set or both are null. This keeps the
      // PDF renderer from having to handle a half-configured signature.
      const keySet = data.principal_signature_storage_key !== null;
      const nameSet = data.principal_name !== null;
      return keySet === nameSet;
    },
    {
      message:
        'principal_signature_storage_key and principal_name must both be set or both be null',
      path: ['principal_name'],
    },
  );

export type ReportCardTenantSettingsPayload = z.infer<typeof reportCardTenantSettingsPayloadSchema>;

// ─── Update payload ──────────────────────────────────────────────────────────
// Used by the admin settings page. All fields optional; cross-field rule still
// enforced when both signature fields are present in the same payload.

export const updateReportCardTenantSettingsSchema = z
  .object({
    matrix_display_mode: matrixDisplayModeSchema.optional(),
    show_top_rank_badge: z.boolean().optional(),
    default_personal_info_fields: z.array(personalInfoFieldSchema).optional(),
    require_finalised_comments: z.boolean().optional(),
    allow_admin_force_generate: z.boolean().optional(),
    principal_signature_storage_key: z.string().min(1).nullable().optional(),
    principal_name: z.string().min(1).nullable().optional(),
    grade_threshold_set_id: z.string().uuid().nullable().optional(),
    default_template_id: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine(
    (data) => {
      // Only enforce when BOTH fields are present in the patch.
      if (data.principal_signature_storage_key === undefined || data.principal_name === undefined) {
        return true;
      }
      const keySet = data.principal_signature_storage_key !== null;
      const nameSet = data.principal_name !== null;
      return keySet === nameSet;
    },
    {
      message:
        'principal_signature_storage_key and principal_name must both be set or both be null',
      path: ['principal_name'],
    },
  );

export type UpdateReportCardTenantSettingsDto = z.infer<
  typeof updateReportCardTenantSettingsSchema
>;
