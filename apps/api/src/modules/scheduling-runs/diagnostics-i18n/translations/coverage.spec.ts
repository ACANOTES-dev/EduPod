/**
 * Bilingual coverage gate.
 *
 * Fails if any DiagnosticCode is missing from en.ts or ar.ts.
 * A new code cannot ship without translations in both languages.
 */
import { DIAGNOSTIC_CODES } from '../diagnostic-codes';
import type { DiagnosticCode } from '../diagnostic-codes';
import type { DiagnosticTranslation } from '../diagnostic-types';

import { AR_TRANSLATIONS } from './ar';
import { EN_TRANSLATIONS } from './en';

// ─── Helpers ────────────────────────────────────────────────────────────────

const dummyCtx = {
  teacher: { id: 't1', name: 'Teacher' },
  subject: { id: 's1', name: 'Subject' },
  year_group: { id: 'yg1', name: 'Year Group' },
  class_label: 'Class A',
  room: { id: 'r1', name: 'Room 101' },
  shortfall_periods: 5,
  demand_periods: 20,
  supply_periods: 15,
  total_unassigned: 8,
  blocked_periods: 3,
  additional_teachers: 2,
  cap_value: 25,
  slot_count: 30,
};

function assertTranslationCallable(
  _code: DiagnosticCode,
  translation: DiagnosticTranslation,
  _locale: string,
): void {
  expect(typeof translation.headline).toBe('function');
  expect(typeof translation.detail).toBe('function');

  // Must produce non-empty strings
  const headline = translation.headline(dummyCtx);
  const detail = translation.detail(dummyCtx);
  expect(headline.length).toBeGreaterThan(0);
  expect(detail.length).toBeGreaterThan(0);

  // Every solution_template must be callable
  for (const tpl of translation.solution_templates) {
    expect(typeof tpl.headline).toBe('function');
    expect(typeof tpl.detail).toBe('function');
    expect(typeof tpl.link_template).toBe('function');
    expect(tpl.headline(dummyCtx).length).toBeGreaterThan(0);
    expect(tpl.detail(dummyCtx).length).toBeGreaterThan(0);
    expect(tpl.link_template(dummyCtx).length).toBeGreaterThan(0);
    expect(['quick', 'medium', 'long']).toContain(tpl.effort);
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DiagnosticsTranslatorService — coverage', () => {
  it('every DiagnosticCode has an English translation', () => {
    for (const code of DIAGNOSTIC_CODES) {
      expect(EN_TRANSLATIONS).toHaveProperty(code);
    }
  });

  it('every DiagnosticCode has an Arabic translation', () => {
    for (const code of DIAGNOSTIC_CODES) {
      expect(AR_TRANSLATIONS).toHaveProperty(code);
    }
  });

  it('English translations have no extra keys beyond DIAGNOSTIC_CODES', () => {
    const codeSet = new Set<string>(DIAGNOSTIC_CODES);
    for (const key of Object.keys(EN_TRANSLATIONS)) {
      expect(codeSet.has(key)).toBe(true);
    }
  });

  it('Arabic translations have no extra keys beyond DIAGNOSTIC_CODES', () => {
    const codeSet = new Set<string>(DIAGNOSTIC_CODES);
    for (const key of Object.keys(AR_TRANSLATIONS)) {
      expect(codeSet.has(key)).toBe(true);
    }
  });

  describe.each(DIAGNOSTIC_CODES.map((c) => [c]))('%s — EN', (code) => {
    it('headline, detail, and solutions are callable and produce non-empty strings', () => {
      assertTranslationCallable(code, EN_TRANSLATIONS[code], 'en');
    });
  });

  describe.each(DIAGNOSTIC_CODES.map((c) => [c]))('%s — AR', (code) => {
    it('headline, detail, and solutions are callable and produce non-empty strings', () => {
      assertTranslationCallable(code, AR_TRANSLATIONS[code], 'ar');
    });
  });
});
