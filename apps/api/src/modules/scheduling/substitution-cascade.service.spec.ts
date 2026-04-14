import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { SubstitutionCascadeService } from './substitution-cascade.service';
import { SubstitutionService } from './substitution.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-james';
const STAFF_JAMES = 'staff-james';
const STAFF_SARAH = 'staff-sarah';
const STAFF_MICHAEL = 'staff-michael';
const OFFER_ID = 'offer-1';
const ABSENCE_ID = 'abs-1';
const SCHEDULE_ID = 'sched-1';

const mockTx = {
  substitutionOffer: {
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findFirst: jest.fn(),
  },
  substitutionRecord: {
    create: jest.fn(),
    updateMany: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

describe('SubstitutionCascadeService', () => {
  let service: SubstitutionCascadeService;
  let mockPrisma: {
    teacherAbsence: { findFirst: jest.Mock };
    tenantSchedulingSettings: { findFirst: jest.Mock };
    substitutionOffer: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    substitutionRecord: { findFirst: jest.Mock };
  };
  let mockSubstitutionService: { findEligibleSubstitutes: jest.Mock };
  let mockSchedulesReadFacade: { findTeacherTimetable: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      teacherAbsence: { findFirst: jest.fn() },
      tenantSchedulingSettings: {
        findFirst: jest.fn().mockResolvedValue({
          offer_timeout_minutes: 30,
          parallel_offer_count: 3,
          auto_cascade_enabled: true,
        }),
      },
      substitutionOffer: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      substitutionRecord: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    mockSubstitutionService = {
      findEligibleSubstitutes: jest.fn().mockResolvedValue({ data: [] }),
    };
    mockSchedulesReadFacade = {
      findTeacherTimetable: jest.fn().mockResolvedValue([]),
    };

    mockTx.substitutionOffer.create.mockResolvedValue({ id: OFFER_ID });
    mockTx.substitutionOffer.update.mockResolvedValue({ id: OFFER_ID });
    mockTx.substitutionOffer.updateMany.mockResolvedValue({ count: 0 });
    mockTx.substitutionOffer.findFirst.mockResolvedValue(null);
    mockTx.substitutionRecord.create.mockResolvedValue({ id: 'rec-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubstitutionCascadeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SubstitutionService, useValue: mockSubstitutionService },
        {
          provide: SchedulesReadFacade,
          useValue: mockSchedulesReadFacade,
        },
        {
          provide: StaffProfileReadFacade,
          useValue: {
            findByUserId: jest.fn().mockResolvedValue({ id: STAFF_JAMES }),
          },
        },
      ],
    }).compile();

    service = module.get<SubstitutionCascadeService>(SubstitutionCascadeService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── runCascade ───────────────────────────────────────────────────────────

  describe('runCascade', () => {
    it('should create offers for top-N eligible candidates for each affected slot', async () => {
      mockPrisma.teacherAbsence.findFirst.mockResolvedValue({
        id: ABSENCE_ID,
        tenant_id: TENANT_ID,
        staff_profile_id: STAFF_SARAH,
        absence_date: new Date('2026-04-15T00:00:00Z'),
        date_to: null,
        full_day: true,
        nominated_substitute_id: null,
        cancelled_at: null,
      });
      mockSchedulesReadFacade.findTeacherTimetable.mockResolvedValue([
        { id: SCHEDULE_ID, weekday: 3, period_order: 1 },
      ]);
      mockSubstitutionService.findEligibleSubstitutes.mockResolvedValue({
        data: [
          { staff_profile_id: STAFF_JAMES, is_available: true },
          { staff_profile_id: STAFF_MICHAEL, is_available: true },
          { staff_profile_id: 'staff-liam', is_available: false },
        ],
      });

      const result = await service.runCascade(TENANT_ID, ABSENCE_ID);

      expect(result.offers_created).toBe(2);
      expect(mockTx.substitutionOffer.create).toHaveBeenCalledTimes(2);
    });

    it('should create a single nomination offer when nominated_substitute_id is set', async () => {
      mockPrisma.teacherAbsence.findFirst.mockResolvedValue({
        id: ABSENCE_ID,
        tenant_id: TENANT_ID,
        staff_profile_id: STAFF_SARAH,
        absence_date: new Date('2026-04-15T00:00:00Z'),
        date_to: null,
        full_day: true,
        nominated_substitute_id: 'staff-oscar',
        cancelled_at: null,
      });
      mockSchedulesReadFacade.findTeacherTimetable.mockResolvedValue([
        { id: SCHEDULE_ID, weekday: 3, period_order: 1 },
      ]);

      const result = await service.runCascade(TENANT_ID, ABSENCE_ID);

      expect(result.offers_created).toBe(1);
      expect(mockTx.substitutionOffer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            candidate_staff_id: 'staff-oscar',
            is_nomination: true,
          }),
        }),
      );
      // Must not fall through to suggest() for round 1 when nomination is set.
      expect(mockSubstitutionService.findEligibleSubstitutes).not.toHaveBeenCalled();
    });

    it('should skip cascade when auto_cascade_enabled is false', async () => {
      mockPrisma.teacherAbsence.findFirst.mockResolvedValue({
        id: ABSENCE_ID,
        tenant_id: TENANT_ID,
        staff_profile_id: STAFF_SARAH,
        absence_date: new Date('2026-04-15T00:00:00Z'),
        date_to: null,
        full_day: true,
        nominated_substitute_id: null,
        cancelled_at: null,
      });
      mockPrisma.tenantSchedulingSettings.findFirst.mockResolvedValue({
        offer_timeout_minutes: 30,
        parallel_offer_count: 3,
        auto_cascade_enabled: false,
      });

      const result = await service.runCascade(TENANT_ID, ABSENCE_ID);

      expect(result.offers_created).toBe(0);
      expect(mockTx.substitutionOffer.create).not.toHaveBeenCalled();
    });

    it('should skip a slot that already has a confirmed substitution', async () => {
      mockPrisma.teacherAbsence.findFirst.mockResolvedValue({
        id: ABSENCE_ID,
        tenant_id: TENANT_ID,
        staff_profile_id: STAFF_SARAH,
        absence_date: new Date('2026-04-15T00:00:00Z'),
        date_to: null,
        full_day: true,
        nominated_substitute_id: null,
        cancelled_at: null,
      });
      mockSchedulesReadFacade.findTeacherTimetable.mockResolvedValue([
        { id: SCHEDULE_ID, weekday: 3, period_order: 1 },
      ]);
      mockPrisma.substitutionRecord.findFirst.mockResolvedValue({ id: 'existing-record' });

      const result = await service.runCascade(TENANT_ID, ABSENCE_ID);

      expect(result.offers_created).toBe(0);
    });
  });

  // ─── acceptOffer ──────────────────────────────────────────────────────────

  describe('acceptOffer', () => {
    const buildOffer = (overrides: Partial<Record<string, unknown>> = {}) => ({
      id: OFFER_ID,
      tenant_id: TENANT_ID,
      absence_id: ABSENCE_ID,
      schedule_id: SCHEDULE_ID,
      absence_date: new Date('2026-04-15T00:00:00Z'),
      candidate_staff_id: STAFF_JAMES,
      status: 'pending',
      expires_at: new Date(Date.now() + 30 * 60 * 1000),
      is_nomination: false,
      cascade_round: 1,
      ...overrides,
    });

    it('should accept, create a SubstitutionRecord, and revoke siblings', async () => {
      mockPrisma.substitutionOffer.findFirst.mockResolvedValue(buildOffer());
      mockTx.substitutionOffer.findFirst.mockResolvedValue(null);

      const result = await service.acceptOffer(TENANT_ID, USER_ID, OFFER_ID);

      expect(result.status).toBe('accepted');
      expect(result.record_id).toBe('rec-1');
      expect(mockTx.substitutionOffer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: OFFER_ID },
          data: expect.objectContaining({ status: 'accepted' }),
        }),
      );
      expect(mockTx.substitutionOffer.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'pending', id: { not: OFFER_ID } }),
          data: expect.objectContaining({ status: 'revoked' }),
        }),
      );
    });

    it('should reject when sibling offer was accepted first (first-accept-wins race)', async () => {
      mockPrisma.substitutionOffer.findFirst.mockResolvedValue(buildOffer());
      // Another sibling already accepted inside the transaction window.
      mockTx.substitutionOffer.findFirst.mockResolvedValue({ id: 'sibling-offer' });

      await expect(service.acceptOffer(TENANT_ID, USER_ID, OFFER_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it("should reject accepting someone else's offer", async () => {
      mockPrisma.substitutionOffer.findFirst.mockResolvedValue(
        buildOffer({ candidate_staff_id: 'not-me' }),
      );

      await expect(service.acceptOffer(TENANT_ID, USER_ID, OFFER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should reject accepting an expired offer', async () => {
      mockPrisma.substitutionOffer.findFirst.mockResolvedValue(
        buildOffer({ expires_at: new Date(Date.now() - 1000) }),
      );

      await expect(service.acceptOffer(TENANT_ID, USER_ID, OFFER_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should 404 if offer does not exist', async () => {
      mockPrisma.substitutionOffer.findFirst.mockResolvedValue(null);

      await expect(service.acceptOffer(TENANT_ID, USER_ID, OFFER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── declineOffer — nomination escalation ────────────────────────────────

  describe('declineOffer', () => {
    it('should trigger next cascade round when regular offer declined and no siblings pending', async () => {
      mockPrisma.substitutionOffer.findFirst.mockResolvedValue({
        id: OFFER_ID,
        tenant_id: TENANT_ID,
        absence_id: ABSENCE_ID,
        schedule_id: SCHEDULE_ID,
        absence_date: new Date('2026-04-15T00:00:00Z'),
        candidate_staff_id: STAFF_JAMES,
        status: 'pending',
        expires_at: new Date(Date.now() + 30 * 60 * 1000),
        is_nomination: false,
        cascade_round: 1,
      });
      // Spy on runCascade to verify the escalation without recursing.
      const spy = jest.spyOn(service, 'runCascade').mockResolvedValue({ offers_created: 0 });
      // No other pending siblings
      mockPrisma.substitutionOffer.count.mockResolvedValue(0);

      await service.declineOffer(TENANT_ID, USER_ID, OFFER_ID, 'Already covering');

      expect(spy).toHaveBeenCalledWith(TENANT_ID, ABSENCE_ID, { cascadeRound: 2 });
    });

    it('should NOT trigger next cascade round when nominated offer declined (Decision 9)', async () => {
      mockPrisma.substitutionOffer.findFirst.mockResolvedValue({
        id: OFFER_ID,
        tenant_id: TENANT_ID,
        absence_id: ABSENCE_ID,
        schedule_id: SCHEDULE_ID,
        absence_date: new Date('2026-04-15T00:00:00Z'),
        candidate_staff_id: STAFF_JAMES,
        status: 'pending',
        expires_at: new Date(Date.now() + 30 * 60 * 1000),
        is_nomination: true,
        cascade_round: 1,
      });
      const spy = jest.spyOn(service, 'runCascade').mockResolvedValue({ offers_created: 0 });

      await service.declineOffer(TENANT_ID, USER_ID, OFFER_ID, null);

      expect(spy).not.toHaveBeenCalled();
    });

    it('should NOT trigger next round when siblings still pending', async () => {
      mockPrisma.substitutionOffer.findFirst.mockResolvedValue({
        id: OFFER_ID,
        tenant_id: TENANT_ID,
        absence_id: ABSENCE_ID,
        schedule_id: SCHEDULE_ID,
        absence_date: new Date('2026-04-15T00:00:00Z'),
        candidate_staff_id: STAFF_JAMES,
        status: 'pending',
        expires_at: new Date(Date.now() + 30 * 60 * 1000),
        is_nomination: false,
        cascade_round: 1,
      });
      mockPrisma.substitutionOffer.count.mockResolvedValue(2); // 2 siblings still open
      const spy = jest.spyOn(service, 'runCascade').mockResolvedValue({ offers_created: 0 });

      await service.declineOffer(TENANT_ID, USER_ID, OFFER_ID, null);

      expect(spy).not.toHaveBeenCalled();
    });
  });
});
