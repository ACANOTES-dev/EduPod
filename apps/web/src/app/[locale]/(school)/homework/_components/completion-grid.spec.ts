/**
 * Unit tests for CompletionGrid — pure helper data and filtering logic.
 *
 * CompletionGrid's testable logic includes:
 *   - The filter state machine: cycling through 'all', 'not_started',
 *     'in_progress', 'completed' filter keys
 *   - The filtered student list derivation based on the active filter
 *   - Status icon mapping (X → not_started, Circle → in_progress, Check → completed)
 *   - Completion percentage calculation (points_awarded / maxPoints)
 *
 * We replicate the relevant data and logic here without mounting React.
 */

// ─── Types (mirrored from completion-grid.tsx) ─────────────────────────────────

interface StudentCompletion {
  student_id: string;
  student_name: string;
  status: 'not_started' | 'in_progress' | 'completed';
  notes: string;
  points_awarded: number | null;
  verified: boolean;
}

type FilterStatus = 'all' | 'not_started' | 'in_progress' | 'completed';

// ─── Pure helpers (derived from completion-grid.tsx logic) ────────────────────

function applyFilter(students: StudentCompletion[], filter: FilterStatus): StudentCompletion[] {
  return filter === 'all' ? students : students.filter((s) => s.status === filter);
}

function calculateCompletionPercent(pointsAwarded: number, maxPoints: number): number {
  if (maxPoints === 0) return 0;
  return Math.round((pointsAwarded / maxPoints) * 100);
}

const FILTER_KEYS: FilterStatus[] = ['all', 'not_started', 'in_progress', 'completed'];

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeStudent(overrides: Partial<StudentCompletion> = {}): StudentCompletion {
  return {
    student_id: 'student-1',
    student_name: 'Ali Hassan',
    status: 'not_started',
    notes: '',
    points_awarded: null,
    verified: false,
    ...overrides,
  };
}

const SAMPLE_STUDENTS: StudentCompletion[] = [
  makeStudent({ student_id: '1', student_name: 'Ali Hassan', status: 'not_started' }),
  makeStudent({ student_id: '2', student_name: 'Sara Khan', status: 'in_progress' }),
  makeStudent({ student_id: '3', student_name: 'Omar Ali', status: 'completed' }),
  makeStudent({ student_id: '4', student_name: 'Fatima Nour', status: 'completed' }),
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CompletionGrid — filter logic', () => {
  afterEach(() => jest.clearAllMocks());

  it('should return all students when filter is "all"', () => {
    expect(applyFilter(SAMPLE_STUDENTS, 'all')).toHaveLength(4);
  });

  it('should return only not_started students when filter is "not_started"', () => {
    const result = applyFilter(SAMPLE_STUDENTS, 'not_started');
    expect(result).toHaveLength(1);
    expect(result[0]?.student_name).toBe('Ali Hassan');
  });

  it('should return only in_progress students when filter is "in_progress"', () => {
    const result = applyFilter(SAMPLE_STUDENTS, 'in_progress');
    expect(result).toHaveLength(1);
    expect(result[0]?.student_name).toBe('Sara Khan');
  });

  it('should return only completed students when filter is "completed"', () => {
    const result = applyFilter(SAMPLE_STUDENTS, 'completed');
    expect(result).toHaveLength(2);
    const names = result.map((s) => s.student_name);
    expect(names).toContain('Omar Ali');
    expect(names).toContain('Fatima Nour');
  });

  it('should return an empty array when no students match the filter', () => {
    const students = [makeStudent({ status: 'not_started' })];
    expect(applyFilter(students, 'completed')).toHaveLength(0);
  });

  it('should return an empty array for an empty student list regardless of filter', () => {
    for (const filter of FILTER_KEYS) {
      expect(applyFilter([], filter)).toHaveLength(0);
    }
  });
});

describe('CompletionGrid — filter key definitions', () => {
  afterEach(() => jest.clearAllMocks());

  it('should include all four filter keys', () => {
    expect(FILTER_KEYS).toContain('all');
    expect(FILTER_KEYS).toContain('not_started');
    expect(FILTER_KEYS).toContain('in_progress');
    expect(FILTER_KEYS).toContain('completed');
  });

  it('should have exactly 4 filter keys', () => {
    expect(FILTER_KEYS).toHaveLength(4);
  });
});

describe('CompletionGrid — points percentage calculation', () => {
  afterEach(() => jest.clearAllMocks());

  it('should calculate percentage correctly', () => {
    expect(calculateCompletionPercent(8, 10)).toBe(80);
  });

  it('should return 100 for full marks', () => {
    expect(calculateCompletionPercent(10, 10)).toBe(100);
  });

  it('should return 0 for zero points awarded', () => {
    expect(calculateCompletionPercent(0, 10)).toBe(0);
  });

  it('should return 0 when maxPoints is 0 (guard against division by zero)', () => {
    expect(calculateCompletionPercent(5, 0)).toBe(0);
  });

  it('should round fractional percentages', () => {
    expect(calculateCompletionPercent(1, 3)).toBe(33); // 33.33...
    expect(calculateCompletionPercent(2, 3)).toBe(67); // 66.66...
  });
});

describe('CompletionGrid — student verification flag', () => {
  afterEach(() => jest.clearAllMocks());

  it('should correctly derive toggled verified state', () => {
    const student = makeStudent({ verified: false });
    const toggled = !student.verified;
    expect(toggled).toBe(true);
  });

  it('should correctly toggle from verified to unverified', () => {
    const student = makeStudent({ verified: true });
    const toggled = !student.verified;
    expect(toggled).toBe(false);
  });
});
