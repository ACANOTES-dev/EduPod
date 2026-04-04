import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, ConfigurationReadFacade } from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';
import {
  SstAgendaGeneratorService,
  AgendaSourceItem,
  SstMeetingAgendaItemRow,
} from './sst-agenda-generator.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACTOR_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEETING_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID_A = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STUDENT_ID_B = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const CONCERN_ID_A = '11111111-1111-1111-1111-111111111111';
const CONCERN_ID_B = '22222222-2222-2222-2222-222222222222';
const CASE_ID_A = '33333333-3333-3333-3333-333333333333';
const ACTION_ID_A = '55555555-5555-5555-5555-555555555555';
const REFERRAL_ID_A = '66666666-6666-6666-6666-666666666666';
const INTERVENTION_ID_A = '77777777-7777-7777-7777-777777777777';
const NOW = new Date('2026-03-27T10:00:00Z');
const PREV_MEETING_DATE = new Date('2026-03-13T10:00:00Z');

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  sstMeeting: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  sstMeetingAgendaItem: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  sstMeetingAction: {
    findMany: jest.fn(),
  },
  pastoralConcern: {
    findMany: jest.fn(),
  },
  pastoralCase: {
    findMany: jest.fn(),
  },
  pastoralReferral: {
    findMany: jest.fn(),
  },
  pastoralIntervention: {
    findMany: jest.fn(),
  },
  studentAcademicRiskAlert: {
    findMany: jest.fn(),
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

const DEFAULT_SST_SETTINGS = {
  meeting_frequency: 'fortnightly',
  auto_agenda_sources: ['new_concerns', 'case_reviews', 'overdue_actions', 'intervention_reviews'],
  precompute_minutes_before: 30,
};

const makeTenantSettingsRecord = (
  sstOverrides: Record<string, unknown> = {},
) => ({
  id: 'settings-1',
  tenant_id: TENANT_ID,
  settings: {
    pastoral: {
      sst: { ...DEFAULT_SST_SETTINGS, ...sstOverrides },
    },
  },
  created_at: new Date(),
  updated_at: new Date(),
});

const makeMeeting = (overrides: Record<string, unknown> = {}) => ({
  id: MEETING_ID,
  tenant_id: TENANT_ID,
  scheduled_at: NOW,
  status: 'scheduled',
  attendees: null,
  general_notes: null,
  agenda_precomputed_at: null,
  created_by_user_id: ACTOR_USER_ID,
  created_at: new Date('2026-03-20T10:00:00Z'),
  updated_at: new Date('2026-03-20T10:00:00Z'),
  ...overrides,
});

const makeExistingAgendaItem = (
  overrides: Partial<SstMeetingAgendaItemRow> = {},
): SstMeetingAgendaItemRow => ({
  id: 'existing-item-1',
  tenant_id: TENANT_ID,
  meeting_id: MEETING_ID,
  source: 'auto_new_concern',
  student_id: STUDENT_ID_A,
  case_id: null,
  concern_id: CONCERN_ID_A,
  description: 'New concern: academic (routine)',
  discussion_notes: null,
  decisions: null,
  display_order: 1,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

let createdItemCounter = 0;

const setupDefaultMocks = () => {
  // Reset counter
  createdItemCounter = 0;

  // Meeting lookup
  mockRlsTx.sstMeeting.findUnique.mockResolvedValue(makeMeeting());

  // Previous completed meeting
  mockRlsTx.sstMeeting.findFirst.mockResolvedValue({
    scheduled_at: PREV_MEETING_DATE,
  });

  // No existing agenda items by default
  mockRlsTx.sstMeetingAgendaItem.findMany.mockResolvedValue([]);

  // Create agenda item mock
  mockRlsTx.sstMeetingAgendaItem.create.mockImplementation(
    async (args: { data: Record<string, unknown> }) => {
      createdItemCounter++;
      return {
        id: `new-item-${createdItemCounter}`,
        tenant_id: TENANT_ID,
        meeting_id: MEETING_ID,
        source: args.data.source,
        student_id: args.data.student_id ?? null,
        case_id: args.data.case_id ?? null,
        concern_id: args.data.concern_id ?? null,
        description: args.data.description,
        discussion_notes: null,
        decisions: null,
        display_order: args.data.display_order,
        created_at: new Date(),
        updated_at: new Date(),
      } as SstMeetingAgendaItemRow;
    },
  );

  // Meeting update for agenda_precomputed_at
  mockRlsTx.sstMeeting.update.mockResolvedValue(
    makeMeeting({ agenda_precomputed_at: new Date() }),
  );

  // Default: no items from any source
  mockRlsTx.pastoralConcern.findMany.mockResolvedValue([]);
  mockRlsTx.pastoralCase.findMany.mockResolvedValue([]);
  mockRlsTx.sstMeetingAction.findMany.mockResolvedValue([]);
  mockRlsTx.pastoralReferral.findMany.mockResolvedValue([]);
  mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
  mockRlsTx.studentAcademicRiskAlert.findMany.mockResolvedValue([]);
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('SstAgendaGeneratorService', () => {
  let service: SstAgendaGeneratorService;
  let mockPastoralEventService: { write: jest.Mock };
  let mockPrisma: Record<string, unknown>;
  let mockConfigFacade: { findSettings: jest.Mock };

  beforeEach(async () => {
    mockPastoralEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

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
        SstAgendaGeneratorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PastoralEventService, useValue: mockPastoralEventService },
        { provide: ConfigurationReadFacade, useValue: mockConfigFacade },
      ],
    }).compile();

    service = module.get<SstAgendaGeneratorService>(SstAgendaGeneratorService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Source Query: New Concerns ─────────────────────────────────────────

  describe('queryNewConcerns', () => {
    it('returns concerns created since last meeting with tier <= 2', async () => {
      setupDefaultMocks();

      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([
        {
          id: CONCERN_ID_A,
          student_id: STUDENT_ID_A,
          category: 'academic',
          severity: 'routine',
        },
        {
          id: CONCERN_ID_B,
          student_id: STUDENT_ID_B,
          category: 'bullying',
          severity: 'elevated',
        },
      ]);

      const items = await service.queryNewConcerns(
        mockRlsTx as unknown as PrismaService,
        TENANT_ID,
        PREV_MEETING_DATE,
      );

      expect(items).toHaveLength(2);
      expect(items[0]).toEqual(
        expect.objectContaining({
          source: 'auto_new_concern',
          student_id: STUDENT_ID_A,
          concern_id: CONCERN_ID_A,
          case_id: null,
        }),
      );
      expect(items[1]).toEqual(
        expect.objectContaining({
          source: 'auto_new_concern',
          student_id: STUDENT_ID_B,
          concern_id: CONCERN_ID_B,
        }),
      );

      // Verify the query filters tier <= 2
      expect(mockRlsTx.pastoralConcern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            created_at: { gte: PREV_MEETING_DATE },
            tier: { lte: 2 },
          }),
        }),
      );
    });
  });

  // ─── Source Query: Cases Requiring Review ────────────────────────────────

  describe('queryCasesRequiringReview', () => {
    it('returns active/monitoring cases with review date before meeting', async () => {
      setupDefaultMocks();

      mockRlsTx.pastoralCase.findMany.mockResolvedValue([
        {
          id: CASE_ID_A,
          student_id: STUDENT_ID_A,
          case_number: 'PC-202603-001',
          status: 'active',
        },
      ]);

      const items = await service.queryCasesRequiringReview(
        mockRlsTx as unknown as PrismaService,
        TENANT_ID,
        NOW,
      );

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual(
        expect.objectContaining({
          source: 'auto_case_review',
          student_id: STUDENT_ID_A,
          case_id: CASE_ID_A,
          concern_id: null,
        }),
      );

      // Verify filter includes active + monitoring status
      expect(mockRlsTx.pastoralCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            next_review_date: { lte: NOW },
            status: {
              in: expect.arrayContaining(['active', 'monitoring']),
            },
          }),
        }),
      );
    });
  });

  // ─── Source Query: Overdue Actions ──────────────────────────────────────

  describe('queryOverdueActions', () => {
    it('returns SST meeting actions with status overdue', async () => {
      setupDefaultMocks();

      mockRlsTx.sstMeetingAction.findMany.mockResolvedValue([
        {
          id: ACTION_ID_A,
          student_id: STUDENT_ID_A,
          case_id: CASE_ID_A,
          description: 'Follow up with parents',
        },
      ]);

      const items = await service.queryOverdueActions(
        mockRlsTx as unknown as PrismaService,
        TENANT_ID,
      );

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual(
        expect.objectContaining({
          source: 'auto_overdue_action',
          student_id: STUDENT_ID_A,
          case_id: CASE_ID_A,
          description: 'Overdue action: Follow up with parents',
        }),
      );

      // Verify filter for overdue status
      expect(mockRlsTx.sstMeetingAction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: 'pc_overdue',
          }),
        }),
      );
    });
  });

  // ─── Source Query: Early Warning Flags ──────────────────────────────────

  describe('queryEarlyWarningFlags', () => {
    it('returns one review-recommended item per flagged student', async () => {
      setupDefaultMocks();

      mockRlsTx.studentAcademicRiskAlert.findMany.mockResolvedValue([
        {
          id: 'alert-1',
          student_id: STUDENT_ID_A,
          trigger_reason: 'Attendance declined for 3 consecutive weeks',
        },
        {
          id: 'alert-2',
          student_id: STUDENT_ID_A,
          trigger_reason: 'Maths assessment average dropped by 12%',
        },
        {
          id: 'alert-3',
          student_id: STUDENT_ID_B,
          trigger_reason: 'Two elevated concerns logged this month',
        },
      ]);

      const items = await service.queryEarlyWarningFlags(
        mockRlsTx as unknown as PrismaService,
        TENANT_ID,
        NOW,
      );

      expect(items).toEqual([
        {
          source: 'auto_early_warning',
          student_id: STUDENT_ID_A,
          case_id: null,
          concern_id: null,
          description:
            'Review recommended: Attendance declined for 3 consecutive weeks; Maths assessment average dropped by 12%',
        },
        {
          source: 'auto_early_warning',
          student_id: STUDENT_ID_B,
          case_id: null,
          concern_id: null,
          description: 'Review recommended: Two elevated concerns logged this month',
        },
      ]);

      expect(mockRlsTx.studentAcademicRiskAlert.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          status: 'active',
          detected_date: { lte: NOW },
        },
        select: {
          id: true,
          student_id: true,
          trigger_reason: true,
        },
        orderBy: [{ detected_date: 'desc' }, { created_at: 'desc' }],
      });
    });
  });

  // ─── Source Query: NEPS Appointments ────────────────────────────────────

  describe('queryUpcomingNepsAppointments', () => {
    it('returns NEPS referrals with upcoming status changes', async () => {
      setupDefaultMocks();

      mockRlsTx.pastoralReferral.findMany.mockResolvedValue([
        {
          id: REFERRAL_ID_A,
          student_id: STUDENT_ID_A,
          case_id: CASE_ID_A,
          status: 'assessment_scheduled',
        },
      ]);

      const items = await service.queryUpcomingNepsAppointments(
        mockRlsTx as unknown as PrismaService,
        TENANT_ID,
        NOW,
      );

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual(
        expect.objectContaining({
          source: 'auto_neps',
          student_id: STUDENT_ID_A,
          case_id: CASE_ID_A,
          description: 'NEPS referral: assessment_scheduled',
        }),
      );

      // Verify filter for NEPS referral type and relevant statuses
      expect(mockRlsTx.pastoralReferral.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            referral_type: 'neps',
            status: {
              in: expect.arrayContaining([
                'submitted',
                'acknowledged',
                'assessment_scheduled',
              ]),
            },
          }),
        }),
      );
    });
  });

  // ─── Source Query: Intervention Reviews ─────────────────────────────────

  describe('queryInterventionReviewDates', () => {
    it('returns active interventions with upcoming review dates', async () => {
      setupDefaultMocks();

      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([
        {
          id: INTERVENTION_ID_A,
          student_id: STUDENT_ID_A,
          case_id: CASE_ID_A,
          intervention_type: 'counselling',
        },
      ]);

      const items = await service.queryInterventionReviewDates(
        mockRlsTx as unknown as PrismaService,
        TENANT_ID,
        NOW,
      );

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual(
        expect.objectContaining({
          source: 'auto_intervention_review',
          student_id: STUDENT_ID_A,
          case_id: CASE_ID_A,
          description: 'Intervention review due: counselling',
        }),
      );

      // Verify 7-day review window
      const sevenDaysAfter = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000);
      expect(mockRlsTx.pastoralIntervention.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            next_review_date: { lte: sevenDaysAfter },
            status: 'pc_active',
          }),
        }),
      );
    });
  });

  // ─── Merge / De-duplication ─────────────────────────────────────────────

  describe('mergeAgendaItems', () => {
    it('filters out duplicate items by source + reference key', () => {
      const existingItems: SstMeetingAgendaItemRow[] = [
        makeExistingAgendaItem({
          id: 'existing-1',
          source: 'auto_new_concern',
          concern_id: CONCERN_ID_A,
          student_id: STUDENT_ID_A,
        }),
        makeExistingAgendaItem({
          id: 'existing-2',
          source: 'auto_case_review',
          case_id: CASE_ID_A,
          student_id: STUDENT_ID_A,
          concern_id: null,
        }),
      ];

      const newItems: AgendaSourceItem[] = [
        // Duplicate: same source + same concern_id
        {
          source: 'auto_new_concern',
          student_id: STUDENT_ID_A,
          case_id: null,
          concern_id: CONCERN_ID_A,
          description: 'New concern: academic (routine)',
        },
        // NOT duplicate: same source but different concern_id
        {
          source: 'auto_new_concern',
          student_id: STUDENT_ID_B,
          case_id: null,
          concern_id: CONCERN_ID_B,
          description: 'New concern: bullying (elevated)',
        },
        // Duplicate: same source + same case_id
        {
          source: 'auto_case_review',
          student_id: STUDENT_ID_A,
          case_id: CASE_ID_A,
          concern_id: null,
          description: 'Case PC-202603-001 review due (active)',
        },
        // NOT duplicate: different source entirely
        {
          source: 'auto_overdue_action',
          student_id: STUDENT_ID_A,
          case_id: CASE_ID_A,
          concern_id: null,
          description: 'Overdue action: Follow up with parents',
        },
      ];

      const result = service.mergeAgendaItems(MEETING_ID, existingItems, newItems);

      // Should only include the 2 non-duplicate items
      expect(result).toHaveLength(2);
      expect(result[0]!.concern_id).toBe(CONCERN_ID_B);
      expect(result[1]!.source).toBe('auto_overdue_action');
    });

    it('never considers manual items as duplicates', () => {
      const existingItems: SstMeetingAgendaItemRow[] = [
        makeExistingAgendaItem({
          id: 'existing-manual',
          source: 'manual',
          student_id: STUDENT_ID_A,
          concern_id: null,
        }),
      ];

      const newItems: AgendaSourceItem[] = [
        {
          source: 'manual',
          student_id: STUDENT_ID_A,
          case_id: null,
          concern_id: null,
          description: 'Another manual item for same student',
        },
      ];

      const result = service.mergeAgendaItems(MEETING_ID, existingItems, newItems);

      // Manual items always pass through
      expect(result).toHaveLength(1);
      expect(result[0]!.source).toBe('manual');
    });

    it('produces no duplicates on double refresh', () => {
      const existingItems: SstMeetingAgendaItemRow[] = [
        makeExistingAgendaItem({
          id: 'existing-1',
          source: 'auto_new_concern',
          concern_id: CONCERN_ID_A,
          student_id: STUDENT_ID_A,
        }),
      ];

      // Same items generated again (simulating refresh)
      const refreshItems: AgendaSourceItem[] = [
        {
          source: 'auto_new_concern',
          student_id: STUDENT_ID_A,
          case_id: null,
          concern_id: CONCERN_ID_A,
          description: 'New concern: academic (routine)',
        },
      ];

      const result = service.mergeAgendaItems(MEETING_ID, existingItems, refreshItems);

      // All items are duplicates, nothing new to insert
      expect(result).toHaveLength(0);
    });
  });

  // ─── Manual Items Preserved ─────────────────────────────────────────────

  describe('manual items preserved during generation', () => {
    it('preserves existing manual items when generating auto items', async () => {
      setupDefaultMocks();

      const manualItem = makeExistingAgendaItem({
        id: 'manual-1',
        source: 'manual',
        student_id: STUDENT_ID_A,
        concern_id: null,
        case_id: null,
        description: 'Discuss student progress update from parent',
        display_order: 1,
      });

      // Existing items include a manual item
      mockRlsTx.sstMeetingAgendaItem.findMany.mockResolvedValue([manualItem]);

      // One new concern from auto source
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([
        {
          id: CONCERN_ID_A,
          student_id: STUDENT_ID_A,
          category: 'academic',
          severity: 'routine',
        },
      ]);

      const result = await service.generateAgenda(TENANT_ID, MEETING_ID, ACTOR_USER_ID);

      // Manual item is preserved in the result
      const manualItems = result.filter((i) => i.source === 'manual');
      expect(manualItems).toHaveLength(1);
      expect(manualItems[0]!.description).toBe(
        'Discuss student progress update from parent',
      );

      // New auto item was also created
      const autoItems = result.filter((i) => i.source === 'auto_new_concern');
      expect(autoItems).toHaveLength(1);
    });
  });

  // ─── Tenant Settings Source Filtering ───────────────────────────────────

  describe('tenant settings source filtering', () => {
    it('skips disabled sources', async () => {
      setupDefaultMocks();

      // Only enable new_concerns, disable everything else
      mockConfigFacade.findSettings.mockResolvedValue(
        makeTenantSettingsRecord({
          auto_agenda_sources: ['new_concerns'],
        }),
      );

      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([
        {
          id: CONCERN_ID_A,
          student_id: STUDENT_ID_A,
          category: 'academic',
          severity: 'routine',
        },
      ]);

      await service.generateAgenda(TENANT_ID, MEETING_ID, ACTOR_USER_ID);

      // Only concern query should have been called
      expect(mockRlsTx.pastoralConcern.findMany).toHaveBeenCalledTimes(1);

      // Case review, overdue actions, referrals, interventions NOT called
      expect(mockRlsTx.pastoralCase.findMany).not.toHaveBeenCalled();
      expect(mockRlsTx.sstMeetingAction.findMany).not.toHaveBeenCalled();
      expect(mockRlsTx.pastoralReferral.findMany).not.toHaveBeenCalled();
      expect(mockRlsTx.pastoralIntervention.findMany).not.toHaveBeenCalled();
    });

    it('queries all sources when all are enabled', async () => {
      setupDefaultMocks();

      mockConfigFacade.findSettings.mockResolvedValue(
        makeTenantSettingsRecord({
          auto_agenda_sources: [
            'new_concerns',
            'case_reviews',
            'overdue_actions',
            'early_warning',
            'neps',
            'intervention_reviews',
          ],
        }),
      );

      await service.generateAgenda(TENANT_ID, MEETING_ID, ACTOR_USER_ID);

      // All source queries should have been called
      expect(mockRlsTx.pastoralConcern.findMany).toHaveBeenCalledTimes(1);
      expect(mockRlsTx.pastoralCase.findMany).toHaveBeenCalledTimes(1);
      expect(mockRlsTx.sstMeetingAction.findMany).toHaveBeenCalledTimes(1);
      expect(mockRlsTx.studentAcademicRiskAlert.findMany).toHaveBeenCalledTimes(1);
      expect(mockRlsTx.pastoralReferral.findMany).toHaveBeenCalledTimes(1);
      expect(mockRlsTx.pastoralIntervention.findMany).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Display Order Grouping ─────────────────────────────────────────────

  describe('display order grouping', () => {
    it('assigns sequential display_order grouped by source', async () => {
      setupDefaultMocks();

      // Concerns
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([
        { id: CONCERN_ID_A, student_id: STUDENT_ID_A, category: 'academic', severity: 'routine' },
        { id: CONCERN_ID_B, student_id: STUDENT_ID_B, category: 'bullying', severity: 'elevated' },
      ]);

      // Cases
      mockRlsTx.pastoralCase.findMany.mockResolvedValue([
        { id: CASE_ID_A, student_id: STUDENT_ID_A, case_number: 'PC-202603-001', status: 'active' },
      ]);

      await service.generateAgenda(TENANT_ID, MEETING_ID, ACTOR_USER_ID);

      // Verify display_order was assigned to each created item
      const createCalls = mockRlsTx.sstMeetingAgendaItem.create.mock.calls as Array<
        [{ data: { display_order: number; source: string } }]
      >;

      expect(createCalls.length).toBe(3); // 2 concerns + 1 case

      // Orders should be sequential starting from 1 (no existing items)
      const orders = createCalls.map((call) => call[0].data.display_order);
      expect(orders).toEqual([1, 2, 3]);

      // Items grouped by source: concerns first, then cases
      const sources = createCalls.map((call) => call[0].data.source);
      expect(sources[0]).toBe('auto_new_concern');
      expect(sources[1]).toBe('auto_new_concern');
      expect(sources[2]).toBe('auto_case_review');
    });

    it('starts display_order after existing items', async () => {
      setupDefaultMocks();

      // Existing items with display_order 1 and 2
      mockRlsTx.sstMeetingAgendaItem.findMany.mockResolvedValue([
        makeExistingAgendaItem({ display_order: 1 }),
        makeExistingAgendaItem({
          id: 'existing-2',
          source: 'manual',
          display_order: 2,
          concern_id: null,
        }),
      ]);

      // One new concern (not a duplicate of existing since different concern_id)
      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([
        { id: CONCERN_ID_B, student_id: STUDENT_ID_B, category: 'bullying', severity: 'elevated' },
      ]);

      await service.generateAgenda(TENANT_ID, MEETING_ID, ACTOR_USER_ID);

      // New item should start at display_order 3
      const createCalls = mockRlsTx.sstMeetingAgendaItem.create.mock.calls as Array<
        [{ data: { display_order: number } }]
      >;
      expect(createCalls.length).toBe(1);
      expect(createCalls[0]![0].data.display_order).toBe(3);
    });
  });

  // ─── agenda_precomputed_at Updated ──────────────────────────────────────

  describe('agenda_precomputed_at updated', () => {
    it('updates agenda_precomputed_at after generation', async () => {
      setupDefaultMocks();

      await service.generateAgenda(TENANT_ID, MEETING_ID, ACTOR_USER_ID);

      expect(mockRlsTx.sstMeeting.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MEETING_ID },
          data: expect.objectContaining({
            agenda_precomputed_at: expect.any(Date),
          }),
        }),
      );
    });

    it('writes agenda_precomputed audit event', async () => {
      setupDefaultMocks();

      await service.generateAgenda(TENANT_ID, MEETING_ID, ACTOR_USER_ID);

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'agenda_precomputed',
          entity_type: 'meeting',
          entity_id: MEETING_ID,
          payload: expect.objectContaining({
            meeting_id: MEETING_ID,
            items_generated: expect.any(Number),
            sources_queried: expect.any(Array),
          }),
        }),
      );
    });
  });

  // ─── Previous Meeting Boundary ──────────────────────────────────────────

  describe('previous meeting boundary', () => {
    it('uses epoch when no previous completed meeting exists', async () => {
      setupDefaultMocks();

      // No previous completed meeting
      mockRlsTx.sstMeeting.findFirst.mockResolvedValue(null);

      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([]);

      await service.generateAgenda(TENANT_ID, MEETING_ID, ACTOR_USER_ID);

      // The concern query should have been called with epoch as sinceDate
      expect(mockRlsTx.pastoralConcern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: { gte: new Date(0) },
          }),
        }),
      );
    });

    it('uses previous meeting date as since boundary', async () => {
      setupDefaultMocks();

      mockRlsTx.pastoralConcern.findMany.mockResolvedValue([]);

      await service.generateAgenda(TENANT_ID, MEETING_ID, ACTOR_USER_ID);

      // The concern query should use the previous meeting's scheduled_at
      expect(mockRlsTx.pastoralConcern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: { gte: PREV_MEETING_DATE },
          }),
        }),
      );
    });
  });

  // ─── Edge: Meeting Not Found ────────────────────────────────────────────

  describe('edge cases', () => {
    it('returns empty array when meeting not found', async () => {
      setupDefaultMocks();
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(null);

      const result = await service.generateAgenda(
        TENANT_ID,
        MEETING_ID,
        ACTOR_USER_ID,
      );

      expect(result).toEqual([]);
    });
  });
});
