import {
  extractAiSummaryErrorCode,
  resolveAiSummaryEndpoint,
  unwrapAiSummaryResponse,
} from './ai-summary-panel.helpers';

// ─── resolveAiSummaryEndpoint ─────────────────────────────────────────────────

describe('ai-summary-panel.helpers — resolveAiSummaryEndpoint', () => {
  it('returns the analytics endpoint with an empty body for dashboard mode', () => {
    expect(resolveAiSummaryEndpoint({ kind: 'dashboard' })).toEqual({
      path: '/api/v1/reports/analytics/ai-summary',
      body: '{}',
    });
  });

  it('encodes the report key for report mode', () => {
    const resolved = resolveAiSummaryEndpoint({
      kind: 'report',
      reportKey: 'cross-module/insights',
      data: { window: 'this_week' },
    });
    expect(resolved.path).toBe('/api/v1/reports/ai-narrator/report/cross-module%2Finsights');
    expect(JSON.parse(resolved.body)).toEqual({ data: { window: 'this_week' } });
  });

  it('falls back to an empty data envelope when no data is supplied', () => {
    const resolved = resolveAiSummaryEndpoint({
      kind: 'report',
      reportKey: 'attendance',
    });
    expect(resolved.path).toBe('/api/v1/reports/ai-narrator/report/attendance');
    expect(JSON.parse(resolved.body)).toEqual({ data: {} });
  });

  it('encodes the saved report id for saved mode (impl 18)', () => {
    const resolved = resolveAiSummaryEndpoint({
      kind: 'saved',
      savedReportId: 'abc-123/x',
    });
    expect(resolved.path).toBe('/api/v1/reports/ai-narrator/saved/abc-123%2Fx');
    expect(resolved.body).toBe('{}');
  });
});

// ─── unwrapAiSummaryResponse ──────────────────────────────────────────────────

describe('ai-summary-panel.helpers — unwrapAiSummaryResponse', () => {
  it('unwraps the API ResponseTransformInterceptor envelope', () => {
    const inner = { narrative: 'hello world', generated_at: '2026-04-25T00:00Z' };
    expect(unwrapAiSummaryResponse({ data: inner })).toBe(inner);
  });

  it('passes through the bare payload (legacy un-wrapped shape)', () => {
    const inner = { narrative: 'world' };
    expect(unwrapAiSummaryResponse(inner)).toBe(inner);
  });

  it('returns the raw value when `data` is empty/falsy', () => {
    const raw = { data: undefined as unknown as { narrative: string } };
    expect(unwrapAiSummaryResponse(raw)).toBe(raw);
  });
});

// ─── extractAiSummaryErrorCode ────────────────────────────────────────────────

describe('ai-summary-panel.helpers — extractAiSummaryErrorCode', () => {
  it('reads the nested envelope shape', () => {
    expect(
      extractAiSummaryErrorCode({
        error: { code: 'AI_DISABLED', message: 'tenant has not opted in' },
      }),
    ).toBe('AI_DISABLED');
  });

  it('reads the AI_RATE_LIMITED code added by impl 18', () => {
    expect(
      extractAiSummaryErrorCode({
        error: { code: 'AI_RATE_LIMITED', message: 'too many requests' },
      }),
    ).toBe('AI_RATE_LIMITED');
  });

  it('falls back to a top-level code when the envelope is flat', () => {
    expect(extractAiSummaryErrorCode({ code: 'AI_UNAVAILABLE' })).toBe('AI_UNAVAILABLE');
  });

  it('returns "" for unrecognised payloads', () => {
    expect(extractAiSummaryErrorCode(null)).toBe('');
    expect(extractAiSummaryErrorCode(undefined)).toBe('');
    expect(extractAiSummaryErrorCode({ unrelated: 'shape' })).toBe('');
  });
});
