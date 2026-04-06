import { Test, TestingModule } from '@nestjs/testing';

import { PastoralEventService } from './pastoral-event.service';
import { PastoralReportStudentSummaryService } from './pastoral-report-student-summary.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ─── Mock DB ────────────────────────────────────────────────────────────────

const buildMockDb = () => ({
  cpAccessGrant: { findFirst: jest.fn() },
  student: { findFirst: jest.fn() },
  pastoralConcern: { findMany: jest.fn() },
  pastoralCase: { findMany: jest.fn() },
  pastoralIntervention: { findMany: jest.fn() },
  pastoralReferral: { findMany: jest.fn() },
  cpRecord: { count: jest.fn() },
});

type MockDb = ReturnType<typeof buildMockDb>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeStudent() {
  return {
    id: STUDENT_ID,
    first_name: 'Alice',
    last_name: 'Smith',
    full_name: 'Alice Smith',
    student_number: 'STU-001',
    year_group: { name: 'Year 5' },
    homeroom_class: { name: '5A' },
  };
}

function makeConcern(overrides: Record<string, unknown> = {}) {
  return {
    id: 'concern-1',
    occurred_at: new Date('2026-03-01T10:00:00Z'),
    category: 'academic',
    severity: 'routine',
    tier: 1,
    actions_taken: 'Spoke with student.',
    logged_by: { first_name: 'Jane', last_name: 'Teacher' },
    versions: [
      {
        version_number: 1,
        narrative: 'Student not completing homework.',
        created_at: new Date('2026-03-01T10:00:00Z'),
        amended_by: { first_name: 'Jane', last_name: 'Teacher' },
        amendment_reason: null,
      },
    ],
    involved_students: [],
    student_id: STUDENT_ID,
    ...overrides,
  };
}

function makeCase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'case-1',
    status: 'open',
    created_at: new Date('2026-03-05T10:00:00Z'),
    next_review_date: new Date('2026-04-05'),
    owner: { first_name: 'John', last_name: 'Counsellor' },
    concerns: [{ id: 'concern-1' }],
    ...overrides,
  };
}

function makeIntervention(overrides: Record<string, unknown> = {}) {
  return {
    id: 'int-1',
    intervention_type: 'mentoring',
    continuum_level: 2,
    status: 'in_progress',
    target_outcomes: { goal: 'Improve attendance' },
    outcome_notes: null,
    created_at: new Date('2026-03-10T10:00:00Z'),
    updated_at: new Date('2026-03-20T10:00:00Z'),
    student_id: STUDENT_ID,
    ...overrides,
  };
}

function makeReferral(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ref-1',
    referral_type: 'neps',
    status: 'draft',
    submitted_at: null,
    student_id: STUDENT_ID,
    created_at: new Date('2026-03-12T10:00:00Z'),
    ...overrides,
  };
}

function setupFullMocks(db: MockDb, hasCp: boolean): void {
  db.cpAccessGrant.findFirst.mockResolvedValue(hasCp ? { id: 'grant-1', revoked_at: null } : null);
  db.student.findFirst.mockResolvedValue(makeStudent());
  db.pastoralConcern.findMany.mockResolvedValue([makeConcern()]);
  db.pastoralCase.findMany.mockResolvedValue([makeCase()]);
  db.pastoralIntervention.findMany.mockResolvedValue([makeIntervention()]);
  db.pastoralReferral.findMany.mockResolvedValue([makeReferral()]);
  db.cpRecord.count.mockResolvedValue(hasCp ? 1 : 0);
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('PastoralReportStudentSummaryService', () => {
  let service: PastoralReportStudentSummaryService;
  let mockEventService: { write: jest.Mock };
  let mockDb: MockDb;

  beforeEach(async () => {
    mockEventService = { write: jest.fn().mockResolvedValue(undefined) };
    mockDb = buildMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PastoralReportStudentSummaryService,
        { provide: PastoralEventService, useValue: mockEventService },
      ],
    }).compile();

    service = module.get<PastoralReportStudentSummaryService>(PastoralReportStudentSummaryService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── build ──────────────────────────────────────────────────────────────

  describe('PastoralReportStudentSummaryService — build', () => {
    it('should return full student summary', async () => {
      setupFullMocks(mockDb, true);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, STUDENT_ID, {});

      expect(result.student).toEqual({
        id: STUDENT_ID,
        full_name: 'Alice Smith',
        student_number: 'STU-001',
        year_group: 'Year 5',
        class_name: '5A',
      });
      expect(result.concerns).toHaveLength(1);
      expect(result.concerns[0]).toEqual(
        expect.objectContaining({
          id: 'concern-1',
          category: 'academic',
          logged_by: 'Jane Teacher',
        }),
      );
      expect(result.cases).toHaveLength(1);
      expect(result.cases[0]).toEqual(
        expect.objectContaining({
          id: 'case-1',
          status: 'open',
          case_owner: 'John Counsellor',
        }),
      );
      expect(result.interventions).toHaveLength(1);
      expect(result.referrals).toHaveLength(1);
    });

    it('should return empty stub when student not found', async () => {
      mockDb.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockDb.student.findFirst.mockResolvedValue(null);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, STUDENT_ID, {});

      expect(result.student.full_name).toBe('Unknown');
      expect(result.concerns).toEqual([]);
      expect(result.cases).toEqual([]);
      expect(result.interventions).toEqual([]);
      expect(result.referrals).toEqual([]);
      expect(result.has_cp_records).toBe(false);
    });

    it('should include tier 3 concerns for CP users', async () => {
      setupFullMocks(mockDb, true);

      await service.build(mockDb as never, TENANT_ID, USER_ID, STUDENT_ID, {});

      // When CP access is granted, the tier filter should be empty (no restriction)
      const concernCall = mockDb.pastoralConcern.findMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(concernCall.where.tier).toBeUndefined();
    });

    it('should exclude tier 3 concerns for non-CP users', async () => {
      setupFullMocks(mockDb, false);

      await service.build(mockDb as never, TENANT_ID, USER_ID, STUDENT_ID, {});

      const concernCall = mockDb.pastoralConcern.findMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(concernCall.where.tier).toEqual({ in: [1, 2] });
    });

    it('should include CP record existence for CP users', async () => {
      setupFullMocks(mockDb, true);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, STUDENT_ID, {});

      expect(result.has_cp_records).toBe(true);
      expect(mockDb.cpRecord.count).toHaveBeenCalled();
    });

    it('should filter by include_resolved option', async () => {
      setupFullMocks(mockDb, false);

      // Without include_resolved: status filter excludes resolved/closed
      await service.build(mockDb as never, TENANT_ID, USER_ID, STUDENT_ID, {});

      const caseCall = mockDb.pastoralCase.findMany.mock.calls[0][0];
      expect(caseCall.where.status).toEqual({ notIn: ['resolved', 'closed'] });
    });

    it('should not filter cases by status when include_resolved is true', async () => {
      setupFullMocks(mockDb, false);

      await service.build(mockDb as never, TENANT_ID, USER_ID, STUDENT_ID, {
        include_resolved: true,
      });

      const caseCall = mockDb.pastoralCase.findMany.mock.calls[0][0];
      expect(caseCall.where.status).toBeUndefined();
    });

    it('should map referral wait days for submitted referrals', async () => {
      setupFullMocks(mockDb, false);
      mockDb.pastoralReferral.findMany.mockResolvedValue([
        makeReferral({
          status: 'submitted',
          submitted_at: new Date('2026-03-01T10:00:00Z'),
        }),
      ]);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, STUDENT_ID, {});

      expect(result.referrals[0]?.status).toBe('submitted');
      expect(typeof result.referrals[0]?.wait_days).toBe('number');
      expect(result.referrals[0]?.wait_days ?? 0).toBeGreaterThanOrEqual(0);
    });

    it('should fire audit event', async () => {
      setupFullMocks(mockDb, false);

      await service.build(mockDb as never, TENANT_ID, USER_ID, STUDENT_ID, {});

      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'student_summary_accessed',
          actor_user_id: USER_ID,
          entity_id: STUDENT_ID,
          student_id: STUDENT_ID,
        }),
      );
    });

    it('should fall back for sparse student, case, concern, intervention, and referral data', async () => {
      mockDb.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockDb.student.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
        full_name: null,
        student_number: null,
        year_group: null,
        homeroom_class: null,
      });
      mockDb.pastoralConcern.findMany.mockResolvedValue([
        makeConcern({
          versions: [],
        }),
      ]);
      mockDb.pastoralCase.findMany.mockResolvedValue([
        makeCase({
          owner: null,
          next_review_date: null,
        }),
      ]);
      mockDb.pastoralIntervention.findMany.mockResolvedValue([
        makeIntervention({
          target_outcomes: 'Improve attendance',
        }),
      ]);
      mockDb.pastoralReferral.findMany.mockResolvedValue([
        makeReferral({
          status: 'submitted',
          submitted_at: null,
        }),
      ]);
      mockDb.cpRecord.count.mockResolvedValue(0);

      const result = await service.build(mockDb as never, TENANT_ID, USER_ID, STUDENT_ID, {});

      expect(result.student).toEqual({
        id: STUDENT_ID,
        full_name: 'Alice Smith',
        student_number: '',
        year_group: '',
        class_name: '',
      });
      expect(result.concerns[0]!.narrative).toBe('');
      expect(result.cases[0]!.case_owner).toBe('Unknown');
      expect(result.cases[0]!.review_date).toBeNull();
      expect(result.interventions[0]!.target_outcomes).toBe('Improve attendance');
      expect(result.referrals[0]!.submitted_at).toBeNull();
      expect(result.referrals[0]!.wait_days).toBeNull();
    });
  });
});
