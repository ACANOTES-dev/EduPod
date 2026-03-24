import { createHash } from 'crypto';

import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { InvitationsService } from './invitations.service';

// ─── Test constants ──────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-aaa';
const INVITED_BY_USER_ID = 'user-inviter';
const INVITATION_ID = 'invitation-ccc';
const ROLE_ID_1 = '00000000-0000-0000-0001-000000000001';
const MEMBERSHIP_ID = 'membership-ddd';

const BASE_CREATE_DTO = {
  email: 'newstaff@school.com',
  role_ids: [ROLE_ID_1],
};

/** SHA-256 helper matching the implementation */
function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ─── Mock infrastructure ─────────────────────────────────────────────────────

const mockPrisma: {
  invitation: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
  user: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  tenantMembership: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  membershipRole: {
    deleteMany: jest.Mock;
    createMany: jest.Mock;
  };
  role: {
    findMany: jest.Mock;
  };
  $transaction: jest.Mock;
} = {
  invitation: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  tenantMembership: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  membershipRole: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  role: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
};

describe('InvitationsService', () => {
  let service: InvitationsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('notifications'), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get<InvitationsService>(InvitationsService);
  });

  // ─── createInvitation ──────────────────────────────────────────────────────

  describe('createInvitation', () => {
    it('should create invitation with hashed token — token_hash must not equal plaintext token', async () => {
      // No existing pending invitation
      mockPrisma.invitation.findFirst.mockResolvedValueOnce(null);
      // Email not yet a user
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      // Roles exist
      mockPrisma.role.findMany.mockResolvedValueOnce([{ id: ROLE_ID_1 }]);

      let capturedTokenHash = '';
      mockPrisma.invitation.create.mockImplementationOnce(({ data }: { data: Record<string, unknown> }) => {
        capturedTokenHash = data['token_hash'] as string;
        return {
          id: INVITATION_ID,
          tenant_id: TENANT_ID,
          email: BASE_CREATE_DTO.email,
          invited_role_payload: { role_ids: [ROLE_ID_1] },
          invited_by_user_id: INVITED_BY_USER_ID,
          token_hash: capturedTokenHash,
          expires_at: data['expires_at'],
          status: 'pending',
          invited_by: { id: INVITED_BY_USER_ID, first_name: 'Admin', last_name: 'User', email: 'admin@school.com' },
        };
      });

      const result = await service.createInvitation(TENANT_ID, INVITED_BY_USER_ID, BASE_CREATE_DTO);

      // The service returns the invitation object (token is sent via email, not returned)
      expect(result.id).toBe(INVITATION_ID);
      expect(result.email).toBe(BASE_CREATE_DTO.email);
      expect(result.status).toBe('pending');

      // The token_hash stored in DB must be a SHA-256 hash (64 hex chars)
      expect(capturedTokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(mockPrisma.invitation.create).toHaveBeenCalledTimes(1);
    });

    it('should set expires_at approximately 72 hours from now', async () => {
      mockPrisma.invitation.findFirst.mockResolvedValueOnce(null);
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      mockPrisma.role.findMany.mockResolvedValueOnce([{ id: ROLE_ID_1 }]);

      const beforeCall = Date.now();

      mockPrisma.invitation.create.mockImplementationOnce(({ data }: { data: Record<string, unknown> }) => ({
        id: INVITATION_ID,
        tenant_id: TENANT_ID,
        email: BASE_CREATE_DTO.email,
        invited_role_payload: { role_ids: [ROLE_ID_1] },
        invited_by_user_id: INVITED_BY_USER_ID,
        token_hash: data['token_hash'],
        expires_at: data['expires_at'],
        status: 'pending',
        invited_by: { id: INVITED_BY_USER_ID, first_name: 'Admin', last_name: 'User', email: 'admin@school.com' },
      }));

      const result = await service.createInvitation(TENANT_ID, INVITED_BY_USER_ID, BASE_CREATE_DTO);

      const afterCall = Date.now();
      const expiresAtMs = (result.expires_at as Date).getTime();

      const expectedMin = beforeCall + 72 * 60 * 60 * 1000;
      const expectedMax = afterCall + 72 * 60 * 60 * 1000;

      expect(expiresAtMs).toBeGreaterThanOrEqual(expectedMin);
      expect(expiresAtMs).toBeLessThanOrEqual(expectedMax);
    });

    it('should throw INVITATION_EXISTS when a pending invitation already exists for the email', async () => {
      mockPrisma.invitation.findFirst.mockResolvedValueOnce({
        id: 'existing-invitation',
        status: 'pending',
        email: BASE_CREATE_DTO.email,
      });

      let caught: unknown;
      try {
        await service.createInvitation(TENANT_ID, INVITED_BY_USER_ID, BASE_CREATE_DTO);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'INVITATION_EXISTS',
      });
    });

    it('should throw USER_ALREADY_MEMBER when user already has an active membership', async () => {
      mockPrisma.invitation.findFirst.mockResolvedValueOnce(null);
      const existingUser = { id: 'user-existing', email: BASE_CREATE_DTO.email };
      mockPrisma.user.findUnique.mockResolvedValueOnce(existingUser);
      // User has an active membership
      mockPrisma.tenantMembership.findFirst.mockResolvedValueOnce({
        id: MEMBERSHIP_ID,
        membership_status: 'active',
      });

      let caught: unknown;
      try {
        await service.createInvitation(TENANT_ID, INVITED_BY_USER_ID, BASE_CREATE_DTO);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'USER_ALREADY_MEMBER',
      });
    });
  });

  // ─── acceptInvitation ──────────────────────────────────────────────────────

  describe('acceptInvitation', () => {
    it('should reject an expired invitation and mark it expired', async () => {
      const plainToken = 'abc123plaintoken';
      const tokenHash = sha256(plainToken);

      // The invitation is found (status pending) but expires_at is in the past
      const expiredInvitation = {
        id: INVITATION_ID,
        tenant_id: TENANT_ID,
        email: 'newstaff@school.com',
        invited_role_payload: { role_ids: [ROLE_ID_1] },
        token_hash: tokenHash,
        status: 'pending',
        expires_at: new Date(Date.now() - 1000), // 1 second in the past
      };

      mockPrisma.invitation.findFirst.mockResolvedValueOnce(expiredInvitation);
      mockPrisma.invitation.update.mockResolvedValueOnce({ ...expiredInvitation, status: 'expired' });

      let caught: unknown;
      try {
        await service.acceptInvitation(plainToken);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'INVITATION_EXPIRED',
      });

      // Verify the invitation was marked expired
      expect(mockPrisma.invitation.update).toHaveBeenCalledWith({
        where: { id: INVITATION_ID },
        data: { status: 'expired' },
      });
    });

    it('should reject when no matching pending invitation is found (revoked or wrong token)', async () => {
      // findFirst returns null — token not found or status not pending
      mockPrisma.invitation.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.acceptInvitation('invalid-token');
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'INVITATION_NOT_FOUND',
      });
    });

    it('should find invitation by SHA-256 hash of the token', async () => {
      const plainToken = 'the-plain-token-64hexchars';
      const tokenHash = sha256(plainToken);

      const validInvitation = {
        id: INVITATION_ID,
        tenant_id: TENANT_ID,
        email: 'newstaff@school.com',
        invited_role_payload: { role_ids: [ROLE_ID_1] },
        token_hash: tokenHash,
        status: 'pending',
        expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1h from now
      };

      mockPrisma.invitation.findFirst.mockResolvedValueOnce(validInvitation);

      // Existing user (no new registration needed)
      const existingUser = { id: 'user-existing', email: 'newstaff@school.com', first_name: 'Jane', last_name: 'Doe' };
      mockPrisma.user.findUnique.mockResolvedValueOnce(existingUser);
      mockPrisma.tenantMembership.findFirst.mockResolvedValueOnce(null); // no existing membership

      const createdMembership = { id: MEMBERSHIP_ID, tenant_id: TENANT_ID, user_id: existingUser.id };
      mockPrisma.tenantMembership.create.mockResolvedValueOnce(createdMembership);
      mockPrisma.membershipRole.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.membershipRole.createMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.invitation.update.mockResolvedValueOnce({ ...validInvitation, status: 'accepted' });

      const result = await service.acceptInvitation(plainToken);

      // Verify the lookup used the correct hash
      expect(mockPrisma.invitation.findFirst).toHaveBeenCalledWith({
        where: { token_hash: tokenHash, status: 'pending' },
      });
      expect(result.accepted).toBe(true);
      expect(result.user.id).toBe(existingUser.id);
    });

    it('should create membership and assign roles for an existing user with no membership', async () => {
      const plainToken = 'existing-user-token';
      const tokenHash = sha256(plainToken);

      const validInvitation = {
        id: INVITATION_ID,
        tenant_id: TENANT_ID,
        email: 'existing@school.com',
        invited_role_payload: { role_ids: [ROLE_ID_1] },
        token_hash: tokenHash,
        status: 'pending',
        expires_at: new Date(Date.now() + 60 * 60 * 1000),
      };

      mockPrisma.invitation.findFirst.mockResolvedValueOnce(validInvitation);

      const existingUser = {
        id: 'user-existing',
        email: 'existing@school.com',
        first_name: 'Bob',
        last_name: 'Jones',
      };
      mockPrisma.user.findUnique.mockResolvedValueOnce(existingUser);

      // No existing membership
      mockPrisma.tenantMembership.findFirst.mockResolvedValueOnce(null);

      const newMembership = { id: MEMBERSHIP_ID };
      mockPrisma.tenantMembership.create.mockResolvedValueOnce(newMembership);
      mockPrisma.membershipRole.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.membershipRole.createMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.invitation.update.mockResolvedValueOnce({});

      const result = await service.acceptInvitation(plainToken);

      // Should create membership
      expect(mockPrisma.tenantMembership.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          user_id: existingUser.id,
          membership_status: 'active',
          joined_at: expect.any(Date),
        },
      });

      // Should assign roles
      expect(mockPrisma.membershipRole.createMany).toHaveBeenCalledWith({
        data: [
          {
            membership_id: MEMBERSHIP_ID,
            role_id: ROLE_ID_1,
            tenant_id: TENANT_ID,
          },
        ],
      });

      // Should mark invitation as accepted
      expect(mockPrisma.invitation.update).toHaveBeenCalledWith({
        where: { id: INVITATION_ID },
        data: { status: 'accepted', accepted_at: expect.any(Date) },
      });

      // User was NOT created (user already existed)
      expect(mockPrisma.user.create).not.toHaveBeenCalled();

      expect(result.accepted).toBe(true);
      expect(result.user.email).toBe(existingUser.email);
    });

    it('should create user and membership for a new user with registration data', async () => {
      const plainToken = 'new-user-token';
      const tokenHash = sha256(plainToken);

      const validInvitation = {
        id: INVITATION_ID,
        tenant_id: TENANT_ID,
        email: 'newperson@school.com',
        invited_role_payload: { role_ids: [ROLE_ID_1] },
        token_hash: tokenHash,
        status: 'pending',
        expires_at: new Date(Date.now() + 60 * 60 * 1000),
      };

      mockPrisma.invitation.findFirst.mockResolvedValueOnce(validInvitation);

      // User does not exist yet
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const createdUser = {
        id: 'user-new',
        email: 'newperson@school.com',
        first_name: 'New',
        last_name: 'Person',
      };
      mockPrisma.user.create.mockResolvedValueOnce(createdUser);

      const newMembership = { id: MEMBERSHIP_ID };
      mockPrisma.tenantMembership.create.mockResolvedValueOnce(newMembership);
      mockPrisma.membershipRole.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.membershipRole.createMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.invitation.update.mockResolvedValueOnce({});

      const registrationData = {
        first_name: 'New',
        last_name: 'Person',
        password: 'Str0ng!Password',
        phone: '+9715551234',
      };

      const result = await service.acceptInvitation(plainToken, registrationData);

      // User should be created
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'newperson@school.com',
          password_hash: expect.any(String), // bcrypt hash, not plaintext
          first_name: 'New',
          last_name: 'Person',
          phone: '+9715551234',
          email_verified_at: expect.any(Date),
        },
      });

      // Password must be hashed — not stored as plaintext
      const createCallArgs = mockPrisma.user.create.mock.calls[0][0];
      expect(createCallArgs.data.password_hash).not.toBe('Str0ng!Password');

      // Membership created for the new user
      expect(mockPrisma.tenantMembership.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          user_id: createdUser.id,
          membership_status: 'active',
          joined_at: expect.any(Date),
        },
      });

      // Roles assigned
      expect(mockPrisma.membershipRole.createMany).toHaveBeenCalledWith({
        data: [
          {
            membership_id: MEMBERSHIP_ID,
            role_id: ROLE_ID_1,
            tenant_id: TENANT_ID,
          },
        ],
      });

      // Invitation accepted
      expect(mockPrisma.invitation.update).toHaveBeenCalledWith({
        where: { id: INVITATION_ID },
        data: { status: 'accepted', accepted_at: expect.any(Date) },
      });

      expect(result.accepted).toBe(true);
      expect(result.user.email).toBe(createdUser.email);
      expect(result.tenant_id).toBe(TENANT_ID);
    });

    it('should throw when new user accepts without providing registration data', async () => {
      const plainToken = 'no-reg-data-token';
      const tokenHash = sha256(plainToken);

      mockPrisma.invitation.findFirst.mockResolvedValueOnce({
        id: INVITATION_ID,
        tenant_id: TENANT_ID,
        email: 'ghost@school.com',
        invited_role_payload: { role_ids: [ROLE_ID_1] },
        token_hash: tokenHash,
        status: 'pending',
        expires_at: new Date(Date.now() + 60 * 60 * 1000),
      });

      // No existing user
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.acceptInvitation(plainToken);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'REGISTRATION_DATA_REQUIRED',
      });
    });
  });

  // ─── revokeInvitation ──────────────────────────────────────────────────────

  describe('revokeInvitation', () => {
    it('should revoke a pending invitation', async () => {
      mockPrisma.invitation.findFirst.mockResolvedValueOnce({
        id: INVITATION_ID,
        tenant_id: TENANT_ID,
        status: 'pending',
      });

      mockPrisma.invitation.update.mockResolvedValueOnce({
        id: INVITATION_ID,
        status: 'revoked',
      });

      const result = await service.revokeInvitation(TENANT_ID, INVITATION_ID);

      expect(mockPrisma.invitation.update).toHaveBeenCalledWith({
        where: { id: INVITATION_ID },
        data: { status: 'revoked' },
      });
      expect(result.status).toBe('revoked');
    });

    it('should throw BadRequestException when invitation is not pending', async () => {
      mockPrisma.invitation.findFirst.mockResolvedValueOnce({
        id: INVITATION_ID,
        tenant_id: TENANT_ID,
        status: 'accepted',
      });

      let caught: unknown;
      try {
        await service.revokeInvitation(TENANT_ID, INVITATION_ID);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'INVITATION_NOT_PENDING',
      });
    });

    it('should throw NotFoundException when invitation does not exist', async () => {
      mockPrisma.invitation.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.revokeInvitation(TENANT_ID, INVITATION_ID);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'INVITATION_NOT_FOUND',
      });
    });
  });
});
