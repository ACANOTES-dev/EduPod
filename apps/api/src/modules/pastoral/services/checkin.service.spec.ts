import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { CheckinAlertService } from './checkin-alert.service';
import { CheckinService } from './checkin.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CHECKIN_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  studentCheckin: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
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

const makeTenantSettingsRecord = (checkinOverrides: Record<string, unknown> = {}) => ({
  id: 'settings-1',
  tenant_id: TENANT_ID,
  settings: {
    pastoral: {
      checkins: {
        enabled: true,
        frequency: 'daily' as const,
        monitoring_owner_user_ids: [USER_ID],
        monitoring_hours_start: '08:00',
        monitoring_hours_end: '16:00',
        monitoring_days: [1, 2, 3, 4, 5],
        flagged_keywords: ['suicide', 'self-harm'],
        consecutive_low_threshold: 3,
        min_cohort_for_aggregate: 10,
        prerequisites_acknowledged: true,
        ...checkinOverrides,
      },
    },
  },
  created_at: new Date(),
  updated_at: new Date(),
});

const makeCheckinRecord = (overrides: Record<string, unknown> = {}) => ({
  id: CHECKIN_ID,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  mood_score: 4,
  freeform_text: null,
  flagged: false,
  flag_reason: null,
  auto_concern_id: null,
  checkin_date: new Date('2026-03-27'),
  created_at: new Date('2026-03-27T10:00:00Z'),
  ...overrides,
});

const todayDateStr = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('CheckinService', () => {
  let service: CheckinService;
  let mockAlertService: {
    evaluateCheckin: jest.Mock;
  };
  let mockPrisma: {
    tenantSetting: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    mockAlertService = {
      evaluateCheckin: jest.fn().mockResolvedValue({
        was_flagged: false,
        flag_reason: null,
        generated_concern_id: null,
      }),
    };

    mockPrisma = {
      tenantSetting: {
        findUnique: jest.fn().mockResolvedValue(makeTenantSettingsRecord()),
      },
    };

    // Reset RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckinService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CheckinAlertService, useValue: mockAlertService },
      ],
    }).compile();

    service = module.get<CheckinService>(CheckinService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── submitCheckin ────────────────────────────────────────────────────────

  describe('submitCheckin', () => {
    it('should create record with correct fields', async () => {
      const record = makeCheckinRecord({
        checkin_date: new Date(todayDateStr()),
      });
      mockRlsTx.studentCheckin.create.mockResolvedValue(record);

      const result = await service.submitCheckin(TENANT_ID, STUDENT_ID, USER_ID, { mood_score: 4 });

      expect(result.id).toBe(CHECKIN_ID);
      expect(result.mood_score).toBe(4);
      expect(result.freeform_text).toBeNull();
      expect(result.was_flagged).toBe(false);

      // Verify create was called with correct data
      expect(mockRlsTx.studentCheckin.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          mood_score: 4,
          freeform_text: null,
          flagged: false,
        }),
      });
    });

    it('should store checkin_date as DATE only (no time component)', async () => {
      const record = makeCheckinRecord({
        checkin_date: new Date(todayDateStr()),
      });
      mockRlsTx.studentCheckin.create.mockResolvedValue(record);

      const result = await service.submitCheckin(TENANT_ID, STUDENT_ID, USER_ID, { mood_score: 3 });

      // checkin_date should be YYYY-MM-DD format
      expect(result.checkin_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Verify the create call used a Date object from a date-only string
      const createCall = mockRlsTx.studentCheckin.create.mock.calls[0][0] as {
        data: { checkin_date: Date };
      };
      const passedDate = createCall.data.checkin_date;
      expect(passedDate).toBeInstanceOf(Date);
    });

    it('should store freeform_text when provided', async () => {
      const record = makeCheckinRecord({
        freeform_text: 'Feeling good today',
        checkin_date: new Date(todayDateStr()),
      });
      mockRlsTx.studentCheckin.create.mockResolvedValue(record);

      const result = await service.submitCheckin(TENANT_ID, STUDENT_ID, USER_ID, {
        mood_score: 4,
        freeform_text: 'Feeling good today',
      });

      expect(result.freeform_text).toBe('Feeling good today');
      expect(mockRlsTx.studentCheckin.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          freeform_text: 'Feeling good today',
        }),
      });
    });

    it('should return 409 when duplicate same day (P2002)', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: { target: ['tenant_id', 'student_id', 'checkin_date'] },
      });
      mockRlsTx.studentCheckin.create.mockRejectedValue(prismaError);

      await expect(
        service.submitCheckin(TENANT_ID, STUDENT_ID, USER_ID, {
          mood_score: 3,
        }),
      ).rejects.toThrow(ConflictException);

      try {
        await service.submitCheckin(TENANT_ID, STUDENT_ID, USER_ID, {
          mood_score: 3,
        });
      } catch (err) {
        const error = err as ConflictException;
        const response = error.getResponse() as Record<string, unknown>;
        expect(response.code).toBe('CHECKIN_ALREADY_SUBMITTED');
      }
    });

    it('should return 409 when weekly frequency and second in same week', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(
        makeTenantSettingsRecord({ frequency: 'weekly' }),
      );

      // Existing checkin in same week
      mockRlsTx.studentCheckin.findFirst.mockResolvedValue(makeCheckinRecord());

      await expect(
        service.submitCheckin(TENANT_ID, STUDENT_ID, USER_ID, {
          mood_score: 3,
        }),
      ).rejects.toThrow(ConflictException);

      try {
        await service.submitCheckin(TENANT_ID, STUDENT_ID, USER_ID, {
          mood_score: 3,
        });
      } catch (err) {
        const error = err as ConflictException;
        const response = error.getResponse() as Record<string, unknown>;
        expect(response.code).toBe('CHECKIN_ALREADY_SUBMITTED');
      }
    });

    it('should succeed when weekly frequency and new week', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(
        makeTenantSettingsRecord({ frequency: 'weekly' }),
      );

      // No existing checkin in the current week
      mockRlsTx.studentCheckin.findFirst.mockResolvedValue(null);

      const record = makeCheckinRecord({
        checkin_date: new Date(todayDateStr()),
      });
      mockRlsTx.studentCheckin.create.mockResolvedValue(record);

      const result = await service.submitCheckin(TENANT_ID, STUDENT_ID, USER_ID, { mood_score: 4 });

      expect(result.id).toBe(CHECKIN_ID);
      expect(mockRlsTx.studentCheckin.create).toHaveBeenCalled();
    });

    it('should not include flag_reason or auto_concern_id in student response', async () => {
      const record = makeCheckinRecord({
        flagged: true,
        flag_reason: 'keyword_match',
        auto_concern_id: 'some-concern-id',
        checkin_date: new Date(todayDateStr()),
      });
      mockRlsTx.studentCheckin.create.mockResolvedValue(record);
      mockAlertService.evaluateCheckin.mockResolvedValue({
        was_flagged: true,
        flag_reason: 'keyword_match',
        generated_concern_id: 'some-concern-id',
      });

      const result = await service.submitCheckin(TENANT_ID, STUDENT_ID, USER_ID, {
        mood_score: 1,
        freeform_text: 'I want to end it all',
      });

      // Student response should have was_flagged but NOT flag_reason or auto_concern_id
      expect(result.was_flagged).toBe(true);
      expect(result).not.toHaveProperty('flag_reason');
      expect(result).not.toHaveProperty('auto_concern_id');
    });

    it('should reject when checkins are disabled (403)', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(
        makeTenantSettingsRecord({ enabled: false }),
      );

      await expect(
        service.submitCheckin(TENANT_ID, STUDENT_ID, USER_ID, {
          mood_score: 3,
        }),
      ).rejects.toThrow(ForbiddenException);

      try {
        await service.submitCheckin(TENANT_ID, STUDENT_ID, USER_ID, {
          mood_score: 3,
        });
      } catch (err) {
        const error = err as ForbiddenException;
        const response = error.getResponse() as Record<string, unknown>;
        expect(response.code).toBe('CHECKINS_DISABLED');
      }
    });

    it('should call alertService.evaluateCheckin after creating record', async () => {
      const record = makeCheckinRecord({
        checkin_date: new Date(todayDateStr()),
      });
      mockRlsTx.studentCheckin.create.mockResolvedValue(record);

      await service.submitCheckin(TENANT_ID, STUDENT_ID, USER_ID, {
        mood_score: 4,
        freeform_text: 'Doing well',
      });

      expect(mockAlertService.evaluateCheckin).toHaveBeenCalledWith(
        TENANT_ID,
        STUDENT_ID,
        CHECKIN_ID,
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        4,
        'Doing well',
      );
    });
  });

  // ─── getMyCheckins ────────────────────────────────────────────────────────

  describe('getMyCheckins', () => {
    it('should return paginated student checkin history', async () => {
      const records = [
        makeCheckinRecord({ checkin_date: new Date('2026-03-27') }),
        makeCheckinRecord({
          id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
          checkin_date: new Date('2026-03-26'),
          mood_score: 3,
        }),
      ];
      mockRlsTx.studentCheckin.findMany.mockResolvedValue(records);
      mockRlsTx.studentCheckin.count.mockResolvedValue(2);

      const result = await service.getMyCheckins(TENANT_ID, STUDENT_ID, 1, 20);

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
    });

    it('should not include flag_reason or auto_concern_id in student response', async () => {
      const records = [
        makeCheckinRecord({
          flagged: true,
          flag_reason: 'keyword_match',
          auto_concern_id: 'some-concern-id',
          checkin_date: new Date('2026-03-27'),
        }),
      ];
      mockRlsTx.studentCheckin.findMany.mockResolvedValue(records);
      mockRlsTx.studentCheckin.count.mockResolvedValue(1);

      const result = await service.getMyCheckins(TENANT_ID, STUDENT_ID, 1, 20);

      expect(result.data[0]!).not.toHaveProperty('flag_reason');
      expect(result.data[0]!).not.toHaveProperty('auto_concern_id');
      expect(result.data[0]!.was_flagged).toBe(true);
    });
  });

  // ─── getStudentCheckins (monitoring) ──────────────────────────────────────

  describe('getStudentCheckins', () => {
    it('should include flag_reason and auto_concern_id for monitoring view', async () => {
      const records = [
        makeCheckinRecord({
          flagged: true,
          flag_reason: 'consecutive_low',
          auto_concern_id: 'concern-123',
          checkin_date: new Date('2026-03-27'),
        }),
      ];
      mockRlsTx.studentCheckin.findMany.mockResolvedValue(records);
      mockRlsTx.studentCheckin.count.mockResolvedValue(1);

      const result = await service.getStudentCheckins(TENANT_ID, STUDENT_ID, 1, 20);

      expect(result.data[0]!.flag_reason).toBe('consecutive_low');
      expect(result.data[0]!.auto_concern_id).toBe('concern-123');
      expect(result.data[0]!.student_id).toBe(STUDENT_ID);
    });
  });

  // ─── getFlaggedCheckins ───────────────────────────────────────────────────

  describe('getFlaggedCheckins', () => {
    it('should return only flagged checkins', async () => {
      const records = [
        makeCheckinRecord({
          flagged: true,
          flag_reason: 'keyword_match',
          checkin_date: new Date('2026-03-27'),
          student: {
            first_name: 'Sara',
            last_name: 'Riley',
          },
        }),
      ];
      mockRlsTx.studentCheckin.findMany.mockResolvedValue(records);
      mockRlsTx.studentCheckin.count.mockResolvedValue(1);

      const result = await service.getFlaggedCheckins(TENANT_ID, {}, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.was_flagged).toBe(true);
      expect(result.data[0]!.student_name).toBe('Sara Riley');

      // Verify the where clause includes flagged: true
      expect(mockRlsTx.studentCheckin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            student: {
              select: { first_name: true, last_name: true },
            },
          },
          where: expect.objectContaining({ flagged: true }),
        }),
      );
    });

    it('should filter by date range', async () => {
      mockRlsTx.studentCheckin.findMany.mockResolvedValue([]);
      mockRlsTx.studentCheckin.count.mockResolvedValue(0);

      await service.getFlaggedCheckins(
        TENANT_ID,
        { date_from: '2026-03-01', date_to: '2026-03-31' },
        1,
        20,
      );

      expect(mockRlsTx.studentCheckin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            student: {
              select: { first_name: true, last_name: true },
            },
          },
          where: expect.objectContaining({
            checkin_date: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should filter by flag_reason', async () => {
      mockRlsTx.studentCheckin.findMany.mockResolvedValue([]);
      mockRlsTx.studentCheckin.count.mockResolvedValue(0);

      await service.getFlaggedCheckins(TENANT_ID, { flag_reason: 'keyword_match' }, 1, 20);

      expect(mockRlsTx.studentCheckin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            student: {
              select: { first_name: true, last_name: true },
            },
          },
          where: expect.objectContaining({
            flag_reason: 'keyword_match',
          }),
        }),
      );
    });
  });

  // ─── getCheckinStatus ─────────────────────────────────────────────────────

  describe('getCheckinStatus', () => {
    it('should return enabled=false when checkins are disabled', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(
        makeTenantSettingsRecord({ enabled: false }),
      );

      const result = await service.getCheckinStatus(TENANT_ID, STUDENT_ID);

      expect(result.enabled).toBe(false);
      expect(result.can_submit_today).toBe(false);
    });

    it('should return can_submit_today=true when no checkin today (daily)', async () => {
      mockRlsTx.studentCheckin.findFirst.mockResolvedValue(null);

      const result = await service.getCheckinStatus(TENANT_ID, STUDENT_ID);

      expect(result.enabled).toBe(true);
      expect(result.can_submit_today).toBe(true);
      expect(result.last_checkin_date).toBeNull();
    });

    it('should return can_submit_today=false when checkin exists today (daily)', async () => {
      const today = new Date();
      mockRlsTx.studentCheckin.findFirst.mockResolvedValue(
        makeCheckinRecord({ checkin_date: today }),
      );

      const result = await service.getCheckinStatus(TENANT_ID, STUDENT_ID);

      expect(result.enabled).toBe(true);
      expect(result.can_submit_today).toBe(false);
    });

    it('should return can_submit_today=false when checkin exists in same week (weekly)', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(
        makeTenantSettingsRecord({ frequency: 'weekly' }),
      );

      // findFirst for last checkin (ordering by desc)
      mockRlsTx.studentCheckin.findFirst
        .mockResolvedValueOnce(makeCheckinRecord({ checkin_date: new Date() }))
        // findFirst for week check
        .mockResolvedValueOnce(makeCheckinRecord({ checkin_date: new Date() }));

      const result = await service.getCheckinStatus(TENANT_ID, STUDENT_ID);

      expect(result.enabled).toBe(true);
      expect(result.can_submit_today).toBe(false);
      expect(result.frequency).toBe('weekly');
    });

    it('should return correct last_checkin_date', async () => {
      mockRlsTx.studentCheckin.findFirst.mockResolvedValue(
        makeCheckinRecord({ checkin_date: new Date('2026-03-25') }),
      );

      const result = await service.getCheckinStatus(TENANT_ID, STUDENT_ID);

      expect(result.last_checkin_date).toBe('2026-03-25');
    });
  });
});
