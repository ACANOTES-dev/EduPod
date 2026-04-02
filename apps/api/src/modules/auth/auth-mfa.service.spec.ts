/* eslint-disable import/order -- jest.mock must precede mocked imports */
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

import { SecurityAuditService } from '../audit-log/security-audit.service';
import { EncryptionService } from '../configuration/encryption.service';
import { PrismaService } from '../prisma/prisma.service';

import { MfaService } from './auth-mfa.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const MOCK_USER = {
  id: USER_ID,
  email: 'user@school.test',
  password_hash: 'hashed',
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

const mockPrisma = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  mfaRecoveryCode: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
    update: jest.fn(),
  },
};

const mockSecurityAuditService = {
  logMfaSetup: jest.fn(),
};

const mockEncryptionService = {
  encrypt: jest.fn().mockReturnValue({ encrypted: 'iv:tag:ciphertext', keyRef: 'v1' }),
  decrypt: jest.fn().mockReturnValue('TESTSECRET123'),
};

describe('MfaService', () => {
  let service: MfaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MfaService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'MFA_ISSUER') return 'SchoolOS';
              return undefined;
            }),
          },
        },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecurityAuditService, useValue: mockSecurityAuditService },
        { provide: EncryptionService, useValue: mockEncryptionService },
      ],
    }).compile();

    service = module.get<MfaService>(MfaService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── setupMfa ─────────────────────────────────────────────────────────────

  describe('MfaService -- setupMfa', () => {
    it('should generate TOTP secret, encrypt it, store it, and return QR code', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
      mockPrisma.user.update.mockResolvedValue({
        ...MOCK_USER,
        mfa_secret: 'iv:tag:ciphertext',
        mfa_secret_key_ref: 'v1',
      });

      const result = await service.setupMfa(USER_ID);

      expect(result.secret).toBe('TESTSECRET123');
      expect(result.qr_code_url).toBe('data:image/png;base64,test');
      expect(result.otpauth_uri).toBe('otpauth://totp/test');

      // Should encrypt the secret before storing
      expect(mockEncryptionService.encrypt).toHaveBeenCalledWith('TESTSECRET123');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER_ID },
          data: { mfa_secret: 'iv:tag:ciphertext', mfa_secret_key_ref: 'v1' },
        }),
      );
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.setupMfa('nonexistent-user')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── verifyMfaSetup ──────────────────────────────────────────────────────

  describe('MfaService -- verifyMfaSetup', () => {
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

      await expect(service.verifyMfaSetup(USER_ID, '123456')).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.verifyMfaSetup('nonexistent', '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should decrypt encrypted MFA secret during verification', async () => {
      const encryptedUser = {
        ...MOCK_USER,
        mfa_secret: 'iv:tag:ciphertext',
        mfa_secret_key_ref: 'v1',
      };
      mockPrisma.user.findUnique.mockResolvedValue({ ...encryptedUser });
      mockEncryptionService.decrypt.mockReturnValue('DECRYPTED_SECRET');
      (otpVerify as jest.Mock).mockResolvedValue({ valid: true });
      mockPrisma.user.update.mockResolvedValue({ ...encryptedUser, mfa_enabled: true });
      mockPrisma.mfaRecoveryCode.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.mfaRecoveryCode.createMany.mockResolvedValue({ count: 10 });

      await service.verifyMfaSetup(USER_ID, '123456');

      expect(mockEncryptionService.decrypt).toHaveBeenCalledWith('iv:tag:ciphertext', 'v1');
      expect(otpVerify).toHaveBeenCalledWith(
        expect.objectContaining({ secret: 'DECRYPTED_SECRET' }),
      );
    });
  });

  // ─── useRecoveryCode ──────────────────────────────────────────────────────

  describe('MfaService -- useRecoveryCode', () => {
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

  // ─── verifyTotp ──────────────────────────────────────────────────────────

  describe('MfaService -- verifyTotp', () => {
    it('should return true when TOTP code is valid', async () => {
      (otpVerify as jest.Mock).mockResolvedValue({ valid: true });
      mockEncryptionService.decrypt.mockReturnValue('DECRYPTED_SECRET');

      const result = await service.verifyTotp('123456', 'iv:tag:ciphertext', 'v1');

      expect(result).toBe(true);
      expect(mockEncryptionService.decrypt).toHaveBeenCalledWith('iv:tag:ciphertext', 'v1');
      expect(otpVerify).toHaveBeenCalledWith(
        expect.objectContaining({ token: '123456', secret: 'DECRYPTED_SECRET' }),
      );
    });

    it('should return false when TOTP code is invalid', async () => {
      (otpVerify as jest.Mock).mockResolvedValue({ valid: false });

      const result = await service.verifyTotp('000000', 'PLAINTEXT_SECRET', null);

      expect(result).toBe(false);
    });

    it('should handle legacy plaintext secrets (null keyRef)', async () => {
      (otpVerify as jest.Mock).mockResolvedValue({ valid: true });

      const result = await service.verifyTotp('123456', 'PLAINTEXT_SECRET', null);

      expect(result).toBe(true);
      expect(mockEncryptionService.decrypt).not.toHaveBeenCalled();
      expect(otpVerify).toHaveBeenCalledWith(
        expect.objectContaining({ secret: 'PLAINTEXT_SECRET' }),
      );
    });
  });

  // ─── decryptMfaSecret ────────────────────────────────────────────────────

  describe('MfaService -- decryptMfaSecret', () => {
    it('should return plaintext for legacy secrets with null keyRef', () => {
      const result = service.decryptMfaSecret('LEGACY_SECRET', null);
      expect(result).toBe('LEGACY_SECRET');
      expect(mockEncryptionService.decrypt).not.toHaveBeenCalled();
    });

    it('should decrypt with encryption service when keyRef is present', () => {
      mockEncryptionService.decrypt.mockReturnValue('DECRYPTED_VALUE');
      const result = service.decryptMfaSecret('iv:tag:ciphertext', 'v1');
      expect(result).toBe('DECRYPTED_VALUE');
      expect(mockEncryptionService.decrypt).toHaveBeenCalledWith('iv:tag:ciphertext', 'v1');
    });
  });
});
