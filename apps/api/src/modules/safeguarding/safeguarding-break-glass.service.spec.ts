/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

const mockTx = {
  safeguardingBreakGlassGrant: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  safeguardingAction: {
    create: jest.fn(),
  },
  safeguardingConcern: {
    findMany: jest.fn(),
  },
  behaviourTask: {
    create: jest.fn(),
    updateMany: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

import {
  ChildProtectionReadFacade,
  MOCK_FACADE_PROVIDERS,
  RbacReadFacade,
} from '../../common/tests/mock-facades';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';

import { SafeguardingBreakGlassService } from './safeguarding-break-glass.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const MEMBERSHIP_ID = '33333333-3333-3333-3333-333333333333';
const CONCERN_ID = '44444444-4444-4444-4444-444444444444';
const GRANT_ID = '99999999-9999-9999-9999-999999999999';
const CP_GRANT_ID = '88888888-8888-8888-8888-888888888888';

const mockNotificationsQueue = { add: jest.fn().mockResolvedValue({}) };

const mockPrisma = {
  tenantMembership: { findFirst: jest.fn() },
  safeguardingBreakGlassGrant: { findFirst: jest.fn() },
  cpAccessGrant: { findFirst: jest.fn() },
};

describe('SafeguardingBreakGlassService', () => {
  let service: SafeguardingBreakGlassService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        SafeguardingBreakGlassService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: { write: jest.fn() } },
        { provide: 'BullQueue_notifications', useValue: mockNotificationsQueue },
        {
          provide: RbacReadFacade,
          useValue: { findMembershipByIdAndUser: mockPrisma.tenantMembership.findFirst },
        },
        {
          provide: ChildProtectionReadFacade,
          useValue: { findActiveGrantForUser: mockPrisma.cpAccessGrant.findFirst },
        },
      ],
    }).compile();

    service = module.get<SafeguardingBreakGlassService>(SafeguardingBreakGlassService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── grantAccess ──────────────────────────────────────────────────────────

  describe('grantAccess', () => {
    const baseDto = {
      granted_to_id: '33333333-3333-3333-3333-333333333333',
      reason: 'Emergency child protection review',
      duration_hours: 24,
      scope: 'specific_concerns' as const,
      scoped_concern_ids: [CONCERN_ID],
    };

    beforeEach(() => {
      mockTx.safeguardingBreakGlassGrant.create.mockResolvedValue({
        id: GRANT_ID,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      mockTx.safeguardingAction.create.mockResolvedValue({ id: 'action-1' });
      mockTx.safeguardingConcern.findMany.mockResolvedValue([]);
    });

    it('should create grant with correct expiry (duration_hours -> expires_at)', async () => {
      const before = Date.now();

      const result = await service.grantAccess(TENANT_ID, USER_ID, baseDto);

      const after = Date.now();

      expect(mockTx.safeguardingBreakGlassGrant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          granted_to_id: baseDto.granted_to_id,
          granted_by_id: USER_ID,
          reason: baseDto.reason,
          scope: 'specific_concerns',
          scoped_concern_ids: [CONCERN_ID],
        }),
      });

      // Verify expires_at is approximately duration_hours from now
      const createCall = mockTx.safeguardingBreakGlassGrant.create.mock.calls[0] as [
        { data: { expires_at: Date; granted_at: Date } },
      ];
      const expiresAt = createCall[0].data.expires_at.getTime();
      const grantedAt = createCall[0].data.granted_at.getTime();
      const expectedDurationMs = 24 * 60 * 60 * 1000;

      expect(expiresAt - grantedAt).toBeGreaterThanOrEqual(expectedDurationMs);
      expect(expiresAt - grantedAt).toBeLessThanOrEqual(expectedDurationMs + 100);
      // granted_at should be close to now
      expect(grantedAt).toBeGreaterThanOrEqual(before);
      expect(grantedAt).toBeLessThanOrEqual(after);

      expect(result.data).toHaveProperty('id', GRANT_ID);
      expect(result.data).toHaveProperty('expires_at');
    });

    it('should reject duration > 72 hours', async () => {
      const longDto = { ...baseDto, duration_hours: 73 };

      await expect(service.grantAccess(TENANT_ID, USER_ID, longDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should queue notification', async () => {
      await service.grantAccess(TENANT_ID, USER_ID, baseDto);

      expect(mockNotificationsQueue.add).toHaveBeenCalledWith(
        'safeguarding:break-glass-granted',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          grant_id: GRANT_ID,
          granted_to_id: baseDto.granted_to_id,
          granted_by_id: USER_ID,
          reason: baseDto.reason,
          scope: 'specific_concerns',
          duration_hours: 24,
        }),
      );
    });

    it('should create safeguarding_actions entry', async () => {
      await service.grantAccess(TENANT_ID, USER_ID, baseDto);

      expect(mockTx.safeguardingAction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          concern_id: CONCERN_ID,
          action_by_id: USER_ID,
          action_type: 'note_added',
          description: expect.stringContaining('Break-glass access granted'),
          metadata: expect.objectContaining({
            break_glass_grant_id: GRANT_ID,
          }),
        }),
      });
    });
  });

  // ─── listActiveGrants ─────────────────────────────────────────────────────

  describe('listActiveGrants', () => {
    it('should return only non-expired, non-revoked grants', async () => {
      const futureDate = new Date(Date.now() + 12 * 60 * 60 * 1000);
      const grants = [
        {
          id: GRANT_ID,
          granted_to: { id: 'u-1', first_name: 'Jane', last_name: 'Doe' },
          granted_by: { id: USER_ID, first_name: 'Admin', last_name: 'User' },
          reason: 'Emergency review',
          scope: 'all_concerns',
          granted_at: new Date(),
          expires_at: futureDate,
        },
      ];

      mockTx.safeguardingBreakGlassGrant.findMany.mockResolvedValue(grants);

      const result = await service.listActiveGrants(TENANT_ID);

      // Verify filter criteria: revoked_at null, expires_at in the future
      expect(mockTx.safeguardingBreakGlassGrant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            revoked_at: null,
            expires_at: { gt: expect.any(Date) as Date },
          }),
        }),
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.id).toBe(GRANT_ID);
    });

    it('should include granted_to and granted_by user info', async () => {
      const futureDate = new Date(Date.now() + 12 * 60 * 60 * 1000);
      const grants = [
        {
          id: GRANT_ID,
          granted_to: { id: 'u-1', first_name: 'Jane', last_name: 'Doe' },
          granted_by: { id: USER_ID, first_name: 'Admin', last_name: 'User' },
          reason: 'Emergency',
          scope: 'all_concerns',
          granted_at: new Date(),
          expires_at: futureDate,
        },
      ];

      mockTx.safeguardingBreakGlassGrant.findMany.mockResolvedValue(grants);

      const result = await service.listActiveGrants(TENANT_ID);

      const grant = result.data[0]!;
      expect(grant.granted_to).toEqual({ id: 'u-1', name: 'Jane Doe' });
      expect(grant.granted_by).toEqual({ id: USER_ID, name: 'Admin User' });
    });
  });

  // ─── completeReview ─────────────────────────────────────────────────────────

  describe('completeReview', () => {
    const reviewDto = { notes: 'Reviewed access logs. No anomalies.' };

    beforeEach(() => {
      mockTx.safeguardingBreakGlassGrant.findFirst.mockResolvedValue({
        id: GRANT_ID,
        tenant_id: TENANT_ID,
        after_action_review_completed_at: null,
      });
      mockTx.safeguardingBreakGlassGrant.update.mockResolvedValue({
        id: GRANT_ID,
      });
      mockTx.behaviourTask.updateMany.mockResolvedValue({ count: 1 });
    });

    it('should set review fields (completed_at, by_id, notes)', async () => {
      await service.completeReview(TENANT_ID, USER_ID, GRANT_ID, reviewDto);

      expect(mockTx.safeguardingBreakGlassGrant.update).toHaveBeenCalledWith({
        where: { id: GRANT_ID },
        data: {
          after_action_review_completed_at: expect.any(Date) as Date,
          after_action_review_by_id: USER_ID,
          after_action_review_notes: reviewDto.notes,
        },
      });
    });

    it('should complete the break_glass_review task', async () => {
      await service.completeReview(TENANT_ID, USER_ID, GRANT_ID, reviewDto);

      expect(mockTx.behaviourTask.updateMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          entity_type: 'break_glass_grant',
          entity_id: GRANT_ID,
        },
        data: {
          status: 'completed',
          completed_at: expect.any(Date) as Date,
          completed_by_id: USER_ID,
          completion_notes: reviewDto.notes,
        },
      });
    });

    it('should throw NotFoundException when grant not found', async () => {
      mockTx.safeguardingBreakGlassGrant.findFirst.mockResolvedValue(null);

      await expect(
        service.completeReview(TENANT_ID, USER_ID, 'non-existent', reviewDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when review already completed', async () => {
      mockTx.safeguardingBreakGlassGrant.findFirst.mockResolvedValue({
        id: GRANT_ID,
        tenant_id: TENANT_ID,
        after_action_review_completed_at: new Date('2026-01-10'),
      });

      await expect(service.completeReview(TENANT_ID, USER_ID, GRANT_ID, reviewDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── checkEffectivePermission ───────────────────────────────────────────────

  describe('checkEffectivePermission', () => {
    beforeEach(() => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(null);
      mockPrisma.safeguardingBreakGlassGrant.findFirst.mockResolvedValue(null);
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue(null);
    });

    it('should allow access via cp_access_grant when user has active grant', async () => {
      // RBAC denied, break-glass denied, but cp_access_grant exists
      mockPrisma.cpAccessGrant.findFirst.mockResolvedValue({
        id: CP_GRANT_ID,
        tenant_id: TENANT_ID,
        user_id: USER_ID,
        revoked_at: null,
      });

      const result = await service.checkEffectivePermission(USER_ID, TENANT_ID, MEMBERSHIP_ID);

      expect(result).toEqual({
        allowed: true,
        context: 'cp_access_grant',
        grantId: CP_GRANT_ID,
      });

      // Verify cp_access_grant was queried with correct filters
      expect(mockPrisma.cpAccessGrant.findFirst).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
      );
    });

    it('should allow access via break-glass grant (backward compatibility)', async () => {
      // RBAC denied, but break-glass grant exists
      mockPrisma.safeguardingBreakGlassGrant.findFirst.mockResolvedValue({
        id: GRANT_ID,
      });

      const result = await service.checkEffectivePermission(USER_ID, TENANT_ID, MEMBERSHIP_ID);

      expect(result).toEqual({
        allowed: true,
        context: 'break_glass',
        grantId: GRANT_ID,
      });

      // cp_access_grant should NOT be checked when break-glass already granted
      expect(mockPrisma.cpAccessGrant.findFirst).not.toHaveBeenCalled();
    });

    it('should deny access when user has neither grant type', async () => {
      // All three checks return nothing
      const result = await service.checkEffectivePermission(USER_ID, TENANT_ID, MEMBERSHIP_ID);

      expect(result).toEqual({
        allowed: false,
        context: 'normal',
      });

      // RBAC and cp_access_grant should have been checked via facades
      expect(mockPrisma.tenantMembership.findFirst).toHaveBeenCalled();
      expect(mockPrisma.cpAccessGrant.findFirst).toHaveBeenCalled();
    });
  });
});
