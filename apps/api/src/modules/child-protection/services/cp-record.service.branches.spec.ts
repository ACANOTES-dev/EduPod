import { Test, TestingModule } from '@nestjs/testing';

import { PastoralEventService } from '../../pastoral/services/pastoral-event.service';
import { PrismaService } from '../../prisma/prisma.service';

import { CpRecordService } from './cp-record.service';

// ─── Constants ─────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const RECORD_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── RLS mock ──────────────────────────────────────────────────────────────

const mockRlsTx = {
  cpRecord: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  pastoralConcern: {
    findFirst: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ───────────────────────────────────────────────────────────────

const makeCpRecord = (overrides: Record<string, unknown> = {}) => ({
  id: RECORD_ID,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  concern_id: null,
  record_type: 'concern',
  logged_by_user_id: USER_ID,
  narrative: 'Test narrative content.',
  mandated_report_status: null,
  mandated_report_ref: null,
  tusla_contact_name: null,
  tusla_contact_date: null,
  legal_hold: false,
  created_at: new Date('2026-03-27T10:00:00Z'),
  updated_at: new Date('2026-03-27T10:00:00Z'),
  logged_by: null,
  ...overrides,
});

// ─── Test Suite — Branch Coverage ──────────────────────────────────────────

describe('CpRecordService — branch coverage', () => {
  let service: CpRecordService;
  let mockPastoralEventService: { write: jest.Mock };

  beforeEach(async () => {
    mockPastoralEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

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

  // ─── create — no concern_id (skip concern verification) ──────────────────

  describe('CpRecordService — create with concern_id', () => {
    it('should create a CP record and validate concern when concern_id is provided', async () => {
      const record = makeCpRecord({
        logged_by: { first_name: 'Jane', last_name: 'Teacher' },
      });
      mockRlsTx.cpRecord.create.mockResolvedValue(record);
      mockRlsTx.pastoralConcern.findFirst.mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000000',
        tier: 3,
      });

      const result = await service.create(
        TENANT_ID,
        USER_ID,
        {
          student_id: STUDENT_ID,
          concern_id: '00000000-0000-0000-0000-000000000000',
          record_type: 'concern' as const,
          narrative: 'Test narrative.',
        },
        '127.0.0.1',
      );

      expect(mockRlsTx.pastoralConcern.findFirst).toHaveBeenCalled();
      expect(result.data.id).toBe(RECORD_ID);
    });
  });

  // ─── toResponse — null logged_by ───────────────────────────────────────────

  describe('CpRecordService — toResponse with null logged_by', () => {
    it('should return logged_by_name as null when logged_by relation is null', async () => {
      const record = makeCpRecord({ logged_by: null });
      mockRlsTx.cpRecord.findFirst.mockResolvedValue(record);

      const result = await service.getById(TENANT_ID, USER_ID, RECORD_ID, null);

      expect(result.data.logged_by_name).toBeNull();
    });

    it('should return logged_by_name when logged_by relation is present', async () => {
      const record = makeCpRecord({
        logged_by: { first_name: 'Jane', last_name: 'Teacher' },
      });
      mockRlsTx.cpRecord.findFirst.mockResolvedValue(record);

      const result = await service.getById(TENANT_ID, USER_ID, RECORD_ID, null);

      expect(result.data.logged_by_name).toBe('Jane Teacher');
    });
  });

  // ─── toSummary — null logged_by ────────────────────────────────────────────

  describe('CpRecordService — toSummary with null logged_by', () => {
    it('should return logged_by_name as null in summary when logged_by is null', async () => {
      mockRlsTx.cpRecord.findMany.mockResolvedValue([makeCpRecord({ logged_by: null })]);
      mockRlsTx.cpRecord.count.mockResolvedValue(1);

      const result = await service.listByStudent(
        TENANT_ID,
        USER_ID,
        { student_id: STUDENT_ID, page: 1, pageSize: 20 },
        null,
      );

      expect(result.data[0]!.logged_by_name).toBeNull();
    });
  });

  // ─── toSummary — narrative exactly 200 chars (boundary) ──────────────────

  describe('CpRecordService — toSummary narrative boundary', () => {
    it('edge: should not truncate narrative of exactly 200 characters', async () => {
      const exactNarrative = 'A'.repeat(200);
      mockRlsTx.cpRecord.findMany.mockResolvedValue([makeCpRecord({ narrative: exactNarrative })]);
      mockRlsTx.cpRecord.count.mockResolvedValue(1);

      const result = await service.listByStudent(
        TENANT_ID,
        USER_ID,
        { student_id: STUDENT_ID, page: 1, pageSize: 20 },
        null,
      );

      expect(result.data[0]!.narrative_preview).toBe(exactNarrative);
      expect(result.data[0]!.narrative_preview).toHaveLength(200);
    });

    it('edge: should truncate narrative of 201 characters', async () => {
      const longNarrative = 'A'.repeat(201);
      mockRlsTx.cpRecord.findMany.mockResolvedValue([makeCpRecord({ narrative: longNarrative })]);
      mockRlsTx.cpRecord.count.mockResolvedValue(1);

      const result = await service.listByStudent(
        TENANT_ID,
        USER_ID,
        { student_id: STUDENT_ID, page: 1, pageSize: 20 },
        null,
      );

      expect(result.data[0]!.narrative_preview).toHaveLength(203); // 200 + '...'
    });
  });

  // ─── update — multiple fields simultaneously ─────────────────────────────

  describe('CpRecordService — update multiple fields at once', () => {
    it('should update all three updatable fields at once', async () => {
      const existing = makeCpRecord();
      const contactDate = '2026-04-01T10:00:00.000Z';
      const updated = makeCpRecord({
        tusla_contact_name: 'Inspector',
        tusla_contact_date: new Date(contactDate),
        legal_hold: true,
        logged_by: { first_name: 'Jane', last_name: 'Teacher' },
      });

      mockRlsTx.cpRecord.findFirst.mockResolvedValue(existing);
      mockRlsTx.cpRecord.update.mockResolvedValue(updated);

      const result = await service.update(
        TENANT_ID,
        USER_ID,
        RECORD_ID,
        {
          tusla_contact_name: 'Inspector',
          tusla_contact_date: contactDate,
          legal_hold: true,
        },
        null,
      );

      expect(mockRlsTx.cpRecord.update).toHaveBeenCalledWith({
        where: { id: RECORD_ID },
        data: {
          tusla_contact_name: 'Inspector',
          tusla_contact_date: new Date(contactDate),
          legal_hold: true,
        },
        include: {
          logged_by: { select: { first_name: true, last_name: true } },
        },
      });
      expect(result.data.tusla_contact_name).toBe('Inspector');
      expect(result.data.legal_hold).toBe(true);
    });
  });

  // ─── update — no fields provided (empty update) ──────────────────────────

  describe('CpRecordService — update with empty dto', () => {
    it('should update with empty data object when no updatable fields provided', async () => {
      const existing = makeCpRecord({
        logged_by: { first_name: 'Jane', last_name: 'Teacher' },
      });
      mockRlsTx.cpRecord.findFirst.mockResolvedValue(existing);
      mockRlsTx.cpRecord.update.mockResolvedValue(existing);

      await service.update(TENANT_ID, USER_ID, RECORD_ID, {}, null);

      expect(mockRlsTx.cpRecord.update).toHaveBeenCalledWith({
        where: { id: RECORD_ID },
        data: {},
        include: {
          logged_by: { select: { first_name: true, last_name: true } },
        },
      });
    });
  });
});
