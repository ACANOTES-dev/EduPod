import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import {
  MOCK_FACADE_PROVIDERS,
  ChildProtectionReadFacade,
} from '../../../common/tests/mock-facades';
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
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
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
  let mockPrisma: Record<string, unknown>;
  let mockCpFacade: {
    hasActiveCpAccess: jest.Mock;
    findFallbackGrantUserId: jest.Mock;
    findDlpUserIds: jest.Mock;
  };
  let mockPastoralEventService: { write: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {};

    mockCpFacade = {
      hasActiveCpAccess: jest.fn().mockResolvedValue(false),
      findFallbackGrantUserId: jest.fn().mockResolvedValue(ACTOR_USER_ID),
      findDlpUserIds: jest.fn().mockResolvedValue([]),
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
        ...MOCK_FACADE_PROVIDERS,
        PastoralDsarService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PastoralEventService, useValue: mockPastoralEventService },
        { provide: ChildProtectionReadFacade, useValue: mockCpFacade },
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

      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([concern1, concern2]);
      mockRlsTx.cpRecord.findMany.mockResolvedValue([]);
      // No duplicates
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(null);
      // Created reviews
      mockRlsTx.pastoralDsarReview.create
        .mockResolvedValueOnce(makeReview({ id: 'r1', entity_id: 'c1', tier: 1 }))
        .mockResolvedValueOnce(makeReview({ id: 'r2', entity_id: 'c2', tier: 2 }));

      const result = await service.routeForReview(
        TENANT_ID,
        COMPLIANCE_REQUEST_ID,
        STUDENT_ID,
        ACTOR_USER_ID,
      );

      expect(result.reviewCount).toBe(2);
      expect(result.tier3Count).toBe(0);
      expect(mockRlsTx.pastoralDsarReview.create).toHaveBeenCalledTimes(2);
      expect(mockRlsTx.pastoralConcern.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          OR: [
            { student_id: STUDENT_ID },
            {
              involved_students: {
                some: {
                  tenant_id: TENANT_ID,
                  student_id: STUDENT_ID,
                },
              },
            },
          ],
        },
      });
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
        .mockResolvedValueOnce(
          makeReview({ id: 'r-case', entity_type: 'case', entity_id: 'case-1', tier: 2 }),
        )
        .mockResolvedValueOnce(
          makeReview({ id: 'r-int', entity_type: 'intervention', entity_id: 'int-1', tier: 2 }),
        )
        .mockResolvedValueOnce(
          makeReview({ id: 'r-ref', entity_type: 'referral', entity_id: 'ref-1', tier: 2 }),
        )
        .mockResolvedValueOnce(
          makeReview({ id: 'r-checkin', entity_type: 'checkin', entity_id: 'chk-1', tier: 1 }),
        );

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
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(true);

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

  // ─── getReview ──────────────────────────────────────────────────────────

  describe('getReview', () => {
    it('should return review with correct record summaries for all entity types', async () => {
      const reviewCase = makeReview({ id: 'r-case', entity_type: 'case', entity_id: 'case-1' });
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(reviewCase);
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue({
        id: 'case-1',
        case_number: 'C-1',
        tier: 2,
        opened_reason: 'reason that is long to review',
        created_at: NOW,
      });

      const resCase = await service.getReview(TENANT_ID, ACTOR_USER_ID, 'r-case');
      expect(resCase.record_summary).toContain('Case (C-1, tier 2):');
      expect(resCase.record_summary).toContain('reason that is long');

      // Test intervention
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ id: 'r-int', entity_type: 'intervention', entity_id: 'i-1' }),
      );
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue({
        id: 'i-1',
        intervention_type: 'time_out',
        continuum_level: 1,
        outcome_notes: 'timeout was effective',
        case: { case_number: 'C-1' },
      });
      const resInt = await service.getReview(TENANT_ID, ACTOR_USER_ID, 'r-int');
      expect(resInt.record_summary).toContain('Intervention (time_out, C-1):');
      expect(resInt.record_summary).toContain('timeout was effective');

      // Test referral
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ id: 'r-ref', entity_type: 'referral', entity_id: 'ref-1' }),
      );
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue({
        id: 'ref-1',
        referral_type: 'counsellor',
        report_summary: 'Report findings',
        case: { case_number: 'C-1' },
      });
      const resRef = await service.getReview(TENANT_ID, ACTOR_USER_ID, 'r-ref');
      expect(resRef.record_summary).toContain('Referral (counsellor, C-1):');
      expect(resRef.record_summary).toContain('Report findings');

      // Test checkin
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ id: 'r-chk', entity_type: 'checkin', entity_id: 'chk-1' }),
      );
      mockRlsTx.studentCheckin.findFirst.mockResolvedValue({
        id: 'chk-1',
        mood_score: 1,
        checkin_date: NOW,
        freeform_text: 'feeling sick',
        flagged: true,
        flag_reason: 'keyword',
      });
      const resChk = await service.getReview(TENANT_ID, ACTOR_USER_ID, 'r-chk');
      expect(resChk.record_summary).toContain('Check-in');
      expect(resChk.record_summary).toContain('feeling sick');

      // Unknown type
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ id: 'r-unk', entity_type: 'unknown_type', entity_id: 'u-1' }),
      );
      const resUnk = await service.getReview(TENANT_ID, ACTOR_USER_ID, 'r-unk');
      expect(resUnk.record_summary).toBe('Unknown record type');
    });

    it('should throw NotFoundException if review does not exist', async () => {
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(null);
      await expect(service.getReview(TENANT_ID, ACTOR_USER_ID, 'non-existent')).rejects.toThrow();
    });

    it('should throw NotFoundException if tier 3 and no cp_access', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(false);
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(makeReview({ tier: 3 }));
      await expect(service.getReview(TENANT_ID, ACTOR_USER_ID, 'r-t3')).rejects.toThrow();
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

      const result = await service.submitDecision(TENANT_ID, ACTOR_USER_ID, REVIEW_ID, {
        decision: 'include',
      });

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

      const result = await service.allReviewsComplete(TENANT_ID, COMPLIANCE_REQUEST_ID);

      expect(result).toBe(false);
    });

    it('should return true when all reviews are decided', async () => {
      mockRlsTx.pastoralDsarReview.count.mockResolvedValue(0);

      const result = await service.allReviewsComplete(TENANT_ID, COMPLIANCE_REQUEST_ID);

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

      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([includedReview, redactedReview]);

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

      const results = await service.getReviewedRecords(TENANT_ID, COMPLIANCE_REQUEST_ID);

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

      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([redactedReview]);
      mockRlsTx.cpRecord.findFirst.mockResolvedValue({
        id: 'cp1',
        record_type: 'concern',
        narrative: 'Sensitive content with third party names',
        created_at: NOW,
      });

      const results = await service.getReviewedRecords(TENANT_ID, COMPLIANCE_REQUEST_ID);

      expect(results).toHaveLength(1);
      expect(results[0]!.record_data.narrative).toBe('[REDACTED]');
      expect(results[0]!.redaction_note).toBe('Names of third parties removed');
      expect(createRlsClient).toHaveBeenCalledWith(mockPrisma, {
        tenant_id: TENANT_ID,
        user_id: ACTOR_USER_ID,
      });
    });

    it('should apply redactions to case, intervention, referral, and checkin records', async () => {
      const reviewCase = makeReview({
        id: 'r-case',
        decision: 'redact',
        entity_type: 'case',
        entity_id: 'case-1',
        reviewed_by_user_id: ACTOR_USER_ID,
      });
      const reviewInt = makeReview({
        id: 'r-int',
        decision: 'redact',
        entity_type: 'intervention',
        entity_id: 'int-1',
        reviewed_by_user_id: ACTOR_USER_ID,
      });
      const reviewRef = makeReview({
        id: 'r-ref',
        decision: 'redact',
        entity_type: 'referral',
        entity_id: 'ref-1',
        reviewed_by_user_id: ACTOR_USER_ID,
      });
      const reviewChk = makeReview({
        id: 'r-chk',
        decision: 'redact',
        entity_type: 'checkin',
        entity_id: 'chk-1',
        reviewed_by_user_id: ACTOR_USER_ID,
      });

      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([
        reviewCase,
        reviewInt,
        reviewRef,
        reviewChk,
      ]);

      mockRlsTx.pastoralCase.findFirst.mockResolvedValue({
        id: 'case-1',
        case_number: 'C-1',
        tier: 2,
        opened_reason: 'Sensitive reason details',
        status: 'open',
        created_at: NOW,
      });
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue({
        id: 'int-1',
        intervention_type: 'type',
        continuum_level: 1,
        outcome_notes: 'Sensitive outcome detail',
        status: 'active',
        next_review_date: NOW,
        created_at: NOW,
        case: { case_number: 'C-1', tier: 2 },
      });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue({
        id: 'ref-1',
        referral_type: 'type',
        status: 'active',
        reason: 'Sensitive reason',
        report_summary: 'Sensitive report detail',
        created_at: NOW,
        case: { case_number: 'C-1', tier: 2 },
      });
      mockRlsTx.studentCheckin.findFirst.mockResolvedValue({
        id: 'chk-1',
        mood_score: 1,
        freeform_text: 'Sensitive checkin text',
        flagged: false,
        flag_reason: null,
        checkin_date: NOW,
        created_at: NOW,
      });

      const results = await service.getReviewedRecords(TENANT_ID, COMPLIANCE_REQUEST_ID);

      expect(results).toHaveLength(4);
      expect(results.find((r) => r.entity_type === 'case')!.record_data.opened_reason).toBe(
        '[REDACTED]',
      );
      expect(results.find((r) => r.entity_type === 'intervention')!.record_data.outcome_notes).toBe(
        '[REDACTED]',
      );

      const refData = results.find((r) => r.entity_type === 'referral')!.record_data;
      expect(refData.reason).toBe('[REDACTED]');
      expect(refData.report_summary).toBe('[REDACTED]');

      expect(results.find((r) => r.entity_type === 'checkin')!.record_data.freeform_text).toBe(
        '[REDACTED]',
      );
    });

    it('should ignore and skip unknown entity types for getReviewedRecords', async () => {
      const reviewUnk = makeReview({
        id: 'r-unk',
        decision: 'include',
        entity_type: 'unknown',
        entity_id: 'u-1',
        reviewed_by_user_id: ACTOR_USER_ID,
      });
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([reviewUnk]);

      const results = await service.getReviewedRecords(TENANT_ID, COMPLIANCE_REQUEST_ID);

      expect(results).toHaveLength(0); // Because fetchEntityRecord returns null for unknown
    });

    it('should skip tier 3 records if no reviewer context is present', async () => {
      const reviewT3 = makeReview({
        id: 'r-t3',
        decision: 'include',
        entity_type: 'cp_record',
        entity_id: 'cp-1',
        tier: 3,
        reviewed_by_user_id: null,
      });
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([reviewT3]);

      const results = await service.getReviewedRecords(TENANT_ID, COMPLIANCE_REQUEST_ID);
      expect(results).toHaveLength(0);
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

    it('should include tier 3 reviews for user with cp_access', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(true);
      const tier3Review = makeReview({ id: 'r3', tier: 3 });

      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([tier3Review]);
      mockRlsTx.pastoralDsarReview.count.mockResolvedValue(1);

      const result = await service.listReviews(TENANT_ID, ACTOR_USER_ID, {
        compliance_request_id: COMPLIANCE_REQUEST_ID,
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toHaveLength(1);
      // Should NOT have tier: { not: 3 } in the where clause
      const findManyCall = mockRlsTx.pastoralDsarReview.findMany.mock.calls[0];
      const whereClause = findManyCall[0].where as Record<string, unknown>;
      expect(whereClause.tier).toBeUndefined();
    });

    it('should apply decision filter when provided', async () => {
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralDsarReview.count.mockResolvedValue(0);

      await service.listReviews(TENANT_ID, ACTOR_USER_ID, {
        decision: 'include',
        page: 1,
        pageSize: 20,
      });

      const findManyCall = mockRlsTx.pastoralDsarReview.findMany.mock.calls[0];
      const whereClause = findManyCall[0].where as Record<string, unknown>;
      // Without pending_only, decision filter should be applied
      // But since no cp_access, tier is overridden to { not: 3 }
      expect(whereClause).toHaveProperty('decision', 'include');
    });

    it('should apply pending_only filter overriding decision', async () => {
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralDsarReview.count.mockResolvedValue(0);

      await service.listReviews(TENANT_ID, ACTOR_USER_ID, {
        pending_only: true,
        decision: 'include', // Should be ignored when pending_only is set
        page: 1,
        pageSize: 20,
      });

      const findManyCall = mockRlsTx.pastoralDsarReview.findMany.mock.calls[0];
      const whereClause = findManyCall[0].where as Record<string, unknown>;
      expect(whereClause.decision).toBeNull();
    });

    it('should apply entity_type filter', async () => {
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralDsarReview.count.mockResolvedValue(0);

      await service.listReviews(TENANT_ID, ACTOR_USER_ID, {
        entity_type: 'concern',
        page: 1,
        pageSize: 20,
      });

      const findManyCall = mockRlsTx.pastoralDsarReview.findMany.mock.calls[0];
      const whereClause = findManyCall[0].where as Record<string, unknown>;
      expect(whereClause.entity_type).toBe('concern');
    });

    it('should apply tier filter', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(true);
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralDsarReview.count.mockResolvedValue(0);

      await service.listReviews(TENANT_ID, ACTOR_USER_ID, {
        tier: 2,
        page: 1,
        pageSize: 20,
      });

      const findManyCall = mockRlsTx.pastoralDsarReview.findMany.mock.calls[0];
      const whereClause = findManyCall[0].where as Record<string, unknown>;
      expect(whereClause.tier).toBe(2);
    });

    it('should use default sort/order when not provided', async () => {
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralDsarReview.count.mockResolvedValue(0);

      await service.listReviews(TENANT_ID, ACTOR_USER_ID, {
        page: 1,
        pageSize: 20,
      });

      const findManyCall = mockRlsTx.pastoralDsarReview.findMany.mock.calls[0];
      expect(findManyCall[0].orderBy).toEqual({ created_at: 'desc' });
    });

    it('should use custom sort/order when provided', async () => {
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralDsarReview.count.mockResolvedValue(0);

      await service.listReviews(TENANT_ID, ACTOR_USER_ID, {
        page: 1,
        pageSize: 20,
        sort: 'tier',
        order: 'asc',
      });

      const findManyCall = mockRlsTx.pastoralDsarReview.findMany.mock.calls[0];
      expect(findManyCall[0].orderBy).toEqual({ tier: 'asc' });
    });
  });

  // ─── submitDecision — additional branch coverage ───────────────────────

  describe('submitDecision — additional branches', () => {
    it('should throw NotFoundException if review not found', async () => {
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(null);

      await expect(
        service.submitDecision(TENANT_ID, ACTOR_USER_ID, 'nonexistent', {
          decision: 'include',
        }),
      ).rejects.toThrow();
    });

    it('should throw BadRequestException if review already decided', async () => {
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(makeReview({ decision: 'include' }));

      await expect(
        service.submitDecision(TENANT_ID, ACTOR_USER_ID, REVIEW_ID, {
          decision: 'redact',
          justification: 'Some justification text here',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for tier 3 review without cp_access', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(false);
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ tier: 3, decision: null }),
      );

      await expect(
        service.submitDecision(TENANT_ID, ACTOR_USER_ID, REVIEW_ID, {
          decision: 'include',
        }),
      ).rejects.toThrow();
    });

    it('should succeed for redact decision with justification', async () => {
      const review = makeReview();
      const updated = makeReview({
        decision: 'redact',
        justification: 'Names need redaction for privacy reasons',
        reviewed_by_user_id: ACTOR_USER_ID,
      });

      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(review);
      mockRlsTx.pastoralDsarReview.update.mockResolvedValue(updated);

      const result = await service.submitDecision(TENANT_ID, ACTOR_USER_ID, REVIEW_ID, {
        decision: 'redact',
        justification: 'Names need redaction for privacy reasons',
      });

      expect(result.decision).toBe('redact');
    });

    it('should succeed for exclude with valid legal_basis and justification', async () => {
      const review = makeReview();
      const updated = makeReview({
        decision: 'exclude',
        legal_basis: 'third_party_rights',
        justification: 'Third party information that cannot be disclosed',
        reviewed_by_user_id: ACTOR_USER_ID,
      });

      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(review);
      mockRlsTx.pastoralDsarReview.update.mockResolvedValue(updated);

      const result = await service.submitDecision(TENANT_ID, ACTOR_USER_ID, REVIEW_ID, {
        decision: 'exclude',
        legal_basis: 'third_party_rights',
        justification: 'Third party information that cannot be disclosed',
      });

      expect(result.decision).toBe('exclude');
    });

    it('should succeed for exclude with legal_basis=other and long justification', async () => {
      const review = makeReview();
      const justification =
        'This is a detailed justification that is certainly more than twenty characters long';
      const updated = makeReview({
        decision: 'exclude',
        legal_basis: 'other',
        justification,
        reviewed_by_user_id: ACTOR_USER_ID,
      });

      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(review);
      mockRlsTx.pastoralDsarReview.update.mockResolvedValue(updated);

      const result = await service.submitDecision(TENANT_ID, ACTOR_USER_ID, REVIEW_ID, {
        decision: 'exclude',
        legal_basis: 'other',
        justification,
      });

      expect(result.decision).toBe('exclude');
    });

    it('should reject redact with empty justification', async () => {
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(makeReview());

      await expect(
        service.submitDecision(TENANT_ID, ACTOR_USER_ID, REVIEW_ID, {
          decision: 'redact',
          justification: '   ',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject exclude with empty legal_basis', async () => {
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(makeReview());

      await expect(
        service.submitDecision(TENANT_ID, ACTOR_USER_ID, REVIEW_ID, {
          decision: 'exclude',
          legal_basis: '   ',
          justification: 'Some justification that is long enough',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should succeed for tier 3 with cp_access', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(true);
      const review = makeReview({ tier: 3, decision: null });
      const updated = makeReview({
        tier: 3,
        decision: 'include',
        reviewed_by_user_id: ACTOR_USER_ID,
      });

      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(review);
      mockRlsTx.pastoralDsarReview.update.mockResolvedValue(updated);

      const result = await service.submitDecision(TENANT_ID, ACTOR_USER_ID, REVIEW_ID, {
        decision: 'include',
      });

      expect(result.decision).toBe('include');
    });
  });

  // ─── getReviewsByRequest ───────────────────────────────────────────────

  describe('getReviewsByRequest', () => {
    it('should exclude tier 3 when user lacks cp_access', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(false);
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([makeReview({ tier: 1 })]);

      const result = await service.getReviewsByRequest(
        TENANT_ID,
        ACTOR_USER_ID,
        COMPLIANCE_REQUEST_ID,
      );

      expect(result).toHaveLength(1);
      const findManyCall = mockRlsTx.pastoralDsarReview.findMany.mock.calls[0];
      const whereClause = findManyCall[0].where as Record<string, unknown>;
      expect(whereClause.tier).toEqual({ not: 3 });
    });

    it('should include tier 3 when user has cp_access', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(true);
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([
        makeReview({ tier: 1 }),
        makeReview({ tier: 3 }),
      ]);

      const result = await service.getReviewsByRequest(
        TENANT_ID,
        ACTOR_USER_ID,
        COMPLIANCE_REQUEST_ID,
      );

      expect(result).toHaveLength(2);
      const findManyCall = mockRlsTx.pastoralDsarReview.findMany.mock.calls[0];
      const whereClause = findManyCall[0].where as Record<string, unknown>;
      expect(whereClause.tier).toBeUndefined();
    });
  });

  // ─── routeForReview — additional branch coverage ───────────────────────

  describe('routeForReview — additional branches', () => {
    it('should count tier 3 concerns correctly', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(true);
      const tier3Concern = makeConcern({ id: 'c3', tier: 3 });
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([tier3Concern]);
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralDsarReview.create.mockResolvedValue(
        makeReview({ id: 'r3', entity_id: 'c3', tier: 3 }),
      );

      const result = await service.routeForReview(
        TENANT_ID,
        COMPLIANCE_REQUEST_ID,
        STUDENT_ID,
        ACTOR_USER_ID,
      );

      expect(result.tier3Count).toBe(1);
      expect(result.reviewCount).toBe(1);
    });

    it('should count tier 3 cases correctly', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(true);
      mockRlsTx.pastoralCase.findMany.mockResolvedValue([
        {
          id: 'case-t3',
          student_id: STUDENT_ID,
          case_number: 'C-1',
          status: 'open',
          tier: 3,
          opened_reason: 'CP case',
          created_at: NOW,
        },
      ]);
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralDsarReview.create.mockResolvedValue(
        makeReview({ id: 'r-case', entity_type: 'case', entity_id: 'case-t3', tier: 3 }),
      );

      const result = await service.routeForReview(
        TENANT_ID,
        COMPLIANCE_REQUEST_ID,
        STUDENT_ID,
        ACTOR_USER_ID,
      );

      expect(result.tier3Count).toBe(1);
    });

    it('should handle interventions without case (defaults to tier 2)', async () => {
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([
        {
          id: 'int-no-case',
          student_id: STUDENT_ID,
          intervention_type: 'attendance_support',
          continuum_level: 1,
          status: 'active',
          outcome_notes: null,
          next_review_date: NOW,
          created_at: NOW,
          case: null, // No case linked
        },
      ]);
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralDsarReview.create.mockResolvedValue(
        makeReview({ id: 'r-int', entity_type: 'intervention', entity_id: 'int-no-case', tier: 2 }),
      );

      const result = await service.routeForReview(
        TENANT_ID,
        COMPLIANCE_REQUEST_ID,
        STUDENT_ID,
        ACTOR_USER_ID,
      );

      expect(result.reviewCount).toBe(1);
      expect(result.tier3Count).toBe(0);
    });

    it('should handle intervention with tier 3 case', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(true);
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([
        {
          id: 'int-t3',
          student_id: STUDENT_ID,
          intervention_type: 'attendance_support',
          continuum_level: 1,
          status: 'active',
          outcome_notes: null,
          next_review_date: NOW,
          created_at: NOW,
          case: { tier: 3, case_number: 'C-1' },
        },
      ]);
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralDsarReview.create.mockResolvedValue(
        makeReview({ id: 'r-int-t3', entity_type: 'intervention', entity_id: 'int-t3', tier: 3 }),
      );

      const result = await service.routeForReview(
        TENANT_ID,
        COMPLIANCE_REQUEST_ID,
        STUDENT_ID,
        ACTOR_USER_ID,
      );

      expect(result.tier3Count).toBe(1);
    });

    it('should handle referrals without case (defaults to tier 2)', async () => {
      mockRlsTx.pastoralReferral.findMany.mockResolvedValue([
        {
          id: 'ref-no-case',
          student_id: STUDENT_ID,
          referral_type: 'neps',
          status: 'submitted',
          reason: null,
          report_summary: null,
          created_at: NOW,
          case: null,
        },
      ]);
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralDsarReview.create.mockResolvedValue(
        makeReview({ id: 'r-ref', entity_type: 'referral', entity_id: 'ref-no-case', tier: 2 }),
      );

      const result = await service.routeForReview(
        TENANT_ID,
        COMPLIANCE_REQUEST_ID,
        STUDENT_ID,
        ACTOR_USER_ID,
      );

      expect(result.reviewCount).toBe(1);
      expect(result.tier3Count).toBe(0);
    });

    it('should handle referrals with tier 3 case', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(true);
      mockRlsTx.pastoralReferral.findMany.mockResolvedValue([
        {
          id: 'ref-t3',
          student_id: STUDENT_ID,
          referral_type: 'neps',
          status: 'submitted',
          reason: null,
          report_summary: null,
          created_at: NOW,
          case: { tier: 3, case_number: 'C-1' },
        },
      ]);
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralDsarReview.create.mockResolvedValue(
        makeReview({ id: 'r-ref-t3', entity_type: 'referral', entity_id: 'ref-t3', tier: 3 }),
      );

      const result = await service.routeForReview(
        TENANT_ID,
        COMPLIANCE_REQUEST_ID,
        STUDENT_ID,
        ACTOR_USER_ID,
      );

      expect(result.tier3Count).toBe(1);
    });

    it('should use fallback userId when preferred user lacks cp_access', async () => {
      // First call (for resolving query user) returns false
      // Second call (also checking preferred user) returns false
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(false);
      const FALLBACK_ID = '44444444-4444-4444-4444-444444444444';
      mockCpFacade.findFallbackGrantUserId.mockResolvedValue(FALLBACK_ID);

      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([]);

      await service.routeForReview(TENANT_ID, COMPLIANCE_REQUEST_ID, STUDENT_ID, ACTOR_USER_ID);

      // Should have called findFallbackGrantUserId because preferred user lacks cp_access
      expect(mockCpFacade.findFallbackGrantUserId).toHaveBeenCalledWith(TENANT_ID);
    });

    it('should use preferred userId when it has cp_access', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(true);

      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([]);
      mockRlsTx.cpRecord.findMany.mockResolvedValue([]);

      await service.routeForReview(TENANT_ID, COMPLIANCE_REQUEST_ID, STUDENT_ID, ACTOR_USER_ID);

      // Should NOT have called findFallbackGrantUserId
      expect(mockCpFacade.findFallbackGrantUserId).not.toHaveBeenCalled();
    });
  });

  // ─── getReview — additional summary branches ──────────────────────────

  describe('getReview — summary branches', () => {
    it('should return summary for concern not found', async () => {
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ entity_type: 'concern', entity_id: 'gone' }),
      );
      mockRlsTx.pastoralConcern.findFirst.mockResolvedValue(null);

      const result = await service.getReview(TENANT_ID, ACTOR_USER_ID, REVIEW_ID);
      expect(result.record_summary).toBe('Concern record not found');
    });

    it('should return summary for concern with long narrative (>100 chars)', async () => {
      const longNarrative = 'x'.repeat(150);
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ entity_type: 'concern', entity_id: 'c1' }),
      );
      mockRlsTx.pastoralConcern.findFirst.mockResolvedValue({
        id: 'c1',
        category: 'academic',
        severity: 'routine',
        tier: 1,
        created_at: NOW,
        versions: [{ narrative: longNarrative, version_number: 1 }],
      });

      const result = await service.getReview(TENANT_ID, ACTOR_USER_ID, REVIEW_ID);
      expect(result.record_summary).toContain('...');
    });

    it('should return summary for concern with no versions', async () => {
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ entity_type: 'concern', entity_id: 'c1' }),
      );
      mockRlsTx.pastoralConcern.findFirst.mockResolvedValue({
        id: 'c1',
        category: 'academic',
        severity: 'routine',
        tier: 1,
        created_at: NOW,
        versions: [],
      });

      const result = await service.getReview(TENANT_ID, ACTOR_USER_ID, REVIEW_ID);
      expect(result.record_summary).toContain('Concern (academic, routine):');
    });

    it('should return CP record not found', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(true);
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ entity_type: 'cp_record', entity_id: 'gone', tier: 3 }),
      );
      mockRlsTx.cpRecord.findFirst.mockResolvedValue(null);

      const result = await service.getReview(TENANT_ID, ACTOR_USER_ID, REVIEW_ID);
      expect(result.record_summary).toBe('CP record not found');
    });

    it('should return CP record summary with long narrative', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(true);
      const longNarrative = 'y'.repeat(150);
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ entity_type: 'cp_record', entity_id: 'cp1', tier: 3 }),
      );
      mockRlsTx.cpRecord.findFirst.mockResolvedValue({
        id: 'cp1',
        record_type: 'concern',
        narrative: longNarrative,
        created_at: NOW,
      });

      const result = await service.getReview(TENANT_ID, ACTOR_USER_ID, REVIEW_ID);
      expect(result.record_summary).toContain('...');
      expect(result.record_summary).toContain('CP Record (concern):');
    });

    it('should return case not found summary', async () => {
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ entity_type: 'case', entity_id: 'gone' }),
      );
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue(null);

      const result = await service.getReview(TENANT_ID, ACTOR_USER_ID, REVIEW_ID);
      expect(result.record_summary).toBe('Case record not found');
    });

    it('should return case summary with long opened_reason', async () => {
      const longReason = 'r'.repeat(150);
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ entity_type: 'case', entity_id: 'c1' }),
      );
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue({
        id: 'c1',
        case_number: 'C-1',
        tier: 2,
        opened_reason: longReason,
        created_at: NOW,
      });

      const result = await service.getReview(TENANT_ID, ACTOR_USER_ID, REVIEW_ID);
      expect(result.record_summary).toContain('...');
    });

    it('should return intervention not found summary', async () => {
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ entity_type: 'intervention', entity_id: 'gone' }),
      );
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(null);

      const result = await service.getReview(TENANT_ID, ACTOR_USER_ID, REVIEW_ID);
      expect(result.record_summary).toBe('Intervention record not found');
    });

    it('should return intervention summary without case_number', async () => {
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ entity_type: 'intervention', entity_id: 'i1' }),
      );
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue({
        id: 'i1',
        intervention_type: 'time_out',
        continuum_level: 2,
        outcome_notes: null,
        case: null,
      });

      const result = await service.getReview(TENANT_ID, ACTOR_USER_ID, REVIEW_ID);
      expect(result.record_summary).toContain('Intervention (time_out):');
      expect(result.record_summary).toContain('Continuum level 2');
    });

    it('should return intervention summary with long outcome_notes', async () => {
      const longNotes = 'n'.repeat(150);
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ entity_type: 'intervention', entity_id: 'i1' }),
      );
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue({
        id: 'i1',
        intervention_type: 'time_out',
        continuum_level: 2,
        outcome_notes: longNotes,
        case: { case_number: 'C-1' },
      });

      const result = await service.getReview(TENANT_ID, ACTOR_USER_ID, REVIEW_ID);
      expect(result.record_summary).toContain('...');
    });

    it('should return referral not found summary', async () => {
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ entity_type: 'referral', entity_id: 'gone' }),
      );
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(null);

      const result = await service.getReview(TENANT_ID, ACTOR_USER_ID, REVIEW_ID);
      expect(result.record_summary).toBe('Referral record not found');
    });

    it('should return referral summary fallback to reason when report_summary is empty', async () => {
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ entity_type: 'referral', entity_id: 'r1' }),
      );
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue({
        id: 'r1',
        referral_type: 'counsellor',
        status: 'submitted',
        reason: 'Student needs support',
        report_summary: null,
        case: null,
      });

      const result = await service.getReview(TENANT_ID, ACTOR_USER_ID, REVIEW_ID);
      expect(result.record_summary).toContain('Student needs support');
    });

    it('should return referral summary fallback to status when both report_summary and reason are empty', async () => {
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ entity_type: 'referral', entity_id: 'r1' }),
      );
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue({
        id: 'r1',
        referral_type: 'counsellor',
        status: 'submitted',
        reason: null,
        report_summary: null,
        case: null,
      });

      const result = await service.getReview(TENANT_ID, ACTOR_USER_ID, REVIEW_ID);
      expect(result.record_summary).toContain('submitted');
    });

    it('should return checkin not found summary', async () => {
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ entity_type: 'checkin', entity_id: 'gone' }),
      );
      mockRlsTx.studentCheckin.findFirst.mockResolvedValue(null);

      const result = await service.getReview(TENANT_ID, ACTOR_USER_ID, REVIEW_ID);
      expect(result.record_summary).toBe('Check-in record not found');
    });

    it('should return checkin summary with mood score when no freeform text', async () => {
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ entity_type: 'checkin', entity_id: 'chk' }),
      );
      mockRlsTx.studentCheckin.findFirst.mockResolvedValue({
        id: 'chk',
        mood_score: 3,
        freeform_text: null,
        flagged: false,
        flag_reason: null,
        checkin_date: NOW,
        created_at: NOW,
      });

      const result = await service.getReview(TENANT_ID, ACTOR_USER_ID, REVIEW_ID);
      expect(result.record_summary).toContain('Mood 3');
    });

    it('should return checkin summary with flag info', async () => {
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ entity_type: 'checkin', entity_id: 'chk' }),
      );
      mockRlsTx.studentCheckin.findFirst.mockResolvedValue({
        id: 'chk',
        mood_score: 1,
        freeform_text: null,
        flagged: true,
        flag_reason: 'keyword_match',
        checkin_date: NOW,
        created_at: NOW,
      });

      const result = await service.getReview(TENANT_ID, ACTOR_USER_ID, REVIEW_ID);
      expect(result.record_summary).toContain('flagged keyword_match');
    });

    it('should return checkin summary with flag but no flag_reason', async () => {
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ entity_type: 'checkin', entity_id: 'chk' }),
      );
      mockRlsTx.studentCheckin.findFirst.mockResolvedValue({
        id: 'chk',
        mood_score: 2,
        freeform_text: null,
        flagged: true,
        flag_reason: null,
        checkin_date: NOW,
        created_at: NOW,
      });

      const result = await service.getReview(TENANT_ID, ACTOR_USER_ID, REVIEW_ID);
      expect(result.record_summary).toContain('flagged');
    });

    it('should return checkin summary with long freeform text', async () => {
      const longText = 'z'.repeat(150);
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ entity_type: 'checkin', entity_id: 'chk' }),
      );
      mockRlsTx.studentCheckin.findFirst.mockResolvedValue({
        id: 'chk',
        mood_score: 1,
        freeform_text: longText,
        flagged: false,
        flag_reason: null,
        checkin_date: NOW,
        created_at: NOW,
      });

      const result = await service.getReview(TENANT_ID, ACTOR_USER_ID, REVIEW_ID);
      expect(result.record_summary).toContain('...');
    });

    it('should allow tier 3 review when user has cp_access', async () => {
      mockCpFacade.hasActiveCpAccess.mockResolvedValue(true);
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ tier: 3, entity_type: 'cp_record', entity_id: 'cp1' }),
      );
      mockRlsTx.cpRecord.findFirst.mockResolvedValue({
        id: 'cp1',
        record_type: 'concern',
        narrative: 'Short narrative',
        created_at: NOW,
      });

      const result = await service.getReview(TENANT_ID, ACTOR_USER_ID, REVIEW_ID);
      expect(result.record_summary).toContain('CP Record');
    });
  });

  // ─── getReviewedRecords — additional branches ─────────────────────────

  describe('getReviewedRecords — additional branches', () => {
    it('should handle redaction with no justification (redaction_note is undefined)', async () => {
      const review = makeReview({
        id: 'r-redact',
        decision: 'redact',
        entity_type: 'concern',
        entity_id: 'c1',
        tier: 1,
        justification: null,
        reviewed_by_user_id: ACTOR_USER_ID,
      });
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([review]);
      mockRlsTx.pastoralConcern.findFirst.mockResolvedValue({
        id: 'c1',
        category: 'academic',
        severity: 'routine',
        tier: 1,
        created_at: NOW,
        versions: [{ narrative: 'Test text', version_number: 1 }],
      });

      const results = await service.getReviewedRecords(TENANT_ID, COMPLIANCE_REQUEST_ID);

      expect(results).toHaveLength(1);
      expect(results[0]!.record_data.narrative).toBe('[REDACTED]');
      expect(results[0]!.redaction_note).toBeUndefined();
    });

    it('should handle include decision (no redaction applied)', async () => {
      const review = makeReview({
        id: 'r-inc',
        decision: 'include',
        entity_type: 'case',
        entity_id: 'case-1',
        reviewed_by_user_id: ACTOR_USER_ID,
      });
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([review]);
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue({
        id: 'case-1',
        case_number: 'C-1',
        tier: 2,
        opened_reason: 'Original reason',
        status: 'open',
        created_at: NOW,
      });

      const results = await service.getReviewedRecords(TENANT_ID, COMPLIANCE_REQUEST_ID);

      expect(results).toHaveLength(1);
      expect(results[0]!.record_data.opened_reason).toBe('Original reason');
      expect(results[0]!.redaction_note).toBeUndefined();
    });

    it('should handle missing entity record (returns null from fetch)', async () => {
      const review = makeReview({
        id: 'r-gone',
        decision: 'include',
        entity_type: 'concern',
        entity_id: 'c-gone',
        reviewed_by_user_id: ACTOR_USER_ID,
      });
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([review]);
      mockRlsTx.pastoralConcern.findFirst.mockResolvedValue(null);

      const results = await service.getReviewedRecords(TENANT_ID, COMPLIANCE_REQUEST_ID);

      // Should be skipped because fetchEntityRecord returns null
      expect(results).toHaveLength(0);
    });

    it('should handle getRedactionFields default case', async () => {
      const review = makeReview({
        id: 'r-unk',
        decision: 'redact',
        entity_type: 'unknown_type',
        entity_id: 'u-1',
        reviewed_by_user_id: ACTOR_USER_ID,
      });
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([review]);

      // fetchEntityRecord returns null for unknown types, so it skips
      const results = await service.getReviewedRecords(TENANT_ID, COMPLIANCE_REQUEST_ID);
      expect(results).toHaveLength(0);
    });

    it('should fetch entity records for interventions and referrals', async () => {
      const intReview = makeReview({
        id: 'r-int',
        decision: 'include',
        entity_type: 'intervention',
        entity_id: 'i-1',
        reviewed_by_user_id: ACTOR_USER_ID,
      });
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([intReview]);
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue({
        id: 'i-1',
        intervention_type: 'time_out',
        continuum_level: 2,
        status: 'active',
        outcome_notes: 'Good progress',
        next_review_date: NOW,
        created_at: NOW,
        case: { tier: 2, case_number: 'C-1' },
      });

      const results = await service.getReviewedRecords(TENANT_ID, COMPLIANCE_REQUEST_ID);

      expect(results).toHaveLength(1);
      expect(results[0]!.record_data.intervention_type).toBe('time_out');
      expect(results[0]!.record_data.case_number).toBe('C-1');
    });

    it('should fetch referral entity records with missing case', async () => {
      const refReview = makeReview({
        id: 'r-ref',
        decision: 'include',
        entity_type: 'referral',
        entity_id: 'ref-1',
        reviewed_by_user_id: ACTOR_USER_ID,
      });
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([refReview]);
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue({
        id: 'ref-1',
        referral_type: 'neps',
        status: 'submitted',
        reason: 'Student needs assessment',
        report_summary: null,
        created_at: NOW,
        case: null,
      });

      const results = await service.getReviewedRecords(TENANT_ID, COMPLIANCE_REQUEST_ID);

      expect(results).toHaveLength(1);
      expect(results[0]!.record_data.case_number).toBeNull();
      expect(results[0]!.record_data.tier).toBe(2);
    });

    it('should fetch checkin entity records', async () => {
      const chkReview = makeReview({
        id: 'r-chk',
        decision: 'include',
        entity_type: 'checkin',
        entity_id: 'chk-1',
        reviewed_by_user_id: ACTOR_USER_ID,
      });
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([chkReview]);
      mockRlsTx.studentCheckin.findFirst.mockResolvedValue({
        id: 'chk-1',
        mood_score: 4,
        freeform_text: 'Good day',
        flagged: false,
        flag_reason: null,
        checkin_date: NOW,
        created_at: NOW,
      });

      const results = await service.getReviewedRecords(TENANT_ID, COMPLIANCE_REQUEST_ID);

      expect(results).toHaveLength(1);
      expect(results[0]!.record_data.mood_score).toBe(4);
      expect(results[0]!.record_data.freeform_text).toBe('Good day');
    });

    it('should not create RLS client with user_id when reviewed_by_user_id is null (non-tier3)', async () => {
      const review = makeReview({
        id: 'r-no-reviewer',
        decision: 'include',
        entity_type: 'concern',
        entity_id: 'c1',
        tier: 1,
        reviewed_by_user_id: null,
      });
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([review]);
      mockRlsTx.pastoralConcern.findFirst.mockResolvedValue({
        id: 'c1',
        category: 'academic',
        severity: 'routine',
        tier: 1,
        created_at: NOW,
        versions: [{ narrative: 'Test', version_number: 1 }],
      });

      const results = await service.getReviewedRecords(TENANT_ID, COMPLIANCE_REQUEST_ID);

      expect(results).toHaveLength(1);
    });

    it('should handle intervention entity record with null case', async () => {
      const intReview = makeReview({
        id: 'r-int-nc',
        decision: 'include',
        entity_type: 'intervention',
        entity_id: 'i-nc',
        reviewed_by_user_id: ACTOR_USER_ID,
      });
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([intReview]);
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue({
        id: 'i-nc',
        intervention_type: 'counselling',
        continuum_level: 1,
        status: 'active',
        outcome_notes: null,
        next_review_date: NOW,
        created_at: NOW,
        case: null,
      });

      const results = await service.getReviewedRecords(TENANT_ID, COMPLIANCE_REQUEST_ID);

      expect(results).toHaveLength(1);
      expect(results[0]!.record_data.case_number).toBeNull();
      expect(results[0]!.record_data.tier).toBe(2);
    });

    it('should apply redaction to checkin freeform_text field', async () => {
      const chkReview = makeReview({
        id: 'r-chk-redact',
        decision: 'redact',
        entity_type: 'checkin',
        entity_id: 'chk-r',
        justification: 'Contains identifying info',
        reviewed_by_user_id: ACTOR_USER_ID,
      });
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([chkReview]);
      mockRlsTx.studentCheckin.findFirst.mockResolvedValue({
        id: 'chk-r',
        mood_score: 2,
        freeform_text: 'Private details here',
        flagged: false,
        flag_reason: null,
        checkin_date: NOW,
        created_at: NOW,
      });

      const results = await service.getReviewedRecords(TENANT_ID, COMPLIANCE_REQUEST_ID);

      expect(results).toHaveLength(1);
      expect(results[0]!.record_data.freeform_text).toBe('[REDACTED]');
      expect(results[0]!.redaction_note).toBe('Contains identifying info');
    });

    it('should apply redaction to referral reason and report_summary', async () => {
      const refReview = makeReview({
        id: 'r-ref-redact',
        decision: 'redact',
        entity_type: 'referral',
        entity_id: 'ref-r',
        justification: 'Third party info',
        reviewed_by_user_id: ACTOR_USER_ID,
      });
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([refReview]);
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue({
        id: 'ref-r',
        referral_type: 'neps',
        status: 'report_received',
        reason: 'Sensitive reason',
        report_summary: 'Sensitive summary',
        created_at: NOW,
        case: { tier: 1, case_number: 'PC-1' },
      });

      const results = await service.getReviewedRecords(TENANT_ID, COMPLIANCE_REQUEST_ID);

      expect(results).toHaveLength(1);
      expect(results[0]!.record_data.reason).toBe('[REDACTED]');
      expect(results[0]!.record_data.report_summary).toBe('[REDACTED]');
    });

    it('should apply redaction to intervention outcome_notes', async () => {
      const intReview = makeReview({
        id: 'r-int-redact',
        decision: 'redact',
        entity_type: 'intervention',
        entity_id: 'int-r',
        justification: 'Third party info',
        reviewed_by_user_id: ACTOR_USER_ID,
      });
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([intReview]);
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue({
        id: 'int-r',
        intervention_type: 'behavioural',
        continuum_level: 2,
        status: 'achieved',
        outcome_notes: 'Contains third party data',
        next_review_date: NOW,
        created_at: NOW,
        case: { tier: 2, case_number: 'PC-2' },
      });

      const results = await service.getReviewedRecords(TENANT_ID, COMPLIANCE_REQUEST_ID);

      expect(results).toHaveLength(1);
      expect(results[0]!.record_data.outcome_notes).toBe('[REDACTED]');
    });

    it('should apply redaction to case opened_reason', async () => {
      const caseReview = makeReview({
        id: 'r-case-redact',
        decision: 'redact',
        entity_type: 'case',
        entity_id: 'case-r',
        justification: 'Third party ref',
        reviewed_by_user_id: ACTOR_USER_ID,
      });
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([caseReview]);
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue({
        id: 'case-r',
        case_number: 'PC-3',
        status: 'open',
        tier: 1,
        opened_reason: 'Reason with third party info',
        created_at: NOW,
      });

      const results = await service.getReviewedRecords(TENANT_ID, COMPLIANCE_REQUEST_ID);

      expect(results).toHaveLength(1);
      expect(results[0]!.record_data.opened_reason).toBe('[REDACTED]');
    });
  });

  // ─── getReview — unknown entity type summary ──────────────────────────────

  describe('getReview — unknown entity type', () => {
    it('should return unknown record type summary for unrecognised entity_type', async () => {
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(
        makeReview({ entity_type: 'something_new', entity_id: 'x1' }),
      );

      const result = await service.getReview(TENANT_ID, ACTOR_USER_ID, REVIEW_ID);
      expect(result.record_summary).toBe('Unknown record type');
    });
  });

  // ─── listReviews — compliance_request_id filter ───────────────────────────

  describe('listReviews — compliance_request_id filter', () => {
    it('should include compliance_request_id in where clause when provided', async () => {
      mockRlsTx.pastoralDsarReview.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralDsarReview.count.mockResolvedValue(0);

      await service.listReviews(TENANT_ID, ACTOR_USER_ID, {
        compliance_request_id: COMPLIANCE_REQUEST_ID,
        page: 1,
        pageSize: 20,
      });

      expect(mockRlsTx.pastoralDsarReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            compliance_request_id: COMPLIANCE_REQUEST_ID,
          }),
        }),
      );
    });
  });

  // ─── validateDecisionDto ��� include decision ───────────────────────────────

  describe('submitDecision — include decision', () => {
    it('should succeed for include without legal_basis or justification', async () => {
      mockRlsTx.pastoralDsarReview.findFirst.mockResolvedValue(makeReview({ decision: null }));
      mockRlsTx.pastoralDsarReview.update.mockResolvedValue(makeReview({ decision: 'include' }));

      const result = await service.submitDecision(TENANT_ID, ACTOR_USER_ID, REVIEW_ID, {
        decision: 'include',
      });

      expect(result.decision).toBe('include');
    });
  });
});
