import { Test } from '@nestjs/testing';

import { EncryptionService } from '../../configuration/encryption.service';
import { PrismaService } from '../../prisma/prisma.service';

import { HmacService } from './hmac.service';

// HmacService now reads + writes `tenant_settings` inside a single RLS-scoped
// transaction (see W-S7-004). Both paths go through `createRlsClient(prisma)`
// which calls `prisma.$extends(...)` and `$transaction(cb)`. The mock below
// short-circuits both so each test can drive the tx state directly via
// `tenantSetting.findUnique` / `tenantSetting.update`.

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SURVEY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeSettingsWithSecret = (encrypted: string, keyRef: string) => ({
  id: 'settings-1',
  tenant_id: TENANT_ID,
  settings: {
    staff_wellbeing: {
      hmac_secret_encrypted: encrypted,
      hmac_key_ref: keyRef,
    },
  },
  created_at: new Date(),
  updated_at: new Date(),
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('HmacService — branches', () => {
  let service: HmacService;
  let mockEncryption: { encrypt: jest.Mock; decrypt: jest.Mock };
  let mockPrisma: {
    tenantSetting: { findUnique: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
    $extends: jest.Mock;
  };

  beforeEach(async () => {
    mockEncryption = {
      encrypt: jest.fn().mockReturnValue({ encrypted: 'enc-new', keyRef: 'key-new' }),
      decrypt: jest.fn().mockReturnValue('decrypted-secret'),
    };

    mockPrisma = {
      tenantSetting: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(),
      $extends: jest.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) =>
      fn(mockPrisma),
    );
    mockPrisma.$extends.mockImplementation(() => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: (fn: (tx: any) => Promise<any>) => fn(mockPrisma),
    }));

    const module = await Test.createTestingModule({
      providers: [
        HmacService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EncryptionService, useValue: mockEncryption },
      ],
    }).compile();

    service = module.get(HmacService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getOrCreateHmacSecret ──────────────────────────────────────────────
  describe('HmacService — getOrCreateHmacSecret', () => {
    it('should return existing secret when found in settings', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(
        makeSettingsWithSecret('enc-existing', 'key-existing'),
      );
      mockEncryption.decrypt.mockReturnValue('my-secret');

      const result = await service.getOrCreateHmacSecret(TENANT_ID);

      expect(result).toBe('my-secret');
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('enc-existing', 'key-existing');
      expect(mockEncryption.encrypt).not.toHaveBeenCalled();
      expect(mockPrisma.tenantSetting.update).not.toHaveBeenCalled();
    });

    it('should create new secret when settings exist but staff_wellbeing is empty', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        id: 'settings-1',
        tenant_id: TENANT_ID,
        settings: {},
        created_at: new Date(),
        updated_at: new Date(),
      });
      mockEncryption.decrypt.mockReturnValue('new-secret');

      const result = await service.getOrCreateHmacSecret(TENANT_ID);

      expect(result).toBe('new-secret');
      expect(mockEncryption.encrypt).toHaveBeenCalled();
      expect(mockPrisma.tenantSetting.update).toHaveBeenCalled();
    });

    it('should create new secret when settings record is null (no row yet)', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(null);
      mockEncryption.decrypt.mockReturnValue('new-secret');

      // The service path expects an existing tenantSetting row (there always
      // is one per tenant post-provisioning). For null we still exercise the
      // "generate + write" branch — the update will be called with the
      // record key.
      const result = await service.getOrCreateHmacSecret(TENANT_ID);

      expect(result).toBe('new-secret');
      expect(mockEncryption.encrypt).toHaveBeenCalled();
    });

    it('should handle missing staff_wellbeing key in settings', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        id: 'settings-1',
        tenant_id: TENANT_ID,
        settings: { other_key: 'value' },
        created_at: new Date(),
        updated_at: new Date(),
      });
      mockEncryption.decrypt.mockReturnValue('new-secret');

      const result = await service.getOrCreateHmacSecret(TENANT_ID);

      expect(result).toBe('new-secret');
      expect(mockEncryption.encrypt).toHaveBeenCalled();
    });

    it('edge: should create fresh secret when encrypted is present but key_ref is missing', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        id: 'settings-1',
        tenant_id: TENANT_ID,
        settings: {
          staff_wellbeing: {
            hmac_secret_encrypted: 'enc-orphan',
            // hmac_key_ref missing
          },
        },
        created_at: new Date(),
        updated_at: new Date(),
      });
      mockEncryption.decrypt.mockReturnValue('new-secret');

      const result = await service.getOrCreateHmacSecret(TENANT_ID);

      expect(result).toBe('new-secret');
      expect(mockEncryption.encrypt).toHaveBeenCalled();
      expect(mockPrisma.tenantSetting.update).toHaveBeenCalled();
    });
  });

  // ─── computeTokenHash ───────────────────────────────────────────────────
  describe('HmacService — computeTokenHash', () => {
    beforeEach(() => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(makeSettingsWithSecret('enc', 'key'));
      mockEncryption.decrypt.mockReturnValue('test-secret');
    });

    it('should return a 64-char hex string', async () => {
      const hash = await service.computeTokenHash(TENANT_ID, SURVEY_ID, USER_ID);
      expect(hash).toHaveLength(64);
      expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
    });

    it('should produce deterministic results for same inputs', async () => {
      mockEncryption.decrypt.mockReturnValue('same-secret');
      const hash1 = await service.computeTokenHash(TENANT_ID, SURVEY_ID, USER_ID);
      const hash2 = await service.computeTokenHash(TENANT_ID, SURVEY_ID, USER_ID);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different users', async () => {
      mockEncryption.decrypt.mockReturnValue('same-secret');
      const hash1 = await service.computeTokenHash(TENANT_ID, SURVEY_ID, 'user-1');
      const hash2 = await service.computeTokenHash(TENANT_ID, SURVEY_ID, 'user-2');
      expect(hash1).not.toBe(hash2);
    });
  });
});
