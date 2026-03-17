import { z } from 'zod';

import { paginationQuerySchema } from './pagination.schema';

// JSONB sub-schemas
export const fieldOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});

export const fieldOptionsSchema = z.array(fieldOptionSchema).min(1);

export const validationRulesSchema = z.object({
  min_length: z.number().int().optional(),
  max_length: z.number().int().optional(),
  min_value: z.number().optional(),
  max_value: z.number().optional(),
  pattern: z.string().optional(),
}).nullable().optional();

export const conditionalVisibilitySchema = z.object({
  depends_on_field_key: z.string(),
  show_when_value: z.union([z.string(), z.array(z.string())]),
}).nullable().optional();

// Field types enum for validation
export const applicationFieldTypes = [
  'short_text', 'long_text', 'number', 'date', 'boolean',
  'single_select', 'multi_select', 'phone', 'email', 'country', 'yes_no',
] as const;

export const applicationFieldTypeSchema = z.enum(applicationFieldTypes);

// Form definition field schema (for create/update)
export const formFieldInputSchema = z.object({
  field_key: z.string().min(1).max(100),
  label: z.string().min(1).max(255),
  help_text: z.string().max(1000).nullable().optional(),
  field_type: applicationFieldTypeSchema,
  required: z.boolean().default(false),
  visible_to_parent: z.boolean().default(true),
  visible_to_staff: z.boolean().default(true),
  searchable: z.boolean().default(false),
  reportable: z.boolean().default(false),
  options_json: fieldOptionsSchema.nullable().optional(),
  validation_rules_json: validationRulesSchema,
  conditional_visibility_json: conditionalVisibilitySchema,
  display_order: z.number().int().min(0),
  active: z.boolean().default(true),
});

// Create form definition
export const createFormDefinitionSchema = z.object({
  name: z.string().min(1).max(255),
  fields: z.array(formFieldInputSchema).min(1),
});

// Update form definition
export const updateFormDefinitionSchema = z.object({
  name: z.string().min(1).max(255),
  fields: z.array(formFieldInputSchema).min(1),
  expected_updated_at: z.string().datetime().optional(),
});

// List form definitions query
export const listFormDefinitionsSchema = paginationQuerySchema.extend({
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

// Inferred types
export type FieldOptionInput = z.infer<typeof fieldOptionSchema>;
export type ValidationRulesInput = z.infer<typeof validationRulesSchema>;
export type ConditionalVisibilityInput = z.infer<typeof conditionalVisibilitySchema>;
export type FormFieldInput = z.infer<typeof formFieldInputSchema>;
export type CreateFormDefinitionDto = z.infer<typeof createFormDefinitionSchema>;
export type UpdateFormDefinitionDto = z.infer<typeof updateFormDefinitionSchema>;
export type ListFormDefinitionsQuery = z.infer<typeof listFormDefinitionsSchema>;
