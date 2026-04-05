import type { ListConcernsQuery } from '@school/shared/pastoral';

import {
  applyAuthorMasking,
  buildConcernOrderBy,
  buildConcernWhereClause,
  mapConcernInvolvedStudents,
  mapConcernRowToDetail,
  mapConcernRowToListItem,
} from './concern.helpers';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID_A = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const STUDENT_ID_2 = '12121212-1212-1212-1212-121212121212';
const CONCERN_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeConcern = (overrides: Partial<ConcernRow> = {}): ConcernRow => ({
  id: CONCERN_ID,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  category: 'academic',
  severity: 'routine',
  tier: 1,
  logged_by_user_id: USER_ID_A,
  author_masked: false,
  occurred_at: new Date('2026-03-01T10:00:00Z'),
  location: null,
  witnesses: null,
  actions_taken: null,
  follow_up_needed: false,
  follow_up_suggestion: null,
  case_id: null,
  behaviour_incident_id: null,
  parent_shareable: false,
  parent_share_level: null,
  shared_by_user_id: null,
  shared_at: null,
  legal_hold: false,
  imported: false,
  acknowledged_at: null,
  acknowledged_by_user_id: null,
  created_at: new Date('2026-03-01T10:00:00Z'),
  updated_at: new Date('2026-03-01T10:00:00Z'),
  logged_by: { first_name: 'Jane', last_name: 'Teacher' },
  involved_students: [],
  ...overrides,
});

// ─── applyAuthorMasking ─────────────────────────────────────────────────────

describe('applyAuthorMasking', () => {
  it('should return real author when author_masked is false', () => {
    const concern = makeConcern({ author_masked: false });
    const result = applyAuthorMasking(concern, false);

    expect(result.author_name).toBe('Jane Teacher');
    expect(result.logged_by_user_id).toBe(USER_ID_A);
    expect(result.author_masked_for_viewer).toBe(false);
  });

  it('should return null author_name when logged_by is null and not masked', () => {
    const concern = makeConcern({ author_masked: false, logged_by: null });
    const result = applyAuthorMasking(concern, false);

    expect(result.author_name).toBeNull();
    expect(result.logged_by_user_id).toBe(USER_ID_A);
    expect(result.author_masked_for_viewer).toBe(false);
  });

  it('should return null author_name when logged_by is undefined and not masked', () => {
    const concern = makeConcern({ author_masked: false, logged_by: undefined });
    const result = applyAuthorMasking(concern, false);

    expect(result.author_name).toBeNull();
    expect(result.logged_by_user_id).toBe(USER_ID_A);
    expect(result.author_masked_for_viewer).toBe(false);
  });

  it('should mask author for non-DLP viewer when author_masked is true', () => {
    const concern = makeConcern({ author_masked: true });
    const result = applyAuthorMasking(concern, false);

    expect(result.author_name).toBe('Author masked');
    expect(result.logged_by_user_id).toBeNull();
    expect(result.author_masked_for_viewer).toBe(true);
  });

  it('should reveal author to DLP viewer even when author_masked is true', () => {
    const concern = makeConcern({ author_masked: true });
    const result = applyAuthorMasking(concern, true);

    expect(result.author_name).toBe('Jane Teacher');
    expect(result.logged_by_user_id).toBe(USER_ID_A);
    expect(result.author_masked_for_viewer).toBe(false);
  });

  it('should return null author_name for DLP when logged_by is null and masked', () => {
    const concern = makeConcern({ author_masked: true, logged_by: null });
    const result = applyAuthorMasking(concern, true);

    expect(result.author_name).toBeNull();
    expect(result.logged_by_user_id).toBe(USER_ID_A);
    expect(result.author_masked_for_viewer).toBe(false);
  });
});

// ─��─ mapConcernInvolvedStudents ─────────────────────────────────────────────

describe('mapConcernInvolvedStudents', () => {
  it('should return empty array when no involved_students', () => {
    const concern = makeConcern({ involved_students: [] });
    expect(mapConcernInvolvedStudents(concern)).toEqual([]);
  });

  it('should return empty array when involved_students is undefined', () => {
    const concern = makeConcern({ involved_students: undefined });
    expect(mapConcernInvolvedStudents(concern)).toEqual([]);
  });

  it('should map involved students with student data', () => {
    const concern = makeConcern({
      involved_students: [
        {
          student_id: STUDENT_ID_2,
          added_at: new Date('2026-03-02T10:00:00Z'),
          student: { id: STUDENT_ID_2, first_name: 'Noah', last_name: 'Peer' },
        },
      ],
    });

    const result = mapConcernInvolvedStudents(concern);
    expect(result).toEqual([
      {
        student_id: STUDENT_ID_2,
        student_name: 'Noah Peer',
        added_at: new Date('2026-03-02T10:00:00Z'),
      },
    ]);
  });

  it('should fall back to "Unknown" when student is null', () => {
    const concern = makeConcern({
      involved_students: [
        {
          student_id: STUDENT_ID_2,
          added_at: new Date('2026-03-02T10:00:00Z'),
          student: null,
        },
      ],
    });

    const result = mapConcernInvolvedStudents(concern);
    expect(result[0]!.student_name).toBe('Unknown');
  });
});

// ─── mapConcernRowToListItem ────────────────────────────────────────────────

describe('mapConcernRowToListItem', () => {
  it('should build full list item from concern row', () => {
    const concern = makeConcern({
      student: { id: STUDENT_ID, first_name: 'Sam', last_name: 'Student' },
    });

    const result = mapConcernRowToListItem(concern, false);

    expect(result.id).toBe(CONCERN_ID);
    expect(result.student_name).toBe('Sam Student');
    expect(result.category).toBe('academic');
    expect(result.severity).toBe('routine');
    expect(result.tier).toBe(1);
    expect(result.author_name).toBe('Jane Teacher');
    expect(result.author_masked_for_viewer).toBe(false);
  });

  it('should fall back to "Unknown" when student is undefined', () => {
    const concern = makeConcern({ student: undefined });
    const result = mapConcernRowToListItem(concern, false);
    expect(result.student_name).toBe('Unknown');
  });

  it('should fall back to "Unknown" when student is null', () => {
    const concern = makeConcern({ student: null });
    const result = mapConcernRowToListItem(concern, false);
    expect(result.student_name).toBe('Unknown');
  });

  it('should apply author masking for non-DLP viewer', () => {
    const concern = makeConcern({ author_masked: true });
    const result = mapConcernRowToListItem(concern, false);

    expect(result.author_name).toBe('Author masked');
    expect(result.logged_by_user_id).toBeNull();
    expect(result.author_masked_for_viewer).toBe(true);
  });
});

// ─── mapConcernRowToDetail ──────────────────────────────────────────────────

describe('mapConcernRowToDetail', () => {
  it('should include all detail fields from concern row', () => {
    const concern = makeConcern({
      location: 'Classroom A',
      witnesses: ['Witness A'],
      actions_taken: 'Spoke to student',
      follow_up_suggestion: 'Follow up next week',
      behaviour_incident_id: 'bi-123',
      parent_shareable: true,
      parent_share_level: 'full_detail',
      acknowledged_at: new Date('2026-03-02T10:00:00Z'),
      acknowledged_by_user_id: USER_ID_A,
      versions: [
        {
          id: 'v1',
          concern_id: CONCERN_ID,
          version_number: 1,
          narrative: 'Initial narrative',
          amended_by_user_id: USER_ID_A,
          amendment_reason: null,
          created_at: new Date('2026-03-01T10:00:00Z'),
        },
      ],
    });

    const result = mapConcernRowToDetail(concern, false);

    expect(result.location).toBe('Classroom A');
    expect(result.witnesses).toEqual(['Witness A']);
    expect(result.actions_taken).toBe('Spoke to student');
    expect(result.follow_up_suggestion).toBe('Follow up next week');
    expect(result.behaviour_incident_id).toBe('bi-123');
    expect(result.parent_shareable).toBe(true);
    expect(result.parent_share_level).toBe('full_detail');
    expect(result.acknowledged_at).toEqual(new Date('2026-03-02T10:00:00Z'));
    expect(result.acknowledged_by_user_id).toBe(USER_ID_A);
    expect(result.versions).toHaveLength(1);
  });

  it('should return empty versions when versions is undefined', () => {
    const concern = makeConcern({ versions: undefined });
    const result = mapConcernRowToDetail(concern, false);
    expect(result.versions).toEqual([]);
  });
});

// ─── buildConcernWhereClause ────────────────────────────────────────────────

describe('buildConcernWhereClause', () => {
  const baseQuery: ListConcernsQuery = {
    page: 1,
    pageSize: 20,
    sort: 'created_at',
    order: 'desc',
  };

  it('should filter to tier 1 only when callerMaxTier is 1', () => {
    const result = buildConcernWhereClause(TENANT_ID, baseQuery, 1);

    expect(result).not.toBeNull();
    expect(result!.tier).toBe(1);
  });

  it('should filter to tier 1 and 2 when callerMaxTier is 2', () => {
    const result = buildConcernWhereClause(TENANT_ID, baseQuery, 2);

    expect(result).not.toBeNull();
    expect(result!.tier).toEqual({ in: [1, 2] });
  });

  it('should not add tier filter when callerMaxTier is 3', () => {
    const result = buildConcernWhereClause(TENANT_ID, baseQuery, 3);

    expect(result).not.toBeNull();
    expect(result!.tier).toBeUndefined();
  });

  it('should apply user-requested tier when within allowed range', () => {
    const result = buildConcernWhereClause(TENANT_ID, { ...baseQuery, tier: 1 }, 2);

    expect(result).not.toBeNull();
    expect(result!.tier).toBe(1);
  });

  it('should return null when requested tier exceeds callerMaxTier', () => {
    const result = buildConcernWhereClause(TENANT_ID, { ...baseQuery, tier: 3 }, 2);
    expect(result).toBeNull();
  });

  it('should filter by student_id with OR clause', () => {
    const result = buildConcernWhereClause(TENANT_ID, { ...baseQuery, student_id: STUDENT_ID }, 3);

    expect(result).not.toBeNull();
    expect(result!.OR).toBeDefined();
    expect(result!.OR).toHaveLength(2);
  });

  it('should filter by category', () => {
    const result = buildConcernWhereClause(TENANT_ID, { ...baseQuery, category: 'bullying' }, 3);

    expect(result).not.toBeNull();
    expect(result!.category).toBe('bullying');
  });

  it('should filter by severity', () => {
    const result = buildConcernWhereClause(TENANT_ID, { ...baseQuery, severity: 'urgent' }, 3);

    expect(result).not.toBeNull();
    expect(result!.severity).toBe('urgent');
  });

  it('should filter by case_id', () => {
    const result = buildConcernWhereClause(TENANT_ID, { ...baseQuery, case_id: 'case-123' }, 3);

    expect(result).not.toBeNull();
    expect(result!.case_id).toBe('case-123');
  });

  it('should filter by date range with both from and to', () => {
    const result = buildConcernWhereClause(
      TENANT_ID,
      { ...baseQuery, from: '2026-01-01', to: '2026-03-31' },
      3,
    );

    expect(result).not.toBeNull();
    const dateFilter = result!.created_at as { gte: Date; lte: Date };
    expect(dateFilter.gte).toEqual(new Date('2026-01-01'));
    expect(dateFilter.lte).toEqual(new Date('2026-03-31'));
  });

  it('should filter by date range with only from', () => {
    const result = buildConcernWhereClause(TENANT_ID, { ...baseQuery, from: '2026-01-01' }, 3);

    expect(result).not.toBeNull();
    const dateFilter = result!.created_at as { gte: Date; lte?: Date };
    expect(dateFilter.gte).toEqual(new Date('2026-01-01'));
    expect(dateFilter.lte).toBeUndefined();
  });

  it('should filter by date range with only to', () => {
    const result = buildConcernWhereClause(TENANT_ID, { ...baseQuery, to: '2026-03-31' }, 3);

    expect(result).not.toBeNull();
    const dateFilter = result!.created_at as { gte?: Date; lte: Date };
    expect(dateFilter.gte).toBeUndefined();
    expect(dateFilter.lte).toEqual(new Date('2026-03-31'));
  });

  it('should combine multiple filters', () => {
    const result = buildConcernWhereClause(
      TENANT_ID,
      {
        ...baseQuery,
        student_id: STUDENT_ID,
        category: 'bullying',
        severity: 'elevated',
        case_id: 'case-1',
        from: '2026-01-01',
        to: '2026-03-31',
      },
      3,
    );

    expect(result).not.toBeNull();
    expect(result!.OR).toBeDefined();
    expect(result!.category).toBe('bullying');
    expect(result!.severity).toBe('elevated');
    expect(result!.case_id).toBe('case-1');
    expect(result!.created_at).toBeDefined();
  });

  it('edge: should handle callerMaxTier of 0', () => {
    const result = buildConcernWhereClause(TENANT_ID, baseQuery, 0);

    expect(result).not.toBeNull();
    // maxTier < 2, so tier should be 1
    expect(result!.tier).toBe(1);
  });
});

// ─── buildConcernOrderBy ────────────────────────────────────────────────────

describe('buildConcernOrderBy', () => {
  it('should order by created_at when sort is created_at', () => {
    const result = buildConcernOrderBy({
      page: 1,
      pageSize: 20,
      sort: 'created_at',
      order: 'desc',
    });
    expect(result.created_at).toBe('desc');
  });

  it('should order by occurred_at when sort is occurred_at', () => {
    const result = buildConcernOrderBy({
      page: 1,
      pageSize: 20,
      sort: 'occurred_at',
      order: 'asc',
    });
    expect(result.occurred_at).toBe('asc');
  });

  it('should order by severity when sort is severity', () => {
    const result = buildConcernOrderBy({
      page: 1,
      pageSize: 20,
      sort: 'severity',
      order: 'desc',
    });
    expect(result.severity).toBe('desc');
  });

  it('should default to created_at for unknown sort field', () => {
    const result = buildConcernOrderBy({
      page: 1,
      pageSize: 20,
      sort: 'unknown_field' as 'created_at',
      order: 'asc',
    });
    expect(result.created_at).toBe('asc');
  });
});
