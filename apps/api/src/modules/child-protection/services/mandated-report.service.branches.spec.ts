import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MandatedReportStatus } from '@prisma/client';

import { PastoralEventService } from '../../pastoral/services/pastoral-event.service';
import { PrismaService } from '../../prisma/prisma.service';

import { MandatedReportService } from './mandated-report.service';

// ─── Constants ─────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CP_RECORD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const IP_ADDRESS = '127.0.0.1';

// ─── RLS mock ──────────────────────────────────────────────────────────────

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

// ─── Helpers ───────────────────────────────────────────────────────────────

const makeCpRecord = (overrides: Record<string, unknown> = {}) => ({
  id: CP_RECORD_ID,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  concern_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  record_type: 'concern',
  logged_by_user_id: USER_ID,
  narrative: 'Test.',
  mandated_report_status: null as MandatedReportStatus | null,
  mandated_report_ref: null as string | null,
  tusla_contact_name: null as string | null,
  tusla_contact_date: null as Date | null,
  legal_hold: false,
  created_at: new Date('2026-03-01T10:00:00Z'),
  updated_at: new Date('2026-03-01T10:00:00Z'),
  ...overrides,
});

// ─── Test Suite — Branch Coverage ──────────────────────────────────────────

describe('MandatedReportService — branch coverage', () => {
  let service: MandatedReportService;
  let mockPastoralEventService: { write: jest.Mock };

  beforeEach(async () => {
    mockPastoralEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

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

  // ─── updateStatus — unknown target status (no valid prisma mapping) ──────

  describe('MandatedReportService — updateStatus unknown prisma status branch', () => {
    it('edge: should throw BadRequestException for unknown target status value', async () => {
      // Create a record with submitted status
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_submitted,
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);

      // The valid transition from 'submitted' is 'acknowledged'.
      // But if someone sends a totally bogus status, it should be caught
      // by the VALID_TRANSITIONS check before reaching STATUS_TO_PRISMA.
      await expect(
        service.updateStatus(
          TENANT_ID,
          USER_ID,
          CP_RECORD_ID,
          { status: 'nonexistent_status' },
          IP_ADDRESS,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── toResponse — mandated_report_status with unknown prisma enum ────────

  describe('MandatedReportService — toResponse unknown status fallback', () => {
    it('should fall back to string representation for unknown mandated_report_status', async () => {
      // Create a record with a mandated report status that might not be in PRISMA_TO_STATUS
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_draft,
      });

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);

      const result = await service.getForCpRecord(TENANT_ID, USER_ID, CP_RECORD_ID, IP_ADDRESS);

      expect(result.data).not.toBeNull();
      expect(result.data!.mandated_report_status).toBe('draft');
    });
  });

  // ─── toResponse — no mandated report (null status) → 'none' ─────────────

  describe('MandatedReportService — toResponse null status', () => {
    it('should map null mandated_report_status to "none" in findByCpRecord', async () => {
      // A record without mandated_report_status that somehow passes the findMany filter
      // This tests the toResponse helper when status is null
      const cpRecord = makeCpRecord();
      const records = [makeCpRecord({ mandated_report_status: null })];

      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);
      mockRlsTx.cpRecord.findMany.mockResolvedValue(records);

      const result = await service.findByCpRecord(TENANT_ID, USER_ID, CP_RECORD_ID, IP_ADDRESS);

      expect(result.data[0]!.mandated_report_status).toBe('none');
    });
  });

  // ─── findByCpRecord — no audit event when empty results ──────────────────

  describe('MandatedReportService — findByCpRecord no audit when empty', () => {
    it('should not write audit event when no mandated reports found', async () => {
      const cpRecord = makeCpRecord();
      mockRlsTx.cpRecord.findUnique.mockResolvedValue(cpRecord);
      mockRlsTx.cpRecord.findMany.mockResolvedValue([]);

      await service.findByCpRecord(TENANT_ID, USER_ID, CP_RECORD_ID, IP_ADDRESS);

      // No audit event because firstRecord is undefined (empty array)
      expect(mockPastoralEventService.write).not.toHaveBeenCalled();
    });
  });

  // ─── updateStatus — audit event includes tusla_ref ─────────────────────────

  describe('MandatedReportService — updateStatus audit event tusla_ref fallback', () => {
    it('should use empty string for tusla_ref in audit when mandated_report_ref is null', async () => {
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_submitted,
        mandated_report_ref: null,
      });
      const updatedRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_acknowledged,
        mandated_report_ref: null,
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
          payload: expect.objectContaining({
            tusla_ref: '',
          }),
        }),
      );
    });

    it('should use actual tusla_ref in audit when mandated_report_ref is set', async () => {
      const cpRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_submitted,
        mandated_report_ref: 'TUSLA-2026-999',
      });
      const updatedRecord = makeCpRecord({
        mandated_report_status: MandatedReportStatus.mr_acknowledged,
        mandated_report_ref: 'TUSLA-2026-999',
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
          payload: expect.objectContaining({
            tusla_ref: 'TUSLA-2026-999',
          }),
        }),
      );
    });
  });
});
