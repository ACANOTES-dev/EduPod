/**
 * Unit tests for GlobalSearch — result grouping and display logic.
 *
 * GlobalSearch groups API results by entity_type and derives an empty-state
 * message.  We test those transformations as pure functions.
 */

// ─── Types (mirrored from global-search.tsx) ──────────────────────────────────

type EntityType = 'students' | 'parents' | 'staff' | 'households';

interface SearchResult {
  id: string;
  entity_type: EntityType;
  primary_label: string;
  secondary_label?: string;
  status?: string;
  url: string;
}

// ─── Pure logic extracted from global-search.tsx ─────────────────────────────

const ENTITY_TYPES: EntityType[] = ['students', 'parents', 'staff', 'households'];

function groupResults(results: SearchResult[]): Record<EntityType, SearchResult[]> {
  const grouped: Record<EntityType, SearchResult[]> = {
    students: [],
    parents: [],
    staff: [],
    households: [],
  };
  for (const result of results) {
    if (result?.entity_type && grouped[result.entity_type]) {
      grouped[result.entity_type].push(result);
    }
  }
  return grouped;
}

function buildGroups(
  results: SearchResult[],
  translate: (key: string) => string,
): { heading: string; items: { id: string; label: string; description?: string }[] }[] {
  const grouped = groupResults(results);

  return ENTITY_TYPES.filter((type) => (grouped[type]?.length ?? 0) > 0).map((type) => ({
    heading: translate(`resultTypes.${type}`),
    items: grouped[type].map((result) => ({
      id: result.id,
      label: result.primary_label,
      description: result.secondary_label,
    })),
  }));
}

function computeEmptyMessage(loading: boolean, query: string, noResultsText: string): string {
  if (loading) return '...';
  if (query.trim()) return noResultsText;
  return '';
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeResult(
  overrides: Partial<SearchResult> & { id: string; entity_type: EntityType },
): SearchResult {
  return {
    primary_label: 'Test Person',
    url: '/en/students/1',
    ...overrides,
  };
}

const t = (key: string): string => key; // identity translator

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GlobalSearch — result grouping', () => {
  afterEach(() => jest.clearAllMocks());

  // ─── groupResults ────────────────────────────────────────────────────────

  describe('groupResults', () => {
    it('should start with all groups empty', () => {
      const grouped = groupResults([]);
      expect(grouped.students).toHaveLength(0);
      expect(grouped.parents).toHaveLength(0);
      expect(grouped.staff).toHaveLength(0);
      expect(grouped.households).toHaveLength(0);
    });

    it('should place each result in the correct bucket', () => {
      const results: SearchResult[] = [
        makeResult({ id: 's1', entity_type: 'students', primary_label: 'Ali Hassan' }),
        makeResult({ id: 'p1', entity_type: 'parents', primary_label: 'Sara Khan' }),
        makeResult({ id: 'h1', entity_type: 'households', primary_label: 'Khan Family' }),
      ];

      const grouped = groupResults(results);

      expect(grouped.students).toHaveLength(1);
      expect(grouped.students[0]?.id).toBe('s1');
      expect(grouped.parents).toHaveLength(1);
      expect(grouped.parents[0]?.id).toBe('p1');
      expect(grouped.households).toHaveLength(1);
      expect(grouped.households[0]?.id).toBe('h1');
      expect(grouped.staff).toHaveLength(0);
    });

    it('should accumulate multiple results of the same type', () => {
      const results: SearchResult[] = [
        makeResult({ id: 's1', entity_type: 'students' }),
        makeResult({ id: 's2', entity_type: 'students' }),
        makeResult({ id: 's3', entity_type: 'students' }),
      ];

      const grouped = groupResults(results);

      expect(grouped.students).toHaveLength(3);
    });

    it('should preserve result order within a bucket', () => {
      const results: SearchResult[] = [
        makeResult({ id: 'a', entity_type: 'students', primary_label: 'Alpha' }),
        makeResult({ id: 'b', entity_type: 'students', primary_label: 'Beta' }),
      ];

      const grouped = groupResults(results);

      expect(grouped.students[0]?.id).toBe('a');
      expect(grouped.students[1]?.id).toBe('b');
    });
  });

  // ─── buildGroups ─────────────────────────────────────────────────────────

  describe('buildGroups', () => {
    it('should return an empty array when there are no results', () => {
      expect(buildGroups([], t)).toHaveLength(0);
    });

    it('should include only non-empty entity buckets', () => {
      const results: SearchResult[] = [makeResult({ id: 's1', entity_type: 'students' })];

      const groups = buildGroups(results, t);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.heading).toBe('resultTypes.students');
    });

    it('should include a group for each entity type that has results', () => {
      const results: SearchResult[] = [
        makeResult({ id: 's1', entity_type: 'students' }),
        makeResult({ id: 'p1', entity_type: 'parents' }),
        makeResult({ id: 'st1', entity_type: 'staff' }),
        makeResult({ id: 'h1', entity_type: 'households' }),
      ];

      const groups = buildGroups(results, t);

      expect(groups).toHaveLength(4);
    });

    it('should map result fields to item fields correctly', () => {
      const results: SearchResult[] = [
        makeResult({
          id: 's1',
          entity_type: 'students',
          primary_label: 'Ahmed Ali',
          secondary_label: 'Class 5A',
        }),
      ];

      const groups = buildGroups(results, t);
      const item = groups[0]?.items[0];

      expect(item?.id).toBe('s1');
      expect(item?.label).toBe('Ahmed Ali');
      expect(item?.description).toBe('Class 5A');
    });

    it('should omit description when secondary_label is not provided', () => {
      const results: SearchResult[] = [
        makeResult({ id: 's1', entity_type: 'students', primary_label: 'No Sub' }),
      ];

      const groups = buildGroups(results, t);
      const item = groups[0]?.items[0];

      expect(item?.description).toBeUndefined();
    });
  });

  // ─── computeEmptyMessage ─────────────────────────────────────────────────

  describe('computeEmptyMessage', () => {
    it('should return "..." while loading regardless of query', () => {
      expect(computeEmptyMessage(true, 'ali', 'No results')).toBe('...');
      expect(computeEmptyMessage(true, '', 'No results')).toBe('...');
    });

    it('should return the no-results text when query is non-empty and not loading', () => {
      expect(computeEmptyMessage(false, 'ali', 'No results')).toBe('No results');
    });

    it('should return empty string when query is blank and not loading', () => {
      expect(computeEmptyMessage(false, '', 'No results')).toBe('');
      expect(computeEmptyMessage(false, '   ', 'No results')).toBe('');
    });
  });
});
