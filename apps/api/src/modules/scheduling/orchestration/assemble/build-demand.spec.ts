import { buildDemand } from './build-demand';
import type {
  ClassSubjectAssignmentRow,
  ClassSubjectOverrideRow,
  CurriculumRow,
  YearGroupWithClasses,
} from './load-tenant-data';

const YG_6: YearGroupWithClasses = {
  id: 'yg-6',
  name: '6th Class',
  classes: [
    { id: '6a', name: '6A', enrolmentCount: 20 },
    { id: '6b', name: '6B', enrolmentCount: 20 },
  ],
};

const elevenSubjectCurriculum: CurriculumRow[] = [
  'acc',
  'ara',
  'bio',
  'bus',
  'chem',
  'eco',
  'eng',
  'geo',
  'his',
  'math',
  'phy',
].map((subjectId) => ({
  year_group_id: 'yg-6',
  subject_id: subjectId,
  subject_name: subjectId,
  min_periods_per_week: 3,
  max_periods_per_day: 1,
  preferred_periods_per_week: 3,
  requires_double_period: false,
  double_period_count: null,
}));

describe('buildDemand', () => {
  it('fans out year-group curriculum to every class when the Matrix is unused (no assignments)', () => {
    const { demand } = buildDemand([YG_6], elevenSubjectCurriculum, [], [], false);
    // 11 subjects × 2 classes = 22 rows
    expect(demand).toHaveLength(22);
    expect(demand.filter((d) => d.class_id === '6a')).toHaveLength(11);
    expect(demand.filter((d) => d.class_id === '6b')).toHaveLength(11);
  });

  // Regression — NHQS-style Matrix: 6A only has 6 subjects checked even though
  // year-group curriculum defines 11. The solver used to plan 39 periods and
  // hit the overbook blocker; it should now plan only the 6 assigned ones.
  it('filters the year-group fan-out by the Curriculum Matrix assignments', () => {
    const assignments: ClassSubjectAssignmentRow[] = [
      { class_id: '6a', subject_id: 'bio' },
      { class_id: '6a', subject_id: 'chem' },
      { class_id: '6a', subject_id: 'eng' },
      { class_id: '6a', subject_id: 'geo' },
      { class_id: '6a', subject_id: 'his' },
      { class_id: '6a', subject_id: 'math' },
      // 6B mirrors 6A except no History
      { class_id: '6b', subject_id: 'bio' },
      { class_id: '6b', subject_id: 'chem' },
      { class_id: '6b', subject_id: 'eng' },
      { class_id: '6b', subject_id: 'geo' },
      { class_id: '6b', subject_id: 'math' },
    ];
    const { demand } = buildDemand([YG_6], elevenSubjectCurriculum, [], assignments, false);
    expect(demand.filter((d) => d.class_id === '6a')).toHaveLength(6);
    expect(demand.filter((d) => d.class_id === '6b')).toHaveLength(5);
    // Unassigned subject (Accounting) must NOT appear for either class
    expect(demand.find((d) => d.subject_id === 'acc')).toBeUndefined();
    // Asymmetric Matrix → 6A gets History, 6B does not
    expect(demand.find((d) => d.class_id === '6a' && d.subject_id === 'his')).toBeDefined();
    expect(demand.find((d) => d.class_id === '6b' && d.subject_id === 'his')).toBeUndefined();
  });

  it('overrides bypass the Matrix filter (explicit opt-in wins)', () => {
    const assignments: ClassSubjectAssignmentRow[] = [
      // Only Biology is matrix-assigned to 6A
      { class_id: '6a', subject_id: 'bio' },
    ];
    const overrides: ClassSubjectOverrideRow[] = [
      {
        class_id: '6a',
        subject_id: 'phy', // NOT in matrix, but explicit override
        subject_name: 'phy',
        year_group_id: 'yg-6',
        periods_per_week: 2,
        max_periods_per_day: null,
        requires_double_period: false,
        double_period_count: null,
        required_room_type: null,
        preferred_room_id: null,
      },
    ];
    const { demand } = buildDemand([YG_6], elevenSubjectCurriculum, overrides, assignments, false);
    const sixA = demand.filter((d) => d.class_id === '6a');
    expect(sixA).toHaveLength(2); // biology from matrix + physics from override
    expect(sixA.find((d) => d.subject_id === 'bio')).toBeDefined();
    expect(sixA.find((d) => d.subject_id === 'phy')?.periods_per_week).toBe(2);
  });

  it('emits zero demand for classes with no Matrix assignments when the Matrix is in use', () => {
    // Only 6A is in the matrix — 6B has no assignments at all.
    const assignments: ClassSubjectAssignmentRow[] = [{ class_id: '6a', subject_id: 'math' }];
    const { demand } = buildDemand([YG_6], elevenSubjectCurriculum, [], assignments, false);
    expect(demand.filter((d) => d.class_id === '6a')).toHaveLength(1);
    expect(demand.filter((d) => d.class_id === '6b')).toHaveLength(0);
  });
});
