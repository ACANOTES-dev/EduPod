import { z } from 'zod';

// ─── Enums ───────────────────────────────────────────────────────────────────

export const DOCUMENT_TYPES = [
  'detention_notice',
  'suspension_letter',
  'return_meeting_letter',
  'behaviour_contract',
  'intervention_summary',
  'appeal_hearing_invite',
  'appeal_decision_letter',
  'exclusion_notice',
  'exclusion_decision_letter',
  'board_pack',
  'custom_document',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_STATUSES = [
  'draft',
  'finalised',
  'sent',
  'superseded',
] as const;

export type DocumentStatusValue = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_ENTITY_TYPES = [
  'incident',
  'sanction',
  'intervention',
  'appeal',
  'exclusion_case',
] as const;

export type DocumentEntityType = (typeof DOCUMENT_ENTITY_TYPES)[number];

export const DOCUMENT_SEND_CHANNELS = [
  'email',
  'whatsapp',
  'in_app',
  'print',
] as const;

export type DocumentSendChannel = (typeof DOCUMENT_SEND_CHANNELS)[number];

// ─── Generate Document ───────────────────────────────────────────────────────

export const generateDocumentSchema = z.object({
  document_type: z.enum(DOCUMENT_TYPES),
  entity_type: z.enum(DOCUMENT_ENTITY_TYPES),
  entity_id: z.string().uuid(),
  locale: z.string().max(5).optional(),
  template_id: z.string().uuid().optional(),
});

export type GenerateDocumentDto = z.infer<typeof generateDocumentSchema>;

// ─── List Documents ──────────────────────────────────────────────────────────

export const listDocumentsQuerySchema = z.object({
  entity_type: z.enum(DOCUMENT_ENTITY_TYPES).optional(),
  entity_id: z.string().uuid().optional(),
  student_id: z.string().uuid().optional(),
  document_type: z.enum(DOCUMENT_TYPES).optional(),
  status: z.enum(DOCUMENT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

// ─── Finalise Document ───────────────────────────────────────────────────────

export const finaliseDocumentSchema = z.object({
  notes: z.string().max(1000).optional(),
});

export type FinaliseDocumentDto = z.infer<typeof finaliseDocumentSchema>;

// ─── Send Document ───────────────────────────────────────────────────────────

export const sendDocumentSchema = z.object({
  channel: z.enum(DOCUMENT_SEND_CHANNELS),
  recipient_parent_id: z.string().uuid().optional(),
});

export type SendDocumentDto = z.infer<typeof sendDocumentSchema>;

// ─── Document Template ───────────────────────────────────────────────────────

export const mergeFieldDefinitionSchema = z.object({
  field_name: z.string(),
  source: z.string(),
  description: z.string(),
});

export type MergeFieldDefinition = z.infer<typeof mergeFieldDefinitionSchema>;

export const createDocumentTemplateSchema = z.object({
  document_type: z.enum(DOCUMENT_TYPES),
  name: z.string().min(1).max(200),
  locale: z.string().max(5).default('en'),
  template_body: z.string().min(1),
  merge_fields: z.array(mergeFieldDefinitionSchema).optional(),
});

export type CreateDocumentTemplateDto = z.infer<typeof createDocumentTemplateSchema>;

export const updateDocumentTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  template_body: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
});

export type UpdateDocumentTemplateDto = z.infer<typeof updateDocumentTemplateSchema>;

export const listDocumentTemplatesQuerySchema = z.object({
  document_type: z.enum(DOCUMENT_TYPES).optional(),
  locale: z.string().max(5).optional(),
  is_active: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
});

export type ListDocumentTemplatesQuery = z.infer<typeof listDocumentTemplatesQuerySchema>;
