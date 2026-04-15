/**
 * CP-SAT migration — Stage 2 contract guard.
 *
 * The TypeScript worker and the Python sidecar (`apps/solver-py`) share
 * the SolverInputV2 wire shape. Both ends consume the same JSON fixture:
 *
 *   - Python: `apps/solver-py/tests/fixtures/solver_input_minimal.json`
 *     parsed via the pydantic models in `solver_py.schema`.
 *   - TypeScript: this test, asserting the fixture conforms to
 *     `SolverInputV2` from `packages/shared/src/scheduler/types-v2.ts`.
 *
 * If either end's schema drifts away from the other, one of these two
 * tests fails. Update both sides together.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

import type { PeriodSlotV2, SolverInputV2, TeacherInputV2 } from '../types-v2';

const FIXTURE_PATH = resolve(
  __dirname,
  '../../../../../apps/solver-py/tests/fixtures/solver_input_minimal.json',
);

const PERIOD_TYPES = new Set(['teaching', 'break_supervision', 'assembly', 'lunch_duty', 'free']);
const SUPERVISION_MODES = new Set(['none', 'yard', 'classroom_previous', 'classroom_next']);
const PREFERENCE_TYPES = new Set(['subject', 'class_pref', 'time_slot']);
const PREFERENCE_PRIORITIES = new Set(['low', 'medium', 'high']);

function loadFixture(): SolverInputV2 {
  const raw = readFileSync(FIXTURE_PATH, 'utf-8');
  return JSON.parse(raw) as SolverInputV2;
}

describe('CP-SAT contract — solver_input_minimal.json conforms to SolverInputV2', () => {
  it('loads without throwing and exposes the expected top-level shape', () => {
    const fixture = loadFixture();
    expect(Array.isArray(fixture.year_groups)).toBe(true);
    expect(Array.isArray(fixture.curriculum)).toBe(true);
    expect(Array.isArray(fixture.teachers)).toBe(true);
    expect(Array.isArray(fixture.rooms)).toBe(true);
    expect(Array.isArray(fixture.room_closures)).toBe(true);
    expect(Array.isArray(fixture.break_groups)).toBe(true);
    expect(Array.isArray(fixture.pinned_entries)).toBe(true);
    expect(Array.isArray(fixture.student_overlaps)).toBe(true);
    expect(typeof fixture.settings).toBe('object');
    expect(fixture.settings).not.toBeNull();
  });

  it('uses only documented period_type / supervision_mode literals', () => {
    const fixture = loadFixture();
    const slots: PeriodSlotV2[] = fixture.year_groups.flatMap((yg) => yg.period_grid);
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(PERIOD_TYPES.has(slot.period_type)).toBe(true);
      expect(SUPERVISION_MODES.has(slot.supervision_mode)).toBe(true);
      expect(slot.weekday).toBeGreaterThanOrEqual(0);
      expect(slot.weekday).toBeLessThanOrEqual(6);
      expect(slot.period_order).toBeGreaterThanOrEqual(0);
    }
  });

  it('teacher preferences use only documented type / priority literals', () => {
    const fixture = loadFixture();
    const teachers: TeacherInputV2[] = fixture.teachers;
    expect(teachers.length).toBeGreaterThan(0);
    for (const teacher of teachers) {
      for (const pref of teacher.preferences) {
        expect(PREFERENCE_TYPES.has(pref.preference_type)).toBe(true);
        expect(PREFERENCE_PRIORITIES.has(pref.priority)).toBe(true);
      }
      for (const window of teacher.availability) {
        expect(window.weekday).toBeGreaterThanOrEqual(0);
        expect(window.weekday).toBeLessThanOrEqual(6);
        expect(typeof window.from).toBe('string');
        expect(typeof window.to).toBe('string');
      }
    }
  });

  it('settings carry every weight key the solver expects', () => {
    const fixture = loadFixture();
    expect(typeof fixture.settings.max_solver_duration_seconds).toBe('number');
    expect(typeof fixture.settings.preference_weights.low).toBe('number');
    expect(typeof fixture.settings.preference_weights.medium).toBe('number');
    expect(typeof fixture.settings.preference_weights.high).toBe('number');
    expect(typeof fixture.settings.global_soft_weights.even_subject_spread).toBe('number');
    expect(typeof fixture.settings.global_soft_weights.minimise_teacher_gaps).toBe('number');
    expect(typeof fixture.settings.global_soft_weights.room_consistency).toBe('number');
    expect(typeof fixture.settings.global_soft_weights.workload_balance).toBe('number');
    expect(typeof fixture.settings.global_soft_weights.break_duty_balance).toBe('number');
  });

  it('round-trips through JSON.stringify + parse without losing data', () => {
    const raw = readFileSync(FIXTURE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as SolverInputV2;
    const reserialised = JSON.parse(JSON.stringify(parsed));
    expect(reserialised).toEqual(parsed);
  });

  it('overrides_applied entries use the documented reason literal', () => {
    const fixture = loadFixture();
    for (const audit of fixture.overrides_applied ?? []) {
      expect(audit.reason).toBe('class_subject_override');
    }
  });
});
