import { z } from 'zod';

import { cpRecordTypeSchema, mandatedReportStatusSchema } from '../enums';

// ─── Create ────────────────────────────────────────────────────────────────

export const createCpRecordSchema = z.object({
  student_id: z.string().uuid(),
  concern_id: z.string().uuid().optional(),
  record_type: cpRecordTypeSchema,
  narrative: z.string().min(1),
  mandated_report_status: mandatedReportStatusSchema.optional(),
  mandated_report_ref: z.string().max(100).optional(),
  tusla_contact_name: z.string().max(255).optional(),
  tusla_contact_date: z.string().datetime().optional(),
  legal_hold: z.boolean().optional().default(false),
});

export type CreateCpRecordDto = z.infer<typeof createCpRecordSchema>;

// ─── Update ────────────────────────────────────────────────────────────────

export const updateCpRecordSchema = z.object({
  narrative: z.string().min(1).optional(),
  mandated_report_status: mandatedReportStatusSchema.optional(),
  mandated_report_ref: z.string().max(100).optional(),
  tusla_contact_name: z.string().max(255).optional(),
  tusla_contact_date: z.string().datetime().nullable().optional(),
  legal_hold: z.boolean().optional(),
});

export type UpdateCpRecordDto = z.infer<typeof updateCpRecordSchema>;

// ─── Mandated Report Submit ────────────────────────────────────────────────

export const submitMandatedReportSchema = z.object({
  cp_record_id: z.string().uuid(),
  tusla_ref: z.string().max(100).optional(),
});

export type SubmitMandatedReportDto = z.infer<typeof submitMandatedReportSchema>;

// ─── Filters ───────────────────────────────────────────────────────────────

export const cpRecordFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  student_id: z.string().uuid().optional(),
  record_type: cpRecordTypeSchema.optional(),
  mandated_report_status: mandatedReportStatusSchema.optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  sort: z.enum(['created_at', 'record_type']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CpRecordFilters = z.infer<typeof cpRecordFiltersSchema>;
