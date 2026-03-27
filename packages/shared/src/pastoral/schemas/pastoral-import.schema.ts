import { z } from 'zod';

import { concernSeveritySchema } from '../enums';

// ─── Import Confirm ───────────────────────────────────────────────────────

export const importConfirmSchema = z.object({
  validation_token: z.string().min(1),
});

export type ImportConfirmDto = z.infer<typeof importConfirmSchema>;

// ─── Import Severity (subset for imports — no 'critical' at import time) ─

export const importSeveritySchema = concernSeveritySchema;
export type ImportSeverity = z.infer<typeof importSeveritySchema>;
