import { z } from 'zod';

// ─── Create Draft ──────────────────────────────────────────────────────────

/**
 * No additional fields needed — draft is created from the CP record context.
 * The CP record already holds student_id, narrative, etc.
 */
export const createMandatedReportSchema = z.object({});

export type CreateMandatedReportDto = z.infer<typeof createMandatedReportSchema>;

// ─── Submit (draft -> submitted) ───────────────────────────────────────────

export const submitMandatedReportSchema = z.object({
  tusla_reference: z.string().min(1).max(100),
});

export type SubmitMandatedReportDto = z.infer<typeof submitMandatedReportSchema>;

// ─── Update Status (submitted -> acknowledged -> outcome_received) ─────────

export const updateMandatedReportStatusSchema = z.object({
  status: z.enum(['acknowledged', 'outcome_received']),
  outcome_notes: z.string().max(10000).optional(),
});

export type UpdateMandatedReportStatusDto = z.infer<typeof updateMandatedReportStatusSchema>;

// ─── Record Outcome ────────────────────────────────────────────────────────

export const recordMandatedReportOutcomeSchema = z.object({
  outcome_type: z.string().min(1).max(255),
  outcome_details: z.string().max(10000).optional(),
  outcome_date: z.string().datetime(),
});

export type RecordMandatedReportOutcomeDto = z.infer<typeof recordMandatedReportOutcomeSchema>;
