import { z } from 'zod';

// ─── Signature Data ───────────────────────────────────────────────────────────

export const signatureDataSchema = z.object({
  type: z.enum(['drawn', 'typed']),
  data: z.string().min(1),
  timestamp: z.string(),
  ip_address: z.string(),
  user_agent: z.string(),
  user_id: z.string().uuid(),
  legal_text_version: z.string(),
});

export type SignatureData = z.infer<typeof signatureDataSchema>;

// ─── Submit Form ──────────────────────────────────────────────────────────────

export const submitFormSchema = z.object({
  responses: z.record(z.string(), z.unknown()),
  signature: signatureDataSchema.optional(),
});

export type SubmitFormDto = z.infer<typeof submitFormSchema>;
