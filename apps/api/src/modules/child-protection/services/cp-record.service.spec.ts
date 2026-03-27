import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PastoralEventService } from '../../pastoral/services/pastoral-event.service';
import { PrismaService } from '../../prisma/prisma.service';

import { CpRecordService } from './cp-record.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID_OTHER = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const CONCERN_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const RECORD_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  cpRecord: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  pastoralConcern: {
    findUnique: jest.fn(),
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

const makeCpRecord = (overrides: Record<string, unknown> = {}) => ({
  id: RECORD_ID,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  concern_id: CONCERN_ID,
  record_type: 'concern',
  logged_by_user_id: USER_ID,
  narrative: 'Child protection concern narrative for testing purposes.',
  mandated_report_status: null,
  mandated_report_ref: null,
  tusla_contact_name: null,
  tusla_contact_date: null,
  legal_hold: false,
  created_at: new Date('2026-03-27T10:00:00Z'),
  updated_at: new Date('2026-03-27T10:00:00Z'),
  logged_by: { first_name: 'Jane', last_name: 'Teacher' },
  ...overrides,
});

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('CpRecordService', () => {
  let service: CpRecordService;
  let mockPastoralEventService: { write: jest.Mock };

  beforeEach(async () => {
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
        CpRecordService,
        { provide: PrismaService, useValue: {} },
        { provide: PastoralEventService, useValue: mockPastoralEventService },
      ],
    }).compile();

    service = module.get<CpRecordService>(CpRecordService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ─────────────────────────────────────────────────────────────

  describe('create', () => {
    const baseDto = {
      concern_id: CONCERN_ID,
      student_id: STUDENT_ID,
      record_type: 'concern' as const,
      narrative: 'Child protection concern narrative for testing purposes.',
    };

    it('creates a CP record with valid data and logs audit event', async () => {
      mockRlsTx.pastoralConcern.findUnique.mockResolvedValue({
        id: CONCERN_ID,
        tier: 3,
      });
      mockRlsTx.cpRecord.create.mockResolvedValue(makeCpRecord());

      const result = await service.create(TENANT_ID, USER_ID, baseDto, '127.0.0.1');

      expect(mockRlsTx.cpRecord.create).toHaveBeenCalledTimes(1);
      expect(mockRlsTx.cpRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          concern_id: CONCERN_ID,
          record_type: 'concern',
          logged_by_user_id: USER_ID,
          narrative: baseDto.narrative,
        }),
        include: {
          logged_by: { select: { first_name: true, last_name: true } },
        },
      });

      expect(result.data).toMatchObject({
        id: RECORD_ID,
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        record_type: 'concern',
      });

      // Verify audit event was fired
      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'cp_record_accessed',
          entity_type: 'cp_record',
          entity_id: RECORD_ID,
          student_id: STUDENT_ID,
          actor_user_id: USER_ID,
          tier: 3,
        }),
      );
    });

    it('validates concern is tier=3 before creating', async () => {
      mockRlsTx.pastoralConcern.findUnique.mockResolvedValue({
        id: CONCERN_ID,
        tier: 2, // Not tier 3
      });

      await expect(
        service.create(TENANT_ID, USER_ID, baseDto, '127.0.0.1'),
      ).rejects.toThrow(NotFoundException);

      expect(mockRlsTx.cpRecord.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException if linked concern does not exist', async () => {
      mockRlsTx.pastoralConcern.findUnique.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, USER_ID, baseDto, '127.0.0.1'),
      ).rejects.toThrow(NotFoundException);

      expect(mockRlsTx.cpRecord.create).not.toHaveBeenCalled();
    });

    it('sets RLS context with both tenant_id and user_id', async () => {
      const { createRlsClient } = jest.requireMock(
        '../../../common/middleware/rls.middleware',
      ) as { createRlsClient: jest.Mock };

      mockRlsTx.pastoralConcern.findUnique.mockResolvedValue({
        id: CONCERN_ID,
        tier: 3,
      });
      mockRlsTx.cpRecord.create.mockResolvedValue(makeCpRecord());

      await service.create(TENANT_ID, USER_ID, baseDto, '127.0.0.1');

      expect(createRlsClient).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tenant_id: TENANT_ID,
          user_id: USER_ID,
        }),
      );
    });
  });

  // ─── listByStudent ────────────────────────────────────────────────────────

  describe('listByStudent', () => {
    const baseQuery = {
      student_id: STUDENT_ID,
      page: 1,
      pageSize: 20,
    };

    it('returns paginated CP records for a student', async () => {
      const records = [makeCpRecord(), makeCpRecord({ id: 'record-2' })];
      mockRlsTx.cpRecord.findMany.mockResolvedValue(records);
      mockRlsTx.cpRecord.count.mockResolvedValue(2);

      const result = await service.listByStudent(
        TENANT_ID,
        USER_ID,
        baseQuery,
        '127.0.0.1',
      );

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
    });

    it('filters by record_type when provided', async () => {
      mockRlsTx.cpRecord.findMany.mockResolvedValue([]);
      mockRlsTx.cpRecord.count.mockResolvedValue(0);

      await service.listByStudent(
        TENANT_ID,
        USER_ID,
        { ...baseQuery, record_type: 'mandated_report' as const },
        null,
      );

      expect(mockRlsTx.cpRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            record_type: 'mandated_report',
          }),
        }),
      );
    });

    it('logs cp_record_accessed audit event for listing', async () => {
      mockRlsTx.cpRecord.findMany.mockResolvedValue([]);
      mockRlsTx.cpRecord.count.mockResolvedValue(0);

      await service.listByStudent(TENANT_ID, USER_ID, baseQuery, '127.0.0.1');

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'cp_record_accessed',
          entity_type: 'cp_record',
          actor_user_id: USER_ID,
          tier: 3,
        }),
      );
    });

    it('handles pagination correctly with skip', async () => {
      mockRlsTx.cpRecord.findMany.mockResolvedValue([]);
      mockRlsTx.cpRecord.count.mockResolvedValue(50);

      await service.listByStudent(
        TENANT_ID,
        USER_ID,
        { ...baseQuery, page: 3, pageSize: 10 },
        null,
      );

      expect(mockRlsTx.cpRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20, // (3-1) * 10
          take: 10,
        }),
      );
    });
  });

  // ─── getById ──────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('returns a CP record with full details', async () => {
      mockRlsTx.cpRecord.findUnique.mockResolvedValue(makeCpRecord());

      const result = await service.getById(
        TENANT_ID,
        USER_ID,
        RECORD_ID,
        '127.0.0.1',
      );

      expect(result.data).toMatchObject({
        id: RECORD_ID,
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        logged_by_name: 'Jane Teacher',
      });
    });

    it('logs cp_record_accessed audit event on read', async () => {
      mockRlsTx.cpRecord.findUnique.mockResolvedValue(makeCpRecord());

      await service.getById(TENANT_ID, USER_ID, RECORD_ID, '127.0.0.1');

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'cp_record_accessed',
          entity_type: 'cp_record',
          entity_id: RECORD_ID,
          student_id: STUDENT_ID,
          actor_user_id: USER_ID,
          tier: 3,
          payload: {
            cp_record_id: RECORD_ID,
            student_id: STUDENT_ID,
          },
          ip_address: '127.0.0.1',
        }),
      );
    });

    it('throws NotFoundException when record does not exist', async () => {
      mockRlsTx.cpRecord.findUnique.mockResolvedValue(null);

      await expect(
        service.getById(TENANT_ID, USER_ID, RECORD_ID, null),
      ).rejects.toThrow(NotFoundException);

      // Audit event should NOT be written for missing records
      expect(mockPastoralEventService.write).not.toHaveBeenCalled();
    });

    it('RLS user_id isolation: different user sees only their accessible records', async () => {
      const { createRlsClient } = jest.requireMock(
        '../../../common/middleware/rls.middleware',
      ) as { createRlsClient: jest.Mock };

      // Simulate that RLS returns null for records not accessible to this user
      mockRlsTx.cpRecord.findUnique.mockResolvedValue(null);

      await expect(
        service.getById(TENANT_ID, USER_ID_OTHER, RECORD_ID, null),
      ).rejects.toThrow(NotFoundException);

      // Verify that user_id was passed to RLS client
      expect(createRlsClient).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tenant_id: TENANT_ID,
          user_id: USER_ID_OTHER,
        }),
      );
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates tusla_contact_name on a CP record', async () => {
      const existing = makeCpRecord();
      const updated = makeCpRecord({
        tusla_contact_name: 'John Inspector',
        updated_at: new Date('2026-03-27T12:00:00Z'),
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(existing);
      mockRlsTx.cpRecord.update.mockResolvedValue(updated);

      const result = await service.update(
        TENANT_ID,
        USER_ID,
        RECORD_ID,
        { tusla_contact_name: 'John Inspector' },
        '127.0.0.1',
      );

      expect(result.data.tusla_contact_name).toBe('John Inspector');
      expect(mockRlsTx.cpRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: RECORD_ID },
          data: expect.objectContaining({
            tusla_contact_name: 'John Inspector',
          }),
        }),
      );
    });

    it('updates legal_hold flag on a CP record', async () => {
      const existing = makeCpRecord();
      const updated = makeCpRecord({ legal_hold: true });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(existing);
      mockRlsTx.cpRecord.update.mockResolvedValue(updated);

      const result = await service.update(
        TENANT_ID,
        USER_ID,
        RECORD_ID,
        { legal_hold: true },
        null,
      );

      expect(result.data.legal_hold).toBe(true);
    });

    it('updates tusla_contact_date on a CP record', async () => {
      const existing = makeCpRecord();
      const contactDate = '2026-03-28T14:00:00.000Z';
      const updated = makeCpRecord({
        tusla_contact_date: new Date(contactDate),
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(existing);
      mockRlsTx.cpRecord.update.mockResolvedValue(updated);

      const result = await service.update(
        TENANT_ID,
        USER_ID,
        RECORD_ID,
        { tusla_contact_date: contactDate },
        null,
      );

      expect(result.data.tusla_contact_date).toEqual(new Date(contactDate));
    });

    it('logs audit event on update', async () => {
      const existing = makeCpRecord();
      mockRlsTx.cpRecord.findUnique.mockResolvedValue(existing);
      mockRlsTx.cpRecord.update.mockResolvedValue(
        makeCpRecord({ legal_hold: true }),
      );

      await service.update(
        TENANT_ID,
        USER_ID,
        RECORD_ID,
        { legal_hold: true },
        '127.0.0.1',
      );

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'cp_record_accessed',
          entity_type: 'cp_record',
          entity_id: RECORD_ID,
          actor_user_id: USER_ID,
          tier: 3,
        }),
      );
    });

    it('throws NotFoundException when record does not exist', async () => {
      mockRlsTx.cpRecord.findUnique.mockResolvedValue(null);

      await expect(
        service.update(
          TENANT_ID,
          USER_ID,
          RECORD_ID,
          { legal_hold: true },
          null,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(mockRlsTx.cpRecord.update).not.toHaveBeenCalled();
    });
  });

  // ─── narrative preview truncation ─────────────────────────────────────────

  describe('toSummary (via listByStudent)', () => {
    it('truncates long narratives to 200 characters with ellipsis', async () => {
      const longNarrative = 'A'.repeat(300);
      mockRlsTx.cpRecord.findMany.mockResolvedValue([
        makeCpRecord({ narrative: longNarrative }),
      ]);
      mockRlsTx.cpRecord.count.mockResolvedValue(1);

      const result = await service.listByStudent(
        TENANT_ID,
        USER_ID,
        { student_id: STUDENT_ID, page: 1, pageSize: 20 },
        null,
      );

      expect(result.data).toHaveLength(1);
      const firstItem = result.data[0]!;
      expect(firstItem.narrative_preview).toHaveLength(203); // 200 + '...'
      expect(firstItem.narrative_preview).toMatch(/\.\.\.$/);
    });

    it('does not truncate short narratives', async () => {
      const shortNarrative = 'Brief note.';
      mockRlsTx.cpRecord.findMany.mockResolvedValue([
        makeCpRecord({ narrative: shortNarrative }),
      ]);
      mockRlsTx.cpRecord.count.mockResolvedValue(1);

      const result = await service.listByStudent(
        TENANT_ID,
        USER_ID,
        { student_id: STUDENT_ID, page: 1, pageSize: 20 },
        null,
      );

      expect(result.data).toHaveLength(1);
      const firstItem = result.data[0]!;
      expect(firstItem.narrative_preview).toBe(shortNarrative);
    });
  });
});
