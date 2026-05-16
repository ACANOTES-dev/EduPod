import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AuthService } from '../auth/auth.service';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { PlatformSupportService } from './platform-support.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  runWithRlsContext: jest.fn((prisma, _context, fn) => prisma.$transaction(fn)),
}));

const ACTOR_ID = '11111111-2222-4333-8444-555555555555';
const USER_ID = '22222222-3333-4444-8555-666666666666';
const TENANT_ID = '33333333-4444-4555-8666-777777777777';
const MEMBERSHIP_ID = '44444444-5555-4666-8777-888888888888';
const ROLE_ID = '55555555-6666-4777-8888-999999999999';

const userRow = {
  email: 'user@example.com',
  first_name: 'User',
  global_status: 'active',
  id: USER_ID,
  last_name: 'Example',
  mfa_enabled: true,
};

function buildMockPrisma() {
  const tx = {
    membershipRole: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };

  return {
    tx,
    prisma: {
      $transaction: jest.fn(async <T>(callback: (client: typeof tx) => Promise<T>) => callback(tx)),
      invitation: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      membershipRole: {
        findFirst: jest.fn(),
      },
      platformSupportAuditAction: {
        count: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
      tenant: {
        findUnique: jest.fn(),
      },
      tenantMembership: {
        findUnique: jest.fn(),
      },
      user: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    },
  };
}

describe('PlatformSupportService', () => {
  let service: PlatformSupportService;
  let mock: ReturnType<typeof buildMockPrisma>;
  let authService: {
    clearBruteForce: jest.Mock;
    deleteAllUserSessions: jest.Mock;
    requestPasswordReset: jest.Mock;
  };
  let platformAuditService: { log: jest.Mock };
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    mock = buildMockPrisma();
    authService = {
      clearBruteForce: jest.fn().mockResolvedValue(undefined),
      deleteAllUserSessions: jest.fn().mockResolvedValue(undefined),
      requestPasswordReset: jest
        .fn()
        .mockResolvedValue({ message: 'If email exists, reset link sent' }),
    };
    platformAuditService = { log: jest.fn().mockResolvedValue(undefined) };
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    const module = await Test.createTestingModule({
      providers: [
        PlatformSupportService,
        { provide: PrismaService, useValue: mock.prisma },
        { provide: AuthService, useValue: authService },
        { provide: PlatformAuditService, useValue: platformAuditService },
        { provide: getQueueToken('notifications'), useValue: queue },
      ],
    }).compile();

    service = module.get<PlatformSupportService>(PlatformSupportService);
  });

  afterEach(() => jest.clearAllMocks());

  it('resetPassword triggers auth reset and writes both audit trails', async () => {
    mock.prisma.user.findUnique.mockResolvedValueOnce(userRow);

    const result = await service.resetPassword(USER_ID, ACTOR_ID, {
      actor_user_id: ACTOR_ID,
    });

    expect(result).toEqual({ message: 'Password reset email triggered' });
    expect(authService.requestPasswordReset).toHaveBeenCalledWith('user@example.com');
    expect(mock.prisma.platformSupportAuditAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action_type: 'password_reset',
        actor_id: ACTOR_ID,
        target_user_id: USER_ID,
      }),
    });
    expect(platformAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user_password_reset_triggered' }),
    );
  });

  it('resetPassword throws NotFoundException when the user is missing', async () => {
    mock.prisma.user.findUnique.mockResolvedValueOnce(null);

    await expect(service.resetPassword(USER_ID, ACTOR_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('resendInvite regenerates token, queues notification, and audits', async () => {
    mock.prisma.user.findUnique.mockResolvedValueOnce(userRow);
    mock.prisma.invitation.findFirst.mockResolvedValueOnce({
      id: 'invitation-1',
      tenant_id: TENANT_ID,
    });
    mock.prisma.invitation.update.mockResolvedValueOnce({});

    await expect(service.resendInvite(USER_ID, ACTOR_ID)).resolves.toEqual({
      message: 'Invitation re-sent',
    });

    expect(mock.prisma.invitation.update).toHaveBeenCalledWith({
      where: { id: 'invitation-1' },
      data: {
        expires_at: expect.any(Date),
        token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });
    expect(queue.add).toHaveBeenCalledWith(
      'communications:send-invitation',
      expect.objectContaining({ invitation_id: 'invitation-1', tenant_id: TENANT_ID }),
      expect.any(Object),
    );
    expect(mock.prisma.platformSupportAuditAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action_type: 'resend_invite' }),
    });
  });

  it('resendInvite rejects users without a pending invitation', async () => {
    mock.prisma.user.findUnique.mockResolvedValueOnce(userRow);
    mock.prisma.invitation.findFirst.mockResolvedValueOnce(null);

    await expect(service.resendInvite(USER_ID, ACTOR_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NO_PENDING_INVITATION' }),
    });
  });

  it('unlockAccount clears brute force state and account lock fields', async () => {
    mock.prisma.user.findUnique.mockResolvedValueOnce(userRow);
    mock.prisma.user.update.mockResolvedValueOnce({});

    await expect(service.unlockAccount(USER_ID, ACTOR_ID)).resolves.toEqual({
      message: 'Account unlocked',
    });

    expect(authService.clearBruteForce).toHaveBeenCalledWith('user@example.com');
    expect(mock.prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { failed_login_attempts: 0, locked_until: null },
    });
  });

  it('disableUser blocks self-disable and already disabled users', async () => {
    mock.prisma.user.findUnique.mockResolvedValueOnce(userRow);
    await expect(service.disableUser(USER_ID, USER_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CANNOT_DISABLE_SELF' }),
    });

    mock.prisma.user.findUnique.mockResolvedValueOnce({ ...userRow, global_status: 'disabled' });
    await expect(service.disableUser(USER_ID, ACTOR_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ALREADY_DISABLED' }),
    });
  });

  it('disableUser updates status, clears sessions, and audits', async () => {
    mock.prisma.user.findUnique.mockResolvedValueOnce(userRow);
    mock.prisma.user.update.mockResolvedValueOnce({});

    await expect(service.disableUser(USER_ID, ACTOR_ID)).resolves.toEqual({
      message: 'User disabled',
    });

    expect(mock.prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { global_status: 'disabled' },
    });
    expect(authService.deleteAllUserSessions).toHaveBeenCalledWith(USER_ID);
    expect(mock.prisma.platformSupportAuditAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action_type: 'disable_user' }),
    });
  });

  it('enableUser only enables disabled users', async () => {
    mock.prisma.user.findUnique.mockResolvedValueOnce(userRow);
    await expect(service.enableUser(USER_ID, ACTOR_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NOT_DISABLED' }),
    });

    mock.prisma.user.findUnique.mockResolvedValueOnce({ ...userRow, global_status: 'disabled' });
    mock.prisma.user.update.mockResolvedValueOnce({});
    await expect(service.enableUser(USER_ID, ACTOR_ID)).resolves.toEqual({
      message: 'User enabled',
    });
    expect(mock.prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { global_status: 'active' },
    });
  });

  it('transferOwnership validates membership and moves school_owner role', async () => {
    mock.prisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID, name: 'School' });
    mock.prisma.membershipRole.findFirst.mockResolvedValueOnce({
      membership: { id: 'old-membership', user_id: 'old-user' },
      role: { id: ROLE_ID },
    });
    mock.prisma.tenantMembership.findUnique.mockResolvedValueOnce({
      id: MEMBERSHIP_ID,
      membership_status: 'active',
    });

    await expect(service.transferOwnership(TENANT_ID, USER_ID, ACTOR_ID)).resolves.toEqual({
      message: 'Ownership transferred',
    });

    expect(mock.tx.membershipRole.upsert).toHaveBeenCalledWith({
      where: {
        membership_id_role_id: {
          membership_id: MEMBERSHIP_ID,
          role_id: ROLE_ID,
        },
      },
      update: {},
      create: { membership_id: MEMBERSHIP_ID, role_id: ROLE_ID, tenant_id: TENANT_ID },
    });
    expect(mock.tx.membershipRole.deleteMany).toHaveBeenCalledWith({
      where: { membership_id: 'old-membership', role_id: ROLE_ID, tenant_id: TENANT_ID },
    });
  });

  it('transferOwnership rejects missing current owner or inactive new owner', async () => {
    mock.prisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, name: 'School' });
    mock.prisma.membershipRole.findFirst.mockResolvedValueOnce(null);

    await expect(service.transferOwnership(TENANT_ID, USER_ID, ACTOR_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NO_CURRENT_OWNER' }),
    });

    mock.prisma.membershipRole.findFirst.mockResolvedValueOnce({
      membership: { id: 'old-membership', user_id: 'old-user' },
      role: { id: ROLE_ID },
    });
    mock.prisma.tenantMembership.findUnique.mockResolvedValueOnce({
      id: MEMBERSHIP_ID,
      membership_status: 'suspended',
    });

    await expect(service.transferOwnership(TENANT_ID, USER_ID, ACTOR_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NEW_OWNER_NOT_MEMBER' }),
    });
  });

  it('transferOwnership rejects missing tenant before role lookup', async () => {
    mock.prisma.tenant.findUnique.mockResolvedValueOnce(null);

    await expect(service.transferOwnership(TENANT_ID, USER_ID, ACTOR_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TENANT_NOT_FOUND' }),
    });
    expect(mock.prisma.membershipRole.findFirst).not.toHaveBeenCalled();
  });

  it('listAuditActions applies filters and pagination', async () => {
    mock.prisma.platformSupportAuditAction.findMany.mockResolvedValueOnce([]);
    mock.prisma.platformSupportAuditAction.count.mockResolvedValueOnce(0);

    const result = await service.listAuditActions({
      action_type: 'disable_user',
      actor_id: ACTOR_ID,
      order: 'desc',
      page: 2,
      pageSize: 5,
      target_tenant_id: TENANT_ID,
      target_user_id: USER_ID,
    });

    expect(result).toEqual({ data: [], meta: { page: 2, pageSize: 5, total: 0 } });
    expect(mock.prisma.platformSupportAuditAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 5,
        where: {
          action_type: 'disable_user',
          actor_id: ACTOR_ID,
          target_tenant_id: TENANT_ID,
          target_user_id: USER_ID,
        },
      }),
    );
  });

  it('listUsers applies search, tenant, status, and pagination filters', async () => {
    const data = [
      {
        ...userRow,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        last_login_at: null,
        locked_until: null,
        memberships: [],
      },
    ];
    mock.prisma.user.findMany.mockResolvedValueOnce(data);
    mock.prisma.user.count.mockResolvedValueOnce(1);

    const result = await service.listUsers({
      global_status: 'active',
      page: 3,
      pageSize: 10,
      search: 'Example',
      tenant_id: TENANT_ID,
    });

    expect(result).toEqual({ data, meta: { page: 3, pageSize: 10, total: 1 } });
    expect(mock.prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 10,
        where: {
          global_status: 'active',
          memberships: { some: { tenant_id: TENANT_ID } },
          OR: [
            { email: { contains: 'Example', mode: 'insensitive' } },
            { first_name: { contains: 'Example', mode: 'insensitive' } },
            { last_name: { contains: 'Example', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });

  it('getUser returns detailed support profile and rejects missing users', async () => {
    const detail = {
      ...userRow,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      email_verified_at: null,
      failed_login_attempts: 0,
      last_login_at: null,
      locked_until: null,
      memberships: [],
    };
    mock.prisma.user.findUnique.mockResolvedValueOnce(detail);

    await expect(service.getUser(USER_ID)).resolves.toBe(detail);
    expect(mock.prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER_ID } }),
    );

    mock.prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.getUser(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});
