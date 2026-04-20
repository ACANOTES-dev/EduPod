/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware');

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';

import { SafeguardingSealService } from './safeguarding-seal.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-initiator';
const APPROVER_ID = 'user-approver';
const CONCERN_ID = 'concern-1';

const makeResolvedConcern = (overrides: Record<string, unknown> = {}) => ({
  id: CONCERN_ID,
  tenant_id: TENANT_ID,
  status: 'sg_resolved',
  sealed_by_id: null,
  seal_approved_by_id: null,
  concern_number: 'SG-2026-001',
  ...overrides,
});

// ─── Mock factories ─────────────────────────────────────────────────────────

const makeMockDb = () => ({
  safeguardingConcern: {
    findFirst: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  safeguardingAction: {
    create: jest.fn().mockResolvedValue({}),
  },
  behaviourTask: {
    create: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
});

const makeMockAuditLog = () => ({
  write: jest.fn().mockResolvedValue(undefined),
});

describe('SafeguardingSealService', () => {
  let service: SafeguardingSealService;
  let mockDb: ReturnType<typeof makeMockDb>;
  let mockAuditLog: ReturnType<typeof makeMockAuditLog>;

  beforeEach(async () => {
    mockDb = makeMockDb();
    mockAuditLog = makeMockAuditLog();

    const mockTx = jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn(mockDb);
    });

    (createRlsClient as jest.Mock).mockReturnValue({ $transaction: mockTx });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SafeguardingSealService,
        { provide: PrismaService, useValue: {} },
        { provide: AuditLogService, useValue: mockAuditLog },
      ],
    }).compile();

    service = module.get<SafeguardingSealService>(SafeguardingSealService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── initiateSeal ──────────────────────────────────────────────────────

  describe('SafeguardingSealService -- initiateSeal', () => {
    it('should initiate seal on a resolved concern', async () => {
      mockDb.safeguardingConcern.findFirst.mockResolvedValue(makeResolvedConcern());

      const result = await service.initiateSeal(TENANT_ID, USER_ID, CONCERN_ID, {
        reason: 'Case complete, no further action',
      });

      expect(result).toEqual({ data: { id: CONCERN_ID, seal_initiated: true } });
      expect(mockDb.safeguardingConcern.update).toHaveBeenCalledWith({
        where: { id: CONCERN_ID },
        data: {
          sealed_by_id: USER_ID,
          sealed_reason: 'Case complete, no further action',
        },
      });
      expect(mockDb.behaviourTask.create).toHaveBeenCalledTimes(1);
      expect(mockDb.safeguardingAction.create).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when concern does not exist', async () => {
      mockDb.safeguardingConcern.findFirst.mockResolvedValue(null);

      await expect(
        service.initiateSeal(TENANT_ID, USER_ID, CONCERN_ID, { reason: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when concern is not resolved', async () => {
      mockDb.safeguardingConcern.findFirst.mockResolvedValue(
        makeResolvedConcern({ status: 'under_investigation' }),
      );

      await expect(
        service.initiateSeal(TENANT_ID, USER_ID, CONCERN_ID, { reason: 'test' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when seal already initiated', async () => {
      mockDb.safeguardingConcern.findFirst.mockResolvedValue(
        makeResolvedConcern({ sealed_by_id: 'other-user' }),
      );

      await expect(
        service.initiateSeal(TENANT_ID, USER_ID, CONCERN_ID, { reason: 'test' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── approveSeal ───────────────────────────────────────────────────────

  describe('SafeguardingSealService -- approveSeal', () => {
    it('should approve seal with a different user (dual-control)', async () => {
      mockDb.safeguardingConcern.findFirst.mockResolvedValue(
        makeResolvedConcern({ sealed_by_id: USER_ID }),
      );

      const result = await service.approveSeal(TENANT_ID, APPROVER_ID, CONCERN_ID);

      expect(result).toEqual({ data: { id: CONCERN_ID, sealed: true } });
      expect(mockDb.safeguardingConcern.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'sealed',
            seal_approved_by_id: APPROVER_ID,
          }),
        }),
      );
      expect(mockDb.behaviourTask.updateMany).toHaveBeenCalledTimes(1);
      expect(mockAuditLog.write).toHaveBeenCalledWith(
        TENANT_ID,
        APPROVER_ID,
        'safeguarding_concern',
        CONCERN_ID,
        'safeguarding_concern_sealed',
        expect.objectContaining({ initiated_by: USER_ID, approved_by: APPROVER_ID }),
        null,
      );
    });

    it('should throw NotFoundException when concern does not exist', async () => {
      mockDb.safeguardingConcern.findFirst.mockResolvedValue(null);

      await expect(service.approveSeal(TENANT_ID, APPROVER_ID, CONCERN_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when seal not yet initiated', async () => {
      mockDb.safeguardingConcern.findFirst.mockResolvedValue(
        makeResolvedConcern({ sealed_by_id: null }),
      );

      await expect(service.approveSeal(TENANT_ID, APPROVER_ID, CONCERN_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for dual-control violation (same user)', async () => {
      mockDb.safeguardingConcern.findFirst.mockResolvedValue(
        makeResolvedConcern({ sealed_by_id: USER_ID }),
      );

      await expect(service.approveSeal(TENANT_ID, USER_ID, CONCERN_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when concern is not resolved', async () => {
      mockDb.safeguardingConcern.findFirst.mockResolvedValue(
        makeResolvedConcern({ sealed_by_id: USER_ID, status: 'under_investigation' }),
      );

      await expect(service.approveSeal(TENANT_ID, APPROVER_ID, CONCERN_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── rejectSeal ────────────────────────────────────────────────────────

  describe('SafeguardingSealService -- rejectSeal', () => {
    it('should reject a pending seal with dual control', async () => {
      mockDb.safeguardingConcern.findFirst.mockResolvedValue(
        makeResolvedConcern({ sealed_by_id: USER_ID }),
      );

      const result = await service.rejectSeal(TENANT_ID, APPROVER_ID, CONCERN_ID, {
        reason: 'Evidence incomplete',
      });

      expect(result).toEqual({ data: { id: CONCERN_ID, seal_rejected: true } });
      expect(mockDb.safeguardingConcern.update).toHaveBeenCalledWith({
        where: { id: CONCERN_ID },
        data: { sealed_by_id: null, sealed_reason: null },
      });
      expect(mockDb.safeguardingAction.create).toHaveBeenCalledTimes(1);
      expect(mockDb.behaviourTask.updateMany).toHaveBeenCalledTimes(1);
      expect(mockAuditLog.write).toHaveBeenCalledWith(
        TENANT_ID,
        APPROVER_ID,
        'safeguarding_concern',
        CONCERN_ID,
        'safeguarding_seal_rejected',
        expect.objectContaining({
          initiated_by: USER_ID,
          rejected_by: APPROVER_ID,
          reason: 'Evidence incomplete',
        }),
        null,
      );
    });

    it('should throw BadRequestException when seal not initiated', async () => {
      mockDb.safeguardingConcern.findFirst.mockResolvedValue(
        makeResolvedConcern({ sealed_by_id: null }),
      );

      await expect(
        service.rejectSeal(TENANT_ID, APPROVER_ID, CONCERN_ID, { reason: 'n/a' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when same user attempts to reject own request', async () => {
      mockDb.safeguardingConcern.findFirst.mockResolvedValue(
        makeResolvedConcern({ sealed_by_id: USER_ID }),
      );

      await expect(
        service.rejectSeal(TENANT_ID, USER_ID, CONCERN_ID, { reason: 'changed my mind' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when concern is already sealed', async () => {
      mockDb.safeguardingConcern.findFirst.mockResolvedValue(
        makeResolvedConcern({ sealed_by_id: USER_ID, sealed_at: new Date() }),
      );

      await expect(
        service.rejectSeal(TENANT_ID, APPROVER_ID, CONCERN_ID, { reason: 'too late' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when concern does not exist', async () => {
      mockDb.safeguardingConcern.findFirst.mockResolvedValue(null);

      await expect(
        service.rejectSeal(TENANT_ID, APPROVER_ID, CONCERN_ID, { reason: 'n/a' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getSealStatus ─────────────────────────────────────────────────────

  describe('SafeguardingSealService -- getSealStatus', () => {
    const mockPrisma = {
      safeguardingConcern: {
        findFirst: jest.fn(),
      },
    } as unknown as PrismaService;

    beforeEach(async () => {
      (mockPrisma.safeguardingConcern.findFirst as jest.Mock).mockReset();

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SafeguardingSealService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: AuditLogService, useValue: mockAuditLog },
        ],
      }).compile();

      service = module.get<SafeguardingSealService>(SafeguardingSealService);
    });

    it('reports not_initiated when no seal fields set', async () => {
      (mockPrisma.safeguardingConcern.findFirst as jest.Mock).mockResolvedValue({
        id: CONCERN_ID,
        sealed_at: null,
        sealed_by_id: null,
        sealed_reason: null,
        seal_approved_by_id: null,
      });

      const res = await service.getSealStatus(TENANT_ID, CONCERN_ID);
      expect(res.state).toBe('not_initiated');
      expect(res.concern_id).toBe(CONCERN_ID);
      expect(res.sealed_at).toBeNull();
    });

    it('reports pending_approval when initiator set but not yet sealed', async () => {
      (mockPrisma.safeguardingConcern.findFirst as jest.Mock).mockResolvedValue({
        id: CONCERN_ID,
        sealed_at: null,
        sealed_by_id: USER_ID,
        sealed_reason: 'Case complete',
        seal_approved_by_id: null,
      });

      const res = await service.getSealStatus(TENANT_ID, CONCERN_ID);
      expect(res.state).toBe('pending_approval');
      expect(res.initiated_by_id).toBe(USER_ID);
      expect(res.approved_by_id).toBeNull();
    });

    it('reports sealed with approver and timestamp', async () => {
      const sealedAt = new Date('2026-04-20T12:00:00Z');
      (mockPrisma.safeguardingConcern.findFirst as jest.Mock).mockResolvedValue({
        id: CONCERN_ID,
        sealed_at: sealedAt,
        sealed_by_id: USER_ID,
        sealed_reason: 'Case complete',
        seal_approved_by_id: APPROVER_ID,
      });

      const res = await service.getSealStatus(TENANT_ID, CONCERN_ID);
      expect(res.state).toBe('sealed');
      expect(res.sealed_at).toBe(sealedAt.toISOString());
      expect(res.approved_by_id).toBe(APPROVER_ID);
    });

    it('throws NotFoundException when concern is missing', async () => {
      (mockPrisma.safeguardingConcern.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.getSealStatus(TENANT_ID, CONCERN_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
