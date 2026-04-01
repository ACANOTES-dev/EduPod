import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MandatedReportStatus } from '@prisma/client';

import { PastoralEventService } from '../../pastoral/services/pastoral-event.service';
import { PrismaService } from '../../prisma/prisma.service';

import { MandatedReportService } from './mandated-report.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CP_RECORD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const IP_ADDRESS = '127.0.0.1';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  cpRecord: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
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

const makeCpRecord = (overrides: Record<string, unknown> = {}) => ({
  id: CP_RECORD_ID,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  concern_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  record_type: 'concern',
  logged_by_user_id: USER_ID,
  narrative: 'Child protection concern narrative.',
  mandated_report_status: null as MandatedReportStatus | null,
  mandated_report_ref: null as string | null,
  tusla_contact_name: null as string | null,
  tusla_contact_date: null as Date | null,
  legal_hold: false,
  created_at: new Date('2026-03-01T10:00:00Z'),
  updated_at: new Date('2026-03-01T10:00:00Z'),
  ...overrides,
});

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('MandatedReportService', () => {
  let service: MandatedReportService;
  let mockPastoralEventService: { write: jest.Mock };

  beforeEach(async () => {
    mockPastoralEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        (fn as jest.Mock).mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MandatedReportService,
        { provide: PrismaService, useValue: {} },
        { provide: PastoralEventService, useValue: mockPastoralEventService },
      ],
    }).compile();

    service = module.get<MandatedReportService>(MandatedReportService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createDraft ─────────────────────────────────────────────────────────

  describe('createDraft', () => {
    it('should create a mandated report in draft state', async () => {
      const cpRecord = makeCpRecord();
      const updatedRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_draft,
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);
      mockRlsTx.cpRecord.update.mockResolvedValue(updatedRecord);

      const result = await service.createDraft(TENANT_ID, USER_ID, CP_RECORD_ID, {}, IP_ADDRESS);

      expect(result.data.mandated_report_status).toBe('draft');
      expect(result.data.cp_record_id).toBe(CP_RECORD_ID);
      expect(result.data.student_id).toBe(STUDENT_ID);

      // Verify update was called with draft status
      expect(mockRlsTx.cpRecord.update).toHaveBeenCalledWith({
        where: { id: CP_RECORD_ID },
        data: {
          mandated_report_status: MandatedReportStatus.mr_draft,
        },
      });
    });

    it('should write mandated_report_generated audit event', async () => {
      const cpRecord = makeCpRecord();
      const updatedRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_draft,
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);
      mockRlsTx.cpRecord.update.mockResolvedValue(updatedRecord);

      await service.createDraft(TENANT_ID, USER_ID, CP_RECORD_ID, {}, IP_ADDRESS);

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'mandated_report_generated',
          entity_type: 'cp_record',
          entity_id: CP_RECORD_ID,
          student_id: STUDENT_ID,
          actor_user_id: USER_ID,
          tier: 3,
          ip_address: IP_ADDRESS,
        }),
      );
    });

    it('should throw NotFoundException if CP record does not exist', async () => {
      mockRlsTx.cpRecord.findUnique.mockResolvedValue(null);

      await expect(
        service.createDraft(TENANT_ID, USER_ID, CP_RECORD_ID, {}, IP_ADDRESS),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if mandated report already exists', async () => {
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_draft,
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);

      await expect(
        service.createDraft(TENANT_ID, USER_ID, CP_RECORD_ID, {}, IP_ADDRESS),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException even if status is submitted', async () => {
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_submitted,
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);

      await expect(
        service.createDraft(TENANT_ID, USER_ID, CP_RECORD_ID, {}, IP_ADDRESS),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── submit ──────────────────────────────────────────────────────────────

  describe('submit', () => {
    const submitDto = { tusla_reference: 'TUSLA-2026-001' };

    it('should transition draft -> submitted', async () => {
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_draft,
      });
      const updatedRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_submitted,
        mandated_report_ref: 'TUSLA-2026-001',
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);
      mockRlsTx.cpRecord.update.mockResolvedValue(updatedRecord);

      const result = await service.submit(TENANT_ID, USER_ID, CP_RECORD_ID, submitDto, IP_ADDRESS);

      expect(result.data.mandated_report_status).toBe('submitted');
      expect(result.data.mandated_report_ref).toBe('TUSLA-2026-001');

      // Verify update was called with submitted status and ref
      expect(mockRlsTx.cpRecord.update).toHaveBeenCalledWith({
        where: { id: CP_RECORD_ID },
        data: {
          mandated_report_status: MandatedReportStatus.mr_submitted,
          mandated_report_ref: 'TUSLA-2026-001',
        },
      });
    });

    it('should store Tusla reference on submission', async () => {
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_draft,
      });
      const updatedRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_submitted,
        mandated_report_ref: 'TUSLA-REF-ABC123',
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);
      mockRlsTx.cpRecord.update.mockResolvedValue(updatedRecord);

      const result = await service.submit(
        TENANT_ID,
        USER_ID,
        CP_RECORD_ID,
        { tusla_reference: 'TUSLA-REF-ABC123' },
        IP_ADDRESS,
      );

      expect(result.data.mandated_report_ref).toBe('TUSLA-REF-ABC123');
    });

    it('should write mandated_report_submitted audit event with tusla_ref', async () => {
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_draft,
      });
      const updatedRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_submitted,
        mandated_report_ref: 'TUSLA-2026-001',
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);
      mockRlsTx.cpRecord.update.mockResolvedValue(updatedRecord);

      await service.submit(TENANT_ID, USER_ID, CP_RECORD_ID, submitDto, IP_ADDRESS);

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'mandated_report_submitted',
          payload: expect.objectContaining({
            tusla_ref: 'TUSLA-2026-001',
          }),
        }),
      );
    });

    it('should throw BadRequestException if status is not draft', async () => {
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_submitted,
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);

      await expect(
        service.submit(TENANT_ID, USER_ID, CP_RECORD_ID, submitDto, IP_ADDRESS),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if no mandated report exists', async () => {
      const cpRecord = makeCpRecord({ mandated_report_status: null });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);

      await expect(
        service.submit(TENANT_ID, USER_ID, CP_RECORD_ID, submitDto, IP_ADDRESS),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if CP record does not exist', async () => {
      mockRlsTx.cpRecord.findUnique.mockResolvedValue(null);

      await expect(
        service.submit(TENANT_ID, USER_ID, CP_RECORD_ID, submitDto, IP_ADDRESS),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateStatus ────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    // ── Valid transitions ──

    it('should transition submitted -> acknowledged', async () => {
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_submitted,
        mandated_report_ref: 'TUSLA-2026-001',
      });
      const updatedRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_acknowledged,
        mandated_report_ref: 'TUSLA-2026-001',
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);
      mockRlsTx.cpRecord.update.mockResolvedValue(updatedRecord);

      const result = await service.updateStatus(
        TENANT_ID,
        USER_ID,
        CP_RECORD_ID,
        { status: 'acknowledged' },
        IP_ADDRESS,
      );

      expect(result.data.mandated_report_status).toBe('acknowledged');

      expect(mockRlsTx.cpRecord.update).toHaveBeenCalledWith({
        where: { id: CP_RECORD_ID },
        data: {
          mandated_report_status: MandatedReportStatus.mr_acknowledged,
        },
      });
    });

    it('should transition acknowledged -> outcome_received', async () => {
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_acknowledged,
        mandated_report_ref: 'TUSLA-2026-001',
      });
      const updatedRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.outcome_received,
        mandated_report_ref: 'TUSLA-2026-001',
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);
      mockRlsTx.cpRecord.update.mockResolvedValue(updatedRecord);

      const result = await service.updateStatus(
        TENANT_ID,
        USER_ID,
        CP_RECORD_ID,
        { status: 'outcome_received' },
        IP_ADDRESS,
      );

      expect(result.data.mandated_report_status).toBe('outcome_received');

      expect(mockRlsTx.cpRecord.update).toHaveBeenCalledWith({
        where: { id: CP_RECORD_ID },
        data: {
          mandated_report_status: MandatedReportStatus.outcome_received,
        },
      });
    });

    it('should write audit event for status transitions', async () => {
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_submitted,
        mandated_report_ref: 'TUSLA-2026-001',
      });
      const updatedRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_acknowledged,
        mandated_report_ref: 'TUSLA-2026-001',
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);
      mockRlsTx.cpRecord.update.mockResolvedValue(updatedRecord);

      await service.updateStatus(
        TENANT_ID,
        USER_ID,
        CP_RECORD_ID,
        { status: 'acknowledged' },
        IP_ADDRESS,
      );

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          entity_type: 'cp_record',
          entity_id: CP_RECORD_ID,
          actor_user_id: USER_ID,
          tier: 3,
        }),
      );
    });

    // ── Blocked transitions ──

    it('should block submitted -> draft (no backward transitions)', async () => {
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_submitted,
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);

      await expect(
        service.updateStatus(
          TENANT_ID,
          USER_ID,
          CP_RECORD_ID,
          { status: 'draft' as 'acknowledged' },
          IP_ADDRESS,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should block draft -> acknowledged (skip not allowed)', async () => {
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_draft,
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);

      await expect(
        service.updateStatus(
          TENANT_ID,
          USER_ID,
          CP_RECORD_ID,
          { status: 'acknowledged' },
          IP_ADDRESS,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should block draft -> outcome_received (skip not allowed)', async () => {
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_draft,
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);

      await expect(
        service.updateStatus(
          TENANT_ID,
          USER_ID,
          CP_RECORD_ID,
          { status: 'outcome_received' },
          IP_ADDRESS,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should block submitted -> outcome_received (skip not allowed)', async () => {
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_submitted,
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);

      await expect(
        service.updateStatus(
          TENANT_ID,
          USER_ID,
          CP_RECORD_ID,
          { status: 'outcome_received' },
          IP_ADDRESS,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should block acknowledged -> draft (no backward transitions)', async () => {
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_acknowledged,
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);

      await expect(
        service.updateStatus(
          TENANT_ID,
          USER_ID,
          CP_RECORD_ID,
          { status: 'draft' as 'acknowledged' },
          IP_ADDRESS,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should block acknowledged -> submitted (no backward transitions)', async () => {
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_acknowledged,
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);

      await expect(
        service.updateStatus(
          TENANT_ID,
          USER_ID,
          CP_RECORD_ID,
          { status: 'submitted' as 'acknowledged' },
          IP_ADDRESS,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should block outcome_received -> anything (terminal state)', async () => {
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.outcome_received,
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);

      await expect(
        service.updateStatus(
          TENANT_ID,
          USER_ID,
          CP_RECORD_ID,
          { status: 'acknowledged' },
          IP_ADDRESS,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should include INVALID_STATUS_TRANSITION code in error response', async () => {
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_submitted,
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);

      try {
        await service.updateStatus(
          TENANT_ID,
          USER_ID,
          CP_RECORD_ID,
          { status: 'draft' as 'acknowledged' },
          IP_ADDRESS,
        );
        fail('Expected BadRequestException');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error).toMatchObject({ response: { code: expect.any(String) } });
        const response = (error as BadRequestException).getResponse();
        expect(response).toEqual(
          expect.objectContaining({
            error: expect.objectContaining({
              code: 'INVALID_STATUS_TRANSITION',
            }),
          }),
        );
      }
    });

    it('should throw BadRequestException if no mandated report exists', async () => {
      const cpRecord = makeCpRecord({ mandated_report_status: null });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);

      await expect(
        service.updateStatus(
          TENANT_ID,
          USER_ID,
          CP_RECORD_ID,
          { status: 'acknowledged' },
          IP_ADDRESS,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if CP record does not exist', async () => {
      mockRlsTx.cpRecord.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus(
          TENANT_ID,
          USER_ID,
          CP_RECORD_ID,
          { status: 'acknowledged' },
          IP_ADDRESS,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getForCpRecord ──────────────────────────────────────────────────────

  describe('getForCpRecord', () => {
    it('should return mandated report data for a CP record with a report', async () => {
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_submitted,
        mandated_report_ref: 'TUSLA-2026-001',
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);

      const result = await service.getForCpRecord(TENANT_ID, USER_ID, CP_RECORD_ID, IP_ADDRESS);

      expect(result.data).not.toBeNull();
      expect(result.data?.mandated_report_status).toBe('submitted');
      expect(result.data?.mandated_report_ref).toBe('TUSLA-2026-001');
      expect(result.data?.cp_record_id).toBe(CP_RECORD_ID);
    });

    it('should return null for a CP record without a mandated report', async () => {
      const cpRecord = makeCpRecord({ mandated_report_status: null });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);

      const result = await service.getForCpRecord(TENANT_ID, USER_ID, CP_RECORD_ID, IP_ADDRESS);

      expect(result.data).toBeNull();
    });

    it('should write cp_record_accessed audit event on read', async () => {
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_draft,
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);

      await service.getForCpRecord(TENANT_ID, USER_ID, CP_RECORD_ID, IP_ADDRESS);

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'cp_record_accessed',
          entity_type: 'cp_record',
          entity_id: CP_RECORD_ID,
          student_id: STUDENT_ID,
          actor_user_id: USER_ID,
          tier: 3,
          ip_address: IP_ADDRESS,
        }),
      );
    });

    it('should write access audit even when no mandated report exists', async () => {
      const cpRecord = makeCpRecord({ mandated_report_status: null });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);

      await service.getForCpRecord(TENANT_ID, USER_ID, CP_RECORD_ID, IP_ADDRESS);

      expect(mockPastoralEventService.write).toHaveBeenCalledTimes(1);
      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'cp_record_accessed',
        }),
      );
    });

    it('should throw NotFoundException if CP record does not exist', async () => {
      mockRlsTx.cpRecord.findUnique.mockResolvedValue(null);

      await expect(
        service.getForCpRecord(TENANT_ID, USER_ID, CP_RECORD_ID, IP_ADDRESS),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findByCpRecord ──────────────────────────────────────────────────────

  describe('findByCpRecord', () => {
    it('should return all mandated reports for a CP record student', async () => {
      const cpRecord = makeCpRecord();
      const reportRecords = [
        makeCpRecord({
          id: 'rrrrrrrr-rrrr-rrrr-rrrr-rrrrrrrrrr01',
          mandated_report_status: MandatedReportStatus.mr_submitted,
          mandated_report_ref: 'TUSLA-2026-001',
        }),
        makeCpRecord({
          id: 'rrrrrrrr-rrrr-rrrr-rrrr-rrrrrrrrrr02',
          mandated_report_status: MandatedReportStatus.mr_draft,
        }),
      ];

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);
      mockRlsTx.cpRecord.findMany.mockResolvedValue(reportRecords);

      const result = await service.findByCpRecord(TENANT_ID, USER_ID, CP_RECORD_ID, IP_ADDRESS);

      expect(result.data).toHaveLength(2);
      expect(result.data[0]!.mandated_report_status).toBe('submitted');
      expect(result.data[1]!.mandated_report_status).toBe('draft');
    });

    it('should return empty array when no mandated reports exist', async () => {
      const cpRecord = makeCpRecord();

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);
      mockRlsTx.cpRecord.findMany.mockResolvedValue([]);

      const result = await service.findByCpRecord(TENANT_ID, USER_ID, CP_RECORD_ID, IP_ADDRESS);

      expect(result.data).toHaveLength(0);
    });

    it('should write access audit event when records are found', async () => {
      const cpRecord = makeCpRecord();
      const reportRecords = [
        makeCpRecord({
          mandated_report_status: MandatedReportStatus.mr_draft,
        }),
      ];

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);
      mockRlsTx.cpRecord.findMany.mockResolvedValue(reportRecords);

      await service.findByCpRecord(TENANT_ID, USER_ID, CP_RECORD_ID, IP_ADDRESS);

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'cp_record_accessed',
          entity_type: 'cp_record',
          entity_id: CP_RECORD_ID,
          tier: 3,
        }),
      );
    });

    it('should throw NotFoundException if CP record does not exist', async () => {
      mockRlsTx.cpRecord.findUnique.mockResolvedValue(null);

      await expect(
        service.findByCpRecord(TENANT_ID, USER_ID, CP_RECORD_ID, IP_ADDRESS),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Full lifecycle ──────────────────────────────────────────────────────

  describe('full lifecycle: draft -> submitted -> acknowledged -> outcome_received', () => {
    it('should complete all 4 valid transitions in sequence', async () => {
      // Step 1: create draft
      const cpRecordNone = makeCpRecord();
      const cpRecordDraft = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_draft,
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecordNone);
      mockRlsTx.cpRecord.update.mockResolvedValue(cpRecordDraft);

      const draftResult = await service.createDraft(
        TENANT_ID,
        USER_ID,
        CP_RECORD_ID,
        {},
        IP_ADDRESS,
      );
      expect(draftResult.data.mandated_report_status).toBe('draft');

      // Step 2: submit
      const cpRecordSubmitted = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_submitted,
        mandated_report_ref: 'TUSLA-2026-001',
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecordDraft);
      mockRlsTx.cpRecord.update.mockResolvedValue(cpRecordSubmitted);

      const submitResult = await service.submit(
        TENANT_ID,
        USER_ID,
        CP_RECORD_ID,
        { tusla_reference: 'TUSLA-2026-001' },
        IP_ADDRESS,
      );
      expect(submitResult.data.mandated_report_status).toBe('submitted');
      expect(submitResult.data.mandated_report_ref).toBe('TUSLA-2026-001');

      // Step 3: acknowledge
      const cpRecordAcknowledged = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_acknowledged,
        mandated_report_ref: 'TUSLA-2026-001',
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecordSubmitted);
      mockRlsTx.cpRecord.update.mockResolvedValue(cpRecordAcknowledged);

      const ackResult = await service.updateStatus(
        TENANT_ID,
        USER_ID,
        CP_RECORD_ID,
        { status: 'acknowledged' },
        IP_ADDRESS,
      );
      expect(ackResult.data.mandated_report_status).toBe('acknowledged');

      // Step 4: outcome received
      const cpRecordOutcome = makeCpRecord({
        mandated_report_status: MandatedReportStatus.outcome_received,
        mandated_report_ref: 'TUSLA-2026-001',
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecordAcknowledged);
      mockRlsTx.cpRecord.update.mockResolvedValue(cpRecordOutcome);

      const outcomeResult = await service.updateStatus(
        TENANT_ID,
        USER_ID,
        CP_RECORD_ID,
        { status: 'outcome_received' },
        IP_ADDRESS,
      );
      expect(outcomeResult.data.mandated_report_status).toBe('outcome_received');

      // Verify all 4 audit events were written
      // createDraft: mandated_report_generated
      // submit: mandated_report_submitted
      // acknowledged: mandated_report_submitted (status change event)
      // outcome_received: mandated_report_submitted (status change event)
      expect(mockPastoralEventService.write).toHaveBeenCalledTimes(4);
    });
  });

  // ─── Update only in draft state ──────────────────────────────────────────

  describe('update restrictions', () => {
    it('should not allow submit from acknowledged state', async () => {
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_acknowledged,
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);

      await expect(
        service.submit(
          TENANT_ID,
          USER_ID,
          CP_RECORD_ID,
          { tusla_reference: 'TUSLA-2026-001' },
          IP_ADDRESS,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should not allow submit from outcome_received state', async () => {
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.outcome_received,
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);

      await expect(
        service.submit(
          TENANT_ID,
          USER_ID,
          CP_RECORD_ID,
          { tusla_reference: 'TUSLA-2026-001' },
          IP_ADDRESS,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
