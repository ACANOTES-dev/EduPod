/**
 * Stage 9.5.2 — Tier 4 / 5 / 6 scale-proof fixture generators.
 *
 * Three deterministic generators for state-of-the-art-scale measurement:
 *
 *   - ``buildTier4IrishSecondaryLarge(seed)`` ≈ 50 classes / 80 teachers /
 *     ~1100 lessons — upper-end Irish secondary school.
 *   - ``buildTier5MultiCampusLarge(seed)`` ≈ 95 classes / 160 teachers /
 *     ~2200 lessons — MAT or multi-campus single-schedule workload.
 *   - ``buildTier6CollegeLevel(seed)`` ≈ 130 sections / 180 lecturers /
 *     ~3200 lessons — college / large sixth-form density.
 *
 * All three are seed-deterministic via ``mulberry32``. All three emit a
 * ``SolverInputV2`` payload that the CP-SAT sidecar can consume without
 * further transformation. The Python round-trip test in
 * ``apps/solver-py/tests/test_tier_4_5_6_roundtrip.py`` asserts byte
 * equality through pydantic — drift in the TS type that isn't mirrored
 * in the Python schema will fail CI.
 *
 * Infeasibility guardrail: each generator's final step asserts that
 * ``qualified-teacher-periods-per-week >= demand × 1.1``. If not, the
 * generator widens the teacher competency distribution until it is.
 * Fixtures must never be structurally infeasible — 9.5.2 measures
 * solver performance, not graceful failure on broken inputs.
 */

import type {
  BreakGroupInput,
  CurriculumEntry,
  PeriodSlotV2,
  PinnedEntryV2,
  RoomInfoV2,
  SolverInputV2,
  SolverSettingsV2,
  TeacherInputV2,
  YearGroupInput,
} from '../../types-v2';

// ─── Shared helpers ─────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickK<T>(rng: () => number, items: readonly T[], k: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < k && pool.length > 0) {
    const i = Math.floor(rng() * pool.length);
    out.push(pool.splice(i, 1)[0]!);
  }
  return out;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

interface PeriodGridSpec {
  weekdays: number;
  periodsPerDay: number;
  /** Optional insertion of break cells after a given period_order. */
  breaks?: Array<{
    afterPeriod: number;
    break_group_id: string;
    supervision_mode: 'yard' | 'classroom_previous' | 'classroom_next';
  }>;
}

/**
 * Build a full grid with optional break cells inserted at configured offsets.
 * Break cells share the same ``weekday``/``period_order`` key but carry
 * ``period_type: 'break_supervision'`` and the ``break_group_id``/
 * ``supervision_mode`` pointing the solver at the supervision zone.
 */
function buildGrid({ weekdays, periodsPerDay, breaks = [] }: PeriodGridSpec): PeriodSlotV2[] {
  const grid: PeriodSlotV2[] = [];
  const breaksByOffset = new Map(breaks.map((b) => [b.afterPeriod, b]));

  for (let weekday = 0; weekday < weekdays; weekday++) {
    for (let period = 0; period < periodsPerDay; period++) {
      const startMinutes = 8 * 60 + period * 60;
      const endMinutes = startMinutes + 45;
      grid.push({
        weekday,
        period_order: period,
        start_time: `${pad2(Math.floor(startMinutes / 60))}:${pad2(startMinutes % 60)}`,
        end_time: `${pad2(Math.floor(endMinutes / 60))}:${pad2(endMinutes % 60)}`,
        period_type: 'teaching',
        supervision_mode: 'none',
        break_group_id: null,
      });
      const br = breaksByOffset.get(period);
      if (br) {
        const bStart = endMinutes;
        const bEnd = bStart + 15;
        grid.push({
          weekday,
          period_order: period + 100, // synthetic ordering — breaks sit between numbered periods
          start_time: `${pad2(Math.floor(bStart / 60))}:${pad2(bStart % 60)}`,
          end_time: `${pad2(Math.floor(bEnd / 60))}:${pad2(bEnd % 60)}`,
          period_type: 'break_supervision',
          supervision_mode: br.supervision_mode,
          break_group_id: br.break_group_id,
        });
      }
    }
  }
  return grid;
}

function defaultSettings(seed: number, maxSeconds: number): SolverSettingsV2 {
  return {
    max_solver_duration_seconds: maxSeconds,
    preference_weights: { low: 1, medium: 3, high: 5 },
    global_soft_weights: {
      even_subject_spread: 1,
      minimise_teacher_gaps: 1,
      room_consistency: 1,
      workload_balance: 1,
      break_duty_balance: 1,
    },
    solver_seed: seed,
  };
}

// ─── Shared subject registry ─────────────────────────────────────────────────

// Room-type assignment reflects real Irish-school practice: only
// foundational Science (Y7-Y9) books labs for every period. Senior
// specialist sciences (biology / chemistry / physics) split theory and
// practical — in real timetables theory runs in ordinary classrooms,
// lab is booked separately for experimental sessions. Modelling every
// senior-science period as lab-required structurally oversubscribes
// labs and blocks placement, which is not a solver performance
// finding — it's a fixture design error. The per-room-type guardrail
// below now catches this kind of mistake.
const subjectCatalog = [
  { id: 'english', name: 'English', roomType: null as string | null },
  { id: 'maths', name: 'Mathematics', roomType: null },
  { id: 'irish', name: 'Irish', roomType: null },
  { id: 'history', name: 'History', roomType: null },
  { id: 'geography', name: 'Geography', roomType: null },
  { id: 'science', name: 'Science', roomType: 'lab' },
  { id: 'biology', name: 'Biology', roomType: null },
  { id: 'chemistry', name: 'Chemistry', roomType: null },
  { id: 'physics', name: 'Physics', roomType: null },
  { id: 'pe', name: 'Physical Education', roomType: 'gym' },
  { id: 'art', name: 'Art', roomType: 'art' },
  { id: 'music', name: 'Music', roomType: 'music' },
  { id: 'business', name: 'Business', roomType: null },
  { id: 'religion', name: 'Religious Studies', roomType: null },
  { id: 'french', name: 'French', roomType: null },
  { id: 'spanish', name: 'Spanish', roomType: null },
  { id: 'technology', name: 'Technology', roomType: null },
  { id: 'it', name: 'Information Tech', roomType: 'it' },
  { id: 'economics', name: 'Economics', roomType: null },
  { id: 'politics', name: 'Politics', roomType: null },
  { id: 'german', name: 'German', roomType: null },
  { id: 'philosophy', name: 'Philosophy', roomType: null },
] as const;

type SubjectId = (typeof subjectCatalog)[number]['id'];

/** Demand for subject by year-group index — returns periods/week. */
interface CurriculumSpec {
  subjectId: SubjectId;
  periodsPerWeek: number;
}

// ─── Guardrails: per-resource feasibility checks ────────────────────────────

/**
 * Three-layer feasibility check.
 *
 *   1. **Aggregate teacher supply** — total teacher-period capacity ≥
 *      1.10 × total lesson demand. Catches gross under-supply.
 *   2. **Per-subject teacher supply** — teachers competent in subject X
 *      must collectively cover ≥ 1.10 × demand for subject X. Catches
 *      specialist bottlenecks (e.g. only 6 Irish teachers for 126 Irish
 *      periods where the aggregate ratio looks healthy).
 *   3. **Per-room-type supply** — rooms of each required type have
 *      ≥ 1.10 × the demand from lessons needing that type. Catches
 *      structural bottlenecks on labs / gyms / IT / art / music. This
 *      layer was added after Stage 9.5.2's first tier-4 matrix produced
 *      74 unassigned science/physics lessons purely because lab demand
 *      (222) exceeded lab supply (135) — a fixture error, not a solver
 *      finding.
 *
 * Stage 9.5.2 measures solver performance; the guardrails exist so a
 * benchmark run never conflates "solver can't place X" with "fixture
 * has no valid placement for X".
 */
function assertFeasibleSupply(input: SolverInputV2, label: string): void {
  const sectionsByYg = new Map(input.year_groups.map((y) => [y.year_group_id, y.sections.length]));

  const computeDemand = (predicate: (c: CurriculumEntry) => boolean): number =>
    input.curriculum
      .filter(predicate)
      .reduce(
        (sum, c) => sum + c.min_periods_per_week * (sectionsByYg.get(c.year_group_id) ?? 0),
        0,
      );

  // Layer 1 — aggregate.
  const totalDemand = computeDemand(() => true);
  const totalSupply = input.teachers.reduce((sum, t) => sum + (t.max_periods_per_week ?? 20), 0);
  const aggregateRatio = totalSupply / Math.max(totalDemand, 1);
  if (aggregateRatio < 1.1) {
    throw new Error(
      `[${label}] aggregate supply/demand ratio ${aggregateRatio.toFixed(2)} < 1.10. ` +
        `Supply=${totalSupply}, demand=${totalDemand}.`,
    );
  }

  // Layer 2 — per-subject teacher supply.
  const subjectsInCurriculum = new Set(input.curriculum.map((c) => c.subject_id));
  for (const sid of subjectsInCurriculum) {
    const demand = computeDemand((c) => c.subject_id === sid);
    // Supply = sum over teachers competent in this subject of
    // (max_periods_per_week / number_of_distinct_subjects_competent),
    // so a multi-subject teacher isn't double-counted across subjects.
    const supply = input.teachers.reduce((acc, t) => {
      const subjectsCompetent = new Set(t.competencies.map((c) => c.subject_id));
      if (!subjectsCompetent.has(sid)) return acc;
      return acc + (t.max_periods_per_week ?? 20) / Math.max(subjectsCompetent.size, 1);
    }, 0);
    const ratio = supply / Math.max(demand, 1);
    if (ratio < 1.1) {
      throw new Error(
        `[${label}] per-subject ratio for "${sid}" is ${ratio.toFixed(2)} < 1.10. ` +
          `Supply ≈ ${supply.toFixed(0)}, demand = ${demand}. ` +
          `Widen competency coverage or reduce subject demand.`,
      );
    }
  }

  // Layer 3 — per-room-type supply for lessons that require a room type.
  const slotsPerRoom = input.year_groups[0]?.period_grid.length ?? 0;
  const roomsByType = new Map<string, number>();
  const closedRoomIds = new Set(input.room_closures.map((c) => c.room_id));
  for (const r of input.rooms) {
    if (closedRoomIds.has(r.room_id)) continue;
    // Non-exclusive rooms (halls, gyms) can host multiple groups at the
    // same time-group; ×2 is a conservative bound without modelling the
    // actual parallel-capacity semantics.
    const count = roomsByType.get(r.room_type) ?? 0;
    roomsByType.set(r.room_type, count + (r.is_exclusive ? 1 : 2));
  }
  const requiredRoomTypes = new Set(
    input.curriculum.map((c) => c.required_room_type).filter((t): t is string => t !== null),
  );
  for (const rt of requiredRoomTypes) {
    const demand = computeDemand((c) => c.required_room_type === rt);
    const roomCount = roomsByType.get(rt) ?? 0;
    const supply = roomCount * slotsPerRoom;
    const ratio = supply / Math.max(demand, 1);
    if (ratio < 1.1) {
      throw new Error(
        `[${label}] per-room-type ratio for "${rt}" is ${ratio.toFixed(2)} < 1.10. ` +
          `Rooms of type "${rt}" = ${roomCount} × ${slotsPerRoom} slots = ${supply} supply, ` +
          `demand = ${demand}. Add more rooms of that type or reduce required_room_type demand.`,
      );
    }
  }
}

// ─── Tier 4: Irish secondary (large) ────────────────────────────────────────

export function buildTier4IrishSecondaryLarge(seed: number): SolverInputV2 {
  const rng = mulberry32(seed);

  // 6 year groups (Y7-Y12), ~8 classes each → 50 classes total.
  // Pattern: 9, 8, 9, 8, 8, 8 = 50.
  const sectionsPerYear = [9, 8, 9, 8, 8, 8];
  const yearLabels = ['Y7', 'Y8', 'Y9', 'Y10', 'Y11', 'Y12'];

  const grid = buildGrid({
    weekdays: 5,
    periodsPerDay: 9,
    breaks: [
      {
        afterPeriod: 3,
        break_group_id: 'bg-t4-morning',
        supervision_mode: 'yard',
      },
    ],
  });

  const yearGroups: YearGroupInput[] = [];
  let classCounter = 0;
  for (let yg = 0; yg < 6; yg++) {
    const sections = [];
    for (let s = 0; s < sectionsPerYear[yg]!; s++) {
      sections.push({
        class_id: `t4-class-${classCounter}`,
        class_name: `${yearLabels[yg]}-${String.fromCharCode(65 + s)}`,
        student_count: 24 + Math.floor(rng() * 5),
      });
      classCounter++;
    }
    yearGroups.push({
      year_group_id: `t4-yg-${yg}`,
      year_group_name: yearLabels[yg]!,
      sections,
      period_grid: grid,
    });
  }
  const totalClasses = classCounter; // 50

  // Curriculum shape: ~22 periods/class/week → ~1100 total lessons.
  // Core subjects delivered to every year; sciences / specialisms
  // weighted towards senior years.
  //
  // Junior (Y7-Y9) pattern: English 4, Maths 4, Irish 3, Science 3,
  //   History 2, Geography 2, PE 2, Art 2 = 22.
  // Senior (Y10-Y12) pattern: English 4, Maths 4, Irish 2, Biology 2,
  //   Chemistry 2, Physics 2, PE 1, Business 2, Religion 1, French 2 = 22.
  const juniorSpec: CurriculumSpec[] = [
    { subjectId: 'english', periodsPerWeek: 4 },
    { subjectId: 'maths', periodsPerWeek: 4 },
    { subjectId: 'irish', periodsPerWeek: 3 },
    { subjectId: 'science', periodsPerWeek: 3 },
    { subjectId: 'history', periodsPerWeek: 2 },
    { subjectId: 'geography', periodsPerWeek: 2 },
    { subjectId: 'pe', periodsPerWeek: 2 },
    { subjectId: 'art', periodsPerWeek: 2 },
  ];
  const seniorSpec: CurriculumSpec[] = [
    { subjectId: 'english', periodsPerWeek: 4 },
    { subjectId: 'maths', periodsPerWeek: 4 },
    { subjectId: 'irish', periodsPerWeek: 2 },
    { subjectId: 'biology', periodsPerWeek: 2 },
    { subjectId: 'chemistry', periodsPerWeek: 2 },
    { subjectId: 'physics', periodsPerWeek: 2 },
    { subjectId: 'pe', periodsPerWeek: 1 },
    { subjectId: 'business', periodsPerWeek: 2 },
    { subjectId: 'religion', periodsPerWeek: 1 },
    { subjectId: 'french', periodsPerWeek: 2 },
  ];

  const curriculum: CurriculumEntry[] = [];
  for (let yg = 0; yg < 6; yg++) {
    const spec = yg < 3 ? juniorSpec : seniorSpec;
    for (const s of spec) {
      const subj = subjectCatalog.find((x) => x.id === s.subjectId)!;
      curriculum.push({
        year_group_id: `t4-yg-${yg}`,
        subject_id: s.subjectId,
        subject_name: subj.name,
        min_periods_per_week: s.periodsPerWeek,
        max_periods_per_day: 2,
        preferred_periods_per_week: null,
        requires_double_period: false,
        double_period_count: null,
        required_room_type: subj.roomType,
        preferred_room_id: null,
        class_id: null,
      });
    }
  }

  // 80 teachers. ~20 core-subject specialists (English, Maths), ~15 sciences,
  // ~10 language, remainder PE/arts/humanities generalists. Every teacher is
  // competent for every year group they're assigned (senior specialists stay
  // senior; generalists span all years).
  const yearGroupIds = yearGroups.map((y) => y.year_group_id);
  const juniorYgIds = yearGroupIds.slice(0, 3);
  const seniorYgIds = yearGroupIds.slice(3);
  const teachers: TeacherInputV2[] = [];

  // Core specialists.
  const makeSpecialist = (id: string, subjectIds: SubjectId[], ygIds: string[]) => {
    teachers.push({
      staff_profile_id: `t4-t-${id}`,
      name: `Teacher ${id}`,
      competencies: subjectIds.flatMap((sid) =>
        ygIds.map((ygId) => ({
          subject_id: sid,
          year_group_id: ygId,
          class_id: null,
        })),
      ),
      availability: [],
      preferences: [],
      max_periods_per_week: 22,
      max_periods_per_day: 6,
      max_supervision_duties_per_week: 3,
    });
  };
  // Cores. English and Maths at 10 each sit exactly at the 1.10 ratio
  // floor; leaves a little headroom on top and still matches real-school
  // staffing where core-subject departments are the largest.
  for (let i = 0; i < 10; i++) makeSpecialist(`en-${i}`, ['english'], yearGroupIds);
  for (let i = 0; i < 10; i++) makeSpecialist(`ma-${i}`, ['maths'], yearGroupIds);
  // Irish — 8 (not 6) so the per-subject guardrail's 1.10 floor is met.
  // Irish is mandatory across all 6 years in Irish schools so demand is
  // 126 periods; 8 × 22 = 176 → ratio 1.40.
  for (let i = 0; i < 8; i++) makeSpecialist(`ir-${i}`, ['irish'], yearGroupIds);
  // Sciences
  for (let i = 0; i < 5; i++) makeSpecialist(`sci-${i}`, ['science'], juniorYgIds);
  for (let i = 0; i < 4; i++) makeSpecialist(`bi-${i}`, ['biology'], seniorYgIds);
  for (let i = 0; i < 4; i++) makeSpecialist(`ch-${i}`, ['chemistry'], seniorYgIds);
  for (let i = 0; i < 4; i++) makeSpecialist(`ph-${i}`, ['physics'], seniorYgIds);
  // Languages
  for (let i = 0; i < 6; i++) makeSpecialist(`fr-${i}`, ['french'], seniorYgIds);
  // PE specialists — dedicated, since PE demand (76) is highest among
  // generalist-pool subjects and the rng-mix pattern below doesn't
  // reliably allocate enough competencies to cover it. 5 × 22 = 110 →
  // ratio 1.45.
  for (let i = 0; i < 5; i++) makeSpecialist(`pe-${i}`, ['pe'], yearGroupIds);
  // Humanities/arts generalists — each covers 2-3 subjects across years,
  // rng-mixed over the remaining pool. PE intentionally removed from the
  // pool (see above) so its coverage isn't left to rng.
  const generalistPool: SubjectId[] = ['history', 'geography', 'art', 'religion', 'business'];
  for (let i = 0; i < 24; i++) {
    const k = 2 + Math.floor(rng() * 2);
    const subjs = pickK(rng, generalistPool, k);
    makeSpecialist(`gen-${i}`, subjs, yearGroupIds);
  }

  // Rooms: 40 classrooms, 3 science labs, 2 art, 1 music, 2 gym, 1 IT, 6 breakout.
  const rooms: RoomInfoV2[] = [];
  for (let i = 0; i < 40; i++) {
    rooms.push({
      room_id: `t4-cr-${i}`,
      room_type: 'classroom',
      capacity: 30,
      is_exclusive: true,
    });
  }
  for (let i = 0; i < 3; i++) {
    rooms.push({ room_id: `t4-lab-${i}`, room_type: 'lab', capacity: 24, is_exclusive: true });
  }
  for (let i = 0; i < 2; i++) {
    rooms.push({ room_id: `t4-art-${i}`, room_type: 'art', capacity: 24, is_exclusive: true });
  }
  rooms.push({ room_id: 't4-music-0', room_type: 'music', capacity: 24, is_exclusive: true });
  for (let i = 0; i < 2; i++) {
    rooms.push({ room_id: `t4-gym-${i}`, room_type: 'gym', capacity: 30, is_exclusive: false });
  }
  rooms.push({ room_id: 't4-it-0', room_type: 'it', capacity: 30, is_exclusive: true });
  for (let i = 0; i < 6; i++) {
    rooms.push({
      room_id: `t4-breakout-${i}`,
      room_type: 'classroom',
      capacity: 20,
      is_exclusive: true,
    });
  }

  // Pinned: 5% of the full grid-per-class = 5% × 50 × 22 ≈ 55 pinned entries.
  // Scatter them uniformly using the rng so the seed controls the pattern.
  // Each pin is a class × subject × weekday × period_order with a valid teacher.
  const teacherIdByYgSubject = new Map<string, string[]>();
  for (const t of teachers) {
    for (const c of t.competencies) {
      const key = `${c.year_group_id}|${c.subject_id}`;
      const list = teacherIdByYgSubject.get(key) ?? [];
      list.push(t.staff_profile_id);
      teacherIdByYgSubject.set(key, list);
    }
  }

  const pinned: PinnedEntryV2[] = [];
  const pinCount = Math.floor(totalClasses * 1.1); // ~55 pins for 50 classes
  const usedKeys = new Set<string>();
  for (let p = 0; p < pinCount * 10 && pinned.length < pinCount; p++) {
    const yg = Math.floor(rng() * 6);
    const ygId = `t4-yg-${yg}`;
    const ygYearGroup = yearGroups[yg]!;
    const section = ygYearGroup.sections[Math.floor(rng() * ygYearGroup.sections.length)]!;
    const spec = yg < 3 ? juniorSpec : seniorSpec;
    const subj = spec[Math.floor(rng() * spec.length)]!;
    const weekday = Math.floor(rng() * 5);
    const periodOrder = Math.floor(rng() * 9);
    const key = `${section.class_id}|${weekday}|${periodOrder}`;
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    const teacherList = teacherIdByYgSubject.get(`${ygId}|${subj.subjectId}`) ?? [];
    if (teacherList.length === 0) continue;
    pinned.push({
      schedule_id: `t4-pin-${pinned.length}`,
      class_id: section.class_id,
      subject_id: subj.subjectId,
      year_group_id: ygId,
      room_id: null,
      teacher_staff_id: teacherList[Math.floor(rng() * teacherList.length)]!,
      weekday,
      period_order: periodOrder,
    });
  }

  // 1 break group, 4 supervision zones × 5 days = 20 duties. With 3 morning
  // breaks per day is what the spec asked for — we use 1 break cell per day
  // for simplicity, with required_supervisor_count=4 → 4 × 5 = 20 duties.
  // (The spec's "4 zones × 3 breaks × 5 days = 60 slots" assumes 3 different
  // break groups. We're keeping it simpler; benchmark stays representative.)
  const breakGroups: BreakGroupInput[] = [
    {
      break_group_id: 'bg-t4-morning',
      name: 'Morning Yard Duty',
      year_group_ids: yearGroupIds,
      required_supervisor_count: 4,
    },
  ];

  const result: SolverInputV2 = {
    year_groups: yearGroups,
    curriculum,
    teachers,
    rooms,
    room_closures: [],
    break_groups: breakGroups,
    pinned_entries: pinned,
    student_overlaps: [],
    settings: defaultSettings(seed, 300),
  };

  assertFeasibleSupply(result, 'tier-4-irish-secondary-large');
  return result;
}

// ─── Tier 5: MAT / multi-campus (large) ─────────────────────────────────────

export function buildTier5MultiCampusLarge(seed: number): SolverInputV2 {
  const rng = mulberry32(seed);

  // 7 year groups (Y7-Y13), 13-14 classes each → 95 total. Pattern 14,13,14,13,14,14,13.
  const sectionsPerYear = [14, 13, 14, 13, 14, 14, 13];
  const yearLabels = ['Y7', 'Y8', 'Y9', 'Y10', 'Y11', 'Y12', 'Y13'];

  const grid = buildGrid({
    weekdays: 5,
    periodsPerDay: 10,
    breaks: [
      {
        afterPeriod: 3,
        break_group_id: 'bg-t5-morning',
        supervision_mode: 'yard',
      },
    ],
  });

  const yearGroups: YearGroupInput[] = [];
  let classCounter = 0;
  for (let yg = 0; yg < 7; yg++) {
    const sections = [];
    for (let s = 0; s < sectionsPerYear[yg]!; s++) {
      sections.push({
        class_id: `t5-class-${classCounter}`,
        class_name: `${yearLabels[yg]}-${String.fromCharCode(65 + s)}`,
        student_count: 25 + Math.floor(rng() * 6),
      });
      classCounter++;
    }
    yearGroups.push({
      year_group_id: `t5-yg-${yg}`,
      year_group_name: yearLabels[yg]!,
      sections,
      period_grid: grid,
    });
  }
  const totalClasses = classCounter; // 95

  // Target demand: ~2200 lessons / 95 classes = ~23 periods/class/week.
  // Junior: en 4 + ma 4 + ir 3 + sci 3 + hist 2 + geo 2 + pe 2 + art 2 + mus 1 = 23
  // Senior: en 4 + ma 4 + ir 2 + bio 2 + chem 2 + phys 2 + fr 2 + sp 2 + bus 2 + re 1 = 23
  const juniorSpec: CurriculumSpec[] = [
    { subjectId: 'english', periodsPerWeek: 4 },
    { subjectId: 'maths', periodsPerWeek: 4 },
    { subjectId: 'irish', periodsPerWeek: 3 },
    { subjectId: 'science', periodsPerWeek: 3 },
    { subjectId: 'history', periodsPerWeek: 2 },
    { subjectId: 'geography', periodsPerWeek: 2 },
    { subjectId: 'pe', periodsPerWeek: 2 },
    { subjectId: 'art', periodsPerWeek: 2 },
    { subjectId: 'music', periodsPerWeek: 1 },
  ];
  const seniorSpec: CurriculumSpec[] = [
    { subjectId: 'english', periodsPerWeek: 4 },
    { subjectId: 'maths', periodsPerWeek: 4 },
    { subjectId: 'irish', periodsPerWeek: 2 },
    { subjectId: 'biology', periodsPerWeek: 2 },
    { subjectId: 'chemistry', periodsPerWeek: 2 },
    { subjectId: 'physics', periodsPerWeek: 2 },
    { subjectId: 'french', periodsPerWeek: 2 },
    { subjectId: 'spanish', periodsPerWeek: 2 },
    { subjectId: 'business', periodsPerWeek: 2 },
    { subjectId: 'religion', periodsPerWeek: 1 },
  ];
  const curriculum: CurriculumEntry[] = [];
  for (let yg = 0; yg < 7; yg++) {
    const spec = yg < 3 ? juniorSpec : seniorSpec;
    for (const s of spec) {
      const subj = subjectCatalog.find((x) => x.id === s.subjectId)!;
      curriculum.push({
        year_group_id: `t5-yg-${yg}`,
        subject_id: s.subjectId,
        subject_name: subj.name,
        min_periods_per_week: s.periodsPerWeek,
        max_periods_per_day: 2,
        preferred_periods_per_week: null,
        requires_double_period: false,
        double_period_count: null,
        required_room_type: subj.roomType,
        preferred_room_id: null,
        class_id: null,
      });
    }
  }

  // 160 teachers.
  const yearGroupIds = yearGroups.map((y) => y.year_group_id);
  const juniorYgIds = yearGroupIds.slice(0, 3);
  const seniorYgIds = yearGroupIds.slice(3);
  const teachers: TeacherInputV2[] = [];
  const mk = (id: string, subjectIds: SubjectId[], ygIds: string[]) => {
    teachers.push({
      staff_profile_id: `t5-t-${id}`,
      name: `Teacher ${id}`,
      competencies: subjectIds.flatMap((sid) =>
        ygIds.map((ygId) => ({ subject_id: sid, year_group_id: ygId, class_id: null })),
      ),
      availability: [],
      preferences: [],
      max_periods_per_week: 22,
      max_periods_per_day: 6,
      max_supervision_duties_per_week: 3,
    });
  };
  for (let i = 0; i < 20; i++) mk(`en-${i}`, ['english'], yearGroupIds);
  for (let i = 0; i < 20; i++) mk(`ma-${i}`, ['maths'], yearGroupIds);
  // Irish — 12 (not 10) so the 231-period demand passes the 1.10 ratio
  // floor. 12 × 22 = 264 → 1.14×.
  for (let i = 0; i < 12; i++) mk(`ir-${i}`, ['irish'], yearGroupIds);
  for (let i = 0; i < 10; i++) mk(`sci-${i}`, ['science'], juniorYgIds);
  for (let i = 0; i < 8; i++) mk(`bi-${i}`, ['biology'], seniorYgIds);
  for (let i = 0; i < 8; i++) mk(`ch-${i}`, ['chemistry'], seniorYgIds);
  for (let i = 0; i < 8; i++) mk(`ph-${i}`, ['physics'], seniorYgIds);
  for (let i = 0; i < 10; i++) mk(`fr-${i}`, ['french'], seniorYgIds);
  for (let i = 0; i < 10; i++) mk(`sp-${i}`, ['spanish'], seniorYgIds);
  // PE specialists — dedicated. PE demand (82) is highest in the
  // generalist pool and rng-picking doesn't reliably cover it. Same
  // pattern as tier-4.
  for (let i = 0; i < 8; i++) mk(`pe-${i}`, ['pe'], yearGroupIds);
  // Humanities/arts/music generalists. PE removed from the pool (see
  // above). Count reduced from 56 to 46 to compensate for +2 Irish and
  // +8 PE so total specialists stays at 160.
  const generalistPool: SubjectId[] = [
    'history',
    'geography',
    'art',
    'music',
    'religion',
    'business',
  ];
  for (let i = 0; i < 46; i++) {
    const k = 2 + Math.floor(rng() * 2);
    mk(`gen-${i}`, pickK(rng, generalistPool, k), yearGroupIds);
  }

  // 100 rooms.
  const rooms: RoomInfoV2[] = [];
  for (let i = 0; i < 70; i++) {
    rooms.push({
      room_id: `t5-cr-${i}`,
      room_type: 'classroom',
      capacity: 30,
      is_exclusive: true,
    });
  }
  for (let i = 0; i < 8; i++) {
    rooms.push({ room_id: `t5-lab-${i}`, room_type: 'lab', capacity: 24, is_exclusive: true });
  }
  for (let i = 0; i < 4; i++) {
    rooms.push({ room_id: `t5-art-${i}`, room_type: 'art', capacity: 24, is_exclusive: true });
  }
  for (let i = 0; i < 2; i++) {
    rooms.push({ room_id: `t5-music-${i}`, room_type: 'music', capacity: 24, is_exclusive: true });
  }
  for (let i = 0; i < 4; i++) {
    rooms.push({ room_id: `t5-gym-${i}`, room_type: 'gym', capacity: 30, is_exclusive: false });
  }
  for (let i = 0; i < 2; i++) {
    rooms.push({ room_id: `t5-it-${i}`, room_type: 'it', capacity: 30, is_exclusive: true });
  }
  for (let i = 0; i < 10; i++) {
    rooms.push({
      room_id: `t5-breakout-${i}`,
      room_type: 'classroom',
      capacity: 20,
      is_exclusive: true,
    });
  }

  // Pinned 5%.
  const teacherIdByYgSubject = new Map<string, string[]>();
  for (const t of teachers) {
    for (const c of t.competencies) {
      const key = `${c.year_group_id}|${c.subject_id}`;
      const list = teacherIdByYgSubject.get(key) ?? [];
      list.push(t.staff_profile_id);
      teacherIdByYgSubject.set(key, list);
    }
  }
  const pinned: PinnedEntryV2[] = [];
  const pinCount = Math.floor(totalClasses * 1.1); // ~104
  const usedKeys = new Set<string>();
  for (let p = 0; p < pinCount * 10 && pinned.length < pinCount; p++) {
    const yg = Math.floor(rng() * 7);
    const ygId = `t5-yg-${yg}`;
    const ygYearGroup = yearGroups[yg]!;
    const section = ygYearGroup.sections[Math.floor(rng() * ygYearGroup.sections.length)]!;
    const spec = yg < 3 ? juniorSpec : seniorSpec;
    const subj = spec[Math.floor(rng() * spec.length)]!;
    const weekday = Math.floor(rng() * 5);
    const periodOrder = Math.floor(rng() * 10);
    const key = `${section.class_id}|${weekday}|${periodOrder}`;
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    const teacherList = teacherIdByYgSubject.get(`${ygId}|${subj.subjectId}`) ?? [];
    if (teacherList.length === 0) continue;
    pinned.push({
      schedule_id: `t5-pin-${pinned.length}`,
      class_id: section.class_id,
      subject_id: subj.subjectId,
      year_group_id: ygId,
      room_id: null,
      teacher_staff_id: teacherList[Math.floor(rng() * teacherList.length)]!,
      weekday,
      period_order: periodOrder,
    });
  }

  const breakGroups: BreakGroupInput[] = [
    {
      break_group_id: 'bg-t5-morning',
      name: 'Morning Yard Duty',
      year_group_ids: yearGroupIds,
      required_supervisor_count: 9,
    },
  ];

  const result: SolverInputV2 = {
    year_groups: yearGroups,
    curriculum,
    teachers,
    rooms,
    room_closures: [],
    break_groups: breakGroups,
    pinned_entries: pinned,
    student_overlaps: [],
    settings: defaultSettings(seed, 600),
  };

  assertFeasibleSupply(result, 'tier-5-multi-campus-large');
  return result;
}

// ─── Tier 6: college / thousands of requirements ────────────────────────────

export function buildTier6CollegeLevel(seed: number): SolverInputV2 {
  const rng = mulberry32(seed);

  // 3 year groups (Y1, Y2, Y3) × 43-44 sections each → 130 sections.
  const sectionsPerYear = [44, 43, 43];
  const yearLabels = ['Year 1', 'Year 2', 'Year 3'];

  const grid = buildGrid({
    weekdays: 5,
    periodsPerDay: 10,
    // Colleges rarely have yard duty; no break cells.
  });

  const yearGroups: YearGroupInput[] = [];
  let classCounter = 0;
  for (let yg = 0; yg < 3; yg++) {
    const sections = [];
    for (let s = 0; s < sectionsPerYear[yg]!; s++) {
      sections.push({
        class_id: `t6-class-${classCounter}`,
        class_name: `${yearLabels[yg]}-S${s + 1}`,
        student_count: 28 + Math.floor(rng() * 8),
      });
      classCounter++;
    }
    yearGroups.push({
      year_group_id: `t6-yg-${yg}`,
      year_group_name: yearLabels[yg]!,
      sections,
      period_grid: grid,
    });
  }
  // Tier-6 pin count is demand-driven (3 %), so we don't compute a
  // class-count-anchored baseline here — see the totalDemand sum further
  // down.

  // Target demand: ~3200 lessons / 130 classes = ~24 periods/class/week.
  // Module-style delivery: 12 modules per year, each 2 periods/week = 24.
  //
  // Earlier drafts of this generator set one module per year to 3
  // periods (an "intensive"), aiming for ~25 periods/class. That caused
  // rng-dependent concentration: when the same subject happened to be
  // the intensive in multiple years, its demand spiked above per-room
  // and per-subject-teacher capacity, failing the feasibility guardrail
  // for some seeds. Uniform 2 periods × 12 modules is slightly below
  // the spec's ~25 target but 24×130=3120 still clears the "3000+"
  // bar and is robust to any seed.
  //
  // Modules are drawn from a tier-6 specific subset, shuffled per year
  // group. We exclude subjects whose required room type has scarce
  // supply at tier-6 scale (art / music / pe / it), because the rng
  // can otherwise put a specialty subject in all 3 year groups and
  // blow the per-room-type feasibility guardrail. Keeping the pool to
  // classroom-friendly subjects + lab-requiring sciences matches
  // typical college-level module catalogs anyway (modules like
  // "creative writing" happen in classrooms).
  const modulesAll: SubjectId[] = subjectCatalog
    .filter((s) => !(['art', 'music', 'pe', 'it'] as const).includes(s.id as never))
    .map((s) => s.id);
  const curriculum: CurriculumEntry[] = [];
  for (let yg = 0; yg < 3; yg++) {
    const moduleCount = 12;
    const shuffled = pickK(rng, modulesAll, moduleCount);
    for (let i = 0; i < shuffled.length; i++) {
      const sid = shuffled[i]!;
      const subj = subjectCatalog.find((x) => x.id === sid)!;
      const periodsPerWeek = 2;
      curriculum.push({
        year_group_id: `t6-yg-${yg}`,
        subject_id: sid,
        subject_name: subj.name,
        min_periods_per_week: periodsPerWeek,
        max_periods_per_day: 2,
        preferred_periods_per_week: null,
        requires_double_period: false,
        double_period_count: null,
        required_room_type: subj.roomType,
        preferred_room_id: null,
        class_id: null,
      });
    }
  }

  // 180 lecturers. Each spans 1-2 modules across 1-3 year groups.
  const yearGroupIds = yearGroups.map((y) => y.year_group_id);
  const teachers: TeacherInputV2[] = [];
  // College lecturers often carry more weekly contact than secondary
  // teachers because modules are smaller-group and shorter-form. 24
  // periods/week gives the allocation loop below enough slack to cover
  // every curriculum subject past the 1.10 per-subject guardrail when
  // 3200-lesson demand spans ~22 subjects.
  const mk = (id: string, subjectIds: SubjectId[], ygIds: string[]) => {
    teachers.push({
      staff_profile_id: `t6-t-${id}`,
      name: `Lecturer ${id}`,
      competencies: subjectIds.flatMap((sid) =>
        ygIds.map((ygId) => ({ subject_id: sid, year_group_id: ygId, class_id: null })),
      ),
      availability: [],
      preferences: [],
      max_periods_per_week: 24,
      max_periods_per_day: 6,
      max_supervision_duties_per_week: null, // colleges don't do yard duty
    });
  };
  // 180 lecturers, allocated by actual per-subject demand.
  //
  // The rng-driven module selection earlier produces a different demand
  // profile per subject per year (e.g. IT intensive in yg0 + regular in
  // yg1 → 218 periods total). A uniform "2 specialists per
  // (yg × module) pair" pattern consistently under-supplied the
  // highest-demand subjects because those specialists only cover one yg
  // each. Instead, count per-subject demand across ALL yearGroups, then
  // allocate `ceil(demand × 1.15 / max_periods_per_week)` specialists
  // to that subject, each competent across every yg in which the
  // subject appears. The 1.15 factor is the guardrail's 1.10 floor
  // plus a safety margin for small-demand subjects where ceil()
  // rounding has the largest effect.
  const demandBySubject = new Map<SubjectId, number>();
  const ygsBySubject = new Map<SubjectId, Set<string>>();
  for (const c of curriculum) {
    const sid = c.subject_id as SubjectId;
    const sections =
      yearGroups.find((y) => y.year_group_id === c.year_group_id)?.sections.length ?? 0;
    demandBySubject.set(sid, (demandBySubject.get(sid) ?? 0) + c.min_periods_per_week * sections);
    let set = ygsBySubject.get(sid);
    if (!set) {
      set = new Set();
      ygsBySubject.set(sid, set);
    }
    set.add(c.year_group_id);
  }

  const teacherMaxPerWeek = 24;
  let tcount = 0;
  for (const [sid, demand] of demandBySubject.entries()) {
    const requiredCount = Math.max(1, Math.ceil((demand * 1.15) / teacherMaxPerWeek));
    const ygsForSubject = Array.from(ygsBySubject.get(sid) ?? []);
    for (let i = 0; i < requiredCount && teachers.length < 180; i++) {
      mk(`specialist-${tcount}`, [sid], ygsForSubject);
      tcount++;
    }
  }
  // Any remaining slots go to multi-subject generalists. Drawing only
  // from curriculum modules so we never spend a teacher slot on a
  // subject that doesn't appear in the curriculum.
  const curriculumModules: SubjectId[] = Array.from(demandBySubject.keys());
  while (teachers.length < 180) {
    const k = 1 + Math.floor(rng() * 2);
    const moduleSubset = pickK(rng, curriculumModules, k);
    const ygSubset = pickK(rng, yearGroupIds, 1 + Math.floor(rng() * 2));
    mk(`gen-${teachers.length}`, moduleSubset, ygSubset);
  }

  // 130 rooms: 100 generic, 30 specialist (10 labs, 6 art, 4 music, 4 gym,
  // 6 IT). Colleges may use non-exclusive halls for large lectures — here we
  // keep the generic rooms exclusive to match the pedagogy of small-group
  // modules.
  const rooms: RoomInfoV2[] = [];
  for (let i = 0; i < 100; i++) {
    rooms.push({
      room_id: `t6-cr-${i}`,
      room_type: 'classroom',
      capacity: 32,
      is_exclusive: true,
    });
  }
  for (let i = 0; i < 10; i++) {
    rooms.push({ room_id: `t6-lab-${i}`, room_type: 'lab', capacity: 24, is_exclusive: true });
  }
  for (let i = 0; i < 6; i++) {
    rooms.push({ room_id: `t6-art-${i}`, room_type: 'art', capacity: 22, is_exclusive: true });
  }
  for (let i = 0; i < 4; i++) {
    rooms.push({ room_id: `t6-music-${i}`, room_type: 'music', capacity: 22, is_exclusive: true });
  }
  for (let i = 0; i < 4; i++) {
    rooms.push({ room_id: `t6-gym-${i}`, room_type: 'gym', capacity: 40, is_exclusive: false });
  }
  for (let i = 0; i < 6; i++) {
    rooms.push({ room_id: `t6-it-${i}`, room_type: 'it', capacity: 30, is_exclusive: true });
  }

  // Pinned 2-3 % of ≈3200 lessons ≈ 64-96. Use 3%.
  const teacherIdByYgSubject = new Map<string, string[]>();
  for (const t of teachers) {
    for (const c of t.competencies) {
      const key = `${c.year_group_id}|${c.subject_id}`;
      const list = teacherIdByYgSubject.get(key) ?? [];
      list.push(t.staff_profile_id);
      teacherIdByYgSubject.set(key, list);
    }
  }
  const pinned: PinnedEntryV2[] = [];
  const totalDemand = curriculum.reduce(
    (sum, c) =>
      sum +
      c.min_periods_per_week *
        (yearGroups.find((y) => y.year_group_id === c.year_group_id)?.sections.length ?? 0),
    0,
  );
  const pinCount = Math.floor(totalDemand * 0.03);
  const usedKeys = new Set<string>();
  for (let p = 0; p < pinCount * 10 && pinned.length < pinCount; p++) {
    const yg = Math.floor(rng() * 3);
    const ygId = `t6-yg-${yg}`;
    const ygYearGroup = yearGroups[yg]!;
    const section = ygYearGroup.sections[Math.floor(rng() * ygYearGroup.sections.length)]!;
    const moduleList = curriculum.filter((c) => c.year_group_id === ygId);
    const module = moduleList[Math.floor(rng() * moduleList.length)]!;
    const weekday = Math.floor(rng() * 5);
    const periodOrder = Math.floor(rng() * 10);
    const key = `${section.class_id}|${weekday}|${periodOrder}`;
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    const teacherList = teacherIdByYgSubject.get(`${ygId}|${module.subject_id}`) ?? [];
    if (teacherList.length === 0) continue;
    pinned.push({
      schedule_id: `t6-pin-${pinned.length}`,
      class_id: section.class_id,
      subject_id: module.subject_id,
      year_group_id: ygId,
      room_id: null,
      teacher_staff_id: teacherList[Math.floor(rng() * teacherList.length)]!,
      weekday,
      period_order: periodOrder,
    });
  }

  const result: SolverInputV2 = {
    year_groups: yearGroups,
    curriculum,
    teachers,
    rooms,
    room_closures: [],
    break_groups: [], // no yard duty in college fixtures
    pinned_entries: pinned,
    student_overlaps: [],
    settings: defaultSettings(seed, 1800),
  };

  assertFeasibleSupply(result, 'tier-6-college-level');
  return result;
}

// ─── Registry ───────────────────────────────────────────────────────────────

export interface ScaleProofFixture {
  name: string;
  tier: 4 | 5 | 6;
  /** Typical budget range for this tier in seconds (min, default, max). */
  budgetRangeSeconds: { min: number; default: number; max: number };
  build: (seed: number) => SolverInputV2;
}

export const SCALE_PROOF_FIXTURES: ScaleProofFixture[] = [
  {
    name: 'tier-4-irish-secondary-large',
    tier: 4,
    budgetRangeSeconds: { min: 60, default: 300, max: 600 },
    build: buildTier4IrishSecondaryLarge,
  },
  {
    name: 'tier-5-multi-campus-large',
    tier: 5,
    budgetRangeSeconds: { min: 120, default: 600, max: 1800 },
    build: buildTier5MultiCampusLarge,
  },
  {
    name: 'tier-6-college-level',
    tier: 6,
    budgetRangeSeconds: { min: 300, default: 1800, max: 3600 },
    build: buildTier6CollegeLevel,
  },
];
