import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { PastoralDsarService } from './pastoral-dsar.service';
import { PastoralEventService } from './pastoral-event.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACTOR_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const COMPLIANCE_REQUEST_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const REVIEW_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const CONCERN_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const CP_RECORD_ID = '11111111-1111-1111-1111-111111111111';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  pastoralDsarReview: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  pastoralConcern: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  pastoralCase: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  pastoralIntervention: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  pastoralReferral: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  studentCheckin: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  cpRecord: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  cpAccessGrant: {
    findFirst: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockRlsTx),
      ),
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

const NOW = new Date('2026-03-27T10:00:00Z');

const makeConcern = (overrides: Record<string, unknown> = {}) => ({
  id: CONCERN_ID,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  category: 'academic',
  severity: 'routine',
  tier: 1,
  created_at: NOW,
  ...overrides,
});

const makeCpRecord = (overrides: Record<string, unknown> = {}) => ({
  id: CP_RECORD_ID,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  record_type: 'concern',
  narrative: 'CP record narrative text for testing.',
  created_at: NOW,
  ...overrides,
});

const makeReview = (overrides: Record<string, unknown> = {}) => ({
  id: REVIEW_ID,
  tenant_id: TENANT_ID,
  compliance_request_id: COMPLIANCE_REQUEST_ID,
  entity_type: 'concern',
  entity_id: CONCERN_ID,
  tier: 1,
  decision: null,
  legal_basis: null,
  justification: null,
  reviewed_by_user_id: null,
  reviewed_at: null,
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('PastoralDsarService', () => {
  let service: PastoralDsarService;
  let mockPrisma: { cpAccessGrant: { findFirst: jest.Mock } };
  let mockPastoralEventService: { write: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      cpAccessGrant: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    mockPastoralEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    mockRlsTx.pastoralConcern.findMany.mockResolvedValue([]);
    mockRlsTx.pastoralCase.findMany.mockResolvedValue([]);
    mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
    mockRlsTx.pastoralReferral.findMany.mockResolvedValue([]);
    mockRlsTx.studentCheckin.findMany.mockResolvedValue([]);
    mockRlsTx.cpRecord.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PastoralDsarService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PastoralEventService, useValue: mockPastoralEventService },
      ],
    }).compile();

    service = module.get<PastoralDsarService>(PastoralDsarService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── routeForReview ─────────────────────────────────────────────────────

  describe('routeForReview', () => {
    it('should create review rows for all matching pastoral concerns', async () => {
      const concern1 = makeConcern({ id: 'c1', tier: 1 });
      const concern2 = makeConcern({ id: 'c2', tier: 2 });

      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([
        concern1,
        concern2,
      ]);
      mockRlsTx.cpRecord.findMany.mockResolvedValue([]);
      // No duplicates
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(null);
      // Created reviews
      mockRlsTx.pastoralDsarReview.create
        .mockResolvedValueOnce(
          makeReview({ id: 'r1', entity_id: 'c1', tier: 1 }),
        )
        .mockResolvedValueOnce(
          makeReview({ id: 'r2', entity_id: 'c2', tier: 2 }),
        );

      const result = await service.routeForReview(
        TENANT_ID,
        COMPLIANCE_REQUEST_ID,
        STUDENT_ID,
        ACTOR_USER_ID,
      );

      expect(result.reviewCount).toBe(2);
      expect(result.tier3Count).toBe(0);
      expect(mockRlsTx.pastoralDsarReview.create).toHaveBeenCalledTimes(2);
    });

    it('should create review rows for cases, interventions, referrals, and check-ins', async () => {
      mockRlsTx.pastoralCase.findMany.mockResolvedValue([
        {
          id: 'case-1',
          student_id: STUDENT_ID,
          case_number: 'CASE-001',
          status: 'open',
          tier: 2,
          opened_reason: 'Reason',
          created_at: NOW,
        },
      ]);
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([
        {
          id: 'int-1',
          student_id: STUDENT_ID,
          intervention_type: 'attendance_support',
          continuum_level: 2,
          status: 'pc_active',
          outcome_notes: 'Outcome note',
          next_review_date: NOW,
          created_at: NOW,
          case: { tier: 2, case_number: 'CASE-001' },
        },
      ]);
      mockRlsTx.pastoralReferral.findMany.mockResolvedValue([
        {
          id: 'ref-1',
          student_id: STUDENT_ID,
          referral_type: 'neps',
          status: 'submitted',
          reason: 'Referral reason',
          report_summary: null,
          created_at: NOW,
          case: { tier: 2, case_number: 'CASE-001' },
        },
      ]);
      mockRlsTx.studentCheckin.findMany.mockResolvedValue([
        {
          id: 'chk-1',
          student_id: STUDENT_ID,
          mood_score: 2,
          freeform_text: 'Need support',
          flagged: true,
          flag_reason: 'keyword_match',
          checkin_date: NOW,
          created_at: NOW,
        },
      ]);
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralDsarReview.create
        .mockResolvedValueOnce(makeReview({ id: 'r-case', entity_type: 'case', entity_id: 'case-1', tier: 2 }))
        .mockResolvedValueOnce(makeReview({ id: 'r-int', entity_type: 'intervention', entity_id: 'int-1', tier: 2 }))
        .mockResolvedValueOnce(makeReview({ id: 'r-ref', entity_type: 'referral', entity_id: 'ref-1', tier: 2 }))
        .mockResolvedValueOnce(makeReview({ id: 'r-checkin', entity_type: 'checkin', entity_id: 'chk-1', tier: 1 }));

      const result = await service.routeForReview(
        TENANT_ID,
        COMPLIANCE_REQUEST_ID,
        STUDENT_ID,
        ACTOR_USER_ID,
      );

      expect(result.reviewCount).toBe(4);
      expect(mockRlsTx.pastoralDsarReview.create).toHaveBeenCalledTimes(4);
    });

    it('should include CP records when routing user has cp_access', async () => {
      // Grant cp_access
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue({
        id: 'grant-1',
        tenant_id: TENANT_ID,
        user_id: ACTOR_USER_ID,
        revoked_at: null,
      });

      const concern = makeConcern({ id: 'c1', tier: 1 });
      const cpRecord = makeCpRecord({ id: 'cp1' });

      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([concern]);
      mockRlsTx.cpRecord.findMany.mockResolvedValue([cpRecord]);
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralDsarReview.create
        .mockResolvedValueOnce(
          makeReview({ id: 'r1', entity_type: 'concern', entity_id: 'c1', tier: 1 }),
        )
        .mockResolvedValueOnce(
          makeReview({ id: 'r2', entity_type: 'cp_record', entity_id: 'cp1', tier: 3 }),
        );

      const result = await service.routeForReview(
        TENANT_ID,
        COMPLIANCE_REQUEST_ID,
        STUDENT_ID,
        ACTOR_USER_ID,
      );

      expect(result.reviewCount).toBe(2);
      expect(result.tier3Count).toBe(1);
      expect(mockRlsTx.cpRecord.findMany).toHaveBeenCalled();
    });

    it('should exclude CP records when routing user lacks cp_access', async () => {
      // No cp_access (default mock)
      const concern = makeConcern({ id: 'c1', tier: 1 });

      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([concern]);
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralDsarReview.create.mockResolvedValueOnce(
        makeReview({ id: 'r1', entity_id: 'c1', tier: 1 }),
      );

      const result = await service.routeForReview(
        TENANT_ID,
        COMPLIANCE_REQUEST_ID,
        STUDENT_ID,
        ACTOR_USER_ID,
      );

      expect(result.reviewCount).toBe(1);
      expect(mockRlsTx.cpRecord.findMany).not.toHaveBeenCalled();
    });

    it('should not create duplicates on re-run', async () => {
      const concern = makeConcern({ id: 'c1', tier: 1 });
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([concern]);
      // Existing review found — duplicate
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ id: 'existing-r1', entity_id: 'c1' }),
      );

      const result = await service.routeForReview(
        TENANT_ID,
        COMPLIANCE_REQUEST_ID,
        STUDENT_ID,
        ACTOR_USER_ID,
      );

      expect(result.reviewCount).toBe(0);
      expect(mockRlsTx.pastoralDsarReview.create).not.toHaveBeenCalled();
    });
  });

  // ─── submitDecision ─────────────────────────────────────────────────────

  describe('submitDecision', () => {
    it('should succeed with include decision', async () => {
      const review = makeReview();
      const updated = makeReview({
        decision: 'include',
        reviewed_by_user_id: ACTOR_USER_ID,
        reviewed_at: NOW,
      });

      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(review);
      mockRlsTx.pastoralDsarReview.update.mockResolvedValue(updated);

      const result = await service.submitDecision(
        TENANT_ID,
        ACTOR_USER_ID,
        REVIEW_ID,
        { decision: 'include' },
      );

      expect(result.decision).toBe('include');
      expect(mockRlsTx.pastoralDsarReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REVIEW_ID },
          data: expect.objectContaining({ decision: 'include' }),
        }),
      );
    });

    it('should require justification for redact decision', async () => {
      const review = makeReview();
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(review);

      await expect(
        service.submitDecision(TENANT_ID, ACTOR_USER_ID, REVIEW_ID, {
          decision: 'redact',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should require legal_basis and justification for exclude decision', async () => {
      const review = makeReview();
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(review);

      // Missing both
      await expect(
        service.submitDecision(TENANT_ID, ACTOR_USER_ID, REVIEW_ID, {
          decision: 'exclude',
        }),
      ).rejects.toThrow(BadRequestException);

      // Missing justification
      await expect(
        service.submitDecision(TENANT_ID, ACTOR_USER_ID, REVIEW_ID, {
          decision: 'exclude',
          legal_basis: 'third_party_rights',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should require detailed justification (>20 chars) for exclude with legal_basis "other"', async () => {
      const review = makeReview();
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(review);

      // Short justification
      await expect(
        service.submitDecision(TENANT_ID, ACTOR_USER_ID, REVIEW_ID, {
          decision: 'exclude',
          legal_basis: 'other',
          justification: 'Too short',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should generate audit event on successful decision', async () => {
      const review = makeReview();
      const updated = makeReview({
        decision: 'include',
        reviewed_by_user_id: ACTOR_USER_ID,
        reviewed_at: NOW,
      });

      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(review);
      mockRlsTx.pastoralDsarReview.update.mockResolvedValue(updated);

      await service.submitDecision(TENANT_ID, ACTOR_USER_ID, REVIEW_ID, {
        decision: 'include',
      });

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'dsar_review_completed',
          entity_type: 'dsar_review',
          entity_id: REVIEW_ID,
          payload: expect.objectContaining({
            dsar_review_id: REVIEW_ID,
            decision: 'include',
          }),
        }),
      );
    });
  });

  // ─── allReviewsComplete ─────────────────────────────────────────────────

  describe('allReviewsComplete', () => {
    it('should return false when pending reviews exist', async () => {
      mockRlsTx.pastoralDsarReview.count.mockResolvedValue(3);

      const result = await service.allReviewsComplete(
        TENANT_ID,
        COMPLIANCE_REQUEST_ID,
      );

      expect(result).toBe(false);
    });

    it('should return true when all reviews are decided', async () => {
      mockRlsTx.pastoralDsarReview.count.mockResolvedValue(0);

      const result = await service.allReviewsComplete(
        TENANT_ID,
        COMPLIANCE_REQUEST_ID,
      );

      expect(result).toBe(true);
    });
  });

  // ─── getReviewedRecords ─────────────────────────────────────────────────

  describe('getReviewedRecords', () => {
    it('should return only included and redacted records', async () => {
      const includedReview = makeReview({
        id: 'r1',
        decision: 'include',
        entity_type: 'concern',
        entity_id: 'c1',
        reviewed_by_user_id: ACTOR_USER_ID,
      });
      const redactedReview = makeReview({
        id: 'r2',
        decision: 'redact',
        entity_type: 'cp_record',
        entity_id: 'cp1',
        tier: 3,
        justification: 'Redaction details here',
        reviewed_by_user_id: ACTOR_USER_ID,
      });

      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([
        includedReview,
        redactedReview,
      ]);

      // Mock fetching underlying records
      mockRlsTx.pastoralConcern.findFirst.mockResolvedValue({
        id: 'c1',
        category: 'academic',
        severity: 'routine',
        tier: 1,
        created_at: NOW,
        versions: [{ narrative: 'Concern narrative text', version_number: 1 }],
      });
      mockRlsTx.cpRecord.findFirst.mockResolvedValue({
        id: 'cp1',
        record_type: 'concern',
        narrative: 'Sensitive CP narrative',
        created_at: NOW,
      });

      const results = await service.getReviewedRecords(
        TENANT_ID,
        COMPLIANCE_REQUEST_ID,
      );

      expect(results).toHaveLength(2);
      // First is included concern
      expect(results[0]!.decision).toBe('include');
      expect(results[0]!.record_data.narrative).toBe('Concern narrative text');
      // Second is redacted CP record
      expect(results[1]!.decision).toBe('redact');
    });

    it('should apply redactions to redacted records', async () => {
      const redactedReview = makeReview({
        id: 'r1',
        decision: 'redact',
        entity_type: 'cp_record',
        entity_id: 'cp1',
        tier: 3,
        justification: 'Names of third parties removed',
        reviewed_by_user_id: ACTOR_USER_ID,
      });

      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([
        redactedReview,
      ]);
      mockRlsTx.cpRecord.findFirst.mockResolvedValue({
        id: 'cp1',
        record_type: 'concern',
        narrative: 'Sensitive content with third party names',
        created_at: NOW,
      });

      const results = await service.getReviewedRecords(
        TENANT_ID,
        COMPLIANCE_REQUEST_ID,
      );

      expect(results).toHaveLength(1);
      expect(results[0]!.record_data.narrative).toBe('[REDACTED]');
      expect(results[0]!.redaction_note).toBe(
        'Names of third parties removed',
      );
      expect(createRlsClient).toHaveBeenCalledWith(mockPrisma, {
        tenant_id: TENANT_ID,
        user_id: ACTOR_USER_ID,
      });
    });
  });

  // ─── listReviews — tier 3 zero-discoverability ──────────────────────────

  describe('listReviews — cp_access filtering', () => {
    it('should hide tier 3 review records from user without cp_access', async () => {
      // No cp_access (default mock)
      const tier1Review = makeReview({ id: 'r1', tier: 1 });

      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([tier1Review]);
      mockRlsTx.pastoralDsarReview.count.mockResolvedValue(1);

      const result = await service.listReviews(TENANT_ID, ACTOR_USER_ID, {
        compliance_request_id: COMPLIANCE_REQUEST_ID,
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toHaveLength(1);

      // Verify where clause excludes tier 3
      const findManyCall = mockRlsTx.pastoralDsarReview.findMany.mock.calls[0];
      const whereClause = findManyCall[0].where as Record<string, unknown>;
      expect(whereClause.tier).toEqual({ not: 3 });
    });
  });
});
