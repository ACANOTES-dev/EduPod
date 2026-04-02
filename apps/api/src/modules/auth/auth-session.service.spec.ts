import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SecurityAuditService } from '../audit-log/security-audit.service';
import { RedisService } from '../redis/redis.service';

import { SessionService } from './auth-session.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBERSHIP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SESSION_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const mockSecurityAuditService = {
  logSessionRevocation: jest.fn(),
};

describe('SessionService', () => {
  let service: SessionService;
  let redisClient: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
    sadd: jest.Mock;
    srem: jest.Mock;
    smembers: jest.Mock;
    expire: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    redisClient = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
      sadd: jest.fn().mockResolvedValue(1),
      srem: jest.fn().mockResolvedValue(1),
      smembers: jest.fn().mockResolvedValue([]),
      expire: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        {
          provide: RedisService,
          useValue: {
            getClient: jest.fn().mockReturnValue(redisClient),
          },
        },
        { provide: SecurityAuditService, useValue: mockSecurityAuditService },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createSession ────────────────────────────────────────────────────────

  describe('SessionService -- createSession', () => {
    it('should store session in Redis with 7-day TTL and index by user', async () => {
      await service.createSession({
        user_id: USER_ID,
        session_id: SESSION_ID,
        tenant_id: TENANT_ID,
        membership_id: MEMBERSHIP_ID,
        ip_address: '127.0.0.1',
        user_agent: 'test-agent',
        created_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      });

      expect(redisClient.set).toHaveBeenCalledWith(
        `session:${SESSION_ID}`,
        expect.any(String),
        'EX',
        604800,
      );
      expect(redisClient.sadd).toHaveBeenCalledWith(`user_sessions:${USER_ID}`, SESSION_ID);
      expect(redisClient.expire).toHaveBeenCalledWith(`user_sessions:${USER_ID}`, 604800);
    });
  });

  // ─── getSession ───────────────────────────────────────────────────────────

  describe('SessionService -- getSession', () => {
    it('should return parsed session when found in Redis', async () => {
      const sessionData = {
        user_id: USER_ID,
        session_id: SESSION_ID,
        tenant_id: null,
        membership_id: null,
        ip_address: '10.0.0.1',
        user_agent: 'Firefox',
        created_at: '2026-01-01T00:00:00.000Z',
        last_active_at: '2026-01-01T00:00:00.000Z',
      };
      redisClient.get.mockResolvedValue(JSON.stringify(sessionData));

      const result = await service.getSession(SESSION_ID);

      expect(result).toEqual(sessionData);
      expect(redisClient.get).toHaveBeenCalledWith(`session:${SESSION_ID}`);
    });

    it('should return null when session not found', async () => {
      redisClient.get.mockResolvedValue(null);

      const result = await service.getSession('nonexistent-session');

      expect(result).toBeNull();
    });
  });

  // ─── deleteSession ────────────────────────────────────────────────────────

  describe('SessionService -- deleteSession', () => {
    it('should remove session key and user index entry from Redis', async () => {
      await service.deleteSession(SESSION_ID, USER_ID);

      expect(redisClient.del).toHaveBeenCalledWith(`session:${SESSION_ID}`);
      expect(redisClient.srem).toHaveBeenCalledWith(`user_sessions:${USER_ID}`, SESSION_ID);
    });
  });

  // ─── deleteAllUserSessions ────────────────────────────────────────────────

  describe('SessionService -- deleteAllUserSessions', () => {
    it('should delete all session keys and the user index', async () => {
      redisClient.smembers.mockResolvedValue(['sess-1', 'sess-2', 'sess-3']);

      await service.deleteAllUserSessions(USER_ID);

      expect(redisClient.smembers).toHaveBeenCalledWith(`user_sessions:${USER_ID}`);
      expect(redisClient.del).toHaveBeenCalledWith(
        'session:sess-1',
        'session:sess-2',
        'session:sess-3',
      );
      expect(redisClient.del).toHaveBeenCalledWith(`user_sessions:${USER_ID}`);
    });

    it('should only delete the user index when no sessions exist', async () => {
      redisClient.smembers.mockResolvedValue([]);

      await service.deleteAllUserSessions(USER_ID);

      // del called once for the user_sessions key, not for individual sessions
      expect(redisClient.del).toHaveBeenCalledTimes(1);
      expect(redisClient.del).toHaveBeenCalledWith(`user_sessions:${USER_ID}`);
    });
  });

  // ─── listSessions ────────────────────────────────────────────────────────

  describe('SessionService -- listSessions', () => {
    it('should return all active sessions for a user', async () => {
      const session1 = {
        user_id: USER_ID,
        session_id: 'sess-1',
        tenant_id: null,
        membership_id: null,
        ip_address: '127.0.0.1',
        user_agent: 'Chrome',
        created_at: '2026-01-01T00:00:00.000Z',
        last_active_at: '2026-01-01T01:00:00.000Z',
      };
      const session2 = {
        user_id: USER_ID,
        session_id: 'sess-2',
        tenant_id: TENANT_ID,
        membership_id: MEMBERSHIP_ID,
        ip_address: '10.0.0.1',
        user_agent: 'Firefox',
        created_at: '2026-01-01T02:00:00.000Z',
        last_active_at: '2026-01-01T03:00:00.000Z',
      };

      redisClient.smembers.mockResolvedValue(['sess-1', 'sess-2']);
      redisClient.get
        .mockResolvedValueOnce(JSON.stringify(session1))
        .mockResolvedValueOnce(JSON.stringify(session2));

      const result = await service.listSessions(USER_ID);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(
        expect.objectContaining({
          session_id: 'sess-1',
          ip_address: '127.0.0.1',
          user_agent: 'Chrome',
        }),
      );
      expect(result[1]).toEqual(
        expect.objectContaining({
          session_id: 'sess-2',
          tenant_id: TENANT_ID,
        }),
      );
    });

    it('should return empty array when user has no sessions', async () => {
      redisClient.smembers.mockResolvedValue([]);

      const result = await service.listSessions(USER_ID);

      expect(result).toEqual([]);
    });

    it('should clean up stale session references from the user index', async () => {
      redisClient.smembers.mockResolvedValue(['sess-valid', 'sess-stale']);
      redisClient.get
        .mockResolvedValueOnce(
          JSON.stringify({
            user_id: USER_ID,
            session_id: 'sess-valid',
            tenant_id: null,
            membership_id: null,
            ip_address: '127.0.0.1',
            user_agent: 'Chrome',
            created_at: '2026-01-01T00:00:00.000Z',
            last_active_at: '2026-01-01T00:00:00.000Z',
          }),
        )
        .mockResolvedValueOnce(null); // sess-stale not in Redis

      const result = await service.listSessions(USER_ID);

      expect(result).toHaveLength(1);
      expect(redisClient.srem).toHaveBeenCalledWith(`user_sessions:${USER_ID}`, 'sess-stale');
    });
  });

  // ─── revokeSession ────────────────────────────────────────────────────────

  describe('SessionService -- revokeSession', () => {
    it('should delete the session and log revocation when session belongs to user', async () => {
      const sessionData = {
        user_id: USER_ID,
        session_id: SESSION_ID,
        tenant_id: null,
        membership_id: null,
        ip_address: '127.0.0.1',
        user_agent: 'jest-agent',
        created_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      };
      redisClient.get.mockResolvedValueOnce(JSON.stringify(sessionData));

      await service.revokeSession(USER_ID, SESSION_ID);

      expect(redisClient.del).toHaveBeenCalledWith(`session:${SESSION_ID}`);
      expect(mockSecurityAuditService.logSessionRevocation).toHaveBeenCalledWith(
        USER_ID,
        USER_ID,
        SESSION_ID,
      );
    });

    it('should throw BadRequestException when session not found', async () => {
      redisClient.get.mockResolvedValueOnce(null);

      await expect(service.revokeSession(USER_ID, 'nonexistent')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when session belongs to a different user', async () => {
      const sessionData = {
        user_id: 'other-user-id',
        session_id: SESSION_ID,
        tenant_id: null,
        membership_id: null,
        ip_address: '127.0.0.1',
        user_agent: 'jest-agent',
        created_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      };
      redisClient.get.mockResolvedValueOnce(JSON.stringify(sessionData));

      await expect(service.revokeSession(USER_ID, SESSION_ID)).rejects.toThrow(BadRequestException);
    });
  });
});
