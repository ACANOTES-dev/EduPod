import { z } from 'zod';

/**
 * Request shapes for the three reports-narration endpoints introduced
 * in impl 10. The dashboard endpoint is body-less (the service fetches
 * the live KPI dashboard internally so the prompt stays consistent
 * with what the user sees on /reports). The report endpoint takes the
 * report data as JSON; the saved-report endpoint takes only the saved
 * report id and re-executes the query through the engine.
 *
 * The response shape is identical across all three endpoints — see
 * `narrationResponseSchema`.
 */

/** Body for `POST /v1/reports/analytics/ai-summary` — empty object. */
export const dashboardNarrationRequestSchema = z.object({}).strict();
export type DashboardNarrationRequestDto = z.infer<typeof dashboardNarrationRequestSchema>;

/** Body for `POST /v1/reports/ai-narrator/report/:reportKey`. */
export const reportNarrationRequestSchema = z.object({
  data: z.record(z.unknown()),
});
export type ReportNarrationRequestDto = z.infer<typeof reportNarrationRequestSchema>;

/** Body for `POST /v1/reports/ai-narrator/saved/:savedReportId` — empty object. */
export const savedReportNarrationRequestSchema = z.object({}).strict();
export type SavedReportNarrationRequestDto = z.infer<typeof savedReportNarrationRequestSchema>;

/**
 * Common response payload. The `cost_usd_estimate` field is undefined on
 * cache hits (no new spend) and set on cache misses with the Anthropic
 * input + output token cost.
 */
export const narrationResponseSchema = z.object({
  narrative: z.string(),
  generated_at: z.string().datetime(),
  cache_hit: z.boolean(),
  cost_usd_estimate: z.number().optional(),
});
export type NarrationResponseDto = z.infer<typeof narrationResponseSchema>;
