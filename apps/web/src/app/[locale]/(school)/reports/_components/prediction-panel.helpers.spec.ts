import {
  clamp,
  extractErrorCode,
  predictionEndpoint,
  riskBand,
  subjectMissingFor,
  unwrapPredictionResponse,
} from './prediction-panel.helpers';

// ─── riskBand ────────────────────────────────────────────────────────────────

describe('prediction-panel.helpers — riskBand', () => {
  it('returns "critical" for scores at or above 80', () => {
    expect(riskBand(80)).toBe('critical');
    expect(riskBand(95)).toBe('critical');
    expect(riskBand(100)).toBe('critical');
  });

  it('returns "high" for 60-79', () => {
    expect(riskBand(60)).toBe('high');
    expect(riskBand(79)).toBe('high');
  });

  it('returns "medium" for 40-59', () => {
    expect(riskBand(40)).toBe('medium');
    expect(riskBand(59)).toBe('medium');
  });

  it('returns "low" for under 40', () => {
    expect(riskBand(0)).toBe('low');
    expect(riskBand(39)).toBe('low');
  });

  it('falls back to "low" when given a non-finite score', () => {
    expect(riskBand(Number.NaN)).toBe('low');
    expect(riskBand(Number.POSITIVE_INFINITY)).toBe('low');
  });
});

// ─── predictionEndpoint ──────────────────────────────────────────────────────

describe('prediction-panel.helpers — predictionEndpoint', () => {
  it('builds the student-risk path with the subject id encoded', () => {
    expect(predictionEndpoint('student_risk', 'abc-123', false)).toBe(
      '/api/v1/reports/predictions/student-risk/abc-123',
    );
  });

  it('builds the attendance-forecast path with the year-group id encoded', () => {
    expect(predictionEndpoint('attendance_forecast', 'yg/01', false)).toBe(
      '/api/v1/reports/predictions/attendance-forecast/yg%2F01',
    );
  });

  it('builds the cash-flow path without a subject id', () => {
    expect(predictionEndpoint('cash_flow', undefined, false)).toBe(
      '/api/v1/reports/predictions/cash-flow-forecast',
    );
  });

  it('appends ?refresh=true on every kind when refresh is set', () => {
    expect(predictionEndpoint('student_risk', 'abc', true)).toBe(
      '/api/v1/reports/predictions/student-risk/abc?refresh=true',
    );
    expect(predictionEndpoint('attendance_forecast', 'yg', true)).toBe(
      '/api/v1/reports/predictions/attendance-forecast/yg?refresh=true',
    );
    expect(predictionEndpoint('cash_flow', undefined, true)).toBe(
      '/api/v1/reports/predictions/cash-flow-forecast?refresh=true',
    );
  });

  it('falls back to an empty path segment when student_risk has no subject (caller must guard)', () => {
    // The component renders an "subject missing" state before calling fetch,
    // but the helper itself stays defensive — empty string is encoded
    // safely so we never spawn an unintended URL like /undefined.
    expect(predictionEndpoint('student_risk', undefined, false)).toBe(
      '/api/v1/reports/predictions/student-risk/',
    );
  });
});

// ─── subjectMissingFor ───────────────────────────────────────────────────────

describe('prediction-panel.helpers — subjectMissingFor', () => {
  it('reports missing for student_risk with no id', () => {
    expect(subjectMissingFor('student_risk', undefined)).toBe(true);
    expect(subjectMissingFor('student_risk', '')).toBe(true);
  });

  it('reports missing for attendance_forecast with no id', () => {
    expect(subjectMissingFor('attendance_forecast', undefined)).toBe(true);
  });

  it('reports present when an id is supplied', () => {
    expect(subjectMissingFor('student_risk', 'abc')).toBe(false);
    expect(subjectMissingFor('attendance_forecast', 'yg')).toBe(false);
  });

  it('never flags cash_flow as missing — that kind is tenant-wide', () => {
    expect(subjectMissingFor('cash_flow', undefined)).toBe(false);
    expect(subjectMissingFor('cash_flow', '')).toBe(false);
  });
});

// ─── extractErrorCode ────────────────────────────────────────────────────────

describe('prediction-panel.helpers — extractErrorCode', () => {
  it('reads the nested envelope shape', () => {
    expect(
      extractErrorCode({
        error: { code: 'AI_RATE_LIMITED', message: 'too many requests' },
      }),
    ).toBe('AI_RATE_LIMITED');
  });

  it('falls back to a top-level code when the envelope is flat', () => {
    expect(extractErrorCode({ code: 'AI_UNAVAILABLE' })).toBe('AI_UNAVAILABLE');
  });

  it('returns "" for an unrecognised payload', () => {
    expect(extractErrorCode(null)).toBe('');
    expect(extractErrorCode(undefined)).toBe('');
    expect(extractErrorCode('boom')).toBe('');
    expect(extractErrorCode({ unrelated: 'shape' })).toBe('');
  });

  it('prefers the nested code when both are present', () => {
    expect(
      extractErrorCode({
        code: 'TOP_LEVEL',
        error: { code: 'NESTED' },
      }),
    ).toBe('NESTED');
  });
});

// ─── unwrapPredictionResponse ────────────────────────────────────────────────

describe('prediction-panel.helpers — unwrapPredictionResponse', () => {
  it('unwraps the API ResponseTransformInterceptor envelope', () => {
    const inner = { risk_score: 42 };
    expect(unwrapPredictionResponse({ data: inner })).toBe(inner);
  });

  it('passes through bare payloads (legacy un-wrapped shape)', () => {
    const inner = { risk_score: 42 };
    expect(unwrapPredictionResponse(inner)).toBe(inner);
  });

  it('returns the raw value when `data` is null/undefined', () => {
    const raw = { data: null };
    expect(unwrapPredictionResponse(raw)).toBe(raw);
  });
});

// ─── clamp ────────────────────────────────────────────────────────────────────

describe('prediction-panel.helpers — clamp', () => {
  it('keeps values inside the range', () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });

  it('clamps below the min', () => {
    expect(clamp(-10, 0, 100)).toBe(0);
  });

  it('clamps above the max', () => {
    expect(clamp(150, 0, 100)).toBe(100);
  });
});
