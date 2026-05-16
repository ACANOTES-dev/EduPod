import { NotFoundException } from '@nestjs/common';

import { AuthReadFacade } from '../auth/auth-read.facade';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { PlatformSessionService } from './platform-session.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = 'session-1';

function buildRedis() {
  const store = new Map<string, string>([
    [
      `session:${SESSION_ID}`,
      JSON.stringify({
        created_at: '2026-05-17T10:00:00.000Z',
        ip_address: '127.0.0.1',
        last_active_at: '2026-05-17T10:15:00.000Z',
        membership_id: 'membership-1',
        session_id: SESSION_ID,
        tenant_id: TENANT_ID,
        user_agent: 'Playwright',
        user_id: USER_ID,
      }),
    ],
  ]);
  const sets = new Map<string, string[]>([[`user_sessions:${USER_ID}`, [SESSION_ID]]]);
  const scan = jest.fn().mockResolvedValue(['0', [...store.keys()]]);
  const get = jest.fn((key: string) => Promise.resolve(store.get(key) ?? null));
  const del = jest.fn((...keys: string[]) => {
    let count = 0;
    for (const key of keys) {
      if (store.delete(key) || sets.delete(key)) count += 1;
    }
    return Promise.resolve(count);
  });
  const srem = jest.fn().mockResolvedValue(1);

  return {
    del,
    get,
    pipeline: jest.fn(() => ({
      del,
      exec: jest.fn().mockResolvedValue([]),
      srem,
    })),
    scan,
    smembers: jest.fn((key: string) => Promise.resolve(sets.get(key) ?? [])),
    srem,
  };
}

function buildPrisma() {
  return {
    tenant: {
      findMany: jest.fn().mockResolvedValue([{ id: TENANT_ID, name: 'Pilot School' }]),
      findUnique: jest.fn().mockResolvedValue({ id: TENANT_ID, name: 'Pilot School' }),
    },
  };
}

describe('PlatformSessionService', () => {
  let authReadFacade: jest.Mocked<Pick<AuthReadFacade, 'findUserSummary' | 'findUsersByIds'>>;
  let platformAuditService: jest.Mocked<Pick<PlatformAuditService, 'log'>>;
  let prisma: ReturnType<typeof buildPrisma>;
  let redis: ReturnType<typeof buildRedis>;
  let service: PlatformSessionService;

  beforeEach(() => {
    prisma = buildPrisma();
    redis = buildRedis();
    authReadFacade = {
      findUserSummary: jest.fn().mockResolvedValue({
        email: 'admin@example.com',
        first_name: 'Ada',
        id: USER_ID,
        last_name: 'Admin',
      }),
      findUsersByIds: jest.fn().mockResolvedValue([
        {
          email: 'admin@example.com',
          first_name: 'Ada',
          id: USER_ID,
          last_name: 'Admin',
        },
      ]),
    };
    platformAuditService = { log: jest.fn().mockResolvedValue(undefined) };
    service = new PlatformSessionService(
      prisma as unknown as PrismaService,
      { getClient: () => redis } as unknown as RedisService,
      authReadFacade as unknown as AuthReadFacade,
      platformAuditService as unknown as PlatformAuditService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('lists sessions grouped by tenant using Redis SCAN', async () => {
    const result = await service.listSessions();

    expect(redis.scan).toHaveBeenCalledWith('0', 'MATCH', 'session:*', 'COUNT', 200);
    expect(authReadFacade.findUsersByIds).toHaveBeenCalledWith('', [USER_ID]);
    expect(result).toEqual([
      {
        tenant_id: TENANT_ID,
        tenant_name: 'Pilot School',
        user_count: 1,
        sessions: [
          expect.objectContaining({
            session_id: SESSION_ID,
            user_email: 'admin@example.com',
            user_name: 'Ada Admin',
          }),
        ],
      },
    ]);
  });

  it('force logs out tenant sessions and writes audit', async () => {
    const result = await service.forceLogoutTenant(TENANT_ID, { actor_user_id: USER_ID });

    expect(result).toEqual({ logged_out: 1 });
    expect(redis.pipeline).toHaveBeenCalledTimes(1);
    expect(platformAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'session_force_logged_out_tenant',
        target_tenant_id: TENANT_ID,
      }),
    );
  });

  it('throws when force logging out a missing user', async () => {
    authReadFacade.findUserSummary.mockResolvedValueOnce(null);

    await expect(service.forceLogoutUser(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});
