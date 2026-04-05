import { Test } from '@nestjs/testing';

import { ConfigurationReadFacade } from '../../configuration/configuration-read.facade';
import { EncryptionService } from '../../configuration/encryption.service';
import { PrismaService } from '../../prisma/prisma.service';

import { HmacService } from './hmac.service';

// ─── Constants ────────────────────────────────────���──────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SURVEY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('HmacService — branches', () => {
  let service: HmacService;
  let mockConfigFacade: Record<string, jest.Mock>;
  let mockEncryption: Record<string, jest.Mock>;
  let mockPrisma: Record<string, jest.Mock | Record<string, jest.Mock>>;

  beforeEach(async () => {
    mockConfigFacade = {
      findSettings: jest.fn(),
    };
    mockEncryption = {
      encrypt: jest.fn().mockReturnValue({ encrypted: 'enc-secret', keyRef: 'key-1' }),
      decrypt: jest.fn().mockReturnValue('decrypted-secret'),
    };
    const mockTx = {
      tenantSetting: { update: jest.fn().mockResolvedValue({}) },
    };
    mockPrisma = {
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    };

    const module = await Test.createTestingModule({
      providers: [
        HmacService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EncryptionService, useValue: mockEncryption },
        { provide: ConfigurationReadFacade, useValue: mockConfigFacade },
      ],
    }).compile();

    service = module.get(HmacService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getOrCreateHmacSecret ──────────────────────────────────────────────
  describe('HmacService — getOrCreateHmacSecret', () => {
    it('should return existing secret when found in settings', async () => {
      mockConfigFacade.findSettings.mockResolvedValue({
        settings: {
          staff_wellbeing: {
            hmac_secret_encrypted: 'enc-existing',
            hmac_key_ref: 'key-existing',
          },
        },
      });
      mockEncryption.decrypt.mockReturnValue('my-secret');

      const result = await service.getOrCreateHmacSecret(TENANT_ID);
      expect(result).toBe('my-secret');
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('enc-existing', 'key-existing');
      expect(mockEncryption.encrypt).not.toHaveBeenCalled();
    });

    it('should create new secret when none exists in settings', async () => {
      mockConfigFacade.findSettings
        .mockResolvedValueOnce({ settings: {} }) // first call: no wellbeing
        .mockResolvedValueOnce({
          settings: {
            staff_wellbeing: {
              hmac_secret_encrypted: 'enc-new',
              hmac_key_ref: 'key-new',
            },
          },
        }); // re-read after write

      mockEncryption.decrypt.mockReturnValue('new-secret');

      const result = await service.getOrCreateHmacSecret(TENANT_ID);
      expect(result).toBe('new-secret');
      expect(mockEncryption.encrypt).toHaveBeenCalled();
    });

    it('should create new secret when settings record is null', async () => {
      mockConfigFacade.findSettings.mockResolvedValueOnce(null).mockResolvedValueOnce({
        settings: {
          staff_wellbeing: {
            hmac_secret_encrypted: 'enc-new',
            hmac_key_ref: 'key-new',
          },
        },
      });

      mockEncryption.decrypt.mockReturnValue('new-secret');

      const result = await service.getOrCreateHmacSecret(TENANT_ID);
      expect(result).toBe('new-secret');
    });

    it('should handle missing staff_wellbeing key in settings', async () => {
      mockConfigFacade.findSettings
        .mockResolvedValueOnce({ settings: { other_key: 'value' } })
        .mockResolvedValueOnce({
          settings: {
            staff_wellbeing: {
              hmac_secret_encrypted: 'enc-new',
              hmac_key_ref: 'key-new',
            },
          },
        });

      mockEncryption.decrypt.mockReturnValue('new-secret');

      const result = await service.getOrCreateHmacSecret(TENANT_ID);
      expect(result).toBe('new-secret');
    });

    it('edge: should handle encrypted present but key_ref missing', async () => {
      mockConfigFacade.findSettings
        .mockResolvedValueOnce({
          settings: {
            staff_wellbeing: {
              hmac_secret_encrypted: 'enc-orphan',
              // hmac_key_ref missing
            },
          },
        })
        .mockResolvedValueOnce({
          settings: {
            staff_wellbeing: {
              hmac_secret_encrypted: 'enc-new',
              hmac_key_ref: 'key-new',
            },
          },
        });

      mockEncryption.decrypt.mockReturnValue('new-secret');

      const result = await service.getOrCreateHmacSecret(TENANT_ID);
      expect(result).toBe('new-secret');
      // Should have created a new secret since keyRef was missing
      expect(mockEncryption.encrypt).toHaveBeenCalled();
    });
  });

  // ─── computeTokenHash ───────────────────────────────────────────────────
  describe('HmacService — computeTokenHash', () => {
    it('should return a 64-char hex string', async () => {
      mockConfigFacade.findSettings.mockResolvedValue({
        settings: {
          staff_wellbeing: {
            hmac_secret_encrypted: 'enc',
            hmac_key_ref: 'key',
          },
        },
      });
      mockEncryption.decrypt.mockReturnValue('test-secret');

      const hash = await service.computeTokenHash(TENANT_ID, SURVEY_ID, USER_ID);
      expect(hash).toHaveLength(64);
      expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
    });

    it('should produce deterministic results for same inputs', async () => {
      mockConfigFacade.findSettings.mockResolvedValue({
        settings: {
          staff_wellbeing: {
            hmac_secret_encrypted: 'enc',
            hmac_key_ref: 'key',
          },
        },
      });
      mockEncryption.decrypt.mockReturnValue('same-secret');

      const hash1 = await service.computeTokenHash(TENANT_ID, SURVEY_ID, USER_ID);
      const hash2 = await service.computeTokenHash(TENANT_ID, SURVEY_ID, USER_ID);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different users', async () => {
      mockConfigFacade.findSettings.mockResolvedValue({
        settings: {
          staff_wellbeing: {
            hmac_secret_encrypted: 'enc',
            hmac_key_ref: 'key',
          },
        },
      });
      mockEncryption.decrypt.mockReturnValue('same-secret');

      const hash1 = await service.computeTokenHash(TENANT_ID, SURVEY_ID, 'user-1');
      const hash2 = await service.computeTokenHash(TENANT_ID, SURVEY_ID, 'user-2');
      expect(hash1).not.toBe(hash2);
    });
  });
});
