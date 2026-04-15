/**
 * Stage 9.5.2 — Unit tests for the Tier 4/5/6 fixture generators.
 *
 * Verifies three invariants each generator must hold:
 *
 *   1. **Determinism** — same seed → byte-identical JSON output.
 *   2. **Expected dimensions** — class / teacher / room / curriculum counts
 *      sit inside the stage spec's stated ranges.
 *   3. **Feasibility guardrail** — ``assertFeasibleSupply`` fires on each
 *      build (it throws internally if the ratio is below 1.10; a successful
 *      build implies the guardrail passed).
 *
 * The benchmark matrix in §B performs the actual solve measurements;
 * these tests only guard the fixture construction path so CI can catch
 * accidental regressions in shape or determinism.
 */

import {
  buildTier4IrishSecondaryLarge,
  buildTier5MultiCampusLarge,
  buildTier6CollegeLevel,
  SCALE_PROOF_FIXTURES,
} from './tier-4-5-6-generators';

describe('Tier 4 fixture — Irish secondary large', () => {
  it('is deterministic across seeds', () => {
    const a = JSON.stringify(buildTier4IrishSecondaryLarge(42));
    const b = JSON.stringify(buildTier4IrishSecondaryLarge(42));
    expect(a).toEqual(b);
  });

  it('different seeds produce different outputs (student counts + pin layout)', () => {
    const a = JSON.stringify(buildTier4IrishSecondaryLarge(1));
    const b = JSON.stringify(buildTier4IrishSecondaryLarge(2));
    expect(a).not.toEqual(b);
  });

  it('hits the spec shape: ~50 classes, 80 teachers, 55 rooms, 6 year groups', () => {
    const fx = buildTier4IrishSecondaryLarge(42);
    const totalClasses = fx.year_groups.reduce((sum, yg) => sum + yg.sections.length, 0);
    expect(fx.year_groups.length).toBe(6);
    expect(totalClasses).toBe(50);
    expect(fx.teachers.length).toBe(80);
    expect(fx.rooms.length).toBe(55);
    expect(fx.break_groups.length).toBe(1); // morning duty
  });

  it('demand approximates 1100 lessons/week', () => {
    const fx = buildTier4IrishSecondaryLarge(42);
    const totalDemand = fx.curriculum.reduce((sum, c) => {
      const sections =
        fx.year_groups.find((y) => y.year_group_id === c.year_group_id)?.sections.length ?? 0;
      return sum + c.min_periods_per_week * sections;
    }, 0);
    // Spec target ~1100. Allow ±10 % drift.
    expect(totalDemand).toBeGreaterThanOrEqual(1000);
    expect(totalDemand).toBeLessThanOrEqual(1200);
  });

  it('supplies ≥ 1.10 × demand (feasibility guardrail)', () => {
    // If the guardrail fires, buildTier4… throws. Reaching this line means
    // it passed. Still, double-check the ratio for telemetry.
    const fx = buildTier4IrishSecondaryLarge(42);
    const demand = fx.curriculum.reduce((sum, c) => {
      const sections =
        fx.year_groups.find((y) => y.year_group_id === c.year_group_id)?.sections.length ?? 0;
      return sum + c.min_periods_per_week * sections;
    }, 0);
    const supply = fx.teachers.reduce((sum, t) => sum + (t.max_periods_per_week ?? 20), 0);
    expect(supply / demand).toBeGreaterThanOrEqual(1.1);
  });
});

describe('Tier 5 fixture — MAT / multi-campus large', () => {
  it('is deterministic', () => {
    const a = JSON.stringify(buildTier5MultiCampusLarge(7));
    const b = JSON.stringify(buildTier5MultiCampusLarge(7));
    expect(a).toEqual(b);
  });

  it('hits the spec shape: ~95 classes, 160 teachers, 100 rooms, 7 year groups', () => {
    const fx = buildTier5MultiCampusLarge(7);
    const totalClasses = fx.year_groups.reduce((sum, yg) => sum + yg.sections.length, 0);
    expect(fx.year_groups.length).toBe(7);
    expect(totalClasses).toBe(95);
    expect(fx.teachers.length).toBe(160);
    expect(fx.rooms.length).toBe(100);
  });

  it('demand approximates 2200 lessons/week', () => {
    const fx = buildTier5MultiCampusLarge(7);
    const totalDemand = fx.curriculum.reduce((sum, c) => {
      const sections =
        fx.year_groups.find((y) => y.year_group_id === c.year_group_id)?.sections.length ?? 0;
      return sum + c.min_periods_per_week * sections;
    }, 0);
    expect(totalDemand).toBeGreaterThanOrEqual(2000);
    expect(totalDemand).toBeLessThanOrEqual(2400);
  });
});

describe('Tier 6 fixture — college level', () => {
  it('is deterministic', () => {
    const a = JSON.stringify(buildTier6CollegeLevel(11));
    const b = JSON.stringify(buildTier6CollegeLevel(11));
    expect(a).toEqual(b);
  });

  it('hits the spec shape: ~130 sections, 180 lecturers, 130 rooms, 3 year groups, no supervision', () => {
    const fx = buildTier6CollegeLevel(11);
    const totalSections = fx.year_groups.reduce((sum, yg) => sum + yg.sections.length, 0);
    expect(fx.year_groups.length).toBe(3);
    expect(totalSections).toBe(130);
    expect(fx.teachers.length).toBe(180);
    expect(fx.rooms.length).toBe(130);
    expect(fx.break_groups.length).toBe(0); // colleges don't do yard duty
  });

  it('demand approximates 3200 lessons/week', () => {
    const fx = buildTier6CollegeLevel(11);
    const totalDemand = fx.curriculum.reduce((sum, c) => {
      const sections =
        fx.year_groups.find((y) => y.year_group_id === c.year_group_id)?.sections.length ?? 0;
      return sum + c.min_periods_per_week * sections;
    }, 0);
    expect(totalDemand).toBeGreaterThanOrEqual(2900);
    expect(totalDemand).toBeLessThanOrEqual(3400);
  });
});

describe('SCALE_PROOF_FIXTURES registry', () => {
  it('registers three tier entries', () => {
    expect(SCALE_PROOF_FIXTURES).toHaveLength(3);
    expect(SCALE_PROOF_FIXTURES.map((f) => f.tier)).toEqual([4, 5, 6]);
  });

  it('each registered builder produces a valid input when invoked with seed 0', () => {
    for (const fx of SCALE_PROOF_FIXTURES) {
      const built = fx.build(0);
      expect(built.year_groups.length).toBeGreaterThan(0);
      expect(built.teachers.length).toBeGreaterThan(0);
      expect(built.rooms.length).toBeGreaterThan(0);
      expect(built.curriculum.length).toBeGreaterThan(0);
      expect(built.settings.solver_seed).toBe(0);
    }
  });
});
