/* eslint-disable import/order -- jest.mock must precede mocked imports */
import * as crypto from 'crypto';

import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';

// Mock otplib and qrcode before any imports that pull them in
jest.mock('otplib', () => ({
  generateSecret: jest.fn().mockReturnValue('TESTSECRET123'),
  generateURI: jest.fn().mockReturnValue('otpauth://totp/test'),
  verify: jest.fn(),
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,test'),
}));

import { verify as otpVerify } from 'otplib';

import { SecurityAuditService } from '../audit-log/security-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { AuthService } from './auth.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBERSHIP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SESSION_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const PASSWORD_PLAIN = 'CorrectPassword123!';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD_PLAIN, 10);

const MOCK_USER = {
  id: USER_ID,
  email: 'user@school.test',
  password_hash: PASSWORD_HASH,
  first_name: 'Test',
  last_name: 'User',
  phone: null,
  preferred_locale: null,
  global_status: 'active',
  mfa_enabled: false,
  mfa_secret: null,
  last_login_at: null,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

const MOCK_MEMBERSHIP = {
  id: MEMBERSHIP_ID,
  tenant_id: TENANT_ID,
  user_id: USER_ID,
  membership_status: 'active',
  tenant: {
    id: TENANT_ID,
    name: 'Test School',
    slug: 'test-school',
    status: 'active',
  },
};

// ─── Shared mock setup ──────────────────────────────────────────────────────

const mockPrisma = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  passwordResetToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  mfaRecoveryCode: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
    update: jest.fn(),
  },
  tenantMembership: { findUnique: jest.fn(), findMany: jest.fn() },
  tenant: { findUnique: jest.fn() },
};

const mockSecurityAuditService = {
  logBruteForceLockout: jest.fn(),
  logLoginFailure: jest.fn(),
  logLoginSuccess: jest.fn(),
  logMfaDisable: jest.fn(),
  logMfaSetup: jest.fn(),
  logPasswordChange: jest.fn(),
  logPasswordReset: jest.fn(),
  logSessionRevocation: jest.fn(),
};

const JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long!!';
const JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-chars!!';

describe('AuthService', () => {
  let service: AuthService;
  let redisClient: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
    sadd: jest.Mock;
    srem: jest.Mock;
    smembers: jest.Mock;
    expire: jest.Mock;
    incr: jest.Mock;
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
      incr: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'JWT_SECRET') return JWT_SECRET;
              if (key === 'JWT_REFRESH_SECRET') return JWT_REFRESH_SECRET;
              if (key === 'MFA_ISSUER') return 'SchoolOS';
              return undefined;
            }),
          },
        },
        {
          provide: RedisService,
          useValue: {
            getClient: jest.fn().mockReturnValue(redisClient),
            ping: jest.fn().mockResolvedValue(true),
          },
        },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecurityAuditService, useValue: mockSecurityAuditService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── signAccessToken ──────────────────────────────────────────────────────

  describe('AuthService -- signAccessToken', () => {
    it('should sign a valid JWT access token with 3 parts', () => {
      const token = service.signAccessToken({
        sub: USER_ID,
        email: 'test@school.com',
        tenant_id: TENANT_ID,
        membership_id: MEMBERSHIP_ID,
      });
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include type=access in the payload', () => {
      const token = service.signAccessToken({
        sub: USER_ID,
        email: 'test@school.com',
        tenant_id: null,
        membership_id: null,
      });
      const payload = service.verifyAccessToken(token);
      expect(payload.type).toBe('access');
    });
  });

  // ─── verifyAccessToken ────────────────────────────────────────────────────

  describe('AuthService -- verifyAccessToken', () => {
    it('should verify a valid access token and return correct fields', () => {
      const token = service.signAccessToken({
        sub: USER_ID,
        email: 'test@school.com',
        tenant_id: TENANT_ID,
        membership_id: MEMBERSHIP_ID,
      });

      const payload = service.verifyAccessToken(token);
      expect(payload.sub).toBe(USER_ID);
      expect(payload.email).toBe('test@school.com');
      expect(payload.tenant_id).toBe(TENANT_ID);
      expect(payload.membership_id).toBe(MEMBERSHIP_ID);
      expect(payload.type).toBe('access');
      expect(typeof payload.iat).toBe('number');
      expect(typeof payload.exp).toBe('number');
    });

    it('should reject an expired JWT token', async () => {
      const jwt = await import('jsonwebtoken');
      const expiredToken = jwt.sign(
        { sub: USER_ID, email: 'test@school.com', type: 'access' },
        JWT_SECRET,
        { expiresIn: '0s' },
      );

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(() => service.verifyAccessToken(expiredToken)).toThrow();
    });

    it('should reject a token signed with a different secret', async () => {
      const jwt = await import('jsonwebtoken');
      const badToken = jwt.sign(
        { sub: USER_ID, email: 'test@school.com', type: 'access' },
        'wrong-secret-key-that-does-not-match',
        { expiresIn: '15m' },
      );

      expect(() => service.verifyAccessToken(badToken)).toThrow();
    });
  });

  // ─── signRefreshToken / verifyRefreshToken ────────────────────────────────

  describe('AuthService -- signRefreshToken', () => {
    it('should sign a valid refresh token with type=refresh', () => {
      const token = service.signRefreshToken({
        sub: USER_ID,
        session_id: SESSION_ID,
      });

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });
  });

  describe('AuthService -- verifyRefreshToken', () => {
    it('should verify a valid refresh token and return correct fields', () => {
      const token = service.signRefreshToken({
        sub: USER_ID,
        session_id: SESSION_ID,
      });

      const payload = service.verifyRefreshToken(token);
      expect(payload.sub).toBe(USER_ID);
      expect(payload.session_id).toBe(SESSION_ID);
      expect(payload.type).toBe('refresh');
    });

    it('should reject a refresh token signed with the access secret', async () => {
      const jwt = await import('jsonwebtoken');
      const badToken = jwt.sign(
        { sub: USER_ID, session_id: SESSION_ID, type: 'refresh' },
        JWT_SECRET, // access secret, not refresh secret
        { expiresIn: '7d' },
      );

      expect(() => service.verifyRefreshToken(badToken)).toThrow();
    });
  });

  // ─── createSession ────────────────────────────────────────────────────────

  describe('AuthService -- createSession', () => {
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

  describe('AuthService -- getSession', () => {
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

  describe('AuthService -- deleteSession', () => {
    it('should remove session key and user index entry from Redis', async () => {
      await service.deleteSession(SESSION_ID, USER_ID);

      expect(redisClient.del).toHaveBeenCalledWith(`session:${SESSION_ID}`);
      expect(redisClient.srem).toHaveBeenCalledWith(`user_sessions:${USER_ID}`, SESSION_ID);
    });
  });

  // ─── deleteAllUserSessions ────────────────────────────────────────────────

  describe('AuthService -- deleteAllUserSessions', () => {
    it('should delete all session keys and the user index', async () => {
      redisClient.smembers.mockResolvedValue(['sess-1', 'sess-2', 'sess-3']);

      await service.deleteAllUserSessions(USER_ID);

      expect(redisClient.smembers).toHaveBeenCalledWith(`user_sessions:${USER_ID}`);
      expect(redisClient.del).toHaveBeenCalledWith('session:sess-1', 'session:sess-2', 'session:sess-3');
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

  // ─── checkBruteForce ──────────────────────────────────────────────────────

  describe('AuthService -- checkBruteForce', () => {
    it('should not be blocked below first threshold (4 attempts)', async () => {
      redisClient.get.mockResolvedValue('4');
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(false);
      expect(result.retryAfterSeconds).toBe(0);
    });

    it('should not be blocked at 0 attempts', async () => {
      redisClient.get.mockResolvedValue('0');
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(false);
    });

    it('should not be blocked when key does not exist (null)', async () => {
      redisClient.get.mockResolvedValue(null);
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(false);
    });

    it('should lock at first threshold (5 attempts) for 30 seconds', async () => {
      redisClient.get.mockResolvedValue('5');
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(true);
      expect(result.retryAfterSeconds).toBe(30);
    });

    it('should lock at second threshold (8 attempts) for 120 seconds', async () => {
      redisClient.get.mockResolvedValue('8');
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(true);
      expect(result.retryAfterSeconds).toBe(120);
    });

    it('should lock at third threshold (10 attempts) for 1800 seconds', async () => {
      redisClient.get.mockResolvedValue('10');
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(true);
      expect(result.retryAfterSeconds).toBe(1800);
    });

    it('should apply highest matching threshold (15 attempts still 1800s)', async () => {
      redisClient.get.mockResolvedValue('15');
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(true);
      expect(result.retryAfterSeconds).toBe(1800);
    });
  });

  // ─── recordFailedLogin ────────────────────────────────────────────────────

  describe('AuthService -- recordFailedLogin', () => {
    it('should increment brute force counter and set expiry window', async () => {
      await service.recordFailedLogin('test@school.com');
      expect(redisClient.incr).toHaveBeenCalledWith('brute_force:test@school.com');
      expect(redisClient.expire).toHaveBeenCalledWith('brute_force:test@school.com', 3600);
    });

    it('should log lockout when a threshold is reached', async () => {
      redisClient.incr.mockResolvedValue(5);

      await service.recordFailedLogin('test@school.com', '1.2.3.4', 'jest-agent');

      expect(mockSecurityAuditService.logBruteForceLockout).toHaveBeenCalledWith(
        'test@school.com',
        '1.2.3.4',
        0.5,
        null,
        'jest-agent',
      );
    });

    it('should not log lockout when no threshold is reached', async () => {
      redisClient.incr.mockResolvedValue(3); // Not a threshold

      await service.recordFailedLogin('test@school.com', '1.2.3.4', 'jest-agent');

      expect(mockSecurityAuditService.logBruteForceLockout).not.toHaveBeenCalled();
    });

    it('should not log lockout when no ipAddress is provided', async () => {
      redisClient.incr.mockResolvedValue(5);

      await service.recordFailedLogin('test@school.com');

      expect(mockSecurityAuditService.logBruteForceLockout).not.toHaveBeenCalled();
    });
  });

  // ─── clearBruteForce ──────────────────────────────────────────────────────

  describe('AuthService -- clearBruteForce', () => {
    it('should delete the brute force counter from Redis', async () => {
      await service.clearBruteForce('test@school.com');
      expect(redisClient.del).toHaveBeenCalledWith('brute_force:test@school.com');
    });
  });

  // ─── login ────────────────────────────────────────────────────────────────

  describe('AuthService -- login', () => {
    beforeEach(() => {
      redisClient.get.mockResolvedValue('0'); // No brute force
    });

    it('should return access_token, refresh_token, and sanitised user on happy path', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.user.update.mockResolvedValue({ ...MOCK_USER, last_login_at: new Date() });

      const result = await service.login(
        MOCK_USER.email,
        PASSWORD_PLAIN,
        '127.0.0.1',
        'jest-agent',
      );

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result).toHaveProperty('user');

      const loginResult = result as unknown as { access_token: string; refresh_token: string; user: Record<string, unknown> };
      expect(loginResult.user).toEqual(
        expect.objectContaining({
          id: USER_ID,
          email: MOCK_USER.email,
          first_name: 'Test',
          last_name: 'User',
          mfa_enabled: false,
        }),
      );
      // Sanitised user must NOT contain password_hash
      expect(loginResult.user).not.toHaveProperty('password_hash');
    });

    it('should create a Redis session on successful login', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.user.update.mockResolvedValue({ ...MOCK_USER });

      await service.login(MOCK_USER.email, PASSWORD_PLAIN, '127.0.0.1', 'jest-agent');

      expect(redisClient.set).toHaveBeenCalledWith(
        expect.stringMatching(/^session:/),
        expect.any(String),
        'EX',
        604800,
      );
    });

    it('should update last_login_at on the user record', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.user.update.mockResolvedValue({ ...MOCK_USER });

      await service.login(MOCK_USER.email, PASSWORD_PLAIN, '127.0.0.1', 'jest-agent');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER_ID },
          data: { last_login_at: expect.any(Date) },
        }),
      );
    });

    it('should clear the brute force counter on successful login', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.user.update.mockResolvedValue({ ...MOCK_USER });

      await service.login(MOCK_USER.email, PASSWORD_PLAIN, '127.0.0.1', 'jest-agent');

      expect(redisClient.del).toHaveBeenCalledWith(`brute_force:${MOCK_USER.email}`);
    });

    it('should log successful login via security audit service', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.user.update.mockResolvedValue({ ...MOCK_USER });

      await service.login(MOCK_USER.email, PASSWORD_PLAIN, '127.0.0.1', 'jest-agent');

      expect(mockSecurityAuditService.logLoginSuccess).toHaveBeenCalledWith(
        USER_ID,
        '127.0.0.1',
        'jest-agent',
        null,
        expect.any(String),
      );
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login('nonexistent@school.com', 'password', '127.0.0.1', 'jest-agent'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockSecurityAuditService.logLoginFailure).toHaveBeenCalledWith(
        'nonexistent@school.com',
        '127.0.0.1',
        'INVALID_CREDENTIALS',
        null,
        'jest-agent',
      );
    });

    it('should throw UnauthorizedException with wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });

      await expect(
        service.login(MOCK_USER.email, 'WrongPassword!', '127.0.0.1', 'jest-agent'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockSecurityAuditService.logLoginFailure).toHaveBeenCalledWith(
        MOCK_USER.email,
        '127.0.0.1',
        'INVALID_CREDENTIALS',
        null,
        'jest-agent',
      );
    });

    it('should record a failed login attempt when credentials are invalid', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login('bad@email.com', 'password', '127.0.0.1', 'jest-agent'),
      ).rejects.toThrow(UnauthorizedException);

      expect(redisClient.incr).toHaveBeenCalledWith('brute_force:bad@email.com');
    });

    it('should throw UnauthorizedException when brute force blocked', async () => {
      redisClient.get.mockResolvedValue('10'); // Above threshold

      await expect(
        service.login(MOCK_USER.email, PASSWORD_PLAIN, '127.0.0.1', 'jest-agent'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockSecurityAuditService.logLoginFailure).toHaveBeenCalledWith(
        MOCK_USER.email,
        '127.0.0.1',
        'BRUTE_FORCE_BLOCKED',
        null,
        'jest-agent',
      );
      // Should NOT try to find user when blocked
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user is suspended', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        global_status: 'suspended',
      });

      await expect(
        service.login(MOCK_USER.email, PASSWORD_PLAIN, '127.0.0.1', 'jest-agent'),
      ).rejects.toThrow(ForbiddenException);

      expect(mockSecurityAuditService.logLoginFailure).toHaveBeenCalledWith(
        MOCK_USER.email,
        '127.0.0.1',
        'USER_SUSPENDED',
        null,
        'jest-agent',
      );
    });

    it('should throw ForbiddenException when user is disabled', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        global_status: 'disabled',
      });

      await expect(
        service.login(MOCK_USER.email, PASSWORD_PLAIN, '127.0.0.1', 'jest-agent'),
      ).rejects.toThrow(ForbiddenException);

      expect(mockSecurityAuditService.logLoginFailure).toHaveBeenCalledWith(
        MOCK_USER.email,
        '127.0.0.1',
        'USER_DISABLED',
        null,
        'jest-agent',
      );
    });

    // ─── Tenant context during login ────────────────────────────────────────

    it('should validate tenant membership when tenantId is provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.tenantMembership.findUnique.mockResolvedValue({ ...MOCK_MEMBERSHIP });
      mockPrisma.user.update.mockResolvedValue({ ...MOCK_USER });

      const result = await service.login(
        MOCK_USER.email,
        PASSWORD_PLAIN,
        '127.0.0.1',
        'jest-agent',
        TENANT_ID,
      );

      expect(result).toHaveProperty('access_token');
      expect(mockPrisma.tenantMembership.findUnique).toHaveBeenCalled();
    });

    it('should include tenant_id and membership_id in access token when tenantId provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.tenantMembership.findUnique.mockResolvedValue({ ...MOCK_MEMBERSHIP });
      mockPrisma.user.update.mockResolvedValue({ ...MOCK_USER });

      const result = await service.login(
        MOCK_USER.email,
        PASSWORD_PLAIN,
        '127.0.0.1',
        'jest-agent',
        TENANT_ID,
      );

      const loginResult = result as { access_token: string };
      const payload = service.verifyAccessToken(loginResult.access_token);
      expect(payload.tenant_id).toBe(TENANT_ID);
      expect(payload.membership_id).toBe(MEMBERSHIP_ID);
    });

    it('should throw ForbiddenException when membership is not active', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.tenantMembership.findUnique.mockResolvedValue({
        ...MOCK_MEMBERSHIP,
        membership_status: 'inactive',
      });

      await expect(
        service.login(MOCK_USER.email, PASSWORD_PLAIN, '127.0.0.1', 'jest-agent', TENANT_ID),
      ).rejects.toThrow(ForbiddenException);

      expect(mockSecurityAuditService.logLoginFailure).toHaveBeenCalledWith(
        MOCK_USER.email,
        '127.0.0.1',
        'MEMBERSHIP_NOT_ACTIVE',
        TENANT_ID,
        'jest-agent',
      );
    });

    it('should throw ForbiddenException when membership does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.tenantMembership.findUnique.mockResolvedValue(null);

      await expect(
        service.login(MOCK_USER.email, PASSWORD_PLAIN, '127.0.0.1', 'jest-agent', TENANT_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when tenant is suspended', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.tenantMembership.findUnique.mockResolvedValue({
        ...MOCK_MEMBERSHIP,
        tenant: { ...MOCK_MEMBERSHIP.tenant, status: 'suspended' },
      });

      await expect(
        service.login(MOCK_USER.email, PASSWORD_PLAIN, '127.0.0.1', 'jest-agent', TENANT_ID),
      ).rejects.toThrow(ForbiddenException);

      expect(mockSecurityAuditService.logLoginFailure).toHaveBeenCalledWith(
        MOCK_USER.email,
        '127.0.0.1',
        'TENANT_SUSPENDED',
        TENANT_ID,
        'jest-agent',
      );
    });

    it('should throw ForbiddenException when tenant is archived', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.tenantMembership.findUnique.mockResolvedValue({
        ...MOCK_MEMBERSHIP,
        tenant: { ...MOCK_MEMBERSHIP.tenant, status: 'archived' },
      });

      await expect(
        service.login(MOCK_USER.email, PASSWORD_PLAIN, '127.0.0.1', 'jest-agent', TENANT_ID),
      ).rejects.toThrow(ForbiddenException);

      expect(mockSecurityAuditService.logLoginFailure).toHaveBeenCalledWith(
        MOCK_USER.email,
        '127.0.0.1',
        'TENANT_ARCHIVED',
        TENANT_ID,
        'jest-agent',
      );
    });

    // ─── MFA during login ───────────────────────────────────────────────────

    it('should return mfa_required when user has MFA enabled and no code provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        mfa_enabled: true,
        mfa_secret: 'TESTSECRET123',
      });

      const result = await service.login(
        MOCK_USER.email,
        PASSWORD_PLAIN,
        '127.0.0.1',
        'jest-agent',
      );

      expect(result).toHaveProperty('mfa_required', true);
      expect(result).toHaveProperty('mfa_token');
      const mfaResult = result as { mfa_required: true; mfa_token: string };
      expect(typeof mfaResult.mfa_token).toBe('string');
    });

    it('should complete login when MFA code is valid', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        mfa_enabled: true,
        mfa_secret: 'TESTSECRET123',
      });
      (otpVerify as jest.Mock).mockResolvedValue({ valid: true });
      mockPrisma.user.update.mockResolvedValue({ ...MOCK_USER });

      const result = await service.login(
        MOCK_USER.email,
        PASSWORD_PLAIN,
        '127.0.0.1',
        'jest-agent',
        undefined,
        '123456',
      );

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
    });

    it('should throw UnauthorizedException when MFA code is invalid', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        mfa_enabled: true,
        mfa_secret: 'TESTSECRET123',
      });
      (otpVerify as jest.Mock).mockResolvedValue({ valid: false });

      await expect(
        service.login(
          MOCK_USER.email,
          PASSWORD_PLAIN,
          '127.0.0.1',
          'jest-agent',
          undefined,
          '000000',
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockSecurityAuditService.logLoginFailure).toHaveBeenCalledWith(
        MOCK_USER.email,
        '127.0.0.1',
        'INVALID_MFA_CODE',
        null,
        'jest-agent',
      );
    });

    it('should throw UnauthorizedException when MFA enabled but secret not configured', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        mfa_enabled: true,
        mfa_secret: null,
      });

      await expect(
        service.login(
          MOCK_USER.email,
          PASSWORD_PLAIN,
          '127.0.0.1',
          'jest-agent',
          undefined,
          '123456',
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockSecurityAuditService.logLoginFailure).toHaveBeenCalledWith(
        MOCK_USER.email,
        '127.0.0.1',
        'MFA_NOT_CONFIGURED',
        null,
        'jest-agent',
      );
    });
  });

  // ─── refresh ──────────────────────────────────────────────────────────────

  describe('AuthService -- refresh', () => {
    it('should return a new access token on happy path', async () => {
      // Generate a real refresh token
      const refreshToken = service.signRefreshToken({
        sub: USER_ID,
        session_id: SESSION_ID,
      });

      // Session exists in Redis
      const sessionData = {
        user_id: USER_ID,
        session_id: SESSION_ID,
        tenant_id: TENANT_ID,
        membership_id: MEMBERSHIP_ID,
        ip_address: '127.0.0.1',
        user_agent: 'jest-agent',
        created_at: '2026-01-01T00:00:00.000Z',
        last_active_at: '2026-01-01T00:00:00.000Z',
      };
      redisClient.get
        .mockResolvedValueOnce(JSON.stringify(sessionData)) // getSession
        .mockResolvedValueOnce(null); // tenant suspended check

      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, status: 'active' });

      const result = await service.refresh(refreshToken);

      expect(result).toHaveProperty('access_token');
      expect(typeof result.access_token).toBe('string');

      // Verify the new access token has correct claims
      const payload = service.verifyAccessToken(result.access_token);
      expect(payload.sub).toBe(USER_ID);
      expect(payload.tenant_id).toBe(TENANT_ID);
    });

    it('should update last_active_at on the session', async () => {
      const refreshToken = service.signRefreshToken({
        sub: USER_ID,
        session_id: SESSION_ID,
      });

      const sessionData = {
        user_id: USER_ID,
        session_id: SESSION_ID,
        tenant_id: null,
        membership_id: null,
        ip_address: '127.0.0.1',
        user_agent: 'jest-agent',
        created_at: '2026-01-01T00:00:00.000Z',
        last_active_at: '2026-01-01T00:00:00.000Z',
      };
      redisClient.get.mockResolvedValueOnce(JSON.stringify(sessionData));
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });

      await service.refresh(refreshToken);

      // Session updated in Redis with new last_active_at
      expect(redisClient.set).toHaveBeenCalledWith(
        `session:${SESSION_ID}`,
        expect.any(String),
        'EX',
        604800,
      );
    });

    it('should throw UnauthorizedException when refresh token is invalid', async () => {
      await expect(service.refresh('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException with expired refresh token', async () => {
      const jwt = await import('jsonwebtoken');
      const expiredToken = jwt.sign(
        { sub: USER_ID, session_id: SESSION_ID, type: 'refresh' },
        JWT_REFRESH_SECRET,
        { expiresIn: '0s' },
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      await expect(service.refresh(expiredToken)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when session not found in Redis', async () => {
      const refreshToken = service.signRefreshToken({
        sub: USER_ID,
        session_id: SESSION_ID,
      });
      redisClient.get.mockResolvedValue(null); // No session

      await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      const refreshToken = service.signRefreshToken({
        sub: USER_ID,
        session_id: SESSION_ID,
      });

      const sessionData = {
        user_id: USER_ID,
        session_id: SESSION_ID,
        tenant_id: null,
        membership_id: null,
        ip_address: '127.0.0.1',
        user_agent: 'jest-agent',
        created_at: '2026-01-01T00:00:00.000Z',
        last_active_at: '2026-01-01T00:00:00.000Z',
      };
      redisClient.get.mockResolvedValueOnce(JSON.stringify(sessionData));
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException and delete all sessions when user is not active', async () => {
      const refreshToken = service.signRefreshToken({
        sub: USER_ID,
        session_id: SESSION_ID,
      });

      const sessionData = {
        user_id: USER_ID,
        session_id: SESSION_ID,
        tenant_id: null,
        membership_id: null,
        ip_address: '127.0.0.1',
        user_agent: 'jest-agent',
        created_at: '2026-01-01T00:00:00.000Z',
        last_active_at: '2026-01-01T00:00:00.000Z',
      };
      redisClient.get.mockResolvedValueOnce(JSON.stringify(sessionData));
      // smembers for deleteAllUserSessions
      redisClient.smembers.mockResolvedValue([SESSION_ID]);

      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        global_status: 'suspended',
      });

      await expect(service.refresh(refreshToken)).rejects.toThrow(ForbiddenException);

      // All sessions should be deleted
      expect(redisClient.del).toHaveBeenCalledWith(`session:${SESSION_ID}`);
    });

    it('should throw ForbiddenException when tenant is suspended (Redis cache)', async () => {
      const refreshToken = service.signRefreshToken({
        sub: USER_ID,
        session_id: SESSION_ID,
      });

      const sessionData = {
        user_id: USER_ID,
        session_id: SESSION_ID,
        tenant_id: TENANT_ID,
        membership_id: MEMBERSHIP_ID,
        ip_address: '127.0.0.1',
        user_agent: 'jest-agent',
        created_at: '2026-01-01T00:00:00.000Z',
        last_active_at: '2026-01-01T00:00:00.000Z',
      };
      redisClient.get
        .mockResolvedValueOnce(JSON.stringify(sessionData)) // getSession
        .mockResolvedValueOnce('true'); // tenant:TENANT_ID:suspended

      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });

      await expect(service.refresh(refreshToken)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when tenant is not active in DB', async () => {
      const refreshToken = service.signRefreshToken({
        sub: USER_ID,
        session_id: SESSION_ID,
      });

      const sessionData = {
        user_id: USER_ID,
        session_id: SESSION_ID,
        tenant_id: TENANT_ID,
        membership_id: MEMBERSHIP_ID,
        ip_address: '127.0.0.1',
        user_agent: 'jest-agent',
        created_at: '2026-01-01T00:00:00.000Z',
        last_active_at: '2026-01-01T00:00:00.000Z',
      };
      redisClient.get
        .mockResolvedValueOnce(JSON.stringify(sessionData)) // getSession
        .mockResolvedValueOnce(null); // tenant:TENANT_ID:suspended (not cached)

      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, status: 'suspended' });

      await expect(service.refresh(refreshToken)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── logout ───────────────────────────────────────────────────────────────

  describe('AuthService -- logout', () => {
    it('should delete the session from Redis', async () => {
      await service.logout(SESSION_ID, USER_ID);

      expect(redisClient.del).toHaveBeenCalledWith(`session:${SESSION_ID}`);
      expect(redisClient.srem).toHaveBeenCalledWith(`user_sessions:${USER_ID}`, SESSION_ID);
    });
  });

  // ─── requestPasswordReset ─────────────────────────────────────────────────

  describe('AuthService -- requestPasswordReset', () => {
    it('should create a token with SHA-256 hash and 1-hour expiry', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.passwordResetToken.count.mockResolvedValue(0);
      mockPrisma.passwordResetToken.create.mockResolvedValue({ id: 'token-1' });

      const result = await service.requestPasswordReset(MOCK_USER.email);

      expect(result).toEqual({ message: 'If email exists, reset link sent' });
      expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            user_id: USER_ID,
            token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
            expires_at: expect.any(Date),
          }),
        }),
      );
    });

    it('should return same message when user does not exist (no info leakage)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.requestPasswordReset('nobody@school.com');

      expect(result).toEqual({ message: 'If email exists, reset link sent' });
      expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('should not create a new token when 3 active tokens already exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.passwordResetToken.count.mockResolvedValue(3);

      const result = await service.requestPasswordReset(MOCK_USER.email);

      expect(result).toEqual({ message: 'If email exists, reset link sent' });
      expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('should log the password reset request via security audit service', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.passwordResetToken.count.mockResolvedValue(0);
      mockPrisma.passwordResetToken.create.mockResolvedValue({ id: 'token-1' });

      await service.requestPasswordReset(MOCK_USER.email);

      expect(mockSecurityAuditService.logPasswordReset).toHaveBeenCalledWith(
        USER_ID,
        'email',
        MOCK_USER.email,
      );
    });
  });

  // ─── confirmPasswordReset ─────────────────────────────────────────────────

  describe('AuthService -- confirmPasswordReset', () => {
    const RAW_TOKEN = 'valid-raw-token-abc123';
    const TOKEN_HASH = crypto.createHash('sha256').update(RAW_TOKEN).digest('hex');

    const resetTokenRecord = {
      id: 'reset-token-id-1',
      user_id: USER_ID,
      token_hash: TOKEN_HASH,
      expires_at: new Date(Date.now() + 3600_000),
      used_at: null,
    };

    it('should update password, mark token as used, invalidate other tokens', async () => {
      mockPrisma.passwordResetToken.findFirst.mockResolvedValue({ ...resetTokenRecord });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.passwordResetToken.update.mockResolvedValue({});
      mockPrisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
      redisClient.smembers.mockResolvedValue([]);

      const result = await service.confirmPasswordReset(RAW_TOKEN, 'NewPassword123!');

      expect(result).toEqual({ message: 'Password reset successfully' });

      // Password updated with a bcrypt hash
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER_ID },
          data: expect.objectContaining({
            password_hash: expect.stringMatching(/^\$2[ab]\$/),
          }),
        }),
      );

      // Token marked as used
      expect(mockPrisma.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'reset-token-id-1' },
          data: { used_at: expect.any(Date) },
        }),
      );

      // Other tokens invalidated
      expect(mockPrisma.passwordResetToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user_id: USER_ID,
            used_at: null,
            id: { not: 'reset-token-id-1' },
          }),
        }),
      );
    });

    it('should delete all user sessions after password reset', async () => {
      mockPrisma.passwordResetToken.findFirst.mockResolvedValue({ ...resetTokenRecord });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.passwordResetToken.update.mockResolvedValue({});
      mockPrisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
      redisClient.smembers.mockResolvedValue(['sess-a', 'sess-b']);

      await service.confirmPasswordReset(RAW_TOKEN, 'NewPassword123!');

      expect(redisClient.del).toHaveBeenCalledWith('session:sess-a', 'session:sess-b');
      expect(mockSecurityAuditService.logPasswordChange).toHaveBeenCalledWith(USER_ID);
    });

    it('should throw BadRequestException for invalid or expired token', async () => {
      mockPrisma.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(
        service.confirmPasswordReset('expired-token', 'NewPassword123!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw with INVALID_RESET_TOKEN error code', async () => {
      mockPrisma.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(
        service.confirmPasswordReset('used-token', 'NewPassword123!'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_RESET_TOKEN' }),
      });
    });
  });

  // ─── setupMfa ─────────────────────────────────────────────────────────────

  describe('AuthService -- setupMfa', () => {
    it('should generate TOTP secret, store it, and return QR code', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.user.update.mockResolvedValue({ ...MOCK_USER, mfa_secret: 'TESTSECRET123' });

      const result = await service.setupMfa(USER_ID);

      expect(result.secret).toBe('TESTSECRET123');
      expect(result.qr_code_url).toBe('data:image/png;base64,test');
      expect(result.otpauth_uri).toBe('otpauth://totp/test');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER_ID },
          data: { mfa_secret: 'TESTSECRET123' },
        }),
      );
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.setupMfa('nonexistent-user')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── verifyMfaSetup ──────────────────────────────────────────────────────

  describe('AuthService -- verifyMfaSetup', () => {
    const userWithSecret = { ...MOCK_USER, mfa_secret: 'TESTSECRET123' };

    it('should enable MFA and return 10 recovery codes on valid TOTP', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...userWithSecret });
      (otpVerify as jest.Mock).mockResolvedValue({ valid: true });
      mockPrisma.user.update.mockResolvedValue({ ...userWithSecret, mfa_enabled: true });
      mockPrisma.mfaRecoveryCode.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.mfaRecoveryCode.createMany.mockResolvedValue({ count: 10 });

      const result = await service.verifyMfaSetup(USER_ID, '123456');

      expect(result.recovery_codes).toHaveLength(10);
      for (const code of result.recovery_codes) {
        expect(typeof code).toBe('string');
        expect(code.length).toBeGreaterThan(0);
      }

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { mfa_enabled: true } }),
      );

      expect(mockPrisma.mfaRecoveryCode.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { user_id: USER_ID } }),
      );

      const createManyCall = (mockPrisma.mfaRecoveryCode.createMany as jest.Mock).mock.calls[0][0];
      expect(createManyCall.data).toHaveLength(10);

      expect(mockSecurityAuditService.logMfaSetup).toHaveBeenCalledWith(USER_ID);
    });

    it('should reject incorrect TOTP code with UnauthorizedException', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...userWithSecret });
      (otpVerify as jest.Mock).mockResolvedValue({ valid: false });

      await expect(service.verifyMfaSetup(USER_ID, '000000')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when mfa_secret not yet set', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER, mfa_secret: null });

      await expect(service.verifyMfaSetup(USER_ID, '123456')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.verifyMfaSetup('nonexistent', '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── useRecoveryCode ──────────────────────────────────────────────────────

  describe('AuthService -- useRecoveryCode', () => {
    it('should accept a valid unused recovery code and mark it as used', async () => {
      const rawCode = 'abcd1234';
      const codeHash = crypto.createHash('sha256').update(rawCode).digest('hex');

      mockPrisma.mfaRecoveryCode.findMany.mockResolvedValue([
        { id: 'rc-1', user_id: USER_ID, code_hash: codeHash, used_at: null },
      ]);
      mockPrisma.mfaRecoveryCode.update.mockResolvedValue({});

      await expect(service.useRecoveryCode(USER_ID, rawCode)).resolves.toBeUndefined();

      expect(mockPrisma.mfaRecoveryCode.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rc-1' },
          data: { used_at: expect.any(Date) },
        }),
      );
    });

    it('should reject a code that does not match any hash', async () => {
      const differentHash = crypto.createHash('sha256').update('correct-code').digest('hex');

      mockPrisma.mfaRecoveryCode.findMany.mockResolvedValue([
        { id: 'rc-1', user_id: USER_ID, code_hash: differentHash, used_at: null },
      ]);

      await expect(service.useRecoveryCode(USER_ID, 'wrong-code')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrisma.mfaRecoveryCode.update).not.toHaveBeenCalled();
    });

    it('should reject when no unused codes exist', async () => {
      mockPrisma.mfaRecoveryCode.findMany.mockResolvedValue([]);

      await expect(service.useRecoveryCode(USER_ID, 'any-code')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── loginWithRecoveryCode ────────────────────────────────────────────────

  describe('AuthService -- loginWithRecoveryCode', () => {
    const rawCode = 'recovery1';
    const codeHash = crypto.createHash('sha256').update(rawCode).digest('hex');

    beforeEach(() => {
      redisClient.get.mockResolvedValue('0'); // No brute force
    });

    it('should login, disable MFA, delete recovery codes, and return tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        mfa_enabled: true,
        mfa_secret: 'TESTSECRET123',
      });
      mockPrisma.mfaRecoveryCode.findMany.mockResolvedValue([
        { id: 'rc-1', user_id: USER_ID, code_hash: codeHash, used_at: null },
      ]);
      mockPrisma.mfaRecoveryCode.update.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.mfaRecoveryCode.deleteMany.mockResolvedValue({ count: 10 });

      const result = await service.loginWithRecoveryCode(
        MOCK_USER.email,
        PASSWORD_PLAIN,
        rawCode,
        '127.0.0.1',
        'jest-agent',
      );

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result).toHaveProperty('user');
      expect(result.user).not.toHaveProperty('password_hash');

      // MFA disabled
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { mfa_enabled: false, mfa_secret: null },
        }),
      );

      // Recovery codes deleted
      expect(mockPrisma.mfaRecoveryCode.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { user_id: USER_ID } }),
      );

      expect(mockSecurityAuditService.logMfaDisable).toHaveBeenCalledWith(
        USER_ID,
        null,
        'recovery_code',
      );
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.loginWithRecoveryCode(
          'unknown@school.com',
          'password',
          rawCode,
          '127.0.0.1',
          'jest-agent',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when password is wrong', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });

      await expect(
        service.loginWithRecoveryCode(
          MOCK_USER.email,
          'WrongPass!',
          rawCode,
          '127.0.0.1',
          'jest-agent',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException when user is not active', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        global_status: 'suspended',
      });

      await expect(
        service.loginWithRecoveryCode(
          MOCK_USER.email,
          PASSWORD_PLAIN,
          rawCode,
          '127.0.0.1',
          'jest-agent',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw UnauthorizedException when recovery code is invalid', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        mfa_enabled: true,
        mfa_secret: 'TESTSECRET123',
      });
      mockPrisma.mfaRecoveryCode.findMany.mockResolvedValue([]); // No matching codes

      await expect(
        service.loginWithRecoveryCode(
          MOCK_USER.email,
          PASSWORD_PLAIN,
          'invalid-code',
          '127.0.0.1',
          'jest-agent',
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockSecurityAuditService.logLoginFailure).toHaveBeenCalledWith(
        MOCK_USER.email,
        '127.0.0.1',
        'INVALID_RECOVERY_CODE',
        null,
        'jest-agent',
      );
    });

    it('should throw UnauthorizedException when brute force blocked', async () => {
      redisClient.get.mockResolvedValue('10');

      await expect(
        service.loginWithRecoveryCode(
          MOCK_USER.email,
          PASSWORD_PLAIN,
          rawCode,
          '127.0.0.1',
          'jest-agent',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── switchTenant ─────────────────────────────────────────────────────────

  describe('AuthService -- switchTenant', () => {
    it('should return a new access token with target tenant context', async () => {
      const targetTenantId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
      const targetMembershipId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

      mockPrisma.tenantMembership.findUnique.mockResolvedValue({
        id: targetMembershipId,
        tenant_id: targetTenantId,
        user_id: USER_ID,
        membership_status: 'active',
        tenant: { id: targetTenantId, status: 'active' },
      });

      // Mock Redis operations for session updates
      redisClient.smembers.mockResolvedValue([SESSION_ID]);
      const sessionData = JSON.stringify({
        user_id: USER_ID,
        session_id: SESSION_ID,
        tenant_id: TENANT_ID,
        membership_id: MEMBERSHIP_ID,
      });
      redisClient.get.mockResolvedValue(sessionData);

      const result = await service.switchTenant(USER_ID, MOCK_USER.email, targetTenantId);

      expect(result).toHaveProperty('access_token');
      const payload = service.verifyAccessToken(result.access_token);
      expect(payload.tenant_id).toBe(targetTenantId);
      expect(payload.membership_id).toBe(targetMembershipId);
    });

    it('should update all user sessions in Redis with new tenant context', async () => {
      const targetTenantId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

      mockPrisma.tenantMembership.findUnique.mockResolvedValue({
        id: 'new-mem',
        tenant_id: targetTenantId,
        user_id: USER_ID,
        membership_status: 'active',
        tenant: { id: targetTenantId, status: 'active' },
      });

      redisClient.smembers.mockResolvedValue(['sess-1', 'sess-2']);
      redisClient.get.mockResolvedValue(
        JSON.stringify({ user_id: USER_ID, tenant_id: TENANT_ID }),
      );

      await service.switchTenant(USER_ID, MOCK_USER.email, targetTenantId);

      // Each session should be updated
      expect(redisClient.set).toHaveBeenCalledTimes(2);
      for (const call of (redisClient.set as jest.Mock).mock.calls) {
        const storedSession = JSON.parse(call[1] as string);
        expect(storedSession.tenant_id).toBe(targetTenantId);
      }
    });

    it('should throw ForbiddenException when membership not active', async () => {
      mockPrisma.tenantMembership.findUnique.mockResolvedValue({
        id: 'mem-inactive',
        membership_status: 'inactive',
        tenant: { status: 'active' },
      });

      await expect(
        service.switchTenant(USER_ID, MOCK_USER.email, TENANT_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when membership does not exist', async () => {
      mockPrisma.tenantMembership.findUnique.mockResolvedValue(null);

      await expect(
        service.switchTenant(USER_ID, MOCK_USER.email, TENANT_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when target tenant is not active', async () => {
      mockPrisma.tenantMembership.findUnique.mockResolvedValue({
        id: MEMBERSHIP_ID,
        membership_status: 'active',
        tenant: { id: TENANT_ID, status: 'suspended' },
      });

      await expect(
        service.switchTenant(USER_ID, MOCK_USER.email, TENANT_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── getMe ────────────────────────────────────────────────────────────────

  describe('AuthService -- getMe', () => {
    it('should return sanitised user and memberships', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.tenantMembership.findMany.mockResolvedValue([
        {
          id: MEMBERSHIP_ID,
          tenant_id: TENANT_ID,
          membership_status: 'active',
          tenant: { id: TENANT_ID, name: 'Test School', slug: 'test-school' },
          membership_roles: [
            {
              role: { id: 'role-1', role_key: 'admin', display_name: 'Administrator' },
            },
          ],
        },
      ]);

      const result = await service.getMe(USER_ID, TENANT_ID);

      expect(result.user).toEqual(
        expect.objectContaining({
          id: USER_ID,
          email: MOCK_USER.email,
          first_name: 'Test',
          last_name: 'User',
        }),
      );
      expect(result.user).not.toHaveProperty('password_hash');
      expect(result.memberships).toHaveLength(1);
      expect(result.memberships[0]).toEqual(
        expect.objectContaining({
          id: MEMBERSHIP_ID,
          tenant_id: TENANT_ID,
          tenant_name: 'Test School',
          tenant_slug: 'test-school',
          membership_status: 'active',
          roles: [
            expect.objectContaining({
              role_id: 'role-1',
              role_key: 'admin',
              display_name: 'Administrator',
            }),
          ],
        }),
      );
    });

    it('should filter memberships by tenantId when provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.tenantMembership.findMany.mockResolvedValue([]);

      await service.getMe(USER_ID, TENANT_ID);

      expect(mockPrisma.tenantMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: USER_ID, tenant_id: TENANT_ID },
        }),
      );
    });

    it('should return all memberships when tenantId is null', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.tenantMembership.findMany.mockResolvedValue([]);

      await service.getMe(USER_ID, null);

      expect(mockPrisma.tenantMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: USER_ID },
        }),
      );
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('nonexistent', TENANT_ID)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── listSessions ────────────────────────────────────────────────────────

  describe('AuthService -- listSessions', () => {
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

  describe('AuthService -- revokeSession', () => {
    it('should delete the session and log revocation when session belongs to user', async () => {
      jest.spyOn(service, 'getSession').mockResolvedValue({
        user_id: USER_ID,
        session_id: SESSION_ID,
        tenant_id: null,
        membership_id: null,
        ip_address: '127.0.0.1',
        user_agent: 'jest-agent',
        created_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      });

      await service.revokeSession(USER_ID, SESSION_ID);

      expect(redisClient.del).toHaveBeenCalledWith(`session:${SESSION_ID}`);
      expect(mockSecurityAuditService.logSessionRevocation).toHaveBeenCalledWith(
        USER_ID,
        USER_ID,
        SESSION_ID,
      );
    });

    it('should throw BadRequestException when session not found', async () => {
      jest.spyOn(service, 'getSession').mockResolvedValue(null);

      await expect(service.revokeSession(USER_ID, 'nonexistent')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when session belongs to a different user', async () => {
      jest.spyOn(service, 'getSession').mockResolvedValue({
        user_id: 'other-user-id',
        session_id: SESSION_ID,
        tenant_id: null,
        membership_id: null,
        ip_address: '127.0.0.1',
        user_agent: 'jest-agent',
        created_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      });

      await expect(service.revokeSession(USER_ID, SESSION_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
