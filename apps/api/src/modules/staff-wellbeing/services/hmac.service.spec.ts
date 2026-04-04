import { Test, TestingModule } from '@nestjs/testing';

import { ConfigurationReadFacade, MOCK_FACADE_PROVIDERS } from '../../../common/tests/mock-facades';
import { EncryptionService } from '../../configuration/encryption.service';
import { PrismaService } from '../../prisma/prisma.service';

import { HmacService } from './hmac.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SURVEY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID_A = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ID_B = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const SURVEY_ID_B = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const KNOWN_SECRET = 'a'.repeat(64);

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeTenantSettingsWithSecret = () => ({
  id: 'settings-1',
  tenant_id: TENANT_ID,
  settings: {
    staff_wellbeing: {
      hmac_secret_encrypted: 'mock-encrypted-value',
      hmac_key_ref: 'local',
    },
  },
  created_at: new Date(),
  updated_at: new Date(),
});

const makeTenantSettingsWithoutSecret = () => ({
  id: 'settings-1',
  tenant_id: TENANT_ID,
  settings: {
    staff_wellbeing: {},
  },
  created_at: new Date(),
  updated_at: new Date(),
});

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('HmacService', () => {
  let service: HmacService;
  let mockPrisma: {
    tenantSetting: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let mockEncryption: {
    encrypt: jest.Mock;
    decrypt: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      tenantSetting: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => fn(mockPrisma));

    mockEncryption = {
      encrypt: jest
        .fn()
        .mockReturnValue({ encrypted: 'mock-encrypted-value', keyRef: 'local' }),
      decrypt: jest.fn().mockReturnValue(KNOWN_SECRET),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HmacService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EncryptionService, useValue: mockEncryption },
        {
          provide: ConfigurationReadFacade,
          useValue: { findSettings: mockPrisma.tenantSetting.findUnique },
        },
      ],
    }).compile();

    service = module.get<HmacService>(HmacService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getOrCreateHmacSecret ──────────────────────────────────────────────

  describe('getOrCreateHmacSecret', () => {
    it('should return existing secret if already stored', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(
        makeTenantSettingsWithSecret(),
      );

      const result = await service.getOrCreateHmacSecret(TENANT_ID);

      expect(result).toBe(KNOWN_SECRET);
      expect(mockEncryption.decrypt).toHaveBeenCalledWith(
        'mock-encrypted-value',
        'local',
      );
      // Should not attempt to write anything
      expect(mockPrisma.tenantSetting.update).not.toHaveBeenCalled();
      expect(mockEncryption.encrypt).not.toHaveBeenCalled();
    });

    it('should generate, encrypt, and store new secret if none exists', async () => {
      // First read: no secret
      mockPrisma.tenantSetting.findUnique
        .mockResolvedValueOnce(makeTenantSettingsWithoutSecret())
        // Second read (confirmation after write): has secret
        .mockResolvedValueOnce(makeTenantSettingsWithSecret());

      mockPrisma.tenantSetting.update.mockResolvedValue(
        makeTenantSettingsWithSecret(),
      );

      const result = await service.getOrCreateHmacSecret(TENANT_ID);

      expect(result).toBe(KNOWN_SECRET);

      // Should have encrypted a new secret
      expect(mockEncryption.encrypt).toHaveBeenCalledTimes(1);
      const encryptArg = mockEncryption.encrypt.mock.calls[0][0] as string;
      // Generated secret should be a 64-char hex string (32 random bytes)
      expect(encryptArg).toMatch(/^[0-9a-f]{64}$/);

      // Should have written to DB
      expect(mockPrisma.tenantSetting.update).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        data: {
          settings: {
            staff_wellbeing: {
              hmac_secret_encrypted: 'mock-encrypted-value',
              hmac_key_ref: 'local',
            },
          },
        },
      });

      // Should have re-read for confirmation
      expect(mockPrisma.tenantSetting.findUnique).toHaveBeenCalledTimes(2);

      // Final decrypt is from the confirmed record
      expect(mockEncryption.decrypt).toHaveBeenCalledWith(
        'mock-encrypted-value',
        'local',
      );
    });
  });

  // ─── computeTokenHash ──────────────────────────────────────────────────

  describe('computeTokenHash', () => {
    beforeEach(() => {
      // All computeTokenHash tests use an existing secret
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(
        makeTenantSettingsWithSecret(),
      );
    });

    it('should return deterministic hash for same inputs', async () => {
      const hash1 = await service.computeTokenHash(
        TENANT_ID,
        SURVEY_ID,
        USER_ID_A,
      );
      const hash2 = await service.computeTokenHash(
        TENANT_ID,
        SURVEY_ID,
        USER_ID_A,
      );

      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different userId', async () => {
      const hashA = await service.computeTokenHash(
        TENANT_ID,
        SURVEY_ID,
        USER_ID_A,
      );
      const hashB = await service.computeTokenHash(
        TENANT_ID,
        SURVEY_ID,
        USER_ID_B,
      );

      expect(hashA).not.toBe(hashB);
    });

    it('should return different hash for different surveyId', async () => {
      const hashA = await service.computeTokenHash(
        TENANT_ID,
        SURVEY_ID,
        USER_ID_A,
      );
      const hashB = await service.computeTokenHash(
        TENANT_ID,
        SURVEY_ID_B,
        USER_ID_A,
      );

      expect(hashA).not.toBe(hashB);
    });

    it('should return hash that is exactly 64 hex characters (SHA256)', async () => {
      const hash = await service.computeTokenHash(
        TENANT_ID,
        SURVEY_ID,
        USER_ID_A,
      );

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
