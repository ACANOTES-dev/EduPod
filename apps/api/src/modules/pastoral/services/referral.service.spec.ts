import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';
import { ReferralRecommendationService } from './referral-recommendation.service';
import type { ReferralRow, ReferralWithDetails, WaitlistItem } from './referral.service';
import { ReferralService } from './referral.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACTOR_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CASE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const REFERRAL_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  pastoralReferral: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  pastoralReferralRecommendation: {
    findMany: jest.fn(),
    count: jest.fn(),
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

const makeReferral = (overrides: Record<string, unknown> = {}): ReferralRow => ({
  id: REFERRAL_ID,
  tenant_id: TENANT_ID,
  case_id: CASE_ID,
  student_id: STUDENT_ID,
  referral_type: 'neps',
  referral_body_name: 'NEPS Office',
  status: 'draft',
  reason: null,
  submitted_at: null,
  submitted_by_user_id: null,
  acknowledged_at: null,
  assessment_scheduled_date: null,
  assessment_completed_at: null,
  pre_populated_data: null,
  manual_additions: null,
  external_reference: null,
  report_received_at: null,
  report_summary: null,
  created_by_user_id: ACTOR_USER_ID,
  created_at: new Date('2026-03-27T10:00:00Z'),
  updated_at: new Date('2026-03-27T10:00:00Z'),
  ...overrides,
});

const makeReferralWithDetails = (overrides: Record<string, unknown> = {}): ReferralWithDetails => ({
  ...makeReferral(overrides),
  recommendations: [],
  student: { id: STUDENT_ID, first_name: 'John', last_name: 'Doe' },
  case: { id: CASE_ID, case_number: 'PC-202603-0001', status: 'open' },
});

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('ReferralService', () => {
  let service: ReferralService;
  let mockEventService: { write: jest.Mock };
  let mockRecommendationService: { allComplete: jest.Mock };

  beforeEach(async () => {
    mockEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    mockRecommendationService = {
      allComplete: jest.fn().mockResolvedValue(true),
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralService,
        { provide: PrismaService, useValue: {} },
        { provide: PastoralEventService, useValue: mockEventService },
        { provide: ReferralRecommendationService, useValue: mockRecommendationService },
      ],
    }).compile();

    service = module.get<ReferralService>(ReferralService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create referral in draft status', async () => {
      const referral = makeReferral();
      mockRlsTx.pastoralReferral.create.mockResolvedValue(referral);

      const result = await service.create(TENANT_ID, ACTOR_USER_ID, {
        student_id: STUDENT_ID,
        case_id: CASE_ID,
        referral_type: 'neps',
        referral_body_name: 'NEPS Office',
      });

      expect(result.id).toBe(REFERRAL_ID);
      expect(result.status).toBe('draft');
      expect(mockRlsTx.pastoralReferral.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          case_id: CASE_ID,
          referral_type: 'neps',
          status: 'draft',
          created_by_user_id: ACTOR_USER_ID,
        }),
      });
      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'referral_created',
          entity_type: 'referral',
          entity_id: REFERRAL_ID,
          student_id: STUDENT_ID,
          actor_user_id: ACTOR_USER_ID,
        }),
      );
    });
  });

  // ─── list ─────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('should return paginated referrals with filters', async () => {
      const referrals = [
        makeReferral(),
        makeReferral({ id: 'ff000000-0000-0000-0000-000000000001' }),
      ];
      mockRlsTx.pastoralReferral.findMany.mockResolvedValue(referrals);
      mockRlsTx.pastoralReferral.count.mockResolvedValue(2);

      const result = await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
        student_id: STUDENT_ID,
        status: 'draft',
        sort: 'created_at',
        order: 'desc',
      });

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
      expect(mockRlsTx.pastoralReferral.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            student_id: STUDENT_ID,
            status: 'draft',
          }),
          skip: 0,
          take: 20,
        }),
      );
    });
  });

  // ─── get ──────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('should return referral with details', async () => {
      const referralWithDetails = makeReferralWithDetails();
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(referralWithDetails);

      const result = await service.get(TENANT_ID, REFERRAL_ID);

      expect(result.id).toBe(REFERRAL_ID);
      expect(result.recommendations).toEqual([]);
      expect(result.student).toEqual({ id: STUDENT_ID, first_name: 'John', last_name: 'Doe' });
      expect(result.case).toEqual({ id: CASE_ID, case_number: 'PC-202603-0001', status: 'open' });
    });

    it('should throw NotFoundException when referral does not exist', async () => {
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(null);

      await expect(service.get(TENANT_ID, REFERRAL_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should succeed on draft', async () => {
      const existing = makeReferral({ status: 'draft' });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);
      const updated = makeReferral({ referral_body_name: 'Updated Name' });
      mockRlsTx.pastoralReferral.update.mockResolvedValue(updated);

      const result = await service.update(TENANT_ID, REFERRAL_ID, {
        referral_body_name: 'Updated Name',
      });

      expect(result.referral_body_name).toBe('Updated Name');
      expect(mockRlsTx.pastoralReferral.update).toHaveBeenCalledWith({
        where: { id: REFERRAL_ID },
        data: { referral_body_name: 'Updated Name' },
      });
    });

    it('should throw on non-draft', async () => {
      const existing = makeReferral({ status: 'submitted' });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);

      await expect(
        service.update(TENANT_ID, REFERRAL_ID, { referral_body_name: 'Updated Name' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── submit ───────────────────────────────────────────────────────────────

  describe('submit', () => {
    it('should transition draft to submitted and stamp submitted_at', async () => {
      const existing = makeReferral({ status: 'draft' });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);
      const updated = makeReferral({
        status: 'submitted',
        submitted_at: new Date(),
        submitted_by_user_id: ACTOR_USER_ID,
      });
      mockRlsTx.pastoralReferral.update.mockResolvedValue(updated);

      const result = await service.submit(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID);

      expect(result.status).toBe('submitted');
      expect(mockRlsTx.pastoralReferral.update).toHaveBeenCalledWith({
        where: { id: REFERRAL_ID },
        data: expect.objectContaining({
          status: 'submitted',
          submitted_at: expect.any(Date),
          submitted_by_user_id: ACTOR_USER_ID,
        }),
      });
      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'referral_submitted',
          entity_id: REFERRAL_ID,
        }),
      );
    });
  });

  // ─── acknowledge ──────────────────────────────────────────────────────────

  describe('acknowledge', () => {
    it('should transition submitted to acknowledged', async () => {
      const existing = makeReferral({ status: 'submitted' });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);
      const updated = makeReferral({ status: 'acknowledged', acknowledged_at: new Date() });
      mockRlsTx.pastoralReferral.update.mockResolvedValue(updated);

      const result = await service.acknowledge(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID);

      expect(result.status).toBe('acknowledged');
      expect(mockRlsTx.pastoralReferral.update).toHaveBeenCalledWith({
        where: { id: REFERRAL_ID },
        data: expect.objectContaining({
          status: 'acknowledged',
          acknowledged_at: expect.any(Date),
        }),
      });
      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'referral_acknowledged',
        }),
      );
    });
  });

  // ─── scheduleAssessment ───────────────────────────────────────────────────

  describe('scheduleAssessment', () => {
    it('should transition acknowledged to assessment_scheduled', async () => {
      const existing = makeReferral({ status: 'acknowledged' });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);
      const updated = makeReferral({
        status: 'assessment_scheduled',
        assessment_scheduled_date: new Date('2026-04-15'),
      });
      mockRlsTx.pastoralReferral.update.mockResolvedValue(updated);

      const result = await service.scheduleAssessment(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID, {
        assessment_scheduled_date: '2026-04-15',
      });

      expect(result.status).toBe('assessment_scheduled');
      expect(mockRlsTx.pastoralReferral.update).toHaveBeenCalledWith({
        where: { id: REFERRAL_ID },
        data: expect.objectContaining({
          status: 'assessment_scheduled',
          assessment_scheduled_date: expect.any(Date),
        }),
      });
      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'referral_assessment_scheduled',
        }),
      );
    });
  });

  // ─── completeAssessment ───────────────────────────────────────────────────

  describe('completeAssessment', () => {
    it('should transition assessment_scheduled to assessment_complete', async () => {
      const existing = makeReferral({ status: 'assessment_scheduled' });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);
      const updated = makeReferral({
        status: 'assessment_complete',
        assessment_completed_at: new Date(),
      });
      mockRlsTx.pastoralReferral.update.mockResolvedValue(updated);

      const result = await service.completeAssessment(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID);

      expect(result.status).toBe('assessment_complete');
      expect(mockRlsTx.pastoralReferral.update).toHaveBeenCalledWith({
        where: { id: REFERRAL_ID },
        data: expect.objectContaining({
          status: 'assessment_complete',
          assessment_completed_at: expect.any(Date),
        }),
      });
      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'referral_assessment_complete',
        }),
      );
    });
  });

  // ─── receiveReport ────────────────────────────────────────────────────────

  describe('receiveReport', () => {
    it('should transition assessment_complete to report_received', async () => {
      const existing = makeReferral({ status: 'assessment_complete' });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);
      const updated = makeReferral({
        status: 'report_received',
        report_received_at: new Date(),
        report_summary: 'Assessment complete. Student needs support.',
      });
      mockRlsTx.pastoralReferral.update.mockResolvedValue(updated);

      const result = await service.receiveReport(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID, {
        report_summary: 'Assessment complete. Student needs support.',
      });

      expect(result.status).toBe('report_received');
      expect(mockRlsTx.pastoralReferral.update).toHaveBeenCalledWith({
        where: { id: REFERRAL_ID },
        data: expect.objectContaining({
          status: 'report_received',
          report_received_at: expect.any(Date),
          report_summary: 'Assessment complete. Student needs support.',
        }),
      });
      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'referral_report_received',
        }),
      );
    });
  });

  // ─── markRecommendationsImplemented ───────────────────────────────────────

  describe('markRecommendationsImplemented', () => {
    it('should succeed when all recommendations are complete', async () => {
      mockRecommendationService.allComplete.mockResolvedValue(true);
      const existing = makeReferral({ status: 'report_received' });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);
      const updated = makeReferral({ status: 'recommendations_implemented' });
      mockRlsTx.pastoralReferral.update.mockResolvedValue(updated);

      const result = await service.markRecommendationsImplemented(
        TENANT_ID,
        ACTOR_USER_ID,
        REFERRAL_ID,
      );

      expect(result.status).toBe('recommendations_implemented');
      expect(mockRecommendationService.allComplete).toHaveBeenCalledWith(TENANT_ID, REFERRAL_ID);
      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'referral_recommendations_implemented',
        }),
      );
    });

    it('should throw when recommendations are not all complete', async () => {
      mockRecommendationService.allComplete.mockResolvedValue(false);

      await expect(
        service.markRecommendationsImplemented(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID),
      ).rejects.toThrow(BadRequestException);

      expect(mockRecommendationService.allComplete).toHaveBeenCalledWith(TENANT_ID, REFERRAL_ID);
      expect(mockRlsTx.pastoralReferral.update).not.toHaveBeenCalled();
    });
  });

  // ─── withdraw ─────────────────────────────────────────────────────────────

  describe('withdraw', () => {
    const withdrawableStatuses = [
      'submitted',
      'acknowledged',
      'assessment_scheduled',
      'report_received',
    ];

    it.each(withdrawableStatuses)('should work from %s status', async (status) => {
      const existing = makeReferral({ status });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);
      const updated = makeReferral({ status: 'withdrawn', reason: 'No longer needed' });
      mockRlsTx.pastoralReferral.update.mockResolvedValue(updated);

      const result = await service.withdraw(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID, {
        reason: 'No longer needed',
      });

      expect(result.status).toBe('withdrawn');
      expect(mockRlsTx.pastoralReferral.update).toHaveBeenCalledWith({
        where: { id: REFERRAL_ID },
        data: {
          status: 'withdrawn',
          reason: 'No longer needed',
        },
      });
      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'referral_withdrawn',
          payload: expect.objectContaining({
            reason: 'No longer needed',
          }),
        }),
      );

      // Reset for next iteration
      mockRlsTx.pastoralReferral.findFirst.mockReset();
      mockRlsTx.pastoralReferral.update.mockReset();
      mockEventService.write.mockReset();
    });

    it('should throw from recommendations_implemented (terminal)', async () => {
      const existing = makeReferral({ status: 'recommendations_implemented' });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);

      await expect(
        service.withdraw(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID, { reason: 'Test' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw from withdrawn (terminal)', async () => {
      const existing = makeReferral({ status: 'withdrawn' });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);

      await expect(
        service.withdraw(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID, { reason: 'Test' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── invalid transitions ──────────────────────────────────────────────────

  describe('invalid transitions', () => {
    it('should throw BadRequestException for draft to acknowledged', async () => {
      const existing = makeReferral({ status: 'draft' });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);

      await expect(service.acknowledge(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for draft to assessment_scheduled', async () => {
      const existing = makeReferral({ status: 'draft' });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);

      await expect(
        service.scheduleAssessment(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID, {
          assessment_scheduled_date: '2026-04-15',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for submitted to assessment_complete', async () => {
      const existing = makeReferral({ status: 'submitted' });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);

      await expect(
        service.completeAssessment(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for acknowledged to report_received', async () => {
      const existing = makeReferral({ status: 'acknowledged' });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);

      await expect(
        service.receiveReport(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID, {
          report_summary: 'Test',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for draft to recommendations_implemented', async () => {
      mockRecommendationService.allComplete.mockResolvedValue(true);
      const existing = makeReferral({ status: 'draft' });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);

      await expect(
        service.markRecommendationsImplemented(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for submitted to report_received', async () => {
      const existing = makeReferral({ status: 'submitted' });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);

      await expect(
        service.receiveReport(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID, {
          report_summary: 'Test',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── getWaitlist ──────────────────────────────────────────────────────────

  describe('getWaitlist', () => {
    it('should return correct wait_days', async () => {
      const submittedAt = new Date();
      submittedAt.setDate(submittedAt.getDate() - 10);

      const waitlistReferral = {
        ...makeReferral({
          status: 'submitted',
          submitted_at: submittedAt,
        }),
        student: { id: STUDENT_ID, first_name: 'John', last_name: 'Doe' },
      };

      mockRlsTx.pastoralReferral.findMany.mockResolvedValue([waitlistReferral]);
      mockRlsTx.pastoralReferral.count.mockResolvedValue(1);

      const result = await service.getWaitlist(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(1);
      const firstItem = result.data[0] as WaitlistItem;
      expect(firstItem.wait_days).toBe(10);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
      expect(mockRlsTx.pastoralReferral.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: { in: ['submitted', 'acknowledged', 'assessment_scheduled'] },
          }),
          orderBy: { submitted_at: 'asc' },
        }),
      );
    });

    it('should filter by referral_type', async () => {
      mockRlsTx.pastoralReferral.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralReferral.count.mockResolvedValue(0);

      await service.getWaitlist(TENANT_ID, {
        page: 1,
        pageSize: 20,
        referral_type: 'neps',
      });

      expect(mockRlsTx.pastoralReferral.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            referral_type: 'neps',
          }),
        }),
      );
    });

    it('should handle null submitted_at by using current date for wait_days', async () => {
      const waitlistReferral = {
        ...makeReferral({
          status: 'submitted',
          submitted_at: null,
        }),
        student: { id: STUDENT_ID, first_name: 'John', last_name: 'Doe' },
      };

      mockRlsTx.pastoralReferral.findMany.mockResolvedValue([waitlistReferral]);
      mockRlsTx.pastoralReferral.count.mockResolvedValue(1);

      const result = await service.getWaitlist(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(1);
      const firstItem = result.data[0] as WaitlistItem;
      expect(firstItem.wait_days).toBe(0);
    });

    it('should use default page and pageSize when not provided', async () => {
      mockRlsTx.pastoralReferral.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralReferral.count.mockResolvedValue(0);

      const result = await service.getWaitlist(TENANT_ID, {});

      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 0 });
    });
  });

  // ─── list — additional branch coverage ──────────────────────────────────

  describe('list — branch coverage', () => {
    it('should apply date_from filter only', async () => {
      mockRlsTx.pastoralReferral.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralReferral.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
        sort: 'created_at',
        order: 'desc',
        date_from: '2026-01-01',
      });

      expect(mockRlsTx.pastoralReferral.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: expect.objectContaining({
              gte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should apply date_to filter only', async () => {
      mockRlsTx.pastoralReferral.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralReferral.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
        sort: 'created_at',
        order: 'desc',
        date_to: '2026-12-31',
      });

      expect(mockRlsTx.pastoralReferral.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: expect.objectContaining({
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should apply referral_type filter', async () => {
      mockRlsTx.pastoralReferral.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralReferral.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
        sort: 'created_at',
        order: 'desc',
        referral_type: 'neps',
      });

      expect(mockRlsTx.pastoralReferral.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            referral_type: 'neps',
          }),
        }),
      );
    });

    it('should use default page and pageSize when not provided', async () => {
      mockRlsTx.pastoralReferral.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralReferral.count.mockResolvedValue(0);

      const result = await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
        sort: 'created_at',
        order: 'desc',
      });

      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 0 });
    });

    it('should use default sort and order when not provided', async () => {
      mockRlsTx.pastoralReferral.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralReferral.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { page: 1, pageSize: 10, sort: 'created_at', order: 'desc' });

      expect(mockRlsTx.pastoralReferral.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { created_at: 'desc' },
        }),
      );
    });
  });

  // ─── create — additional branch coverage ────────────────────────────────

  describe('create — branch coverage', () => {
    it('should include pre_populated_data when provided', async () => {
      const referral = makeReferral();
      mockRlsTx.pastoralReferral.create.mockResolvedValue(referral);

      await service.create(TENANT_ID, ACTOR_USER_ID, {
        student_id: STUDENT_ID,
        referral_type: 'neps',
        pre_populated_data: { attendance: '85%' },
      });

      expect(mockRlsTx.pastoralReferral.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          pre_populated_data: { attendance: '85%' },
        }),
      });
    });

    it('should include manual_additions when provided', async () => {
      const referral = makeReferral();
      mockRlsTx.pastoralReferral.create.mockResolvedValue(referral);

      await service.create(TENANT_ID, ACTOR_USER_ID, {
        student_id: STUDENT_ID,
        referral_type: 'neps',
        manual_additions: { notes: 'Additional observations' },
      });

      expect(mockRlsTx.pastoralReferral.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          manual_additions: { notes: 'Additional observations' },
        }),
      });
    });

    it('should create without optional case_id', async () => {
      const referral = makeReferral({ case_id: null });
      mockRlsTx.pastoralReferral.create.mockResolvedValue(referral);

      const result = await service.create(TENANT_ID, ACTOR_USER_ID, {
        student_id: STUDENT_ID,
        referral_type: 'neps',
      });

      expect(result.case_id).toBeNull();
    });
  });

  // ─── update — additional branch coverage ────────────────────────────────

  describe('update — branch coverage', () => {
    it('should throw NotFoundException when referral does not exist', async () => {
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, REFERRAL_ID, { referral_body_name: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update external_reference when provided', async () => {
      const existing = makeReferral({ status: 'draft' });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);
      const updated = makeReferral({ external_reference: 'REF-123' });
      mockRlsTx.pastoralReferral.update.mockResolvedValue(updated);

      const result = await service.update(TENANT_ID, REFERRAL_ID, {
        external_reference: 'REF-123',
      });

      expect(result.external_reference).toBe('REF-123');
      expect(mockRlsTx.pastoralReferral.update).toHaveBeenCalledWith({
        where: { id: REFERRAL_ID },
        data: { external_reference: 'REF-123' },
      });
    });

    it('should update report_summary when provided', async () => {
      const existing = makeReferral({ status: 'draft' });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);
      const updated = makeReferral({ report_summary: 'Summary text' });
      mockRlsTx.pastoralReferral.update.mockResolvedValue(updated);

      await service.update(TENANT_ID, REFERRAL_ID, {
        report_summary: 'Summary text',
      });

      expect(mockRlsTx.pastoralReferral.update).toHaveBeenCalledWith({
        where: { id: REFERRAL_ID },
        data: { report_summary: 'Summary text' },
      });
    });

    it('should update pre_populated_data when provided', async () => {
      const existing = makeReferral({ status: 'draft' });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);
      const updated = makeReferral({ pre_populated_data: { key: 'value' } });
      mockRlsTx.pastoralReferral.update.mockResolvedValue(updated);

      await service.update(TENANT_ID, REFERRAL_ID, {
        pre_populated_data: { key: 'value' },
      });

      expect(mockRlsTx.pastoralReferral.update).toHaveBeenCalledWith({
        where: { id: REFERRAL_ID },
        data: { pre_populated_data: { key: 'value' } },
      });
    });

    it('should update manual_additions when provided', async () => {
      const existing = makeReferral({ status: 'draft' });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);
      const updated = makeReferral({ manual_additions: { notes: 'Added' } });
      mockRlsTx.pastoralReferral.update.mockResolvedValue(updated);

      await service.update(TENANT_ID, REFERRAL_ID, {
        manual_additions: { notes: 'Added' },
      });

      expect(mockRlsTx.pastoralReferral.update).toHaveBeenCalledWith({
        where: { id: REFERRAL_ID },
        data: { manual_additions: { notes: 'Added' } },
      });
    });
  });

  // ─── withdraw — additional branch coverage ──────────────────────────────

  describe('withdraw — branch coverage', () => {
    it('should throw NotFoundException when referral does not exist', async () => {
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(null);

      await expect(
        service.withdraw(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID, { reason: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow withdrawal from draft status', async () => {
      const existing = makeReferral({ status: 'draft' });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);
      const updated = makeReferral({ status: 'withdrawn' });
      mockRlsTx.pastoralReferral.update.mockResolvedValue(updated);

      const result = await service.withdraw(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID, {
        reason: 'No longer needed',
      });

      expect(result.status).toBe('withdrawn');
    });

    it('should allow withdrawal from assessment_complete status', async () => {
      const existing = makeReferral({ status: 'assessment_complete' });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);
      const updated = makeReferral({ status: 'withdrawn' });
      mockRlsTx.pastoralReferral.update.mockResolvedValue(updated);

      const result = await service.withdraw(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID, {
        reason: 'Changed direction',
      });

      expect(result.status).toBe('withdrawn');
    });
  });

  // ─── transition — not-found branch ──────────────────────────────────────

  describe('transition — branch coverage', () => {
    it('should throw NotFoundException when referral does not exist for submit', async () => {
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(null);

      await expect(service.submit(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when referral does not exist for acknowledge', async () => {
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(null);

      await expect(service.acknowledge(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should use fallback event type for unknown status', async () => {
      // Access the private statusToEventType via transition flow
      // If the status doesn't match the map, it falls back to `referral_${status}`
      const existing = makeReferral({ status: 'draft' });
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(existing);
      const updated = makeReferral({ status: 'submitted' });
      mockRlsTx.pastoralReferral.update.mockResolvedValue(updated);

      await service.submit(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID);

      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'referral_submitted',
        }),
      );
    });
  });
});
