import { z } from 'zod';

import { savedReportQuerySchema } from './query-engine';
import type { SavedReportQuery } from './query-engine';

/**
 * Schemas for the natural-language → builder-query translation feature
 * (impl 11). The Ask-AI service takes a free-text question, asks Claude
 * to translate it into the builder's `SavedReportQuery` structure, and
 * returns the proposed query for the user to review before executing.
 *
 * The service NEVER executes the AI's output directly — the proposal is
 * always validated against the permission-scoped subject registry, and
 * any execute-on-this-query path goes through the query engine like any
 * hand-built report.
 */

// ─── Confidence ────────────────────────────────────────────────────────────

export const askAiConfidenceSchema = z.enum(['high', 'medium', 'low']);
export type AskAiConfidence = z.infer<typeof askAiConfidenceSchema>;

// ─── Request ────────────────────────────────────────────────────────────────

/**
 * `POST /v1/reports/ai-ask-ai` body. The query text is bounded to keep
 * prompt cost predictable and to reject empty / accidental submissions.
 */
export const askAiRequestSchema = z.object({
  query_text: z.string().trim().min(5).max(500),
});
export type AskAiRequestDto = z.infer<typeof askAiRequestSchema>;

// ─── Response ───────────────────────────────────────────────────────────────

/**
 * The translation result. `query` is `null` when the AI's output failed
 * structural validation (malformed JSON, unknown subject, schema-shape
 * mismatch). `warnings` always carries the human-readable reasons —
 * including any "field dropped because not in your permission set" notes
 * that did not invalidate the whole proposal.
 */
export const askAiTranslationResultSchema = z.object({
  query: savedReportQuerySchema.nullable(),
  rationale: z.string(),
  confidence: askAiConfidenceSchema,
  warnings: z.array(z.string()),
  cache_hit: z.boolean(),
});
export type AskAiTranslationResult = z.infer<typeof askAiTranslationResultSchema>;
export type AskAiSavedReportQuery = SavedReportQuery;

// ─── History entry ──────────────────────────────────────────────────────────

export const askAiHistoryEntrySchema = z.object({
  id: z.string().uuid(),
  query_text: z.string(),
  result_json: askAiTranslationResultSchema.partial({ cache_hit: true }),
  was_saved: z.boolean(),
  created_at: z.string().datetime(),
});
export type AskAiHistoryEntry = z.infer<typeof askAiHistoryEntrySchema>;

export const askAiHistoryResponseSchema = z.object({
  data: z.array(askAiHistoryEntrySchema),
  meta: z.object({
    count: z.number().int().nonnegative(),
  }),
});
export type AskAiHistoryResponse = z.infer<typeof askAiHistoryResponseSchema>;

// ─── History "mark saved" ──────────────────────────────────────────────────

export const askAiMarkSavedRequestSchema = z.object({
  history_id: z.string().uuid(),
});
export type AskAiMarkSavedRequestDto = z.infer<typeof askAiMarkSavedRequestSchema>;

// ─── Rate-limit error code ──────────────────────────────────────────────────

/**
 * Rate-limit constants surfaced as named exports so the controller, the
 * service, and the tests share a single source of truth.
 */
export const ASK_AI_RATE_LIMIT_PER_HOUR = 20;
export const ASK_AI_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
export const ASK_AI_CACHE_TTL_SECONDS = 24 * 60 * 60;
export const ASK_AI_PROMPT_VERSION = 1;

export const ASK_AI_ERROR_CODES = {
  RATE_LIMITED: 'AI_RATE_LIMITED',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  INVALID_REQUEST: 'AI_ASK_AI_INVALID_REQUEST',
  HISTORY_NOT_FOUND: 'AI_ASK_AI_HISTORY_NOT_FOUND',
} as const;
export type AskAiErrorCode = (typeof ASK_AI_ERROR_CODES)[keyof typeof ASK_AI_ERROR_CODES];
