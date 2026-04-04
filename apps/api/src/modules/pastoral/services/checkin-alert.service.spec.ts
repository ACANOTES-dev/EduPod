import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';

import { SYSTEM_USER_SENTINEL } from '@school/shared';

import { MOCK_FACADE_PROVIDERS, ConfigurationReadFacade } from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';

import { CheckinAlertService } from './checkin-alert.service';
import { PastoralEventService } from './pastoral-event.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CHECKIN_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONCERN_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const MONITORING_OWNER_1 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── RLS Mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  studentCheckin: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  pastoralConcern: {
    create: jest.fn(),
  },
  tenantSetting: {
    findUnique: jest.fn(),
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

const DEFAULT_CHECKIN_SETTINGS = {
  enabled: true,
  frequency: 'daily' as const,
  monitoring_owner_user_ids: [MONITORING_OWNER_1],
  monitoring_hours_start: '08:00',
  monitoring_hours_end: '16:00',
  monitoring_days: [1, 2, 3, 4, 5],
  flagged_keywords: ['suicide', 'kill myself', 'self-harm', 'cut myself', 'hurt myself'],
  consecutive_low_threshold: 3,
  min_cohort_for_aggregate: 10,
  prerequisites_acknowledged: true,
};

const makeTenantSettingsRecord = (checkinOverrides: Record<string, unknown> = {}) => ({
  id: 'settings-1',
  tenant_id: TENANT_ID,
  settings: {
    pastoral: {
      checkins: {
        ...DEFAULT_CHECKIN_SETTINGS,
        ...checkinOverrides,
      },
    },
  },
  created_at: new Date(),
  updated_at: new Date(),
});

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('CheckinAlertService', () => {
  let service: CheckinAlertService;
  let mockPastoralEventService: { write: jest.Mock };
  let mockNotificationsQueue: { add: jest.Mock };
  let mockPrisma: Record<string, unknown>;
  let mockConfigFacade: { findSettings: jest.Mock };

  beforeEach(async () => {
    mockPastoralEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    mockNotificationsQueue = { add: jest.fn().mockResolvedValue(undefined) };

    mockPrisma = {};

    mockConfigFacade = {
      findSettings: jest.fn().mockResolvedValue(makeTenantSettingsRecord()),
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        (fn as jest.Mock).mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        CheckinAlertService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PastoralEventService, useValue: mockPastoralEventService },
        {
          provide: getQueueToken('notifications'),
          useValue: mockNotificationsQueue,
        },
        { provide: ConfigurationReadFacade, useValue: mockConfigFacade },
      ],
    }).compile();

    service = module.get<CheckinAlertService>(CheckinAlertService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── matchKeywords ──────────────────────────────────────────────────────

  describe('matchKeywords', () => {
    it('exact keyword in text triggers flag', () => {
      const result = service.matchKeywords('I feel like suicide is the only option', [
        'suicide',
        'self-harm',
      ]);
      expect(result).toBe('suicide');
    });

    it('case-insensitive matching works', () => {
      const result = service.matchKeywords('I have been SELF-HARM ing', ['self-harm']);
      expect(result).toBe('self-harm');
    });

    it('partial word does NOT match (shortcut != cut)', () => {
      const result = service.matchKeywords('I took a shortcut to school today', [
        'cut',
        'cut myself',
      ]);
      expect(result).toBeNull();
    });

    it('multi-word keyword matches', () => {
      const result = service.matchKeywords(
        'Sometimes I want to kill myself and I do not know why',
        ['suicide', 'kill myself'],
      );
      expect(result).toBe('kill myself');
    });

    it('clean text returns no flag', () => {
      const result = service.matchKeywords(
        'I had a great day at school today and played football',
        ['suicide', 'kill myself', 'self-harm', 'cut myself', 'hurt myself'],
      );
      expect(result).toBeNull();
    });
  });

  // ─── detectConsecutiveLow ───────────────────────────────────────────────

  describe('detectConsecutiveLow', () => {
    it('3 consecutive lowest triggers', async () => {
      mockRlsTx.studentCheckin.findMany.mockResolvedValue([
        { mood_score: 1 },
        { mood_score: 1 },
        { mood_score: 1 },
      ]);

      const result = await service.detectConsecutiveLow(TENANT_ID, STUDENT_ID, 3, 1);
      expect(result).toBe(true);
    });

    it('2 does NOT trigger (threshold=3)', async () => {
      mockRlsTx.studentCheckin.findMany.mockResolvedValue([{ mood_score: 1 }, { mood_score: 1 }]);

      const result = await service.detectConsecutiveLow(TENANT_ID, STUDENT_ID, 3, 1);
      expect(result).toBe(false);
    });

    it('mixed scores does NOT trigger', async () => {
      mockRlsTx.studentCheckin.findMany.mockResolvedValue([
        { mood_score: 1 },
        { mood_score: 3 },
        { mood_score: 1 },
      ]);

      const result = await service.detectConsecutiveLow(TENANT_ID, STUDENT_ID, 3, 1);
      expect(result).toBe(false);
    });

    it('fewer than threshold total does NOT trigger', async () => {
      mockRlsTx.studentCheckin.findMany.mockResolvedValue([{ mood_score: 1 }]);

      const result = await service.detectConsecutiveLow(TENANT_ID, STUDENT_ID, 3, 1);
      expect(result).toBe(false);
    });
  });

  // ─── evaluateCheckin — flag generates concern ───────────────────────────

  describe('evaluateCheckin — concern generation', () => {
    const setupFlagMocks = () => {
      mockRlsTx.pastoralConcern.create.mockResolvedValue({
        id: CONCERN_ID,
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        category: 'emotional',
        severity: 'elevated',
        tier: 2,
      });
      mockRlsTx.studentCheckin.update.mockResolvedValue({
        id: CHECKIN_ID,
        flagged: true,
      });
    };

    it('flag generates Tier 2 concern', async () => {
      setupFlagMocks();

      const result = await service.evaluateCheckin(
        TENANT_ID,
        STUDENT_ID,
        CHECKIN_ID,
        '2026-03-27',
        3,
        'I want to commit suicide',
      );

      expect(result.was_flagged).toBe(true);
      expect(result.flag_reason).toBe('keyword_match');
      expect(result.generated_concern_id).toBe(CONCERN_ID);

      // Verify concern was created with correct fields
      expect(mockRlsTx.pastoralConcern.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          category: 'emotional',
          severity: 'elevated',
          tier: 2,
          logged_by_user_id: SYSTEM_USER_SENTINEL,
          follow_up_needed: true,
          follow_up_suggestion: 'Review flagged self-check-in',
          parent_shareable: false,
          legal_hold: false,
          imported: false,
          author_masked: false,
        }),
      });
    });

    it('flag records checkin_alert_generated audit event', async () => {
      setupFlagMocks();

      await service.evaluateCheckin(
        TENANT_ID,
        STUDENT_ID,
        CHECKIN_ID,
        '2026-03-27',
        3,
        'I want to commit suicide',
      );

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'checkin_alert_generated',
          entity_type: 'checkin',
          entity_id: CHECKIN_ID,
          student_id: STUDENT_ID,
          actor_user_id: SYSTEM_USER_SENTINEL,
          tier: 2,
          payload: expect.objectContaining({
            checkin_id: CHECKIN_ID,
            student_id: STUDENT_ID,
            flag_reason: 'keyword_match',
            auto_concern_id: CONCERN_ID,
          }),
        }),
      );
    });

    it('flag enqueues notification to monitoring owners', async () => {
      setupFlagMocks();

      await service.evaluateCheckin(
        TENANT_ID,
        STUDENT_ID,
        CHECKIN_ID,
        '2026-03-27',
        3,
        'I want to commit suicide',
      );

      expect(mockNotificationsQueue.add).toHaveBeenCalledWith(
        'pastoral:checkin-alert-notification',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          checkin_id: CHECKIN_ID,
          student_id: STUDENT_ID,
          flag_reason: 'keyword_match',
          monitoring_owner_user_ids: [MONITORING_OWNER_1],
        }),
      );
    });

    it('both keyword and consecutive-low: keyword takes precedence', async () => {
      // Both would trigger, but keyword runs first and wins
      mockRlsTx.studentCheckin.findMany.mockResolvedValue([
        { mood_score: 1 },
        { mood_score: 1 },
        { mood_score: 1 },
      ]);
      setupFlagMocks();

      const result = await service.evaluateCheckin(
        TENANT_ID,
        STUDENT_ID,
        CHECKIN_ID,
        '2026-03-27',
        1,
        'I want to hurt myself badly',
      );

      expect(result.flag_reason).toBe('keyword_match');
    });

    it('consecutive-low triggers when no keyword match', async () => {
      mockRlsTx.studentCheckin.findMany.mockResolvedValue([
        { mood_score: 1 },
        { mood_score: 1 },
        { mood_score: 1 },
      ]);
      setupFlagMocks();

      const result = await service.evaluateCheckin(
        TENANT_ID,
        STUDENT_ID,
        CHECKIN_ID,
        '2026-03-27',
        1,
        'I feel okay I guess',
      );

      expect(result.was_flagged).toBe(true);
      expect(result.flag_reason).toBe('consecutive_low');
      expect(result.generated_concern_id).toBe(CONCERN_ID);
    });

    it('clean check-in returns no flag', async () => {
      // No keyword match, no consecutive low
      mockRlsTx.studentCheckin.findMany.mockResolvedValue([
        { mood_score: 3 },
        { mood_score: 4 },
        { mood_score: 5 },
      ]);

      const result = await service.evaluateCheckin(
        TENANT_ID,
        STUDENT_ID,
        CHECKIN_ID,
        '2026-03-27',
        4,
        'Had a good day',
      );

      expect(result.was_flagged).toBe(false);
      expect(result.flag_reason).toBeNull();
      expect(result.generated_concern_id).toBeNull();
    });

    it('null freeformText skips keyword check and only runs consecutive-low', async () => {
      // 3 consecutive lows should still trigger
      mockRlsTx.studentCheckin.findMany.mockResolvedValue([
        { mood_score: 1 },
        { mood_score: 1 },
        { mood_score: 1 },
      ]);
      setupFlagMocks();

      const result = await service.evaluateCheckin(
        TENANT_ID,
        STUDENT_ID,
        CHECKIN_ID,
        '2026-03-27',
        1,
        null,
      );

      expect(result.was_flagged).toBe(true);
      expect(result.flag_reason).toBe('consecutive_low');
    });
  });

  // ─── isWithinMonitoringHours ────────────────────────────────────────────

  describe('isWithinMonitoringHours', () => {
    it('inside hours returns true', () => {
      // Wednesday (day 3), 10:00 AM
      const wednesday10am = new Date('2026-03-25T10:00:00');
      const result = service.isWithinMonitoringHours(
        '08:00',
        '16:00',
        [1, 2, 3, 4, 5], // Mon-Fri
        wednesday10am,
      );
      expect(result).toBe(true);
    });

    it('outside hours returns false', () => {
      // Wednesday (day 3), 7:00 PM
      const wednesday7pm = new Date('2026-03-25T19:00:00');
      const result = service.isWithinMonitoringHours(
        '08:00',
        '16:00',
        [1, 2, 3, 4, 5],
        wednesday7pm,
      );
      expect(result).toBe(false);
    });

    it('weekend returns false when only weekdays configured', () => {
      // Saturday (day 6 in JS, but getDay()=6), 10:00 AM
      const saturday10am = new Date('2026-03-28T10:00:00');
      const result = service.isWithinMonitoringHours(
        '08:00',
        '16:00',
        [1, 2, 3, 4, 5], // Mon-Fri
        saturday10am,
      );
      expect(result).toBe(false);
    });

    it('at start boundary returns true', () => {
      const wednesday8am = new Date('2026-03-25T08:00:00');
      const result = service.isWithinMonitoringHours(
        '08:00',
        '16:00',
        [1, 2, 3, 4, 5],
        wednesday8am,
      );
      expect(result).toBe(true);
    });

    it('at end boundary returns false', () => {
      const wednesday4pm = new Date('2026-03-25T16:00:00');
      const result = service.isWithinMonitoringHours(
        '08:00',
        '16:00',
        [1, 2, 3, 4, 5],
        wednesday4pm,
      );
      expect(result).toBe(false);
    });
  });
});
