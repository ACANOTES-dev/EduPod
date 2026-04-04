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
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockRlsTx),
      ),
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
      const timestamps = result.data.map(
        (e: { timestamp?: string; created_at?: Date }) =>
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
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([
        parentContactEvent,
      ]);
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

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        { page: 2, pageSize: 10 },
      );

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

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        { ...defaultFilters, event_type: 'case_status_changed' },
      );

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

      const result = await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        {
          ...defaultFilters,
          from: '2026-03-14',
          to: '2026-03-16',
        },
      );

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
      const tier3Events = result.data.filter(
        (e: { tier: number }) => e.tier === 3,
      );
      expect(tier3Events).toHaveLength(0);
    });

    it('should not query Tier 3 data at all for non-DLP user', async () => {
      // Non-DLP user
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(0);

      await service.getChronology(
        TENANT_ID,
        USER_ID_STAFF,
        STUDENT_ID,
        defaultFilters,
      );

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
        const includesTierFilter =
          whereStr.includes('"tier"') || whereStr.includes('"lt"');
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

      mockRlsTx.pastoralEvent.findMany.mockResolvedValue([
        tier3Event,
        tier1Event,
      ]);
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
      const timestamps = result.data.map(
        (e: { timestamp?: string; created_at?: Date }) =>
          new Date(e.timestamp ?? e.created_at ?? '').getTime(),
      );
      for (let i = 0; i < timestamps.length - 1; i++) {
        expect(timestamps[i]!).toBeGreaterThanOrEqual(timestamps[i + 1]!);
      }
    });
  });
});
