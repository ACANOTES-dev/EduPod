import { z } from 'zod';

import { cpRecordTypeSchema } from '../enums';

// ─── Create ────────────────────────────────────────────────────────────────

export const createCpRecordSchema = z.object({
  concern_id: z.string().uuid(),
  student_id: z.string().uuid(),
  record_type: cpRecordTypeSchema,
  narrative: z.string().min(1).max(50000),
});

export type CreateCpRecordDto = z.infer<typeof createCpRecordSchema>;

// ─── Update (metadata only) ────────────────────────────────────────────────

export const updateCpRecordSchema = z.object({
  tusla_contact_name: z.string().max(255).optional(),
  tusla_contact_date: z.string().datetime().optional(),
  legal_hold: z.boolean().optional(),
});

export type UpdateCpRecordDto = z.infer<typeof updateCpRecordSchema>;

// ─── List Query ────────────────────────────────────────────────────────────

export const listCpRecordsQuerySchema = z.object({
  student_id: z.string().uuid(),
  record_type: cpRecordTypeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListCpRecordsQuery = z.infer<typeof listCpRecordsQuerySchema>;
