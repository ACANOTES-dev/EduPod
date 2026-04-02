import * as crypto from 'crypto';

import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SecurityAuditService } from '../audit-log/security-audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { PasswordResetService } from './auth-password-reset.service';
import { SessionService } from './auth-session.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const MOCK_USER = {
  id: USER_ID,
  email: 'user@school.test',
};

const mockPrisma = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  passwordResetToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockSecurityAuditService = {
  logPasswordChange: jest.fn(),
  logPasswordReset: jest.fn(),
};

const mockSessionService = {
  deleteAllUserSessions: jest.fn().mockResolvedValue(undefined),
};

describe('PasswordResetService', () => {
  let service: PasswordResetService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordResetService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecurityAuditService, useValue: mockSecurityAuditService },
        { provide: SessionService, useValue: mockSessionService },
      ],
    }).compile();

    service = module.get<PasswordResetService>(PasswordResetService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── requestPasswordReset ─────────────────────────────────────────────────

  describe('PasswordResetService -- requestPasswordReset', () => {
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

  describe('PasswordResetService -- confirmPasswordReset', () => {
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

      await service.confirmPasswordReset(RAW_TOKEN, 'NewPassword123!');

      expect(mockSessionService.deleteAllUserSessions).toHaveBeenCalledWith(USER_ID);
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
});
