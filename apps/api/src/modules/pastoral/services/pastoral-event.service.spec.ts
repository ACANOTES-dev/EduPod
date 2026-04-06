import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService, PastoralEventInput } from './pastoral-event.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONCERN_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const CONCERN_B_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  pastoralEvent: {
    create: jest.fn(),
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

// ─── Test suite ─────────────────────────────────────────────────────────────

describe('PastoralEventService', () => {
  let service: PastoralEventService;
  let mockPrisma: {
    pastoralEvent: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      pastoralEvent: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PastoralEventService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<PastoralEventService>(PastoralEventService);

    // Reset RLS tx mocks
    Object.values(mockRlsTx).forEach((model) =>
      Object.values(model).forEach((fn) => fn.mockReset()),
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── write() ────────────────────────────────────────────────────────────

  describe('write', () => {
    const validConcernCreatedEvent: PastoralEventInput = {
      tenant_id: TENANT_ID,
      event_type: 'concern_created',
      entity_type: 'concern',
      entity_id: CONCERN_ID,
      student_id: STUDENT_ID,
      actor_user_id: USER_ID,
      tier: 1,
      payload: {
        concern_id: CONCERN_ID,
        student_id: STUDENT_ID,
        category: 'academic',
        severity: 'routine',
        tier: 1,
        narrative_version: 1,
        narrative_snapshot: 'Student is struggling with maths.',
        source: 'manual',
      },
      ip_address: '127.0.0.1',
    };

    it('writes valid event', async () => {
      mockRlsTx.pastoralEvent.create.mockResolvedValue({ id: 'event-1' });

      await service.write(validConcernCreatedEvent);

      expect(mockRlsTx.pastoralEvent.create).toHaveBeenCalledTimes(1);
      expect(mockRlsTx.pastoralEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'concern_created',
          entity_type: 'concern',
          entity_id: CONCERN_ID,
          student_id: STUDENT_ID,
          actor_user_id: USER_ID,
          tier: 1,
          ip_address: '127.0.0.1',
        }),
      });
    });

    it('validates payload against event type schema — rejects invalid payload', async () => {
      const loggerSpy = jest.spyOn(
        (service as unknown as { logger: { error: jest.Mock } }).logger,
        'error',
      );

      const invalidEvent: PastoralEventInput = {
        ...validConcernCreatedEvent,
        payload: {
          // Missing required fields: concern_id, student_id, category, severity, tier, narrative_version, narrative_snapshot, source
        },
      };

      await service.write(invalidEvent);

      // Should NOT have inserted
      expect(mockRlsTx.pastoralEvent.create).not.toHaveBeenCalled();
      // Should have logged an error
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Payload validation failed'));
    });

    it('discards event with unknown event_type and logs error', async () => {
      const loggerSpy = jest.spyOn(
        (service as unknown as { logger: { error: jest.Mock } }).logger,
        'error',
      );

      const unknownTypeEvent: PastoralEventInput = {
        ...validConcernCreatedEvent,
        event_type: 'totally_made_up_event',
      };

      await service.write(unknownTypeEvent);

      // Should NOT have inserted
      expect(mockRlsTx.pastoralEvent.create).not.toHaveBeenCalled();
      // Should have logged unknown type
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown pastoral event type: totally_made_up_event'),
      );
    });

    it('never throws to caller on DB error', async () => {
      mockRlsTx.pastoralEvent.create.mockRejectedValue(new Error('DB connection lost'));

      // Should not throw — fire-and-forget contract
      await expect(service.write(validConcernCreatedEvent)).resolves.toBeUndefined();
    });

    it('logs non-Error thrown values in catch', async () => {
      const loggerSpy = jest.spyOn(
        (service as unknown as { logger: { error: jest.Mock } }).logger,
        'error',
      );

      mockRlsTx.pastoralEvent.create.mockRejectedValue('string-error');

      await service.write(validConcernCreatedEvent);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to write pastoral event'),
        'string-error',
      );
    });
  });

  // ─── getStudentChronology() ──────────────────────────────────────────────

  describe('getStudentChronology', () => {
    it('returns paginated events', async () => {
      const mockEvents = Array.from({ length: 10 }, (_, i) => ({
        id: `event-${i + 1}`,
        tenant_id: TENANT_ID,
        event_type: 'concern_created',
        entity_type: 'concern',
        entity_id: CONCERN_ID,
        student_id: STUDENT_ID,
        actor_user_id: USER_ID,
        tier: 1,
        payload: {},
        ip_address: null,
        created_at: new Date(`2026-03-${String(27 - i).padStart(2, '0')}T10:00:00Z`),
      }));

      mockRlsTx.pastoralEvent.findMany.mockResolvedValue(mockEvents);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(15);

      const result = await service.getStudentChronology(TENANT_ID, USER_ID, STUDENT_ID, 1, 10);

      expect(result.data).toHaveLength(10);
      expect(result.meta).toEqual({ page: 1, pageSize: 10, total: 15 });
      expect(mockRlsTx.pastoralEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, student_id: STUDENT_ID },
          orderBy: { created_at: 'desc' },
          skip: 0,
          take: 10,
        }),
      );
    });
  });

  // ─── getEntityHistory() ──────────────────────────────────────────────────

  describe('getEntityHistory', () => {
    it('returns events for specific entity only', async () => {
      const concernAEvents = Array.from({ length: 3 }, (_, i) => ({
        id: `event-a-${i + 1}`,
        tenant_id: TENANT_ID,
        event_type: 'concern_created',
        entity_type: 'concern',
        entity_id: CONCERN_ID,
        student_id: STUDENT_ID,
        actor_user_id: USER_ID,
        tier: 1,
        payload: {},
        ip_address: null,
        created_at: new Date(`2026-03-${String(27 - i).padStart(2, '0')}T10:00:00Z`),
      }));

      // Mock returns only concern A events (DB would filter)
      mockRlsTx.pastoralEvent.findMany.mockResolvedValue(concernAEvents);
      mockRlsTx.pastoralEvent.count.mockResolvedValue(3);

      const result = await service.getEntityHistory(
        TENANT_ID,
        USER_ID,
        'concern',
        CONCERN_ID,
        1,
        20,
      );

      expect(result.data).toHaveLength(3);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 3 });
      // Verify the query was scoped to the specific entity
      expect(mockRlsTx.pastoralEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenant_id: TENANT_ID,
            entity_type: 'concern',
            entity_id: CONCERN_ID,
          },
        }),
      );
      // Ensure concern B was never queried
      expect(mockRlsTx.pastoralEvent.findMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entity_id: CONCERN_B_ID,
          }),
        }),
      );
    });
  });
});
