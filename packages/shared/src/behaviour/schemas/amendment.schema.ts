import { z } from 'zod';

export const AMENDMENT_TYPE_VALUES = ['correction', 'supersession', 'retraction'] as const;
export const AMENDMENT_ENTITY_TYPE_VALUES = ['incident', 'sanction', 'appeal'] as const;

export const whatChangedEntrySchema = z.object({
  field: z.string(),
  old_value: z.string().nullable(),
  new_value: z.string().nullable(),
});

export type WhatChangedEntry = z.infer<typeof whatChangedEntrySchema>;

export const sendCorrectionSchema = z.object({
  // No body required — action-only endpoint
});

export const amendmentListQuerySchema = z.object({
  entity_type: z.enum(AMENDMENT_ENTITY_TYPE_VALUES).optional(),
  amendment_type: z.enum(AMENDMENT_TYPE_VALUES).optional(),
  correction_sent: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type AmendmentListQuery = z.infer<typeof amendmentListQuerySchema>;
