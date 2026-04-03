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

import { SecurityAuditService } from '../audit-log/security-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { MfaService } from './auth-mfa.service';
import { PasswordResetService } from './auth-password-reset.service';
import { RateLimitService } from './auth-rate-limit.service';
import { SessionService } from './auth-session.service';
import { TokenService } from './auth-token.service';
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
  mfa_secret_key_ref: null,
  failed_login_attempts: 0,
  locked_until: null,
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

const JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long!!';
const JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-chars!!';

// ─── Shared mock setup ──────────────────────────────────────────────────────

const mockPrisma = {
  $transaction: jest.fn(),
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

// ─── Sub-service mocks ──────────────────────────────────────────────────────

const mockTokenService = {
  signAccessToken: jest.fn(),
  signRefreshToken: jest.fn(),
  verifyAccessToken: jest.fn(),
  verifyRefreshToken: jest.fn(),
};

const mockSessionService = {
  createSession: jest.fn().mockResolvedValue(undefined),
  getSession: jest.fn().mockResolvedValue(null),
  deleteSession: jest.fn().mockResolvedValue(undefined),
  deleteAllUserSessions: jest.fn().mockResolvedValue(undefined),
  listSessions: jest.fn().mockResolvedValue([]),
  revokeSession: jest.fn().mockResolvedValue(undefined),
};

const mockRateLimitService = {
  checkBruteForce: jest.fn().mockResolvedValue({ blocked: false, retryAfterSeconds: 0 }),
  recordFailedLogin: jest.fn().mockResolvedValue(undefined),
  clearBruteForce: jest.fn().mockResolvedValue(undefined),
  checkIpThrottle: jest.fn().mockResolvedValue({ blocked: false }),
  recordIpFailedLogin: jest.fn().mockResolvedValue(undefined),
  clearIpThrottle: jest.fn().mockResolvedValue(undefined),
  isAccountLocked: jest.fn().mockResolvedValue(false),
  recordAccountFailedLogin: jest.fn().mockResolvedValue(undefined),
  clearAccountLockout: jest.fn().mockResolvedValue(undefined),
};

const mockMfaService = {
  setupMfa: jest.fn(),
  verifyMfaSetup: jest.fn(),
  useRecoveryCode: jest.fn(),
  verifyTotp: jest.fn().mockResolvedValue(false),
  decryptMfaSecret: jest.fn(),
};

const mockPasswordResetService = {
  requestPasswordReset: jest.fn(),
  confirmPasswordReset: jest.fn(),
};

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

    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrisma & { $executeRawUnsafe: jest.Mock }) => Promise<unknown>) =>
        fn({
          ...mockPrisma,
          $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
        }),
    );

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

    // Configure real token signing via mockTokenService (using real JWT)
    const jwt = await import('jsonwebtoken');
    mockTokenService.signAccessToken.mockImplementation((payload: Record<string, unknown>) =>
      jwt.sign({ ...payload, type: 'access' }, JWT_SECRET, { expiresIn: '15m' }),
    );
    mockTokenService.signRefreshToken.mockImplementation((payload: Record<string, unknown>) =>
      jwt.sign({ ...payload, type: 'refresh' }, JWT_REFRESH_SECRET, { expiresIn: '7d' }),
    );
    mockTokenService.verifyAccessToken.mockImplementation((token: string) =>
      jwt.verify(token, JWT_SECRET),
    );
    mockTokenService.verifyRefreshToken.mockImplementation((token: string) =>
      jwt.verify(token, JWT_REFRESH_SECRET),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: TokenService, useValue: mockTokenService },
        { provide: SessionService, useValue: mockSessionService },
        { provide: RateLimitService, useValue: mockRateLimitService },
        { provide: MfaService, useValue: mockMfaService },
        { provide: PasswordResetService, useValue: mockPasswordResetService },
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
    it('should delegate to SessionService', async () => {
      const session = {
        user_id: USER_ID,
        session_id: SESSION_ID,
        tenant_id: TENANT_ID,
        membership_id: MEMBERSHIP_ID,
        ip_address: '127.0.0.1',
        user_agent: 'test-agent',
        created_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      };

      await service.createSession(session);

      expect(mockSessionService.createSession).toHaveBeenCalledWith(session);
    });
  });

  // ─── getSession ───────────────────────────────────────────────────────────

  describe('AuthService -- getSession', () => {
    it('should return parsed session when found via SessionService', async () => {
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
      mockSessionService.getSession.mockResolvedValue(sessionData);

      const result = await service.getSession(SESSION_ID);

      expect(result).toEqual(sessionData);
      expect(mockSessionService.getSession).toHaveBeenCalledWith(SESSION_ID);
    });

    it('should return null when session not found', async () => {
      mockSessionService.getSession.mockResolvedValue(null);

      const result = await service.getSession('nonexistent-session');

      expect(result).toBeNull();
    });
  });

  // ─── deleteSession ────────────────────────────────────────────────────────

  describe('AuthService -- deleteSession', () => {
    it('should delegate to SessionService', async () => {
      await service.deleteSession(SESSION_ID, USER_ID);

      expect(mockSessionService.deleteSession).toHaveBeenCalledWith(SESSION_ID, USER_ID);
    });
  });

  // ─── deleteAllUserSessions ────────────────────────────────────────────────

  describe('AuthService -- deleteAllUserSessions', () => {
    it('should delegate to SessionService', async () => {
      await service.deleteAllUserSessions(USER_ID);

      expect(mockSessionService.deleteAllUserSessions).toHaveBeenCalledWith(USER_ID);
    });
  });

  // ─── checkBruteForce ──────────────────────────────────────────────────────

  describe('AuthService -- checkBruteForce', () => {
    it('should not be blocked below first threshold (4 attempts)', async () => {
      mockRateLimitService.checkBruteForce.mockResolvedValue({
        blocked: false,
        retryAfterSeconds: 0,
      });
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(false);
      expect(result.retryAfterSeconds).toBe(0);
    });

    it('should not be blocked at 0 attempts', async () => {
      mockRateLimitService.checkBruteForce.mockResolvedValue({
        blocked: false,
        retryAfterSeconds: 0,
      });
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(false);
    });

    it('should not be blocked when key does not exist (null)', async () => {
      mockRateLimitService.checkBruteForce.mockResolvedValue({
        blocked: false,
        retryAfterSeconds: 0,
      });
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(false);
    });

    it('should lock at first threshold (5 attempts) for 30 seconds', async () => {
      mockRateLimitService.checkBruteForce.mockResolvedValue({
        blocked: true,
        retryAfterSeconds: 30,
      });
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(true);
      expect(result.retryAfterSeconds).toBe(30);
    });

    it('should lock at second threshold (8 attempts) for 120 seconds', async () => {
      mockRateLimitService.checkBruteForce.mockResolvedValue({
        blocked: true,
        retryAfterSeconds: 120,
      });
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(true);
      expect(result.retryAfterSeconds).toBe(120);
    });

    it('should lock at third threshold (10 attempts) for 1800 seconds', async () => {
      mockRateLimitService.checkBruteForce.mockResolvedValue({
        blocked: true,
        retryAfterSeconds: 1800,
      });
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(true);
      expect(result.retryAfterSeconds).toBe(1800);
    });

    it('should apply highest matching threshold (15 attempts still 1800s)', async () => {
      mockRateLimitService.checkBruteForce.mockResolvedValue({
        blocked: true,
        retryAfterSeconds: 1800,
      });
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(true);
      expect(result.retryAfterSeconds).toBe(1800);
    });
  });

  // ─── recordFailedLogin ────────────────────────────────────────────────────

  describe('AuthService -- recordFailedLogin', () => {
    it('should delegate to RateLimitService', async () => {
      await service.recordFailedLogin('test@school.com');
      expect(mockRateLimitService.recordFailedLogin).toHaveBeenCalledWith(
        'test@school.com',
        undefined,
        undefined,
      );
    });

    it('should pass ip and userAgent to RateLimitService', async () => {
      await service.recordFailedLogin('test@school.com', '1.2.3.4', 'jest-agent');
      expect(mockRateLimitService.recordFailedLogin).toHaveBeenCalledWith(
        'test@school.com',
        '1.2.3.4',
        'jest-agent',
      );
    });
  });

  // ─── clearBruteForce ──────────────────────────────────────────────────────

  describe('AuthService -- clearBruteForce', () => {
    it('should delegate to RateLimitService', async () => {
      await service.clearBruteForce('test@school.com');
      expect(mockRateLimitService.clearBruteForce).toHaveBeenCalledWith('test@school.com');
    });
  });

  // ─── login ────────────────────────────────────────────────────────────────

  describe('AuthService -- login', () => {
    beforeEach(() => {
      mockRateLimitService.checkBruteForce.mockResolvedValue({
        blocked: false,
        retryAfterSeconds: 0,
      });
      mockRateLimitService.checkIpThrottle.mockResolvedValue({ blocked: false });
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

      const loginResult = result as unknown as {
        access_token: string;
        refresh_token: string;
        user: Record<string, unknown>;
      };
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

    it('should create a session via SessionService on successful login', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.user.update.mockResolvedValue({ ...MOCK_USER });

      await service.login(MOCK_USER.email, PASSWORD_PLAIN, '127.0.0.1', 'jest-agent');

      expect(mockSessionService.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: USER_ID,
          ip_address: '127.0.0.1',
          user_agent: 'jest-agent',
        }),
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

      expect(mockRateLimitService.clearBruteForce).toHaveBeenCalledWith(MOCK_USER.email);
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

      expect(mockRateLimitService.recordFailedLogin).toHaveBeenCalledWith(
        'bad@email.com',
        '127.0.0.1',
        'jest-agent',
      );
    });

    it('should throw UnauthorizedException when brute force blocked', async () => {
      mockRateLimitService.checkBruteForce.mockResolvedValue({
        blocked: true,
        retryAfterSeconds: 1800,
      });

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
      mockMfaService.verifyTotp.mockResolvedValue(true);
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

    it('should delegate MFA verification to MfaService during login', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        mfa_enabled: true,
        mfa_secret: 'iv:tag:ciphertext',
        mfa_secret_key_ref: 'v1',
      });
      mockMfaService.verifyTotp.mockResolvedValue(true);
      mockPrisma.user.update.mockResolvedValue({ ...MOCK_USER });

      await service.login(
        MOCK_USER.email,
        PASSWORD_PLAIN,
        '127.0.0.1',
        'jest-agent',
        undefined,
        '123456',
      );

      expect(mockMfaService.verifyTotp).toHaveBeenCalledWith('123456', 'iv:tag:ciphertext', 'v1');
    });

    it('should throw UnauthorizedException when MFA code is invalid', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        mfa_enabled: true,
        mfa_secret: 'TESTSECRET123',
      });
      mockMfaService.verifyTotp.mockResolvedValue(false);

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

      // Session exists via SessionService
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
      mockSessionService.getSession.mockResolvedValue(sessionData);
      redisClient.get.mockResolvedValueOnce(null); // tenant suspended check

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
      mockSessionService.getSession.mockResolvedValue(sessionData);
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

    it('should throw UnauthorizedException when session not found', async () => {
      const refreshToken = service.signRefreshToken({
        sub: USER_ID,
        session_id: SESSION_ID,
      });
      mockSessionService.getSession.mockResolvedValue(null);

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
      mockSessionService.getSession.mockResolvedValue(sessionData);
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
      mockSessionService.getSession.mockResolvedValue(sessionData);

      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        global_status: 'suspended',
      });

      await expect(service.refresh(refreshToken)).rejects.toThrow(ForbiddenException);

      // All sessions should be deleted via SessionService
      expect(mockSessionService.deleteAllUserSessions).toHaveBeenCalledWith(USER_ID);
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
      mockSessionService.getSession.mockResolvedValue(sessionData);
      redisClient.get.mockResolvedValueOnce('true'); // tenant:TENANT_ID:suspended

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
      mockSessionService.getSession.mockResolvedValue(sessionData);
      redisClient.get.mockResolvedValueOnce(null); // tenant:TENANT_ID:suspended (not cached)

      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, status: 'suspended' });

      await expect(service.refresh(refreshToken)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── logout ───────────────────────────────────────────────────────────────

  describe('AuthService -- logout', () => {
    it('should delete the session via SessionService', async () => {
      await service.logout(SESSION_ID, USER_ID);

      expect(mockSessionService.deleteSession).toHaveBeenCalledWith(SESSION_ID, USER_ID);
    });
  });

  // ─── requestPasswordReset ─────────────────────────────────────────────────

  describe('AuthService -- requestPasswordReset', () => {
    it('should delegate to PasswordResetService', async () => {
      mockPasswordResetService.requestPasswordReset.mockResolvedValue({
        message: 'If email exists, reset link sent',
      });

      const result = await service.requestPasswordReset(MOCK_USER.email);

      expect(result).toEqual({ message: 'If email exists, reset link sent' });
      expect(mockPasswordResetService.requestPasswordReset).toHaveBeenCalledWith(MOCK_USER.email);
    });

    it('should return same message when user does not exist (no info leakage)', async () => {
      mockPasswordResetService.requestPasswordReset.mockResolvedValue({
        message: 'If email exists, reset link sent',
      });

      const result = await service.requestPasswordReset('nobody@school.com');

      expect(result).toEqual({ message: 'If email exists, reset link sent' });
    });
  });

  // ─── confirmPasswordReset ─────────────────────────────────────────────────

  describe('AuthService -- confirmPasswordReset', () => {
    it('should delegate to PasswordResetService', async () => {
      mockPasswordResetService.confirmPasswordReset.mockResolvedValue({
        message: 'Password reset successfully',
      });

      const result = await service.confirmPasswordReset('some-token', 'NewPassword123!');

      expect(result).toEqual({ message: 'Password reset successfully' });
      expect(mockPasswordResetService.confirmPasswordReset).toHaveBeenCalledWith(
        'some-token',
        'NewPassword123!',
      );
    });

    it('should throw BadRequestException for invalid or expired token', async () => {
      mockPasswordResetService.confirmPasswordReset.mockRejectedValue(
        new BadRequestException({
          code: 'INVALID_RESET_TOKEN',
          message: 'Invalid or expired reset token',
        }),
      );

      await expect(
        service.confirmPasswordReset('expired-token', 'NewPassword123!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw with INVALID_RESET_TOKEN error code', async () => {
      mockPasswordResetService.confirmPasswordReset.mockRejectedValue(
        new BadRequestException({
          code: 'INVALID_RESET_TOKEN',
          message: 'Invalid or expired reset token',
        }),
      );

      await expect(
        service.confirmPasswordReset('used-token', 'NewPassword123!'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_RESET_TOKEN' }),
      });
    });
  });

  // ─── setupMfa ─────────────────────────────────────────────────────────────

  describe('AuthService -- setupMfa', () => {
    it('should delegate to MfaService and return MFA setup result', async () => {
      mockMfaService.setupMfa.mockResolvedValue({
        secret: 'TESTSECRET123',
        qr_code_url: 'data:image/png;base64,test',
        otpauth_uri: 'otpauth://totp/test',
      });

      const result = await service.setupMfa(USER_ID);

      expect(result.secret).toBe('TESTSECRET123');
      expect(result.qr_code_url).toBe('data:image/png;base64,test');
      expect(result.otpauth_uri).toBe('otpauth://totp/test');
      expect(mockMfaService.setupMfa).toHaveBeenCalledWith(USER_ID);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockMfaService.setupMfa.mockRejectedValue(
        new UnauthorizedException({
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        }),
      );

      await expect(service.setupMfa('nonexistent-user')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── verifyMfaSetup ──────────────────────────────────────────────────────

  describe('AuthService -- verifyMfaSetup', () => {
    it('should delegate to MfaService and return recovery codes', async () => {
      const recoveryCodes = Array.from({ length: 10 }, () => crypto.randomBytes(4).toString('hex'));
      mockMfaService.verifyMfaSetup.mockResolvedValue({ recovery_codes: recoveryCodes });

      const result = await service.verifyMfaSetup(USER_ID, '123456');

      expect(result.recovery_codes).toHaveLength(10);
      for (const code of result.recovery_codes) {
        expect(typeof code).toBe('string');
        expect(code.length).toBeGreaterThan(0);
      }
      expect(mockMfaService.verifyMfaSetup).toHaveBeenCalledWith(USER_ID, '123456');
    });

    it('should reject incorrect TOTP code with UnauthorizedException', async () => {
      mockMfaService.verifyMfaSetup.mockRejectedValue(
        new UnauthorizedException({
          code: 'INVALID_MFA_CODE',
          message: 'Invalid MFA code. Please try again.',
        }),
      );

      await expect(service.verifyMfaSetup(USER_ID, '000000')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw BadRequestException when mfa_secret not yet set', async () => {
      mockMfaService.verifyMfaSetup.mockRejectedValue(
        new BadRequestException({
          code: 'MFA_NOT_SETUP',
          message: 'MFA setup has not been initiated. Call /mfa/setup first.',
        }),
      );

      await expect(service.verifyMfaSetup(USER_ID, '123456')).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockMfaService.verifyMfaSetup.mockRejectedValue(
        new UnauthorizedException({
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        }),
      );

      await expect(service.verifyMfaSetup('nonexistent', '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── useRecoveryCode ──────────────────────────────────────────────────────

  describe('AuthService -- useRecoveryCode', () => {
    it('should delegate to MfaService for a valid recovery code', async () => {
      mockMfaService.useRecoveryCode.mockResolvedValue(undefined);

      await expect(service.useRecoveryCode(USER_ID, 'abcd1234')).resolves.toBeUndefined();
      expect(mockMfaService.useRecoveryCode).toHaveBeenCalledWith(USER_ID, 'abcd1234');
    });

    it('should reject a code that does not match any hash', async () => {
      mockMfaService.useRecoveryCode.mockRejectedValue(
        new UnauthorizedException({
          code: 'INVALID_RECOVERY_CODE',
          message: 'Invalid recovery code',
        }),
      );

      await expect(service.useRecoveryCode(USER_ID, 'wrong-code')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject when no unused codes exist', async () => {
      mockMfaService.useRecoveryCode.mockRejectedValue(
        new UnauthorizedException({
          code: 'INVALID_RECOVERY_CODE',
          message: 'Invalid recovery code',
        }),
      );

      await expect(service.useRecoveryCode(USER_ID, 'any-code')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── loginWithRecoveryCode ────────────────────────────────────────────────

  describe('AuthService -- loginWithRecoveryCode', () => {
    const rawCode = 'recovery1';

    beforeEach(() => {
      mockRateLimitService.checkBruteForce.mockResolvedValue({
        blocked: false,
        retryAfterSeconds: 0,
      });
      mockRateLimitService.checkIpThrottle.mockResolvedValue({ blocked: false });
    });

    it('should login, disable MFA, delete recovery codes, and return tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        mfa_enabled: true,
        mfa_secret: 'TESTSECRET123',
      });
      mockMfaService.useRecoveryCode.mockResolvedValue(undefined);
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

      // MFA disabled (clears both secret and key ref)
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { mfa_enabled: false, mfa_secret: null, mfa_secret_key_ref: null },
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
      mockMfaService.useRecoveryCode.mockRejectedValue(
        new UnauthorizedException({
          code: 'INVALID_RECOVERY_CODE',
          message: 'Invalid recovery code',
        }),
      );

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
      mockRateLimitService.checkBruteForce.mockResolvedValue({
        blocked: true,
        retryAfterSeconds: 1800,
      });

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
      redisClient.get.mockResolvedValue(JSON.stringify({ user_id: USER_ID, tenant_id: TENANT_ID }));

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

      await expect(service.switchTenant(USER_ID, MOCK_USER.email, TENANT_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException when membership does not exist', async () => {
      mockPrisma.tenantMembership.findUnique.mockResolvedValue(null);

      await expect(service.switchTenant(USER_ID, MOCK_USER.email, TENANT_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException when target tenant is not active', async () => {
      mockPrisma.tenantMembership.findUnique.mockResolvedValue({
        id: MEMBERSHIP_ID,
        membership_status: 'active',
        tenant: { id: TENANT_ID, status: 'suspended' },
      });

      await expect(service.switchTenant(USER_ID, MOCK_USER.email, TENANT_ID)).rejects.toThrow(
        ForbiddenException,
      );
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

      await expect(service.getMe('nonexistent', TENANT_ID)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── listSessions ────────────────────────────────────────────────────────

  describe('AuthService -- listSessions', () => {
    it('should delegate to SessionService', async () => {
      const sessions = [
        {
          session_id: 'sess-1',
          ip_address: '127.0.0.1',
          user_agent: 'Chrome',
          created_at: '2026-01-01T00:00:00.000Z',
          last_active_at: '2026-01-01T01:00:00.000Z',
          tenant_id: null,
        },
        {
          session_id: 'sess-2',
          ip_address: '10.0.0.1',
          user_agent: 'Firefox',
          created_at: '2026-01-01T02:00:00.000Z',
          last_active_at: '2026-01-01T03:00:00.000Z',
          tenant_id: TENANT_ID,
        },
      ];
      mockSessionService.listSessions.mockResolvedValue(sessions);

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
      expect(mockSessionService.listSessions).toHaveBeenCalledWith(USER_ID);
    });

    it('should return empty array when user has no sessions', async () => {
      mockSessionService.listSessions.mockResolvedValue([]);

      const result = await service.listSessions(USER_ID);

      expect(result).toEqual([]);
    });
  });

  // ─── revokeSession ────────────────────────────────────────────────────────

  describe('AuthService -- revokeSession', () => {
    it('should delegate to SessionService', async () => {
      await service.revokeSession(USER_ID, SESSION_ID);

      expect(mockSessionService.revokeSession).toHaveBeenCalledWith(USER_ID, SESSION_ID);
    });

    it('should throw BadRequestException when session not found', async () => {
      mockSessionService.revokeSession.mockRejectedValue(
        new BadRequestException({
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found or does not belong to you',
        }),
      );

      await expect(service.revokeSession(USER_ID, 'nonexistent')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when session belongs to a different user', async () => {
      mockSessionService.revokeSession.mockRejectedValue(
        new BadRequestException({
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found or does not belong to you',
        }),
      );

      await expect(service.revokeSession(USER_ID, SESSION_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── IP Throttle (Layer 1) ──────────────────────────────────────────────────

  describe('AuthService -- IP throttle', () => {
    beforeEach(() => {
      mockRateLimitService.checkBruteForce.mockResolvedValue({
        blocked: false,
        retryAfterSeconds: 0,
      });
    });

    it('should block login after IP exceeds max attempts', async () => {
      mockRateLimitService.checkIpThrottle.mockResolvedValue({ blocked: true });

      await expect(
        service.login(MOCK_USER.email, PASSWORD_PLAIN, '10.0.0.99', 'jest-agent'),
      ).rejects.toThrow(UnauthorizedException);

      // Should log with IP_THROTTLED internally but expose INVALID_CREDENTIALS
      expect(mockSecurityAuditService.logLoginFailure).toHaveBeenCalledWith(
        MOCK_USER.email,
        '10.0.0.99',
        'IP_THROTTLED',
        null,
        'jest-agent',
      );

      // Should NOT try to find user when IP is blocked
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('should allow login when IP is below max attempts', async () => {
      mockRateLimitService.checkIpThrottle.mockResolvedValue({ blocked: false });
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.user.update.mockResolvedValue({ ...MOCK_USER });

      const result = await service.login(MOCK_USER.email, PASSWORD_PLAIN, '10.0.0.1', 'jest-agent');

      expect(result).toHaveProperty('access_token');
    });

    it('should increment IP failure counter on failed login', async () => {
      mockRateLimitService.checkIpThrottle.mockResolvedValue({ blocked: false });
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login('bad@email.com', 'password', '10.0.0.50', 'jest-agent'),
      ).rejects.toThrow(UnauthorizedException);

      // IP failure counter should be incremented via RateLimitService
      expect(mockRateLimitService.recordIpFailedLogin).toHaveBeenCalledWith('10.0.0.50');
    });

    it('should return generic INVALID_CREDENTIALS error code when IP throttled', async () => {
      mockRateLimitService.checkIpThrottle.mockResolvedValue({ blocked: true });

      try {
        await service.login(MOCK_USER.email, PASSWORD_PLAIN, '10.0.0.99', 'jest-agent');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        const err = error as UnauthorizedException;
        const response = err.getResponse() as { code: string };
        expect(response.code).toBe('INVALID_CREDENTIALS');
      }
    });
  });

  // ─── Account Lockout (Layer 2) ──────────────────────────────────────────────

  describe('AuthService -- Account lockout', () => {
    beforeEach(() => {
      mockRateLimitService.checkIpThrottle.mockResolvedValue({ blocked: false });
      mockRateLimitService.checkBruteForce.mockResolvedValue({
        blocked: false,
        retryAfterSeconds: 0,
      });
    });

    it('should block login when account is locked and lockout has not expired', async () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000); // 10 min from now
      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        locked_until: futureDate,
        failed_login_attempts: 5,
      });

      await expect(
        service.login(MOCK_USER.email, PASSWORD_PLAIN, '127.0.0.1', 'jest-agent'),
      ).rejects.toThrow(UnauthorizedException);

      // Should log ACCOUNT_LOCKED internally
      expect(mockSecurityAuditService.logLoginFailure).toHaveBeenCalledWith(
        MOCK_USER.email,
        '127.0.0.1',
        'ACCOUNT_LOCKED',
        null,
        'jest-agent',
      );
    });

    it('should return generic INVALID_CREDENTIALS when account is locked', async () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000);
      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        locked_until: futureDate,
        failed_login_attempts: 5,
      });

      try {
        await service.login(MOCK_USER.email, PASSWORD_PLAIN, '127.0.0.1', 'jest-agent');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        const err = error as UnauthorizedException;
        const response = err.getResponse() as { code: string };
        expect(response.code).toBe('INVALID_CREDENTIALS');
      }
    });

    it('should allow login when lockout has expired', async () => {
      const pastDate = new Date(Date.now() - 60 * 1000); // 1 min ago
      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        locked_until: pastDate,
        failed_login_attempts: 5,
      });
      mockPrisma.user.update.mockResolvedValue({ ...MOCK_USER });

      const result = await service.login(
        MOCK_USER.email,
        PASSWORD_PLAIN,
        '127.0.0.1',
        'jest-agent',
      );

      expect(result).toHaveProperty('access_token');
    });

    it('should increment failed_login_attempts on wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        failed_login_attempts: 2,
      });

      await expect(
        service.login(MOCK_USER.email, 'WrongPassword!', '127.0.0.1', 'jest-agent'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER_ID },
          data: { failed_login_attempts: 3 },
        }),
      );
    });

    it('should lock account when failed attempts reach threshold', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        failed_login_attempts: 4, // Next failure = 5 = threshold
      });

      await expect(
        service.login(MOCK_USER.email, 'WrongPassword!', '127.0.0.1', 'jest-agent'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER_ID },
          data: {
            failed_login_attempts: 5,
            locked_until: expect.any(Date),
          },
        }),
      );
    });

    it('should reset failed_login_attempts on successful login', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        failed_login_attempts: 3,
      });
      mockPrisma.user.update.mockResolvedValue({ ...MOCK_USER });

      await service.login(MOCK_USER.email, PASSWORD_PLAIN, '127.0.0.1', 'jest-agent');

      // First update call resets lockout counters, second updates last_login_at
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER_ID },
          data: { failed_login_attempts: 0, locked_until: null },
        }),
      );
    });

    it('should not update lockout counters when they are already zero', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER }); // already 0/null
      mockPrisma.user.update.mockResolvedValue({ ...MOCK_USER });

      await service.login(MOCK_USER.email, PASSWORD_PLAIN, '127.0.0.1', 'jest-agent');

      // Only one update: last_login_at (no lockout reset needed)
      const updateCalls = (mockPrisma.user.update as jest.Mock).mock.calls;
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0][0]).toEqual(
        expect.objectContaining({
          data: { last_login_at: expect.any(Date) },
        }),
      );
    });

    it('should return same INVALID_CREDENTIALS code for all failure paths', async () => {
      // Test 1: User not found
      mockPrisma.user.findUnique.mockResolvedValue(null);
      try {
        await service.login('ghost@school.com', 'password', '127.0.0.1', 'jest-agent');
        fail('Should have thrown');
      } catch (error) {
        const err = error as UnauthorizedException;
        const response = err.getResponse() as { code: string };
        expect(response.code).toBe('INVALID_CREDENTIALS');
      }

      jest.clearAllMocks();
      mockRateLimitService.checkIpThrottle.mockResolvedValue({ blocked: false });
      mockRateLimitService.checkBruteForce.mockResolvedValue({
        blocked: false,
        retryAfterSeconds: 0,
      });

      // Test 2: Wrong password
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.user.update.mockResolvedValue({ ...MOCK_USER });
      try {
        await service.login(MOCK_USER.email, 'WrongPassword!', '127.0.0.1', 'jest-agent');
        fail('Should have thrown');
      } catch (error) {
        const err = error as UnauthorizedException;
        const response = err.getResponse() as { code: string };
        expect(response.code).toBe('INVALID_CREDENTIALS');
      }

      jest.clearAllMocks();
      mockRateLimitService.checkIpThrottle.mockResolvedValue({ blocked: false });
      mockRateLimitService.checkBruteForce.mockResolvedValue({
        blocked: false,
        retryAfterSeconds: 0,
      });

      // Test 3: Account locked
      mockPrisma.user.findUnique.mockResolvedValue({
        ...MOCK_USER,
        locked_until: new Date(Date.now() + 600_000),
        failed_login_attempts: 5,
      });
      try {
        await service.login(MOCK_USER.email, PASSWORD_PLAIN, '127.0.0.1', 'jest-agent');
        fail('Should have thrown');
      } catch (error) {
        const err = error as UnauthorizedException;
        const response = err.getResponse() as { code: string };
        expect(response.code).toBe('INVALID_CREDENTIALS');
      }
    });
  });
});
