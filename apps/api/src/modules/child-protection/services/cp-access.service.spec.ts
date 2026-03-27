import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PastoralEventService } from '../../pastoral/services/pastoral-event.service';
import { PrismaService } from '../../prisma/prisma.service';

import { CpAccessService } from './cp-access.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DLP_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TARGET_USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const GRANT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const IP_ADDRESS = '127.0.0.1';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  cpAccessGrant: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
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

const makeGrant = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: GRANT_ID,
  tenant_id: TENANT_ID,
  user_id: TARGET_USER_ID,
  granted_by_user_id: DLP_USER_ID,
  granted_at: new Date('2026-03-27T10:00:00Z'),
  revoked_at: null,
  revoked_by_user_id: null,
  revocation_reason: null,
  ...overrides,
});

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('CpAccessService', () => {
  let service: CpAccessService;
  let mockPastoralEventService: { write: jest.Mock };
  let mockPrisma: {
    cpAccessGrant: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    mockPastoralEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    mockPrisma = {
      cpAccessGrant: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CpAccessService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PastoralEventService, useValue: mockPastoralEventService },
      ],
    }).compile();

    service = module.get<CpAccessService>(CpAccessService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── grant ──────────────────────────────────────────────────────────────

  describe('grant', () => {
    it('should create a new CP access grant', async () => {
      const grant = makeGrant();
      mockRlsTx.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.cpAccessGrant.create.mockResolvedValue(grant);

      const result = await service.grant(
        TENANT_ID,
        DLP_USER_ID,
        { user_id: TARGET_USER_ID },
        IP_ADDRESS,
      );

      expect(result.data).toEqual(grant);
      expect(mockRlsTx.cpAccessGrant.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          user_id: TARGET_USER_ID,
          granted_by_user_id: DLP_USER_ID,
        },
      });
    });

    it('should return existing grant without creating duplicate (idempotent)', async () => {
      const existingGrant = makeGrant();
      mockRlsTx.cpAccessGrant.findFirst.mockResolvedValue(existingGrant);

      const result = await service.grant(
        TENANT_ID,
        DLP_USER_ID,
        { user_id: TARGET_USER_ID },
        IP_ADDRESS,
      );

      expect(result.data).toEqual(existingGrant);
      expect(mockRlsTx.cpAccessGrant.create).not.toHaveBeenCalled();
    });

    it('should write cp_access_granted audit event', async () => {
      const grant = makeGrant();
      mockRlsTx.cpAccessGrant.findFirst.mockResolvedValue(null);
      mockRlsTx.cpAccessGrant.create.mockResolvedValue(grant);

      await service.grant(
        TENANT_ID,
        DLP_USER_ID,
        { user_id: TARGET_USER_ID },
        IP_ADDRESS,
      );

      expect(mockPastoralEventService.write).toHaveBeenCalledWith({
        tenant_id: TENANT_ID,
        event_type: 'cp_access_granted',
        entity_type: 'cp_access_grant',
        entity_id: GRANT_ID,
        student_id: null,
        actor_user_id: DLP_USER_ID,
        tier: 3,
        payload: {
          grant_id: GRANT_ID,
          granted_to_user_id: TARGET_USER_ID,
          granted_by_user_id: DLP_USER_ID,
        },
        ip_address: IP_ADDRESS,
      });
    });
  });

  // ─── revoke ─────────────────────────────────────────────────────────────

  describe('revoke', () => {
    it('should revoke an active grant', async () => {
      const grant = makeGrant();
      mockRlsTx.cpAccessGrant.findFirst.mockResolvedValue(grant);
      mockRlsTx.cpAccessGrant.update.mockResolvedValue({
        ...grant,
        revoked_at: new Date(),
        revoked_by_user_id: DLP_USER_ID,
        revocation_reason: 'Role change',
      });

      const result = await service.revoke(
        TENANT_ID,
        DLP_USER_ID,
        GRANT_ID,
        { revocation_reason: 'Role change' },
        IP_ADDRESS,
      );

      expect(result.data).toEqual({ revoked: true });
      expect(mockRlsTx.cpAccessGrant.update).toHaveBeenCalledWith({
        where: { id: GRANT_ID },
        data: expect.objectContaining({
          revoked_at: expect.any(Date) as Date,
          revoked_by_user_id: DLP_USER_ID,
          revocation_reason: 'Role change',
        }),
      });
    });

    it('should throw NotFoundException for non-existent or already revoked grant', async () => {
      mockRlsTx.cpAccessGrant.findFirst.mockResolvedValue(null);

      await expect(
        service.revoke(
          TENANT_ID,
          DLP_USER_ID,
          GRANT_ID,
          { revocation_reason: 'Test' },
          IP_ADDRESS,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should block self-revocation', async () => {
      // Grant where user_id equals the revoker
      const selfGrant = makeGrant({ user_id: DLP_USER_ID });
      mockRlsTx.cpAccessGrant.findFirst.mockResolvedValue(selfGrant);

      await expect(
        service.revoke(
          TENANT_ID,
          DLP_USER_ID,
          GRANT_ID,
          { revocation_reason: 'Self-revoke attempt' },
          IP_ADDRESS,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should write cp_access_revoked audit event', async () => {
      const grant = makeGrant();
      mockRlsTx.cpAccessGrant.findFirst.mockResolvedValue(grant);
      mockRlsTx.cpAccessGrant.update.mockResolvedValue({
        ...grant,
        revoked_at: new Date(),
      });

      await service.revoke(
        TENANT_ID,
        DLP_USER_ID,
        GRANT_ID,
        { revocation_reason: 'Role change' },
        IP_ADDRESS,
      );

      expect(mockPastoralEventService.write).toHaveBeenCalledWith({
        tenant_id: TENANT_ID,
        event_type: 'cp_access_revoked',
        entity_type: 'cp_access_grant',
        entity_id: GRANT_ID,
        student_id: null,
        actor_user_id: DLP_USER_ID,
        tier: 3,
        payload: {
          grant_id: GRANT_ID,
          user_id: TARGET_USER_ID,
          revoked_by_user_id: DLP_USER_ID,
          reason: 'Role change',
        },
        ip_address: IP_ADDRESS,
      });
    });
  });

  // ─── listActive ─────────────────────────────────────────────────────────

  describe('listActive', () => {
    it('should return formatted list of active grants', async () => {
      const grantsWithRelations = [
        {
          ...makeGrant(),
          user: { first_name: 'Jane', last_name: 'Teacher' },
          granted_by: { first_name: 'Alice', last_name: 'Principal' },
        },
      ];
      mockRlsTx.cpAccessGrant.findMany.mockResolvedValue(grantsWithRelations);

      const result = await service.listActive(TENANT_ID, DLP_USER_ID);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual({
        id: GRANT_ID,
        user_id: TARGET_USER_ID,
        user_name: 'Jane Teacher',
        granted_by_user_id: DLP_USER_ID,
        granted_by_name: 'Alice Principal',
        granted_at: new Date('2026-03-27T10:00:00Z'),
      });
    });

    it('should return empty array when no active grants exist', async () => {
      mockRlsTx.cpAccessGrant.findMany.mockResolvedValue([]);

      const result = await service.listActive(TENANT_ID, DLP_USER_ID);

      expect(result.data).toEqual([]);
    });
  });

  // ─── hasAccess ──────────────────────────────────────────────────────────

  describe('hasAccess', () => {
    it('should return true when user has an active grant', async () => {
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue({ id: GRANT_ID });

      const result = await service.hasAccess(TENANT_ID, TARGET_USER_ID);

      expect(result).toBe(true);
      expect(mockPrisma.cpAccessGrant.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          user_id: TARGET_USER_ID,
          revoked_at: null,
        },
        select: { id: true },
      });
    });

    it('should return false when user has no active grant', async () => {
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);

      const result = await service.hasAccess(TENANT_ID, TARGET_USER_ID);

      expect(result).toBe(false);
    });

    it('should return false when user has only a revoked grant', async () => {
      // The query filters revoked_at: null, so a revoked grant is not returned
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);

      const result = await service.hasAccess(TENANT_ID, TARGET_USER_ID);

      expect(result).toBe(false);
    });
  });
});
