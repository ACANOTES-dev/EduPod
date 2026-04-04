import { ConcernProjectionService } from './concern-projection.service';
import type { ConcernRow } from './concern.types';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONCERN_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const INVOLVED_STUDENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── Helpers ───────────────────────────────────────────────────────────────

const makeConcernRow = (overrides: Partial<ConcernRow> = {}): ConcernRow => ({
  id: CONCERN_ID,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  logged_by_user_id: USER_ID,
  author_masked: false,
  category: 'academic',
  severity: 'routine',
  tier: 1,
  occurred_at: new Date('2026-03-01T10:00:00Z'),
  location: 'Room 12',
  witnesses: null,
  actions_taken: 'Spoke with student',
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
  student: { id: STUDENT_ID, first_name: 'John', last_name: 'Smith' },
  involved_students: [],
  versions: [],
  ...overrides,
});

// ─── Test Suite ────────────────────────────────────────────────────────────

describe('ConcernProjectionService', () => {
  let service: ConcernProjectionService;

  beforeEach(() => {
    service = new ConcernProjectionService();
  });

  afterEach(() => jest.clearAllMocks());

  // ─── toConcernListItem ─────────────────────────────────────────────────────

  describe('ConcernProjectionService — toConcernListItem', () => {
    it('should return correct DTO with student name', () => {
      const concern = makeConcernRow();

      const result = service.toConcernListItem(concern, false);

      expect(result.id).toBe(CONCERN_ID);
      expect(result.student_id).toBe(STUDENT_ID);
      expect(result.student_name).toBe('John Smith');
      expect(result.category).toBe('academic');
      expect(result.severity).toBe('routine');
      expect(result.tier).toBe(1);
      expect(result.follow_up_needed).toBe(false);
      expect(result.case_id).toBeNull();
    });

    it('should return Unknown when no student relation', () => {
      const concern = makeConcernRow({ student: null });

      const result = service.toConcernListItem(concern, false);

      expect(result.student_name).toBe('Unknown');
    });

    it('should show author when not masked', () => {
      const concern = makeConcernRow({ author_masked: false });

      const result = service.toConcernListItem(concern, false);

      expect(result.author_name).toBe('Jane Teacher');
      expect(result.author_masked_for_viewer).toBe(false);
      expect(result.logged_by_user_id).toBe(USER_ID);
    });

    it('should mask author when masked and no CP access', () => {
      const concern = makeConcernRow({ author_masked: true });

      const result = service.toConcernListItem(concern, false);

      expect(result.author_name).toBe('Author masked');
      expect(result.author_masked_for_viewer).toBe(true);
      expect(result.logged_by_user_id).toBeNull();
    });

    it('should reveal author when masked but has CP access', () => {
      const concern = makeConcernRow({ author_masked: true });

      const result = service.toConcernListItem(concern, true);

      expect(result.author_name).toBe('Jane Teacher');
      expect(result.author_masked_for_viewer).toBe(false);
      expect(result.logged_by_user_id).toBe(USER_ID);
    });

    it('should map involved students', () => {
      const addedAt = new Date('2026-03-02T10:00:00Z');
      const concern = makeConcernRow({
        involved_students: [
          {
            student_id: INVOLVED_STUDENT_ID,
            added_at: addedAt,
            student: { id: INVOLVED_STUDENT_ID, first_name: 'Alice', last_name: 'Jones' },
          },
        ],
      });

      const result = service.toConcernListItem(concern, false);

      expect(result.students_involved).toHaveLength(1);
      expect(result.students_involved[0]).toEqual({
        student_id: INVOLVED_STUDENT_ID,
        student_name: 'Alice Jones',
        added_at: addedAt,
      });
    });

    it('should return Unknown for involved student with no student relation', () => {
      const addedAt = new Date('2026-03-02T10:00:00Z');
      const concern = makeConcernRow({
        involved_students: [
          {
            student_id: INVOLVED_STUDENT_ID,
            added_at: addedAt,
            student: null,
          },
        ],
      });

      const result = service.toConcernListItem(concern, false);

      expect(result.students_involved[0]?.student_name).toBe('Unknown');
    });

    it('should return null author_name when logged_by is null and not masked', () => {
      const concern = makeConcernRow({ logged_by: null });

      const result = service.toConcernListItem(concern, false);

      expect(result.author_name).toBeNull();
      expect(result.author_masked_for_viewer).toBe(false);
    });
  });

  // ─── toConcernDetail ───────────────────────────────────────────────────────

  describe('ConcernProjectionService — toConcernDetail', () => {
    it('should include all detail fields', () => {
      const concern = makeConcernRow({
        witnesses: ['Witness A'],
        actions_taken: 'Spoke with parents',
        follow_up_suggestion: 'Follow up in 2 weeks',
        location: 'Yard',
        behaviour_incident_id: null,
        parent_shareable: true,
        parent_share_level: 'category_only',
        acknowledged_at: new Date('2026-03-02T12:00:00Z'),
        acknowledged_by_user_id: USER_ID,
      });

      const result = service.toConcernDetail(concern, false);

      expect(result.witnesses).toEqual(['Witness A']);
      expect(result.actions_taken).toBe('Spoke with parents');
      expect(result.follow_up_suggestion).toBe('Follow up in 2 weeks');
      expect(result.location).toBe('Yard');
      expect(result.parent_shareable).toBe(true);
      expect(result.parent_share_level).toBe('category_only');
      expect(result.acknowledged_at).toEqual(new Date('2026-03-02T12:00:00Z'));
      expect(result.acknowledged_by_user_id).toBe(USER_ID);
    });

    it('should include versions array', () => {
      const versionDate = new Date('2026-03-03T10:00:00Z');
      const concern = makeConcernRow({
        versions: [
          {
            id: 'version-1',
            concern_id: CONCERN_ID,
            version_number: 1,
            narrative: 'Initial report',
            amended_by_user_id: USER_ID,
            amendment_reason: null,
            created_at: versionDate,
          },
        ],
      });

      const result = service.toConcernDetail(concern, false);

      expect(result.versions).toHaveLength(1);
      expect(result.versions[0]).toEqual(
        expect.objectContaining({
          id: 'version-1',
          version_number: 1,
          narrative: 'Initial report',
        }),
      );
    });

    it('should default versions to empty array when undefined', () => {
      const concern = makeConcernRow({ versions: undefined });

      const result = service.toConcernDetail(concern, false);

      expect(result.versions).toEqual([]);
    });
  });
});
