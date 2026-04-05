import { ModuleRef } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { EncryptionService } from './encryption.service';
import { KeyRotationService } from './key-rotation.service';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const CURRENT_KEY_REF = 'v2';
const CURRENT_VERSION = 2;

const mockStripeConfig = (id: string, keyRef: string) => ({
  id,
  tenant_id: `tenant-${id}`,
  stripe_secret_key_encrypted: `iv:tag:cipher_secret_${id}`,
  stripe_publishable_key: 'pk_test_abc',
  stripe_webhook_secret_encrypted: `iv:tag:cipher_webhook_${id}`,
  encryption_key_ref: keyRef,
  key_last_rotated_at: null,
  created_by_user_id: null,
  created_at: new Date(),
  updated_at: new Date(),
});

const mockStaffProfile = (
  id: string,
  keyRef: string | null,
  accountEncrypted: string | null,
  ibanEncrypted: string | null,
) => ({
  id,
  tenant_id: `tenant-${id}`,
  bank_name: 'Test Bank',
  bank_account_number_encrypted: accountEncrypted,
  bank_iban_encrypted: ibanEncrypted,
  bank_encryption_key_ref: keyRef,
});

const mockMfaUser = (id: string, keyRef: string | null) => ({
  id,
  mfa_secret: keyRef ? `iv:tag:cipher_mfa_${id}` : null,
  mfa_secret_key_ref: keyRef,
});

// ─── Test suite ─────────────────────────────────────────────────────────────

describe('KeyRotationService', () => {
  type MockPrismaTransactionClient = {
    tenantStripeConfig: {
      findMany: jest.Mock;
      update: jest.Mock;
    };
    staffProfile: {
      findMany: jest.Mock;
      update: jest.Mock;
    };
    user: {
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };
  type TransactionCallback<T> = (tx: MockPrismaTransactionClient) => Promise<T>;
  type MockPrisma = MockPrismaTransactionClient & {
    $transaction: jest.Mock<Promise<unknown>, [TransactionCallback<unknown>]>;
  };

  let service: KeyRotationService;
  let staffProfileReadFacade: Record<string, jest.Mock>;
  let moduleRef: ModuleRef;
  let mockPrisma: MockPrisma;
  let mockEncryption: {
    getCurrentVersion: jest.Mock;
    getKeyRef: jest.Mock;
    encrypt: jest.Mock;
    decrypt: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      tenantStripeConfig: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      staffProfile: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(),
    };
    mockPrisma.$transaction.mockImplementation(async (fn: TransactionCallback<unknown>) =>
      fn(mockPrisma),
    );

    mockEncryption = {
      getCurrentVersion: jest.fn().mockReturnValue(CURRENT_VERSION),
      getKeyRef: jest.fn().mockReturnValue(CURRENT_KEY_REF),
      encrypt: jest.fn().mockImplementation((plaintext: string) => ({
        encrypted: `new_iv:new_tag:new_cipher_${plaintext}`,
        keyRef: CURRENT_KEY_REF,
      })),
      decrypt: jest.fn().mockImplementation((encrypted: string) => {
        // Return the original "plaintext" derived from the cipher
        return `decrypted_${encrypted}`;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        KeyRotationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EncryptionService, useValue: mockEncryption },
      ],
    }).compile();

    service = module.get<KeyRotationService>(KeyRotationService);
    moduleRef = module.get(ModuleRef);
    staffProfileReadFacade = module.get(StaffProfileReadFacade) as unknown as Record<
      string,
      jest.Mock
    >;
    staffProfileReadFacade['findWithStaleBankEncryptionKey']!.mockReset().mockResolvedValue([]);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Stripe Configs ───────────────────────────────────────────────────────

  describe('rotateAll — stripe configs', () => {
    it('defaults dryRun to false when omitted', async () => {
      mockPrisma.tenantStripeConfig.findMany.mockResolvedValueOnce([]);

      const result = await service.rotateAll();

      expect(result.dryRun).toBe(false);
    });

    it('should re-encrypt records with old keyRef', async () => {
      const oldRecord = mockStripeConfig('sc-1', 'local');
      mockPrisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([oldRecord])
        .mockResolvedValueOnce([]);

      const result = await service.rotateAll(false);

      expect(result.stripeConfigs.total).toBe(1);
      expect(result.stripeConfigs.rotated).toBe(1);
      expect(result.stripeConfigs.failed).toBe(0);
      expect(result.dryRun).toBe(false);

      // Should have decrypted both fields with old keyRef
      expect(mockEncryption.decrypt).toHaveBeenCalledWith(
        oldRecord.stripe_secret_key_encrypted,
        'local',
      );
      expect(mockEncryption.decrypt).toHaveBeenCalledWith(
        oldRecord.stripe_webhook_secret_encrypted,
        'local',
      );

      // Should have re-encrypted both fields
      expect(mockEncryption.encrypt).toHaveBeenCalledTimes(2);

      // Should have updated the record
      expect(mockPrisma.tenantStripeConfig.update).toHaveBeenCalledWith({
        where: { id: 'sc-1' },
        data: expect.objectContaining({
          encryption_key_ref: CURRENT_KEY_REF,
        }),
      });
    });

    it('should skip records already on current version', async () => {
      // findMany with NOT currentKeyRef returns nothing — all records already rotated
      mockPrisma.tenantStripeConfig.findMany.mockResolvedValueOnce([]);

      const result = await service.rotateAll(false);

      expect(result.stripeConfigs.total).toBe(0);
      expect(result.stripeConfigs.rotated).toBe(0);
      expect(mockPrisma.tenantStripeConfig.update).not.toHaveBeenCalled();
    });
  });

  // ─── Staff Bank Details ───────────────────────────────────────────────────

  describe('rotateAll — staff bank details', () => {
    it('should re-encrypt records with old keyRef', async () => {
      const oldRecord = mockStaffProfile('sp-1', 'aws', 'iv:tag:cipher_acct', 'iv:tag:cipher_iban');
      staffProfileReadFacade['findWithStaleBankEncryptionKey']!.mockResolvedValueOnce([
        oldRecord,
      ]).mockResolvedValueOnce([]);

      const result = await service.rotateAll(false);

      expect(result.staffProfiles.total).toBe(1);
      expect(result.staffProfiles.rotated).toBe(1);
      expect(result.staffProfiles.failed).toBe(0);

      // Should have decrypted both bank fields
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('iv:tag:cipher_acct', 'aws');
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('iv:tag:cipher_iban', 'aws');

      // Should have updated the record
      expect(mockPrisma.staffProfile.update).toHaveBeenCalledWith({
        where: { id: 'sp-1' },
        data: expect.objectContaining({
          bank_encryption_key_ref: CURRENT_KEY_REF,
        }),
      });
    });

    it('should handle null encrypted fields gracefully', async () => {
      // Has keyRef but no encrypted fields — should be skipped
      const nullFieldsRecord = mockStaffProfile('sp-2', 'local', null, null);
      staffProfileReadFacade['findWithStaleBankEncryptionKey']!.mockResolvedValueOnce([
        nullFieldsRecord,
      ]).mockResolvedValueOnce([]);

      const result = await service.rotateAll(false);

      expect(result.staffProfiles.total).toBe(1);
      expect(result.staffProfiles.skipped).toBe(1);
      expect(result.staffProfiles.rotated).toBe(0);
      expect(mockPrisma.staffProfile.update).not.toHaveBeenCalled();
    });

    it('should handle record with only account number encrypted', async () => {
      const partialRecord = mockStaffProfile('sp-3', 'local', 'iv:tag:cipher_acct', null);
      staffProfileReadFacade['findWithStaleBankEncryptionKey']!.mockResolvedValueOnce([
        partialRecord,
      ]).mockResolvedValueOnce([]);

      const result = await service.rotateAll(false);

      expect(result.staffProfiles.rotated).toBe(1);
      // Only one decrypt call for this record (account only, no IBAN)
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('iv:tag:cipher_acct', 'local');
    });

    it('should handle record with only IBAN encrypted', async () => {
      const partialRecord = mockStaffProfile('sp-4', 'local', null, 'iv:tag:cipher_iban');
      staffProfileReadFacade['findWithStaleBankEncryptionKey']!.mockResolvedValueOnce([
        partialRecord,
      ]).mockResolvedValueOnce([]);

      const result = await service.rotateAll(false);

      expect(result.staffProfiles.rotated).toBe(1);
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('iv:tag:cipher_iban', 'local');
      expect(mockPrisma.staffProfile.update).toHaveBeenCalledWith({
        where: { id: 'sp-4' },
        data: expect.objectContaining({
          bank_encryption_key_ref: CURRENT_KEY_REF,
          bank_iban_encrypted: expect.stringContaining('new_cipher_'),
        }),
      });
    });
  });

  // ─── MFA Secrets ─────────────────────────────────────────────────────────

  describe('rotateAll — MFA secrets', () => {
    it('should re-encrypt MFA secrets with old keyRef', async () => {
      const oldUser = mockMfaUser('user-1', 'v1');
      mockPrisma.user.findMany.mockResolvedValueOnce([oldUser]).mockResolvedValueOnce([]);

      const result = await service.rotateAll(false);

      expect(result.mfaSecrets.total).toBe(1);
      expect(result.mfaSecrets.rotated).toBe(1);
      expect(result.mfaSecrets.failed).toBe(0);

      // Should have decrypted with old keyRef
      expect(mockEncryption.decrypt).toHaveBeenCalledWith(oldUser.mfa_secret, 'v1');

      // Should have re-encrypted the plaintext
      expect(mockEncryption.encrypt).toHaveBeenCalledWith(`decrypted_${oldUser.mfa_secret}`);

      // Should have updated the record
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          mfa_secret_key_ref: CURRENT_KEY_REF,
        }),
      });
    });

    it('should skip users with null mfa_secret_key_ref (legacy plaintext)', async () => {
      // Users with null mfa_secret_key_ref are excluded by the WHERE clause,
      // so findMany returns empty for them
      mockPrisma.user.findMany.mockResolvedValueOnce([]);

      const result = await service.rotateAll(false);

      expect(result.mfaSecrets.total).toBe(0);
      expect(result.mfaSecrets.rotated).toBe(0);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should skip users already on current version', async () => {
      // findMany with NOT currentKeyRef returns nothing — all users already rotated
      mockPrisma.user.findMany.mockResolvedValueOnce([]);

      const result = await service.rotateAll(false);

      expect(result.mfaSecrets.total).toBe(0);
      expect(result.mfaSecrets.rotated).toBe(0);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should count and log failures without stopping', async () => {
      const user = mockMfaUser('user-bad', 'v1');

      mockEncryption.decrypt.mockImplementation((encrypted: string) => {
        if (encrypted.includes('user-bad')) {
          throw new Error('Corrupt MFA data');
        }
        return `decrypted_${encrypted}`;
      });

      mockPrisma.user.findMany.mockResolvedValueOnce([user]).mockResolvedValueOnce([]);

      const result = await service.rotateAll(false);

      expect(result.mfaSecrets.total).toBe(1);
      expect(result.mfaSecrets.failed).toBe(1);
      expect(result.mfaSecrets.rotated).toBe(0);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  // ─── Dry run ──────────────────────────────────────────────────────────────

  describe('rotateAll — dry run', () => {
    it('should count records but not update them', async () => {
      const stripeRecord = mockStripeConfig('sc-1', 'local');
      const staffRecord = mockStaffProfile('sp-1', 'aws', 'iv:tag:acct', 'iv:tag:iban');
      const mfaUser = mockMfaUser('user-1', 'v1');

      mockPrisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([stripeRecord])
        .mockResolvedValueOnce([]);
      staffProfileReadFacade['findWithStaleBankEncryptionKey']!.mockResolvedValueOnce([
        staffRecord,
      ]).mockResolvedValueOnce([]);
      mockPrisma.user.findMany.mockResolvedValueOnce([mfaUser]).mockResolvedValueOnce([]);

      const result = await service.rotateAll(true);

      expect(result.dryRun).toBe(true);
      expect(result.stripeConfigs.rotated).toBe(1);
      expect(result.staffProfiles.rotated).toBe(1);
      expect(result.mfaSecrets.rotated).toBe(1);

      // No updates should have been made
      expect(mockPrisma.tenantStripeConfig.update).not.toHaveBeenCalled();
      expect(mockPrisma.staffProfile.update).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  // ─── Error handling ───────────────────────────────────────────────────────

  describe('rotateAll — error handling', () => {
    it('should continue rotation when individual record fails', async () => {
      const good = mockStripeConfig('sc-good', 'local');
      const bad = mockStripeConfig('sc-bad', 'local');

      // Make decrypt throw for the bad record's secret key
      mockEncryption.decrypt.mockImplementation((encrypted: string, _keyRef: string) => {
        if (encrypted.includes('sc-bad')) {
          throw new Error('Corrupt data');
        }
        return `decrypted_${encrypted}`;
      });

      mockPrisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([bad, good])
        .mockResolvedValueOnce([]);

      const result = await service.rotateAll(false);

      expect(result.stripeConfigs.total).toBe(2);
      expect(result.stripeConfigs.rotated).toBe(1);
      expect(result.stripeConfigs.failed).toBe(1);

      // The good record should still have been updated
      expect(mockPrisma.tenantStripeConfig.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.tenantStripeConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sc-good' } }),
      );
    });

    it('should normalise non-Error stripe failures', async () => {
      const bad = mockStripeConfig('sc-bad', 'local');

      mockEncryption.decrypt.mockImplementation(() => {
        throw 'broken stripe payload';
      });
      mockPrisma.tenantStripeConfig.findMany.mockResolvedValueOnce([bad]).mockResolvedValueOnce([]);

      const result = await service.rotateAll(false);

      expect(result.stripeConfigs.failed).toBe(1);
      expect(result.stripeConfigs.rotated).toBe(0);
    });

    it('should log and count staff profile failures without stopping', async () => {
      const bad = mockStaffProfile('sp-bad', 'local', 'iv:tag:acct', null);

      mockEncryption.decrypt.mockImplementation(() => {
        throw new Error('Key mismatch');
      });

      staffProfileReadFacade['findWithStaleBankEncryptionKey']!.mockResolvedValueOnce([
        bad,
      ]).mockResolvedValueOnce([]);

      const result = await service.rotateAll(false);

      expect(result.staffProfiles.total).toBe(1);
      expect(result.staffProfiles.failed).toBe(1);
      expect(result.staffProfiles.rotated).toBe(0);
      expect(mockPrisma.staffProfile.update).not.toHaveBeenCalled();
    });

    it('should normalise non-Error staff profile failures', async () => {
      const bad = mockStaffProfile('sp-bad', 'local', 'iv:tag:acct', null);

      mockEncryption.decrypt.mockImplementation(() => {
        throw 'broken staff payload';
      });
      staffProfileReadFacade['findWithStaleBankEncryptionKey']!.mockResolvedValueOnce([
        bad,
      ]).mockResolvedValueOnce([]);

      const result = await service.rotateAll(false);

      expect(result.staffProfiles.failed).toBe(1);
      expect(result.staffProfiles.rotated).toBe(0);
    });

    it('should normalise non-Error MFA failures', async () => {
      const user = mockMfaUser('user-bad', 'v1');

      mockEncryption.decrypt.mockImplementation(() => {
        throw 'broken mfa payload';
      });
      mockPrisma.user.findMany.mockResolvedValueOnce([user]).mockResolvedValueOnce([]);

      const result = await service.rotateAll(false);

      expect(result.mfaSecrets.failed).toBe(1);
      expect(result.mfaSecrets.rotated).toBe(0);
    });
  });

  describe('facade resolution', () => {
    it('should attempt to resolve the staff profile facade during module init', () => {
      const getSpy = jest.spyOn(moduleRef, 'get');

      service.onModuleInit();

      expect(getSpy).toHaveBeenCalledWith(
        StaffProfileReadFacade,
        expect.objectContaining({ strict: false }),
      );
    });

    it('should throw when the staff profile facade cannot be resolved', async () => {
      jest.spyOn(moduleRef, 'get').mockReturnValueOnce(null);
      service['staffProfileReadFacade'] = null;

      await expect(service.rotateAll(false)).rejects.toThrow(
        'StaffProfileReadFacade is not available',
      );
    });
  });
});
