import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';
import { ReferralRecommendationService } from './referral-recommendation.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACTOR_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ASSIGNED_USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const REFERRAL_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const RECOMMENDATION_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  pastoralReferral: {
    findFirst: jest.fn(),
  },
  pastoralReferralRecommendation: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
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

const makeRecommendation = (overrides: Record<string, unknown> = {}) => ({
  id: RECOMMENDATION_ID,
  tenant_id: TENANT_ID,
  referral_id: REFERRAL_ID,
  recommendation: 'Refer student to counselling',
  assigned_to_user_id: ASSIGNED_USER_ID,
  review_date: new Date('2026-04-15'),
  status: 'rec_pending',
  status_note: null,
  created_at: new Date('2026-03-27T10:00:00Z'),
  updated_at: new Date('2026-03-27T10:00:00Z'),
  ...overrides,
});

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('ReferralRecommendationService', () => {
  let service: ReferralRecommendationService;
  let mockEventService: { write: jest.Mock };

  beforeEach(async () => {
    mockEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralRecommendationService,
        { provide: PrismaService, useValue: {} },
        { provide: PastoralEventService, useValue: mockEventService },
      ],
    }).compile();

    service = module.get<ReferralRecommendationService>(
      ReferralRecommendationService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ─────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create recommendation with rec_pending status', async () => {
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue({
        id: REFERRAL_ID,
      });
      const created = makeRecommendation();
      mockRlsTx.pastoralReferralRecommendation.create.mockResolvedValue(
        created,
      );

      const result = await service.create(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID, {
        referral_id: REFERRAL_ID,
        recommendation: 'Refer student to counselling',
        assigned_to_user_id: ASSIGNED_USER_ID,
        review_date: '2026-04-15',
      });

      expect(result.id).toBe(RECOMMENDATION_ID);
      expect(result.status).toBe('rec_pending');
      expect(
        mockRlsTx.pastoralReferralRecommendation.create,
      ).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          referral_id: REFERRAL_ID,
          recommendation: 'Refer student to counselling',
          assigned_to_user_id: ASSIGNED_USER_ID,
          status: 'rec_pending',
        }),
      });
    });

    it('should throw NotFoundException when referral not found', async () => {
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID, {
          referral_id: REFERRAL_ID,
          recommendation: 'Some recommendation',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should emit recommendation_created audit event', async () => {
      mockRlsTx.pastoralReferral.findFirst.mockResolvedValue({
        id: REFERRAL_ID,
      });
      mockRlsTx.pastoralReferralRecommendation.create.mockResolvedValue(
        makeRecommendation(),
      );

      await service.create(TENANT_ID, ACTOR_USER_ID, REFERRAL_ID, {
        referral_id: REFERRAL_ID,
        recommendation: 'Refer student to counselling',
        assigned_to_user_id: ASSIGNED_USER_ID,
      });

      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'recommendation_created',
          entity_type: 'referral',
          entity_id: REFERRAL_ID,
          actor_user_id: ACTOR_USER_ID,
          payload: expect.objectContaining({
            recommendation_id: RECOMMENDATION_ID,
            referral_id: REFERRAL_ID,
            assigned_to: ASSIGNED_USER_ID,
          }),
        }),
      );
    });
  });

  // ─── list ───────────────────────────────────────────────────────────────

  describe('list', () => {
    it('should return recommendations for referral, ordered by created_at ASC', async () => {
      const recs = [
        makeRecommendation({
          id: 'rec-1',
          created_at: new Date('2026-03-27T08:00:00Z'),
        }),
        makeRecommendation({
          id: 'rec-2',
          created_at: new Date('2026-03-27T09:00:00Z'),
        }),
      ];
      mockRlsTx.pastoralReferralRecommendation.findMany.mockResolvedValue(recs);

      const result = await service.list(TENANT_ID, REFERRAL_ID);

      expect(result).toHaveLength(2);
      expect(
        mockRlsTx.pastoralReferralRecommendation.findMany,
      ).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, referral_id: REFERRAL_ID },
        orderBy: { created_at: 'asc' },
        include: {
          assigned_to: {
            select: { first_name: true, last_name: true },
          },
        },
      });
    });
  });

  // ─── update ─────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should transition rec_pending -> rec_in_progress', async () => {
      mockRlsTx.pastoralReferralRecommendation.findFirst.mockResolvedValue(
        makeRecommendation({ status: 'rec_pending' }),
      );
      const updated = makeRecommendation({ status: 'rec_in_progress' });
      mockRlsTx.pastoralReferralRecommendation.update.mockResolvedValue(
        updated,
      );

      const result = await service.update(
        TENANT_ID,
        ACTOR_USER_ID,
        RECOMMENDATION_ID,
        { status: 'in_progress' },
      );

      expect(result.status).toBe('rec_in_progress');
      expect(
        mockRlsTx.pastoralReferralRecommendation.update,
      ).toHaveBeenCalledWith({
        where: { id: RECOMMENDATION_ID },
        data: expect.objectContaining({ status: 'rec_in_progress' }),
      });
    });

    it('should transition rec_in_progress -> implemented', async () => {
      mockRlsTx.pastoralReferralRecommendation.findFirst.mockResolvedValue(
        makeRecommendation({ status: 'rec_in_progress' }),
      );
      const updated = makeRecommendation({ status: 'implemented' });
      mockRlsTx.pastoralReferralRecommendation.update.mockResolvedValue(
        updated,
      );

      const result = await service.update(
        TENANT_ID,
        ACTOR_USER_ID,
        RECOMMENDATION_ID,
        { status: 'implemented' },
      );

      expect(result.status).toBe('implemented');
    });

    it('should transition rec_in_progress -> not_applicable WITH status_note', async () => {
      mockRlsTx.pastoralReferralRecommendation.findFirst.mockResolvedValue(
        makeRecommendation({ status: 'rec_in_progress' }),
      );
      const updated = makeRecommendation({
        status: 'not_applicable',
        status_note: 'Student transferred',
      });
      mockRlsTx.pastoralReferralRecommendation.update.mockResolvedValue(
        updated,
      );

      const result = await service.update(
        TENANT_ID,
        ACTOR_USER_ID,
        RECOMMENDATION_ID,
        { status: 'not_applicable', status_note: 'Student transferred' },
      );

      expect(result.status).toBe('not_applicable');
      expect(
        mockRlsTx.pastoralReferralRecommendation.update,
      ).toHaveBeenCalledWith({
        where: { id: RECOMMENDATION_ID },
        data: expect.objectContaining({
          status: 'not_applicable',
          status_note: 'Student transferred',
        }),
      });
    });

    it('should throw when setting not_applicable WITHOUT status_note', async () => {
      mockRlsTx.pastoralReferralRecommendation.findFirst.mockResolvedValue(
        makeRecommendation({ status: 'rec_in_progress' }),
      );

      await expect(
        service.update(TENANT_ID, ACTOR_USER_ID, RECOMMENDATION_ID, {
          status: 'not_applicable',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw on invalid transition (implemented -> pending)', async () => {
      mockRlsTx.pastoralReferralRecommendation.findFirst.mockResolvedValue(
        makeRecommendation({ status: 'implemented' }),
      );

      await expect(
        service.update(TENANT_ID, ACTOR_USER_ID, RECOMMENDATION_ID, {
          status: 'pending',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should fire recommendation_status_changed audit event when status changes', async () => {
      mockRlsTx.pastoralReferralRecommendation.findFirst.mockResolvedValue(
        makeRecommendation({ status: 'rec_pending' }),
      );
      mockRlsTx.pastoralReferralRecommendation.update.mockResolvedValue(
        makeRecommendation({ status: 'rec_in_progress' }),
      );

      await service.update(TENANT_ID, ACTOR_USER_ID, RECOMMENDATION_ID, {
        status: 'in_progress',
      });

      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'recommendation_status_changed',
          entity_type: 'referral',
          entity_id: RECOMMENDATION_ID,
          actor_user_id: ACTOR_USER_ID,
          payload: expect.objectContaining({
            recommendation_id: RECOMMENDATION_ID,
            new_status: 'in_progress',
          }),
        }),
      );
    });

    it('should NOT fire audit event when status is not changed', async () => {
      mockRlsTx.pastoralReferralRecommendation.findFirst.mockResolvedValue(
        makeRecommendation({ status: 'rec_pending' }),
      );
      mockRlsTx.pastoralReferralRecommendation.update.mockResolvedValue(
        makeRecommendation({ status: 'rec_pending', assigned_to_user_id: 'new-user' }),
      );

      await service.update(TENANT_ID, ACTOR_USER_ID, RECOMMENDATION_ID, {
        assigned_to_user_id: 'new-user',
      });

      expect(mockEventService.write).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when recommendation not found', async () => {
      mockRlsTx.pastoralReferralRecommendation.findFirst.mockResolvedValue(
        null,
      );

      await expect(
        service.update(TENANT_ID, ACTOR_USER_ID, RECOMMENDATION_ID, {
          status: 'in_progress',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── allComplete ────────────────────────────────────────────────────────

  describe('allComplete', () => {
    it('should return true when all recommendations are implemented or not_applicable', async () => {
      mockRlsTx.pastoralReferralRecommendation.count.mockResolvedValue(0);

      const result = await service.allComplete(TENANT_ID, REFERRAL_ID);

      expect(result).toBe(true);
      expect(
        mockRlsTx.pastoralReferralRecommendation.count,
      ).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          referral_id: REFERRAL_ID,
          status: {
            in: ['rec_pending', 'rec_in_progress'],
          },
        },
      });
    });

    it('should return false when any recommendation is pending or in_progress', async () => {
      mockRlsTx.pastoralReferralRecommendation.count.mockResolvedValue(2);

      const result = await service.allComplete(TENANT_ID, REFERRAL_ID);

      expect(result).toBe(false);
    });

    it('should return true when no recommendations exist (edge case)', async () => {
      mockRlsTx.pastoralReferralRecommendation.count.mockResolvedValue(0);

      const result = await service.allComplete(TENANT_ID, REFERRAL_ID);

      expect(result).toBe(true);
    });
  });
});
