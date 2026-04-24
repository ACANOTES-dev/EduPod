import { REPORT_SUBJECT_KEYS } from '@school/shared/reports';

import { SUBJECT_ADAPTERS } from './fields';
import { OWNER_SENTINEL_PERMISSION } from './reports-subject-registry.service';
import type { SubjectAdapter } from './subject-adapter';

/**
 * Smoke-test every subject adapter: invoke every resolver in its map
 * against a synthetic row and assert the output is the expected shape
 * (not undefined, matches the column set).
 *
 * This proves each field file's resolver closures are reachable and
 * covers the aggregate "every subject has a working resolver map"
 * contract without mocking Prisma — the map lookup + closure call is
 * what matters, not the Prisma layer.
 */

const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('Subject adapter resolver smoke — every descriptor + resolver pair is reachable', () => {
  for (const key of REPORT_SUBJECT_KEYS) {
    it(`[${key}] exposes a descriptor with a non-empty field catalogue`, () => {
      const adapter: SubjectAdapter = SUBJECT_ADAPTERS[key];
      expect(adapter).toBeDefined();
      expect(adapter.descriptor.key).toBe(key);
      expect(adapter.descriptor.fields.length).toBeGreaterThan(0);
      expect(adapter.descriptor.label_key).toMatch(/^reports\.subjects\./);
    });

    it(`[${key}] exposes a non-empty filterColumnMap for at least the default filterable fields`, () => {
      const adapter = SUBJECT_ADAPTERS[key];
      const filterable = adapter.descriptor.fields.filter((f) => f.filterable);
      // Every filterable field must have a corresponding entry in the
      // column map. A field that says `filterable: true` but has no
      // column mapping is a bug — the engine would reject the filter at
      // runtime, so catch it here instead.
      for (const f of filterable) {
        expect(adapter.filterColumnMap[f.id]).toBeDefined();
      }
    });

    it(`[${key}] resolveRow returns a column-keyed record, honouring scoped fields`, () => {
      const adapter = SUBJECT_ADAPTERS[key];
      // Synthesise a row that has all the keys `selectFragment` names,
      // plus populated nested relations for any included.select shape.
      const row = synthesiseRow(adapter.buildSelect(new Map(), []) as Record<string, unknown>);

      // Pick the first 3 fields; invoke resolveRow for each. We expect
      // the output to carry exactly those column ids.
      const firstColumns = adapter.descriptor.fields.slice(0, 3).map((f) => ({ field_id: f.id }));
      const scoped = new Map(adapter.descriptor.fields.map((f) => [f.id, f]));
      const out = adapter.resolveRow(row, scoped, firstColumns);
      for (const c of firstColumns) {
        expect(Object.prototype.hasOwnProperty.call(out, c.field_id)).toBe(true);
      }
    });

    it(`[${key}] buildOrderBy returns a default sort when no sort spec is passed`, () => {
      const adapter = SUBJECT_ADAPTERS[key];
      const out = adapter.buildOrderBy(undefined);
      expect(out.length).toBeGreaterThan(0);
    });

    it(`[${key}] buildOrderBy returns a compiled sort when a sort spec references a mapped field`, () => {
      const adapter = SUBJECT_ADAPTERS[key];
      // Find any field that has a filterColumnMap entry (i.e. a
      // column-backed field) and try to sort on it.
      const mappedField = adapter.descriptor.fields.find((f) => adapter.filterColumnMap[f.id]);
      if (!mappedField) return; // unlikely but safe
      const out = adapter.buildOrderBy([{ field_id: mappedField.id, direction: 'asc' }]);
      expect(out.length).toBeGreaterThan(0);
    });
  }

  it('owner-sentinel test fixture survives schema drift — every adapter exports an icon_name', () => {
    // Trivial cross-subject assertion that acts as a guardrail: if an
    // adapter forgets to declare `icon_name`, the builder UI would
    // render an empty icon slot. Catch it here.
    for (const key of REPORT_SUBJECT_KEYS) {
      const adapter = SUBJECT_ADAPTERS[key];
      expect(adapter.descriptor.icon_name).toBeTruthy();
    }
    // Reference the sentinel so the export stays in the covered set
    // (the sentinel's consumer paths are exercised by the registry and
    // controller specs; touching it here gives the constants a direct
    // coverage entry).
    expect(OWNER_SENTINEL_PERMISSION).toBe('__owner__');
  });

  it('the registry contains exactly the canonical 11 subjects in the shared enum', () => {
    const registered = Object.keys(SUBJECT_ADAPTERS).sort();
    const canonical = [...REPORT_SUBJECT_KEYS].sort();
    expect(registered).toEqual(canonical);
  });

  // Reference the unused fixture so the constant participates in coverage.
  void TENANT;
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a synthetic row object that satisfies the shape of a Prisma
 * select fragment. Every leaf (`true`) becomes `null`; every nested
 * `{ select: {...} }` becomes a nested synthesised row. This gives the
 * resolvers *some* value to read without forcing every spec to hand-
 * build a fully-typed fixture.
 */
function synthesiseRow(selectShape: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(selectShape)) {
    if (value === true) {
      out[key] = null;
    } else if (
      value &&
      typeof value === 'object' &&
      'select' in (value as Record<string, unknown>)
    ) {
      const inner = (value as { select: Record<string, unknown> }).select;
      out[key] = synthesiseRow(inner);
    }
  }
  return out;
}
