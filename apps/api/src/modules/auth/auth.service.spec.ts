import * as crypto from 'crypto';

import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

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

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { AuthService } from './auth.service';

// ─── Shared mock setup ────────────────────────────────────────────────────────

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
  tenantMembership: { findUnique: jest.fn() },
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

  const JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long!!';
  const JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-chars!!';

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
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ─── Section 1.1: JWT token signing and verification ──────────────────────

  describe('JWT token signing and verification', () => {
    it('should sign a valid JWT token', () => {
      const token = service.signAccessToken({
        sub: 'user-123',
        email: 'test@school.com',
        tenant_id: 'tenant-123',
        membership_id: 'membership-123',
      });
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should verify a valid JWT token', () => {
      const token = service.signAccessToken({
        sub: 'user-123',
        email: 'test@school.com',
        tenant_id: 'tenant-123',
        membership_id: 'membership-123',
      });

      const payload = service.verifyAccessToken(token);
      expect(payload.sub).toBe('user-123');
      expect(payload.email).toBe('test@school.com');
      expect(payload.tenant_id).toBe('tenant-123');
      expect(payload.type).toBe('access');
    });

    it('should reject expired JWT token', async () => {
      // Sign a token with very short expiry by manipulating the service
      const jwt = await import('jsonwebtoken');
      const expiredToken = jwt.sign(
        { sub: 'user-123', email: 'test@school.com', type: 'access' },
        JWT_SECRET,
        { expiresIn: '0s' },
      );

      // Wait a tiny bit to ensure token is expired
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(() => service.verifyAccessToken(expiredToken)).toThrow();
    });
  });

  // ─── Section 1.2: Session management ─────────────────────────────────────

  describe('Session management', () => {
    it('should create session in Redis', async () => {
      await service.createSession({
        user_id: 'user-123',
        session_id: 'session-456',
        tenant_id: 'tenant-789',
        membership_id: 'membership-abc',
        ip_address: '127.0.0.1',
        user_agent: 'test-agent',
        created_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      });

      expect(redisClient.set).toHaveBeenCalledWith(
        'session:session-456',
        expect.any(String),
        'EX',
        604800, // 7 days
      );
      expect(redisClient.sadd).toHaveBeenCalledWith(
        'user_sessions:user-123',
        'session-456',
      );
    });

    it('should delete session from Redis', async () => {
      await service.deleteSession('session-456', 'user-123');

      expect(redisClient.del).toHaveBeenCalledWith('session:session-456');
      expect(redisClient.srem).toHaveBeenCalledWith(
        'user_sessions:user-123',
        'session-456',
      );
    });
  });

  // ─── Section 1.3: Brute force protection ──────────────────────────────────

  describe('Brute force protection', () => {
    it('should not be locked below threshold (4 attempts)', async () => {
      redisClient.get.mockResolvedValue('4');
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(false);
      expect(result.retryAfterSeconds).toBe(0);
    });

    it('should lock at first threshold (5 attempts) for 30s', async () => {
      redisClient.get.mockResolvedValue('5');
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(true);
      expect(result.retryAfterSeconds).toBe(30);
    });

    it('should lock at second threshold (8 attempts) for 2m', async () => {
      redisClient.get.mockResolvedValue('8');
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(true);
      expect(result.retryAfterSeconds).toBe(120);
    });

    it('should lock at third threshold (10 attempts) for 30m', async () => {
      redisClient.get.mockResolvedValue('10');
      const result = await service.checkBruteForce('test@school.com');
      expect(result.blocked).toBe(true);
      expect(result.retryAfterSeconds).toBe(1800);
    });

    it('should increment failed login counter', async () => {
      await service.recordFailedLogin('test@school.com');
      expect(redisClient.incr).toHaveBeenCalledWith('brute_force:test@school.com');
      expect(redisClient.expire).toHaveBeenCalledWith(
        'brute_force:test@school.com',
        3600,
      );
    });

    it('should reset failed login counter on success', async () => {
      await service.clearBruteForce('test@school.com');
      expect(redisClient.del).toHaveBeenCalledWith('brute_force:test@school.com');
    });
  });

  // ─── Section 1.4: MFA ─────────────────────────────────────────────────────

  describe('MFA', () => {
    const mockUser = {
      id: 'user-mfa-1',
      email: 'mfa@school.com',
      first_name: 'MFA',
      last_name: 'User',
      phone: null,
      preferred_locale: null,
      global_status: 'active',
      mfa_enabled: false,
      mfa_secret: null,
      last_login_at: null,
      created_at: new Date(),
    };

    describe('setupMfa', () => {
      it('should generate TOTP secret and return QR URI', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(mockUser);
        mockPrisma.user.update.mockResolvedValue({ ...mockUser, mfa_secret: 'TESTSECRET123' });

        const result = await service.setupMfa('user-mfa-1');

        expect(result.secret).toBe('TESTSECRET123');
        expect(result.qr_code_url).toBe('data:image/png;base64,test');
        expect(result.otpauth_uri).toBe('otpauth://totp/test');

        // Secret stored on the user record (not yet enabled)
        expect(mockPrisma.user.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'user-mfa-1' },
            data: { mfa_secret: 'TESTSECRET123' },
          }),
        );
      });

      it('should throw UnauthorizedException when user not found', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null);

        await expect(service.setupMfa('nonexistent-user')).rejects.toThrow(UnauthorizedException);
      });
    });

    describe('verifyMfaSetup', () => {
      const userWithSecret = { ...mockUser, mfa_secret: 'TESTSECRET123' };

      it('should verify correct TOTP code and return 10 recovery codes', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(userWithSecret);
        (otpVerify as jest.Mock).mockResolvedValue({ valid: true });
        mockPrisma.user.update.mockResolvedValue({ ...userWithSecret, mfa_enabled: true });
        mockPrisma.mfaRecoveryCode.deleteMany.mockResolvedValue({ count: 0 });
        mockPrisma.mfaRecoveryCode.createMany.mockResolvedValue({ count: 10 });

        const result = await service.verifyMfaSetup('user-mfa-1', '123456');

        expect(result.recovery_codes).toHaveLength(10);
        // All codes should be non-empty strings
        for (const code of result.recovery_codes) {
          expect(typeof code).toBe('string');
          expect(code.length).toBeGreaterThan(0);
        }

        // MFA enabled on user
        expect(mockPrisma.user.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: { mfa_enabled: true },
          }),
        );

        // Old recovery codes deleted
        expect(mockPrisma.mfaRecoveryCode.deleteMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { user_id: 'user-mfa-1' } }),
        );

        // 10 hashed codes stored
        expect(mockPrisma.mfaRecoveryCode.createMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.arrayContaining([
              expect.objectContaining({ user_id: 'user-mfa-1', code_hash: expect.any(String) }),
            ]),
          }),
        );
        const createManyCall = (mockPrisma.mfaRecoveryCode.createMany as jest.Mock).mock.calls[0][0];
        expect(createManyCall.data).toHaveLength(10);
      });

      it('should reject incorrect TOTP code with UnauthorizedException', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(userWithSecret);
        (otpVerify as jest.Mock).mockResolvedValue({ valid: false });

        await expect(service.verifyMfaSetup('user-mfa-1', '000000')).rejects.toThrow(
          UnauthorizedException,
        );

        // MFA must NOT be enabled
        expect(mockPrisma.user.update).not.toHaveBeenCalled();
      });

      it('should throw BadRequestException when mfa_secret not yet set', async () => {
        mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, mfa_secret: null });

        await expect(service.verifyMfaSetup('user-mfa-1', '123456')).rejects.toThrow(
          BadRequestException,
        );
      });
    });

    describe('useRecoveryCode', () => {
      it('should accept a valid unused recovery code', async () => {
        const rawCode = 'abcd1234';
        const codeHash = crypto.createHash('sha256').update(rawCode).digest('hex');

        mockPrisma.mfaRecoveryCode.findMany.mockResolvedValue([
          { id: 'rc-1', user_id: 'user-mfa-1', code_hash: codeHash, used_at: null },
        ]);
        mockPrisma.mfaRecoveryCode.update.mockResolvedValue({});

        await expect(service.useRecoveryCode('user-mfa-1', rawCode)).resolves.toBeUndefined();

        // Code marked as used
        expect(mockPrisma.mfaRecoveryCode.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'rc-1' },
            data: { used_at: expect.any(Date) },
          }),
        );
      });

      it('should reject an already-used recovery code (not in unused set)', async () => {
        // No unused codes returned — already used codes are excluded by the query
        mockPrisma.mfaRecoveryCode.findMany.mockResolvedValue([]);

        await expect(service.useRecoveryCode('user-mfa-1', 'used-code')).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('should reject an invalid recovery code that does not match any hash', async () => {
        const differentHash = crypto.createHash('sha256').update('correct-code').digest('hex');

        mockPrisma.mfaRecoveryCode.findMany.mockResolvedValue([
          { id: 'rc-1', user_id: 'user-mfa-1', code_hash: differentHash, used_at: null },
        ]);

        await expect(service.useRecoveryCode('user-mfa-1', 'wrong-code')).rejects.toThrow(
          UnauthorizedException,
        );

        // Code must NOT be updated
        expect(mockPrisma.mfaRecoveryCode.update).not.toHaveBeenCalled();
      });
    });
  });

  // ─── Section 1.5: Password Reset ──────────────────────────────────────────

  describe('Password Reset', () => {
    const mockUser = {
      id: 'user-reset-1',
      email: 'reset@school.com',
      first_name: 'Reset',
      last_name: 'User',
    };

    describe('requestPasswordReset', () => {
      it('should create a password reset token and store its hash', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(mockUser);
        mockPrisma.passwordResetToken.count.mockResolvedValue(0);
        mockPrisma.passwordResetToken.create.mockResolvedValue({ id: 'token-1' });

        const result = await service.requestPasswordReset('reset@school.com');

        expect(result).toEqual({ message: 'If email exists, reset link sent' });

        // Token record created with a hashed token and 1-hour expiry
        expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              user_id: 'user-reset-1',
              token_hash: expect.any(String),
              expires_at: expect.any(Date),
            }),
          }),
        );

        // Verify hash is a 64-char SHA-256 hex string
        const createCall = (mockPrisma.passwordResetToken.create as jest.Mock).mock.calls[0][0];
        expect(createCall.data.token_hash).toMatch(/^[0-9a-f]{64}$/);
      });

      it('should return success message even when user does not exist (no leakage)', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null);

        const result = await service.requestPasswordReset('nobody@school.com');

        expect(result).toEqual({ message: 'If email exists, reset link sent' });
        expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
      });

      it('should limit to 3 active tokens and not create a fourth', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(mockUser);
        // Already at the limit
        mockPrisma.passwordResetToken.count.mockResolvedValue(3);

        const result = await service.requestPasswordReset('reset@school.com');

        // Graceful no-op — no new token
        expect(result).toEqual({ message: 'If email exists, reset link sent' });
        expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
      });
    });

    describe('confirmPasswordReset', () => {
      it('should accept a valid reset token and update the password', async () => {
        const rawToken = 'valid-raw-token-abc123';
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

        const resetTokenRecord = {
          id: 'reset-token-id-1',
          user_id: 'user-reset-1',
          token_hash: tokenHash,
          expires_at: new Date(Date.now() + 3600_000),
          used_at: null,
        };

        mockPrisma.passwordResetToken.findFirst.mockResolvedValue(resetTokenRecord);
        mockPrisma.user.update.mockResolvedValue({});
        mockPrisma.passwordResetToken.update.mockResolvedValue({});
        mockPrisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
        redisClient.smembers.mockResolvedValue([]);

        const result = await service.confirmPasswordReset(rawToken, 'NewPassword123!');

        expect(result).toEqual({ message: 'Password reset successfully' });

        // Password updated with a bcrypt hash (60-char $2b$ prefix)
        expect(mockPrisma.user.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'user-reset-1' },
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
      });

      it('should reject an expired token (findFirst returns null)', async () => {
        mockPrisma.passwordResetToken.findFirst.mockResolvedValue(null);

        await expect(
          service.confirmPasswordReset('expired-token', 'NewPassword123!'),
        ).rejects.toThrow(BadRequestException);

        await expect(
          service.confirmPasswordReset('expired-token', 'NewPassword123!'),
        ).rejects.toMatchObject({
          response: expect.objectContaining({ code: 'INVALID_RESET_TOKEN' }),
        });
      });

      it('should reject an already-used token (findFirst returns null because used_at filter)', async () => {
        // The query filters `used_at: null` — a used token won't be found
        mockPrisma.passwordResetToken.findFirst.mockResolvedValue(null);

        await expect(
          service.confirmPasswordReset('already-used-token', 'NewPassword123!'),
        ).rejects.toThrow(BadRequestException);
      });
    });
  });
});
