/**
 * Pure helpers for {@link ./prediction-panel.tsx}. Extracted so they can
 * be unit-tested under the web app's `node` jest environment without
 * importing React / Recharts (which fail in node — they expect a DOM).
 */

import type { PredictionKind } from './prediction-panel.types';

// ─── Risk-score banding ───────────────────────────────────────────────────────

export type RiskBand = 'low' | 'medium' | 'high' | 'critical';

/**
 * Translate a 0-100 risk score into one of four bands. Bins are 20-point
 * windows except `critical` which captures the top quintile.
 */
export function riskBand(score: number): RiskBand {
  if (!Number.isFinite(score)) return 'low';
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

// ─── Path builder ────────────────────────────────────────────────────────────

/**
 * Map (kind, subjectId, refresh) into the impl-12 prediction-controller
 * path. The student-risk and attendance-forecast paths require a subject
 * id; cash-flow is tenant-wide. The caller is responsible for guarding
 * against a missing subject (see `subjectMissingFor`).
 */
export function predictionEndpoint(
  kind: PredictionKind,
  subjectId: string | undefined,
  refresh: boolean,
): string {
  const refreshSuffix = refresh ? '?refresh=true' : '';
  if (kind === 'student_risk') {
    return `/api/v1/reports/predictions/student-risk/${encodeURIComponent(subjectId ?? '')}${refreshSuffix}`;
  }
  if (kind === 'attendance_forecast') {
    return `/api/v1/reports/predictions/attendance-forecast/${encodeURIComponent(
      subjectId ?? '',
    )}${refreshSuffix}`;
  }
  return `/api/v1/reports/predictions/cash-flow-forecast${refreshSuffix}`;
}

/**
 * Whether this kind requires a subject id. Used to render the inline
 * "pick a student / year-group" hint instead of firing a request with
 * an undefined path segment.
 */
export function subjectMissingFor(kind: PredictionKind, subjectId: string | undefined): boolean {
  if (kind === 'cash_flow') return false;
  return !subjectId || subjectId.length === 0;
}

// ─── Error-code extraction ───────────────────────────────────────────────────

/**
 * Extract the structured error code (`AI_DISABLED`, `AI_UNAVAILABLE`,
 * `AI_RATE_LIMITED`, `AI_PREDICTION_UNPARSEABLE`) from the API's
 * `{ error: { code, message } }` envelope. Falls back to top-level
 * `code` then to an empty string when the shape doesn't match.
 */
export function extractErrorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'error' in err) {
    const error = (err as { error?: { code?: string } }).error;
    if (error?.code) return error.code;
  }
  if (err && typeof err === 'object' && 'code' in err) {
    return (err as { code?: string }).code ?? '';
  }
  return '';
}

// ─── Response unwrap ─────────────────────────────────────────────────────────

/**
 * The API's ResponseTransformInterceptor wraps successful responses in
 * `{ data: T }`. Some endpoints still return the inner shape directly
 * during the deprecation window. Tolerate both.
 */
export function unwrapPredictionResponse<T>(raw: T | { data: T }): T {
  if (raw && typeof raw === 'object' && 'data' in raw) {
    const inner = (raw as { data?: T }).data;
    if (inner !== undefined && inner !== null) return inner;
  }
  return raw as T;
}

// ─── Number clamp ────────────────────────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
