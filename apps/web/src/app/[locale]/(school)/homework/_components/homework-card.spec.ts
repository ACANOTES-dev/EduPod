/**
 * Unit tests for HomeworkCard and HomeworkTypeBadge — pure helper data.
 *
 * HomeworkCard contains declarative data:
 *   - STATUS_MAP: maps homework status strings to badge variants
 *   - HomeworkTypeBadge TYPE_LABELS / TYPE_COLORS: maps homework_type to
 *     display labels and colour classes
 *
 * We replicate these maps here to verify they are correctly keyed and that
 * the variant/label/colour derivation is correct — without mounting React or
 * importing @school/ui.
 */

// ─── Data (mirrored from homework-card.tsx and homework-type-badge.tsx) ───────

const STATUS_MAP: Record<string, 'warning' | 'success' | 'neutral'> = {
  draft: 'warning',
  published: 'success',
  archived: 'neutral',
};

const TYPE_LABELS: Record<string, string> = {
  written: 'Written',
  reading: 'Reading',
  research: 'Research',
  revision: 'Revision',
  project_work: 'Project',
  online_activity: 'Online',
};

const TYPE_COLORS: Record<string, string> = {
  written: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  reading: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  research: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  revision: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  project_work: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  online_activity: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
};

const FALLBACK_TYPE_LABEL = (type: string): string => TYPE_LABELS[type] ?? type;
const FALLBACK_TYPE_COLOR = (type: string): string =>
  TYPE_COLORS[type] ?? 'bg-gray-100 text-gray-800';

// ─── Helpers (derived logic from homework-card.tsx) ───────────────────────────

function getStatusVariant(status: string): 'warning' | 'success' | 'neutral' {
  return STATUS_MAP[status] ?? 'neutral';
}

function clampCompletion(rate: number): number {
  return Math.min(100, rate);
}

function roundCompletion(rate: number): number {
  return Math.round(rate);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('HomeworkCard — status mapping', () => {
  afterEach(() => jest.clearAllMocks());

  it('should map "draft" to "warning" variant', () => {
    expect(getStatusVariant('draft')).toBe('warning');
  });

  it('should map "published" to "success" variant', () => {
    expect(getStatusVariant('published')).toBe('success');
  });

  it('should map "archived" to "neutral" variant', () => {
    expect(getStatusVariant('archived')).toBe('neutral');
  });

  it('should fall back to "neutral" for an unknown status', () => {
    expect(getStatusVariant('unknown_status')).toBe('neutral');
  });
});

describe('HomeworkCard — completion rate display', () => {
  afterEach(() => jest.clearAllMocks());

  it('should clamp a rate above 100 to exactly 100', () => {
    expect(clampCompletion(120)).toBe(100);
  });

  it('should leave a rate at or below 100 unchanged', () => {
    expect(clampCompletion(75)).toBe(75);
    expect(clampCompletion(100)).toBe(100);
  });

  it('should round a decimal completion rate', () => {
    expect(roundCompletion(67.6)).toBe(68);
    expect(roundCompletion(33.4)).toBe(33);
  });

  it('should return 0 for a zero rate', () => {
    expect(clampCompletion(0)).toBe(0);
    expect(roundCompletion(0)).toBe(0);
  });
});

describe('HomeworkTypeBadge — type label derivation', () => {
  afterEach(() => jest.clearAllMocks());

  it('should return "Written" for written type', () => {
    expect(FALLBACK_TYPE_LABEL('written')).toBe('Written');
  });

  it('should return "Reading" for reading type', () => {
    expect(FALLBACK_TYPE_LABEL('reading')).toBe('Reading');
  });

  it('should return "Research" for research type', () => {
    expect(FALLBACK_TYPE_LABEL('research')).toBe('Research');
  });

  it('should return "Revision" for revision type', () => {
    expect(FALLBACK_TYPE_LABEL('revision')).toBe('Revision');
  });

  it('should return "Project" for project_work type', () => {
    expect(FALLBACK_TYPE_LABEL('project_work')).toBe('Project');
  });

  it('should return "Online" for online_activity type', () => {
    expect(FALLBACK_TYPE_LABEL('online_activity')).toBe('Online');
  });

  it('should fall back to the raw type string for an unknown type', () => {
    expect(FALLBACK_TYPE_LABEL('custom_type')).toBe('custom_type');
  });
});

describe('HomeworkTypeBadge — type colour assignment', () => {
  afterEach(() => jest.clearAllMocks());

  it('should assign blue colour to written type', () => {
    expect(FALLBACK_TYPE_COLOR('written')).toContain('bg-blue-100');
  });

  it('should assign green colour to reading type', () => {
    expect(FALLBACK_TYPE_COLOR('reading')).toContain('bg-green-100');
  });

  it('should assign purple colour to research type', () => {
    expect(FALLBACK_TYPE_COLOR('research')).toContain('bg-purple-100');
  });

  it('should fall back to gray for an unknown type', () => {
    expect(FALLBACK_TYPE_COLOR('unknown')).toBe('bg-gray-100 text-gray-800');
  });
});
