/**
 * Pure helpers for {@link ./ai-summary-panel.tsx}. Extracted so they can
 * be unit-tested under the web app's `node` jest environment without
 * importing React.
 */

export type AiSummaryMode =
  | { kind: 'dashboard' }
  | { kind: 'report'; reportKey: string; data?: Record<string, unknown> }
  | { kind: 'saved'; savedReportId: string };

export interface AiSummaryResponse {
  narrative?: string;
  summary?: string;
  generated_at?: string;
  cache_hit?: boolean;
}

export interface ResolvedEndpoint {
  path: string;
  body: string;
}

/**
 * Translate the panel mode into the impl-10 narration endpoint + body:
 *
 * - `dashboard` → `POST /v1/reports/analytics/ai-summary` with `{}`
 * - `report`    → `POST /v1/reports/ai-narrator/report/:reportKey` with
 *                 `{ data: <mode.data> }`
 * - `saved`     → `POST /v1/reports/ai-narrator/saved/:savedReportId`
 *                 with `{}`
 *
 * Path segments are URL-encoded; bodies are pre-serialised so the panel
 * can pass them directly into `apiClient(path, { body, … })`.
 */
export function resolveAiSummaryEndpoint(mode: AiSummaryMode): ResolvedEndpoint {
  if (mode.kind === 'dashboard') {
    return {
      path: '/api/v1/reports/analytics/ai-summary',
      body: JSON.stringify({}),
    };
  }
  if (mode.kind === 'saved') {
    return {
      path: `/api/v1/reports/ai-narrator/saved/${encodeURIComponent(mode.savedReportId)}`,
      body: JSON.stringify({}),
    };
  }
  return {
    path: `/api/v1/reports/ai-narrator/report/${encodeURIComponent(mode.reportKey)}`,
    body: JSON.stringify({ data: mode.data ?? {} }),
  };
}

/**
 * The API's response transform interceptor wraps successful responses in
 * `{ data: T }`. Older narrator aliases still return the inner shape
 * directly during the deprecation window. Tolerate both.
 */
export function unwrapAiSummaryResponse(
  raw: AiSummaryResponse | { data: AiSummaryResponse },
): AiSummaryResponse {
  if (
    raw &&
    typeof raw === 'object' &&
    'data' in raw &&
    (raw as { data?: AiSummaryResponse }).data
  ) {
    return (raw as { data: AiSummaryResponse }).data;
  }
  return raw as AiSummaryResponse;
}

/**
 * Extract the structured error code (`AI_DISABLED`, `AI_UNAVAILABLE`,
 * `AI_RATE_LIMITED`, …) from the API's `{ error: { code, message } }`
 * envelope. Tolerates a flat `{ code }` shape and returns "" when neither
 * applies.
 */
export function extractAiSummaryErrorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'error' in err) {
    const error = (err as { error?: { code?: string } }).error;
    if (error?.code) return error.code;
  }
  if (err && typeof err === 'object' && 'code' in err) {
    return (err as { code?: string }).code ?? '';
  }
  return '';
}
