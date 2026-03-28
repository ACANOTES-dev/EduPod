import { z } from 'zod';

export const createComplianceRequestSchema = z.object({
  request_type: z.enum(['access_export', 'erasure', 'rectification', 'portability']),
  subject_type: z.enum(['parent', 'student', 'household', 'user', 'staff', 'applicant']),
  subject_id: z.string().uuid(),
});

export type CreateComplianceRequestDto = z.infer<typeof createComplianceRequestSchema>;

export const classifyComplianceRequestSchema = z.object({
  classification: z.enum(['erase', 'anonymise', 'retain_legal_basis']),
  decision_notes: z.string().max(2000).optional(),
});

export type ClassifyComplianceRequestDto = z.infer<typeof classifyComplianceRequestSchema>;

export const complianceDecisionSchema = z.object({
  decision_notes: z.string().max(2000).optional(),
});

export type ComplianceDecisionDto = z.infer<typeof complianceDecisionSchema>;

export const complianceFilterSchema = z.object({
  status: z.enum(['submitted', 'classified', 'approved', 'rejected', 'completed']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ComplianceFilterDto = z.infer<typeof complianceFilterSchema>;

export const extendComplianceRequestSchema = z.object({
  extension_reason: z.string().min(10).max(2000),
});

export type ExtendComplianceRequestDto = z.infer<typeof extendComplianceRequestSchema>;

export const complianceOverdueFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ComplianceOverdueFilterDto = z.infer<typeof complianceOverdueFilterSchema>;

export const dsarExportFormatSchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
});

export type DsarExportFormatDto = z.infer<typeof dsarExportFormatSchema>;
