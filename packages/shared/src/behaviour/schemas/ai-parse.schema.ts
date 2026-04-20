import { z } from 'zod';

// ─── Incident description — AI parse ───────────────────────────────────────

export const aiParseInputSchema = z.object({
  description: z.string().min(20).max(5000),
});

export type AiParseInput = z.infer<typeof aiParseInputSchema>;

export const aiParsePolaritySchema = z.enum(['positive', 'negative']);
export type AiParsePolarity = z.infer<typeof aiParsePolaritySchema>;

export const aiParseSeveritySchema = z.enum(['minor', 'moderate', 'major']);
export type AiParseSeverity = z.infer<typeof aiParseSeveritySchema>;

export interface AiParseSuggestedStudent {
  id: string;
  full_name: string;
  confidence: number;
}

export interface AiParseResult {
  suggested_category_id: string | null;
  suggested_polarity: AiParsePolarity | null;
  suggested_severity: AiParseSeverity | null;
  suggested_students: AiParseSuggestedStudent[];
  suggested_when: string | null;
  suggested_location: string | null;
  confidence_score: number;
  raw_provider_response_id: string;
}

// ─── Student AI summary ─────────────────────────────────────────────────────

export const aiStudentSummaryQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export type AiStudentSummaryQuery = z.infer<typeof aiStudentSummaryQuerySchema>;

export type AiStudentSummaryHighlightKind = 'trend' | 'incident' | 'intervention' | 'recognition';

export interface AiStudentSummaryHighlight {
  kind: AiStudentSummaryHighlightKind;
  title: string;
  detail: string;
}

export interface AiStudentSummaryResult {
  student_id: string;
  summary_paragraph: string;
  highlights: AiStudentSummaryHighlight[];
  period: {
    from: string;
    to: string;
  };
  generated_at: string;
  cached: boolean;
}
