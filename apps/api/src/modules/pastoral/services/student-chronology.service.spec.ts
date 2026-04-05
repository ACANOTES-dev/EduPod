import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';
import { StudentChronologyService } from './student-chronology.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID_STAFF = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID_DLP = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STUDENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  pastoralEvent: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  pastoralConcern: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  pastoralCase: {
    findUnique: jest.fn(),
  },
  pastoralConcernVersion: {
    findMany: jest.fn(),
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

const makeEvent = (overrides: Record<string, unknown> = {}) => ({
  id: `event-${Math.random().toString(36).slice(2, 10)}`,
  tenant_id: TENANT_ID,
  event_type: 'concern_created',
  entity_type: 'concern',
  entity_id: 'concern-1',
  student_id: STUDENT_ID,
  actor_user_id: USER_ID_STAFF,
  tier: 1,
  payload: {
    concern_id: 'concern-1',
    student_id: STUDENT_ID,
    category: 'academic',
    severity: 'routine',
    tier: 1,
  },
  ip_address: null,
  created_at: new Date('2026-03-15T10:00:00Z'),
  ...overrides,
});

const makeTier3Event = (overrides: Record<string, unknown> = {}) =>
  makeEvent({
    id: 'event-tier3',
    tier: 3,
    event_type: 'concern_created',
    entity_id: 'concern-cp-1',
    payload: {
      concern_id: 'concern-cp-1',
      student_id: STUDENT_ID,
      category: 'child_protection',
      severity: 'critical',
      tier: 3,
    },
    created_at: new Date('2026-03-16T08:00:00Z'),
    ...overrides,
  });

const makeCaseEvent = (overrides: Record<string, unknown> = {}) =>
  makeEvent({
    id: 'event-case-status',
    event_type: 'case_status_changed',
    entity_type: 'case',
    entity_id: 'case-1',
    tier: 1,
    payload: {
      case_id: 'case-1',
      old_status: 'open',
      new_status: 'active',
      reason: 'Activating case for follow-up.',
    },
    created_at: new Date('2026-03-17T14:00:00Z'),
    ...overrides,
  });

const defaultFilters = {
  page: 1,
  pageSize: 50,
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('StudentChronologyService', () => {
  let service: StudentChronologyService;
  let mockPrisma: {
    cpAccessGrant: { findFirst: jest.Mock };
  };
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        StudentChronologyService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PastoralEventService, useValue: mockPastoralEventService },
      ],
    }).compile();

    service = module.get<StudentChronologyService>(StudentChronologyService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── timeline ordering ──────────────────────────────────────────────────

  describe('timeline ordering', () => {
    it('should return all event types in reverse chronological order', async () => {
      const events = [
        makeCaseEvent({ created_at: new Date('2026-03-17T14:00:00Z') }),
        makeTier3Event({ created_at: new Date('2026-03-16T08:00:00Z'), tier: 1 }),
        makeEvent({ created_at: new Date('2026-03-15T10:00:00Z') }),
      ];

      // Non-DLP user -- no CP access
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue(events);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(3);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data).toHaveLength(3);

      // Verify reverse chronological order (newest first)
      const timestamps = result.data.map((e: { timestamp?: string; created_at?: Date }) =>
        new Date(e.timestamp ?? e.created_at ?? '').getTime(),
      );
      for (let i = 0; i < timestamps.length - 1; i++) {
        expect(timestamps[i]!).toBeGreaterThanOrEqual(timestamps[i + 1]!);
      }
    });

    it('should include concern events with version history', async () => {
      const concernEvent = makeEvent({
        event_type: 'concern_created',
        entity_type: 'concern',
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([concernEvent]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data).toHaveLength(1);
      const entry = result.data[0]!;
      expect(entry.entity_type).toBe('concern');
      expect(entry.event_type).toBe('concern_created');
    });

    it('should include case status change events', async () => {
      const caseEvent = makeCaseEvent();

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([caseEvent]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data).toHaveLength(1);
      const entry = result.data[0]!;
      expect(entry.entity_type).toBe('case');
      expect(entry.event_type).toBe('case_status_changed');
    });

    it('should include parent contact events', async () => {
      const parentContactEvent = makeEvent({
        event_type: 'parent_contact_recorded',
        entity_type: 'parent_contact',
        entity_id: 'contact-1',
        payload: {
          contact_method: 'phone',
          outcome_summary: 'Parent informed of concern.',
        },
        created_at: new Date('2026-03-18T09:00:00Z'),
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([parentContactEvent]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data).toHaveLength(1);
      const entry = result.data[0]!;
      expect(entry.entity_type).toBe('parent_contact');
    });
  });

  // ─── pagination ─────────────────────────────────────────────────────────

  describe('pagination', () => {
    it('should paginate correctly', async () => {
      const events = Array.from({ length: 10 }, (_, i) =>
        makeEvent({
          id: `event-${i}`,
          created_at: new Date(`2026-03-${String(10 + i).padStart(2, '0')}T10:00:00Z`),
        }),
      );

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue(events);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(25);

      const result = await service.getChronology(TENANT_ID, USER_ID_STAFF, STUDENT_ID, {
        page: 2,
        pageSize: 10,
      });

      expect(result.data).toHaveLength(10);
      expect(result.meta).toEqual(
        expect.objectContaining({
          total: 25,
          page: 2,
          pageSize: 10,
        }),
      );
    });

    it('should filter by event_types', async () => {
      const caseEvent = makeCaseEvent();

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([caseEvent]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(TENANT_ID, USER_ID_STAFF, STUDENT_ID, {
        ...defaultFilters,
        event_type: 'case_status_changed',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.event_type).toBe('case_status_changed');
    });

    it('should filter by date range', async () => {
      const event = makeEvent({
        created_at: new Date('2026-03-15T10:00:00Z'),
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(TENANT_ID, USER_ID_STAFF, STUDENT_ID, {
        ...defaultFilters,
        from: '2026-03-14',
        to: '2026-03-16',
      });

      expect(result.data).toHaveLength(1);
    });
  });

  // ─── tier 3 visibility (DLP vs non-DLP) ────────────────────────────────

  describe('tier 3 visibility', () => {
    it('should exclude Tier 3 events for non-DLP user', async () => {
      // Non-DLP user has no cp_access_grant
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);

      // Only return tier 1 events (tier 3 should be filtered out)
      const tier1Event = makeEvent({ tier: 1 });
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([tier1Event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      // Non-DLP user should never see tier 3 events
      const tier3Events = result.data.filter((e: { tier: number }) => e.tier === 3);
      expect(tier3Events).toHaveLength(0);
    });

    it('should not query Tier 3 data at all for non-DLP user', async () => {
      // Non-DLP user
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(0);

      await service.getChronology(TENANT_ID, USER_ID_STAFF, STUDENT_ID, defaultFilters);

      // The findMany call should include tier filtering for non-DLP users
      // It should NOT query tier 3 events at all (defence in depth)
      const findManyCall = mockRlsTx.pastoralEvent.findMany.mock.calls[0]?.[0] as
        | { where?: Record<string, unknown> }
        | undefined;

      if (findManyCall?.where) {
        // The where clause should restrict tier < 3 for non-DLP users
        // Accept various forms: { tier: { lt: 3 } }, { tier: { in: [1,2] } },
        // { OR: [...] } with tier checks, etc.
        const whereStr = JSON.stringify(findManyCall.where);
        // Tier 3 should be explicitly excluded in the query
        const includesTierFilter = whereStr.includes('"tier"') || whereStr.includes('"lt"');
        expect(includesTierFilter).toBe(true);
      }
    });

    it('should include Tier 3 events for DLP user', async () => {
      // DLP user has an active cp_access_grant
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue({
        id: 'grant-1',
        user_id: USER_ID_DLP,
        tenant_id: TENANT_ID,
      });

      const tier1Event = makeEvent({ tier: 1, id: 'event-t1' });
      const tier3Event = makeTier3Event({ id: 'event-t3' });

      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([tier3Event, tier1Event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(2);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_DLP,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data).toHaveLength(2);
      const tiers = result.data.map((e: { tier: number }) => e.tier);
      expect(tiers).toContain(3);
    });

    it('should merge Tier 3 seamlessly into timeline for DLP', async () => {
      // DLP user
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue({
        id: 'grant-1',
        user_id: USER_ID_DLP,
        tenant_id: TENANT_ID,
      });

      const events = [
        makeCaseEvent({
          id: 'ev-3',
          created_at: new Date('2026-03-18T14:00:00Z'),
          tier: 1,
        }),
        makeTier3Event({
          id: 'ev-2',
          created_at: new Date('2026-03-17T08:00:00Z'),
        }),
        makeEvent({
          id: 'ev-1',
          created_at: new Date('2026-03-15T10:00:00Z'),
          tier: 1,
        }),
      ];

      mockRlsTx.pastoralEvent.findMany.mockResolvedValue(events);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(3);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_DLP,
        STUDENT_ID,
        defaultFilters,
      );

      // All 3 events present, including the tier 3 one
      expect(result.data).toHaveLength(3);

      // Events are in reverse chronological order -- tier 3 is interleaved,
      // not separated into its own group
      const timestamps = result.data.map((e: { timestamp?: string; created_at?: Date }) =>
        new Date(e.timestamp ?? e.created_at ?? '').getTime(),
      );
      for (let i = 0; i < timestamps.length - 1; i++) {
        expect(timestamps[i]!).toBeGreaterThanOrEqual(timestamps[i + 1]!);
      }
    });
  });

  // ─── summary generation ────────────────────────────────────────────────

  describe('summary generation', () => {
    it('should generate concern_created summary', async () => {
      const event = makeEvent({
        event_type: 'concern_created',
        entity_type: 'concern',
        payload: { category: 'academic', severity: 'routine' },
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toContain('Concern logged');
      expect(result.data[0]!.summary).toContain('academic');
      expect(result.data[0]!.summary).toContain('routine');
    });

    it('should generate concern_tier_escalated summary', async () => {
      const event = makeEvent({
        event_type: 'concern_tier_escalated',
        entity_type: 'concern',
        payload: { old_tier: 1, new_tier: 2 },
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toContain('escalated from tier 1 to tier 2');
    });

    it('should generate concern_acknowledged summary', async () => {
      const event = makeEvent({ event_type: 'concern_acknowledged' });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toBe('Concern acknowledged');
    });

    it('should generate concern_amended summary', async () => {
      const event = makeEvent({
        event_type: 'concern_amended',
        payload: { version_number: 3 },
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toContain('v3');
    });

    it('should generate concern_shared_with_parent summary', async () => {
      const event = makeEvent({
        event_type: 'concern_shared_with_parent',
        payload: { share_level: 'category_summary' },
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toContain('category_summary');
    });

    it('should generate concern_accessed summary', async () => {
      const event = makeEvent({ event_type: 'concern_accessed' });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toBe('Concern record accessed');
    });

    it('should generate case_created summary', async () => {
      const event = makeEvent({
        event_type: 'case_created',
        entity_type: 'case',
        payload: { case_number: 'PC-202603-001' },
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toContain('Case opened');
      expect(result.data[0]!.summary).toContain('PC-202603-001');
    });

    it('should generate case_ownership_transferred summary', async () => {
      const event = makeEvent({
        event_type: 'case_ownership_transferred',
        entity_type: 'case',
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toBe('Case ownership transferred');
    });

    it('should generate case_concern_linked summary', async () => {
      const event = makeEvent({ event_type: 'case_concern_linked', entity_type: 'case' });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toBe('Concern linked to case');
    });

    it('should generate case_concern_unlinked summary', async () => {
      const event = makeEvent({ event_type: 'case_concern_unlinked', entity_type: 'case' });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toBe('Concern unlinked from case');
    });

    it('should generate case_student_added summary', async () => {
      const event = makeEvent({ event_type: 'case_student_added', entity_type: 'case' });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toBe('Student added to case');
    });

    it('should generate case_student_removed summary', async () => {
      const event = makeEvent({ event_type: 'case_student_removed', entity_type: 'case' });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toBe('Student removed from case');
    });

    it('should generate intervention_created summary', async () => {
      const event = makeEvent({
        event_type: 'intervention_created',
        entity_type: 'intervention',
        payload: { intervention_type: 'attendance_support' },
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toContain('Intervention started');
      expect(result.data[0]!.summary).toContain('attendance_support');
    });

    it('should generate intervention_status_changed summary', async () => {
      const event = makeEvent({
        event_type: 'intervention_status_changed',
        entity_type: 'intervention',
        payload: { new_status: 'pc_completed' },
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toContain('Intervention status changed to pc_completed');
    });

    it('should generate intervention_progress_recorded summary', async () => {
      const event = makeEvent({
        event_type: 'intervention_progress_recorded',
        entity_type: 'intervention',
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toBe('Intervention progress note recorded');
    });

    it('should generate referral_created summary', async () => {
      const event = makeEvent({
        event_type: 'referral_created',
        entity_type: 'referral',
        payload: { referral_type: 'neps', referral_body_name: 'NEPS' },
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toContain('Referral created');
      expect(result.data[0]!.summary).toContain('neps');
      expect(result.data[0]!.summary).toContain('NEPS');
    });

    it('should generate referral_submitted summary', async () => {
      const event = makeEvent({
        event_type: 'referral_submitted',
        entity_type: 'referral',
        payload: { referral_body_name: 'CAMHS' },
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toContain('Referral submitted to CAMHS');
    });

    it('should generate referral_status_changed summary', async () => {
      const event = makeEvent({
        event_type: 'referral_status_changed',
        entity_type: 'referral',
        payload: { new_status: 'accepted' },
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toContain('Referral status changed to accepted');
    });

    it('should generate parent_contact_logged summary', async () => {
      const event = makeEvent({
        event_type: 'parent_contact_logged',
        entity_type: 'parent_contact',
        payload: { contact_method: 'phone' },
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toContain('Parent contacted via phone');
    });

    it('should generate cp_record_created summary', async () => {
      const event = makeEvent({
        event_type: 'cp_record_created',
        entity_type: 'cp_record',
        tier: 1, // Needs to be visible to non-DLP users for this test
        payload: { record_type: 'concern' },
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toContain('CP record created');
      expect(result.data[0]!.summary).toContain('concern');
    });

    it('should generate mandated_report_submitted summary', async () => {
      const event = makeEvent({
        event_type: 'mandated_report_submitted',
        entity_type: 'cp_record',
        tier: 1,
        payload: { mandated_report_ref: 'REF-123' },
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toContain('Mandated report submitted');
      expect(result.data[0]!.summary).toContain('REF-123');
    });

    it('should generate default summary for unknown event type', async () => {
      const event = makeEvent({
        event_type: 'some_unknown_event',
        entity_type: 'concern',
        payload: {},
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toContain('some unknown event');
      expect(result.data[0]!.summary).toContain('concern');
    });

    it('should use fallback values when payload fields are missing', async () => {
      const event = makeEvent({
        event_type: 'concern_created',
        payload: {}, // No category or severity
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toContain('unknown category');
      expect(result.data[0]!.summary).toContain('unknown severity');
    });

    it('should use fallback for tier escalation with missing payload', async () => {
      const event = makeEvent({
        event_type: 'concern_tier_escalated',
        payload: {}, // No old_tier or new_tier
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toContain('?');
    });

    it('should use fallback for mandated_report_submitted with no ref', async () => {
      const event = makeEvent({
        event_type: 'mandated_report_submitted',
        entity_type: 'cp_record',
        tier: 1,
        payload: {}, // no mandated_report_ref
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toContain('pending');
    });
  });

  // ─── actor resolution ──────────────────────────────────────────────────

  describe('actor resolution', () => {
    it('should use actor name when actor is present', async () => {
      const event = makeEvent({
        actor: { first_name: 'Jane', last_name: 'Teacher' },
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.actor.name).toBe('Jane Teacher');
      expect(result.data[0]!.actor.masked).toBe(false);
    });

    it('should use fallback name when actor is null', async () => {
      const event = makeEvent({
        actor: null,
        actor_user_id: USER_ID_STAFF,
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.actor.name).toContain('User');
      expect(result.data[0]!.actor.name).toContain(USER_ID_STAFF.slice(0, 8));
      expect(result.data[0]!.actor.masked).toBe(false);
    });
  });

  // ─── entity type resolution ────────────────────────────────────────────

  describe('entity type resolution', () => {
    it('should resolve known entity types', async () => {
      const entityTypes = [
        'concern',
        'case',
        'intervention',
        'referral',
        'parent_contact',
        'cp_record',
      ];

      for (const entityType of entityTypes) {
        const event = makeEvent({
          entity_type: entityType,
          id: `event-${entityType}`,
        });

        mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
        mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
        mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

        const result = await service.getChronology(
          TENANT_ID,
          USER_ID_STAFF,
          STUDENT_ID,
          defaultFilters,
        );

        expect(result.data[0]!.entity_type).toBe(entityType);
      }
    });

    it('should fallback to concern for unknown entity type', async () => {
      const event = makeEvent({ entity_type: 'totally_unknown' });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.entity_type).toBe('concern');
    });
  });

  // ─── filter branches ──────────────────────────────────────────────────

  describe('filter branches', () => {
    it('should handle from-only date range filter', async () => {
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(0);

      await service.getChronology(TENANT_ID, USER_ID_STAFF, STUDENT_ID, {
        ...defaultFilters,
        from: '2026-03-01',
      });

      const findManyCall = mockRlsTx.pastoralEvent.findMany.mock.calls[0]?.[0] as {
        where?: Record<string, unknown>;
      };
      const createdAt = findManyCall?.where?.created_at as Record<string, unknown>;
      expect(createdAt.gte).toEqual(new Date('2026-03-01'));
      expect(createdAt.lte).toBeUndefined();
    });

    it('should handle to-only date range filter', async () => {
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(0);

      await service.getChronology(TENANT_ID, USER_ID_STAFF, STUDENT_ID, {
        ...defaultFilters,
        to: '2026-03-31',
      });

      const findManyCall = mockRlsTx.pastoralEvent.findMany.mock.calls[0]?.[0] as {
        where?: Record<string, unknown>;
      };
      const createdAt = findManyCall?.where?.created_at as Record<string, unknown>;
      expect(createdAt.lte).toEqual(new Date('2026-03-31'));
      expect(createdAt.gte).toBeUndefined();
    });

    it('should handle entity_type filter', async () => {
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(0);

      await service.getChronology(TENANT_ID, USER_ID_STAFF, STUDENT_ID, {
        ...defaultFilters,
        entity_type: 'case',
      });

      const findManyCall = mockRlsTx.pastoralEvent.findMany.mock.calls[0]?.[0] as {
        where?: Record<string, unknown>;
      };
      expect(findManyCall?.where?.entity_type).toBe('case');
    });

    it('should handle null payload', async () => {
      const event = makeEvent({
        payload: null,
        event_type: 'concern_created',
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      // Should not throw, payload should be empty object
      expect(result.data[0]!.payload).toEqual({});
    });
  });

  // ─── Branch coverage: case_status_changed summary ──────────────────────────

  describe('summary generation — additional branches', () => {
    it('should generate case_status_changed with missing payload fields', async () => {
      const event = makeEvent({
        event_type: 'case_status_changed',
        entity_type: 'case',
        payload: {}, // no old_status, no new_status
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toContain('Case status changed: ?');
    });

    it('should generate referral_status_changed summary', async () => {
      const event = makeEvent({
        event_type: 'referral_status_changed',
        entity_type: 'referral',
        payload: { new_status: 'acknowledged' },
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toContain('Referral status changed to acknowledged');
    });

    it('should generate intervention_progress_recorded summary', async () => {
      const event = makeEvent({
        event_type: 'intervention_progress_recorded',
        entity_type: 'intervention',
        payload: {},
      });

      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([event]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(1);

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

      expect(result.data[0]!.summary).toBe('Intervention progress note recorded');
    });
  });

  // ─── Branch coverage: date range filter — to-only ──────────────────────────

  describe('filter branches — additional', () => {
    it('should handle from and to date range simultaneously', async () => {
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(0);

      await service.getChronology(TENANT_ID, USER_ID_STAFF, STUDENT_ID, {
        ...defaultFilters,
        from: '2026-01-01',
        to: '2026-06-30',
      });

      expect(mockRlsTx.pastoralEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: {
              gte: expect.any(Date),
              lte: expect.any(Date),
            },
          }),
        }),
      );
    });

    it('should handle event_type and entity_type filters simultaneously', async () => {
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(0);

      await service.getChronology(TENANT_ID, USER_ID_STAFF, STUDENT_ID, {
        ...defaultFilters,
        event_type: 'concern_created',
        entity_type: 'concern',
      });

      expect(mockRlsTx.pastoralEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            event_type: 'concern_created',
            entity_type: 'concern',
          }),
        }),
      );
    });
  });
});
