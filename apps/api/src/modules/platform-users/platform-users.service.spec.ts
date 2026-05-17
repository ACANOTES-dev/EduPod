import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { PlatformUsersService } from './platform-users.service';

const PLATFORM_USER_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_USER_ID = '33333333-3333-4333-8333-333333333333';
const OWNER_ROLE_ID = '44444444-4444-4444-8444-444444444444';
const SUPPORT_ROLE_ID = '55555555-5555-4555-8555-555555555555';

const ownerRole = {
  id: OWNER_ROLE_ID,
  role_key: 'platform_owner',
  display_name: 'Platform Owner',
};

const supportRole = {
  id: SUPPORT_ROLE_ID,
  role_key: 'platform_support',
  display_name: 'Platform Support',
};

const platformUserRow = {
  id: PLATFORM_USER_ID,
  user_id: USER_ID,
  invited_by_user_id: ACTOR_USER_ID,
  invited_at: new Date('2026-05-01T00:00:00.000Z'),
  activated_at: null,
  revoked_at: null,
  notes: null,
  roles: [{ platform_user_id: PLATFORM_USER_ID, role_id: OWNER_ROLE_ID, role: ownerRole }],
  user: {
    id: USER_ID,
    email: 'operator@example.com',
    first_name: 'Platform',
    last_name: 'Operator',
    global_status: 'active',
    last_login_at: null,
  },
};

function buildMockPrisma() {
  const tx = {
    passwordResetToken: { create: jest.fn() },
    platformUser: {
      update: jest.fn(),
      upsert: jest.fn(),
    },
    platformUserRole: {
      delete: jest.fn(),
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
    user: { create: jest.fn() },
  };

  return {
    tx,
    prisma: {
      $transaction: jest.fn(async <T>(callback: (client: typeof tx) => Promise<T>) => callback(tx)),
      passwordResetToken: { create: jest.fn() },
      platformPermission: { findMany: jest.fn() },
      platformRole: { findMany: jest.fn() },
      platformUser: {
        count: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      platformUserRole: {
        delete: jest.fn(),
        deleteMany: jest.fn(),
        upsert: jest.fn(),
      },
      user: { findUnique: jest.fn() },
    },
  };
}

describe('PlatformUsersService', () => {
  let service: PlatformUsersService;
  let mock: ReturnType<typeof buildMockPrisma>;
  let mockAuditService: { log: jest.Mock };

  beforeEach(async () => {
    mock = buildMockPrisma();
    mockAuditService = { log: jest.fn().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      providers: [
        PlatformUsersService,
        { provide: PrismaService, useValue: mock.prisma },
        { provide: PlatformAuditService, useValue: mockAuditService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('https://dua.edupod.app') },
        },
      ],
    }).compile();
    service = module.get<PlatformUsersService>(PlatformUsersService);
  });

  afterEach(() => jest.clearAllMocks());

  it('default-denies membership when no active platform row with roles exists', async () => {
    mock.prisma.platformUser.findFirst.mockResolvedValueOnce(null);

    await expect(service.isMember(USER_ID)).resolves.toBe(false);
    expect(mock.prisma.platformUser.findFirst).toHaveBeenCalledWith({
      where: {
        revoked_at: null,
        roles: { some: {} },
        user: { global_status: 'active' },
        user_id: USER_ID,
      },
      select: { id: true },
    });
  });

  it('authorizes a user only when the relational permission is present', async () => {
    mock.prisma.platformUser.findFirst.mockResolvedValueOnce({ id: PLATFORM_USER_ID });

    await expect(service.hasPermission(USER_ID, 'platform.tenants.view')).resolves.toBe(true);

    expect(mock.prisma.platformUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          revoked_at: null,
          user: { global_status: 'active' },
          user_id: USER_ID,
        }),
      }),
    );
  });

  it('invites a new platform user, grants roles, and returns a setup URL', async () => {
    mock.prisma.user.findUnique.mockResolvedValueOnce(null);
    mock.prisma.platformRole.findMany.mockResolvedValueOnce([ownerRole]);
    mock.tx.user.create.mockResolvedValueOnce({ id: USER_ID });
    mock.tx.platformUser.upsert.mockResolvedValueOnce({ id: PLATFORM_USER_ID });
    mock.prisma.platformUser.findUnique.mockResolvedValueOnce(platformUserRow);

    const result = await service.invite(
      {
        email: 'operator@example.com',
        first_name: 'Platform',
        last_name: 'Operator',
        role_keys: ['platform_owner'],
      },
      ACTOR_USER_ID,
    );

    expect(mock.tx.platformUserRole.upsert).toHaveBeenCalledWith({
      where: {
        platform_user_id_role_id: {
          platform_user_id: PLATFORM_USER_ID,
          role_id: OWNER_ROLE_ID,
        },
      },
      update: {},
      create: {
        platform_user_id: PLATFORM_USER_ID,
        role_id: OWNER_ROLE_ID,
        granted_by_user_id: ACTOR_USER_ID,
      },
    });
    expect(mock.tx.passwordResetToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ user_id: USER_ID }),
    });
    expect(result.setup_url).toContain('https://dua.edupod.app/en/reset-password?token=');
    expect(result.platform_user).toEqual(platformUserRow);
  });

  it('rejects unknown platform roles', async () => {
    mock.prisma.platformUser.findUnique.mockResolvedValueOnce(platformUserRow);
    mock.prisma.platformRole.findMany.mockResolvedValueOnce([]);

    await expect(
      service.updateRoles(PLATFORM_USER_ID, { role_keys: ['platform_owner'] }, ACTOR_USER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks removing the actor own platform_owner role', async () => {
    mock.prisma.platformUser.findUnique.mockResolvedValueOnce({
      ...platformUserRow,
      user_id: ACTOR_USER_ID,
    });
    mock.prisma.platformRole.findMany.mockResolvedValueOnce([supportRole]);

    await expect(
      service.updateRoles(PLATFORM_USER_ID, { role_keys: ['platform_support'] }, ACTOR_USER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks removing the last active platform_owner role from another operator', async () => {
    mock.prisma.platformUser.findUnique.mockResolvedValueOnce(platformUserRow);
    mock.prisma.platformRole.findMany.mockResolvedValueOnce([supportRole]);
    mock.prisma.platformUser.count.mockResolvedValueOnce(0);

    await expect(
      service.updateRoles(PLATFORM_USER_ID, { role_keys: ['platform_support'] }, ACTOR_USER_ID),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'LAST_PLATFORM_OWNER' }),
    });
  });

  it('blocks revoking the actor own platform_owner row', async () => {
    mock.prisma.platformUser.findUnique.mockResolvedValueOnce({
      ...platformUserRow,
      user_id: ACTOR_USER_ID,
    });

    await expect(service.revoke(PLATFORM_USER_ID, ACTOR_USER_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('blocks revoking the last active platform_owner row', async () => {
    mock.prisma.platformUser.findUnique.mockResolvedValueOnce(platformUserRow);
    mock.prisma.platformUser.count.mockResolvedValueOnce(0);

    await expect(service.revoke(PLATFORM_USER_ID, ACTOR_USER_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'LAST_PLATFORM_OWNER' }),
    });
  });

  it('updates access status through the Session 3D alias path', async () => {
    mock.prisma.platformUser.findUnique
      .mockResolvedValueOnce({
        ...platformUserRow,
        roles: [
          { platform_user_id: PLATFORM_USER_ID, role_id: SUPPORT_ROLE_ID, role: supportRole },
        ],
      })
      .mockResolvedValueOnce({
        ...platformUserRow,
        revoked_at: new Date('2026-05-02T00:00:00.000Z'),
        roles: [
          { platform_user_id: PLATFORM_USER_ID, role_id: SUPPORT_ROLE_ID, role: supportRole },
        ],
      });

    await expect(
      service.updateAccess(PLATFORM_USER_ID, { is_active: false }, ACTOR_USER_ID),
    ).resolves.toMatchObject({ id: PLATFORM_USER_ID });

    expect(mock.tx.platformUser.update).toHaveBeenCalledWith({
      where: { id: PLATFORM_USER_ID },
      data: { revoked_at: expect.any(Date) },
    });
  });

  it('revokes a platform user without deleting the underlying user account', async () => {
    mock.prisma.platformUser.findUnique.mockResolvedValueOnce({
      ...platformUserRow,
      roles: [{ platform_user_id: PLATFORM_USER_ID, role_id: SUPPORT_ROLE_ID, role: supportRole }],
    });

    await expect(service.revoke(PLATFORM_USER_ID, ACTOR_USER_ID)).resolves.toBeUndefined();

    expect(mock.tx.platformUserRole.deleteMany).toHaveBeenCalledWith({
      where: { platform_user_id: PLATFORM_USER_ID },
    });
    expect(mock.tx.platformUser.update).toHaveBeenCalledWith({
      where: { id: PLATFORM_USER_ID },
      data: { revoked_at: expect.any(Date) },
    });
    expect(mock.tx.user.create).not.toHaveBeenCalled();
  });
});
