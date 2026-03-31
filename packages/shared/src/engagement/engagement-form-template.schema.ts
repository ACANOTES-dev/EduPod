import { z } from 'zod';

// ─── Field Types ──────────────────────────────────────────────────────────────

export const engagementFieldTypeEnum = z.enum([
  'short_text',
  'long_text',
  'number',
  'date',
  'boolean',
  'single_select',
  'multi_select',
  'phone',
  'email',
  'country',
  'yes_no',
  'signature',
  'file_upload',
  'info_block',
]);

export const engagementFormTypeEnum = z.enum([
  'consent_form',
  'risk_assessment',
  'survey',
  'policy_signoff',
]);

export const consentTypeEnum = z.enum(['one_time', 'annual', 'standing']);

export const distributeTargetTypeEnum = z.enum([
  'whole_school',
  'year_group',
  'class_group',
  'custom',
]);

// ─── Bilingual Text Helpers ───────────────────────────────────────────────────

const bilingualTextSchema = z.object({
  en: z.string().min(1),
  ar: z.string().optional(),
});

const optionalBilingualTextSchema = z.object({
  en: z.string().optional(),
  ar: z.string().optional(),
});

// ─── Form Field Schema ────────────────────────────────────────────────────────

export const engagementFormFieldSchema = z.object({
  id: z.string().uuid(),
  field_key: z.string().min(1),
  label: bilingualTextSchema,
  help_text: optionalBilingualTextSchema.optional(),
  field_type: engagementFieldTypeEnum,
  required: z.boolean(),
  display_order: z.number().int(),
  options_json: z.unknown().optional(),
  validation_rules_json: z.unknown().optional(),
  conditional_visibility_json: z.unknown().optional(),
  config: z.unknown().optional(),
});

export type EngagementFormField = z.infer<typeof engagementFormFieldSchema>;

// ─── Create Form Template ─────────────────────────────────────────────────────

export const createEngagementFormTemplateSchema = z
  .object({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    form_type: engagementFormTypeEnum,
    consent_type: consentTypeEnum.optional(),
    fields_json: z.array(engagementFormFieldSchema),
    requires_signature: z.boolean().default(false),
    academic_year_id: z.string().uuid().optional(),
  })
  .refine((data) => data.form_type !== 'consent_form' || data.consent_type !== undefined, {
    message: 'consent_type is required when form_type is consent_form',
    path: ['consent_type'],
  });

export type CreateEngagementFormTemplateDto = z.infer<typeof createEngagementFormTemplateSchema>;

// ─── Update Form Template ─────────────────────────────────────────────────────

export const updateEngagementFormTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  form_type: engagementFormTypeEnum.optional(),
  consent_type: consentTypeEnum.optional(),
  fields_json: z.array(engagementFormFieldSchema).optional(),
  requires_signature: z.boolean().optional(),
  academic_year_id: z.string().uuid().optional(),
});

export type UpdateEngagementFormTemplateDto = z.infer<typeof updateEngagementFormTemplateSchema>;

// ─── Distribute Form ──────────────────────────────────────────────────────────

export const distributeFormSchema = z
  .object({
    target_type: distributeTargetTypeEnum,
    target_ids: z.array(z.string().uuid()).optional(),
    deadline: z.string().optional(),
    event_id: z.string().uuid().optional(),
  })
  .refine(
    (data) =>
      data.target_type === 'whole_school' ||
      (data.target_ids !== undefined && data.target_ids.length > 0),
    {
      message: 'target_ids is required when target_type is not whole_school',
      path: ['target_ids'],
    },
  );

export type DistributeFormDto = z.infer<typeof distributeFormSchema>;
