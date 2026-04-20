/**
 * Pure-logic tests for the AI parse modal helpers (impl 19).
 */

import {
  AI_PARSE_PREFILL_KEY,
  clearPrefillFromSession,
  formatConfidencePercent,
  polarityLabelKey,
  readPrefillFromSession,
  severityLabelKey,
} from './ai-parse-projection';

describe('polarityLabelKey', () => {
  it('returns namespaced i18n key for positive', () => {
    expect(polarityLabelKey('positive')).toBe('results.polarityValues.positive');
  });
  it('returns namespaced i18n key for negative', () => {
    expect(polarityLabelKey('negative')).toBe('results.polarityValues.negative');
  });
});

describe('severityLabelKey', () => {
  it('covers minor / moderate / major', () => {
    expect(severityLabelKey('minor')).toBe('results.severityValues.minor');
    expect(severityLabelKey('moderate')).toBe('results.severityValues.moderate');
    expect(severityLabelKey('major')).toBe('results.severityValues.major');
  });
});

describe('formatConfidencePercent', () => {
  it('rounds to nearest integer', () => {
    expect(formatConfidencePercent(0.876)).toBe(88);
    expect(formatConfidencePercent(0.234)).toBe(23);
  });

  it('clamps to [0, 100]', () => {
    expect(formatConfidencePercent(-0.2)).toBe(0);
    expect(formatConfidencePercent(1.5)).toBe(100);
  });

  it('returns 0 for non-finite input (never shows NaN%)', () => {
    expect(formatConfidencePercent(Number.NaN)).toBe(0);
    expect(formatConfidencePercent(Number.POSITIVE_INFINITY)).toBe(0);
    expect(formatConfidencePercent(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it('handles exact boundaries', () => {
    expect(formatConfidencePercent(0)).toBe(0);
    expect(formatConfidencePercent(1)).toBe(100);
  });
});

describe('sessionStorage seam', () => {
  // jsdom isn't loaded in this test env; simulate a minimal sessionStorage.
  const originalWindow = (globalThis as { window?: unknown }).window;
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    (globalThis as { window?: unknown }).window = {
      sessionStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
      },
    };
  });

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it('reads stored prefill', () => {
    store[AI_PARSE_PREFILL_KEY] = 'on the playground at lunch';
    expect(readPrefillFromSession()).toBe('on the playground at lunch');
  });

  it('returns null when key is absent', () => {
    expect(readPrefillFromSession()).toBeNull();
  });

  it('clears the stored prefill', () => {
    store[AI_PARSE_PREFILL_KEY] = 'something';
    clearPrefillFromSession();
    expect(store[AI_PARSE_PREFILL_KEY]).toBeUndefined();
  });

  it('returns null when window is undefined (SSR)', () => {
    (globalThis as { window?: unknown }).window = undefined;
    expect(readPrefillFromSession()).toBeNull();
  });

  it('silently tolerates throwing sessionStorage', () => {
    (globalThis as { window?: unknown }).window = {
      sessionStorage: {
        getItem: () => {
          throw new Error('denied');
        },
        removeItem: () => {
          throw new Error('denied');
        },
      },
    };
    expect(readPrefillFromSession()).toBeNull();
    expect(() => clearPrefillFromSession()).not.toThrow();
  });
});
