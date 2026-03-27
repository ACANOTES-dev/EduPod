import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { EncryptionService } from './encryption.service';

// 64 hex chars = 32 bytes, a valid AES-256 key for testing
const TEST_KEY = 'a'.repeat(64);
const TEST_KEY_V1 = 'a'.repeat(64);
const TEST_KEY_V2 = 'b'.repeat(64);

// ─── Helper: build a ConfigService mock for versioned keys ──────────────────

function buildConfigGet(
  overrides: Record<string, string | undefined> = {},
): (key: string) => string | undefined {
  return (key: string) => {
    if (key in overrides) return overrides[key];
    return undefined;
  };
}

describe('EncryptionService', () => {
  let service: EncryptionService;

  afterEach(() => jest.clearAllMocks());

  // ─── Original tests (backward compatibility with legacy env vars) ─────────

  describe('legacy env vars (no versioned keys)', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'ENCRYPTION_KEY') return undefined;
                if (key === 'ENCRYPTION_KEY_LOCAL') return TEST_KEY;
                return undefined;
              }),
            },
          },
        ],
      }).compile();

      service = module.get<EncryptionService>(EncryptionService);
    });

    describe('encrypt / decrypt', () => {
      it('should encrypt and decrypt a string correctly', () => {
        const plaintext = 'sk_test_abc123';

        const { encrypted, keyRef } = service.encrypt(plaintext);
        const decrypted = service.decrypt(encrypted, keyRef);

        expect(decrypted).toBe(plaintext);
      });

      it('should produce different ciphertext for the same plaintext due to random IV', () => {
        const plaintext = 'sk_test_abc123';

        const result1 = service.encrypt(plaintext);
        const result2 = service.encrypt(plaintext);

        // Different IVs mean different ciphertext strings
        expect(result1.encrypted).not.toBe(result2.encrypted);

        // But both should decrypt to the original
        expect(service.decrypt(result1.encrypted, result1.keyRef)).toBe(plaintext);
        expect(service.decrypt(result2.encrypted, result2.keyRef)).toBe(plaintext);
      });

      it('should return a non-empty key reference', () => {
        const { keyRef } = service.encrypt('any-value');

        expect(typeof keyRef).toBe('string');
        expect(keyRef.length).toBeGreaterThan(0);
      });

      it('should use "v1" as keyRef when falling back to legacy env vars', () => {
        const { keyRef } = service.encrypt('any-value');

        expect(keyRef).toBe('v1');
      });

      it('should throw when decrypting a tampered ciphertext', () => {
        const { encrypted, keyRef } = service.encrypt('sk_test_abc123');

        // Tamper with the ciphertext section (third part after splitting on ':')
        const parts = encrypted.split(':');
        const tamperedCiphertext = parts[2]!.slice(0, -2) + 'ff';
        const tampered = `${parts[0]}:${parts[1]}:${tamperedCiphertext}`;

        expect(() => service.decrypt(tampered, keyRef)).toThrow();
      });

      it('should throw when decrypting a value with wrong format', () => {
        expect(() => service.decrypt('not-a-valid-format', 'local')).toThrow(
          'Internal Server Error Exception',
        );
      });
    });

    describe('mask', () => {
      it('should mask a value showing only the last 4 characters', () => {
        expect(service.mask('sk_test_abc123')).toBe('****c123');
      });

      it('should mask short values entirely when length is 4 or fewer', () => {
        expect(service.mask('abc')).toBe('****');
        expect(service.mask('abcd')).toBe('****');
      });

      it('should show last 4 chars for a value of exactly 5 characters', () => {
        expect(service.mask('12345')).toBe('****2345');
      });
    });
  });

  // ─── Multi-key versioning tests ───────────────────────────────────────────

  describe('multi-key support', () => {
    let serviceV2: EncryptionService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(
                buildConfigGet({
                  ENCRYPTION_KEY_V1: TEST_KEY_V1,
                  ENCRYPTION_KEY_V2: TEST_KEY_V2,
                  ENCRYPTION_CURRENT_VERSION: '2',
                }),
              ),
            },
          },
        ],
      }).compile();

      serviceV2 = module.get<EncryptionService>(EncryptionService);
    });

    it('should encrypt with v2 and decrypt successfully', () => {
      const { encrypted, keyRef } = serviceV2.encrypt('secret-data');

      expect(keyRef).toBe('v2');
      expect(serviceV2.decrypt(encrypted, keyRef)).toBe('secret-data');
    });

    it('should decrypt v1-encrypted data when current version is v2', async () => {
      // Build a v1-only service to encrypt data
      const v1Module: TestingModule = await Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(
                buildConfigGet({
                  ENCRYPTION_KEY_V1: TEST_KEY_V1,
                  ENCRYPTION_CURRENT_VERSION: '1',
                }),
              ),
            },
          },
        ],
      }).compile();
      const serviceV1 = v1Module.get<EncryptionService>(EncryptionService);

      const { encrypted, keyRef } = serviceV1.encrypt('old-secret');
      expect(keyRef).toBe('v1');

      // The v2 service should decrypt v1 data because it has both keys
      expect(serviceV2.decrypt(encrypted, keyRef)).toBe('old-secret');
    });

    it('should return correct getCurrentVersion', () => {
      expect(serviceV2.getCurrentVersion()).toBe(2);
    });

    it('should return correct getKeyRef', () => {
      expect(serviceV2.getKeyRef()).toBe('v2');
    });
  });

  // ─── Backward compatibility for legacy keyRefs ────────────────────────────

  describe('backward compat — legacy keyRefs', () => {
    let serviceWithLegacy: EncryptionService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(
                buildConfigGet({
                  ENCRYPTION_KEY_V1: TEST_KEY_V1,
                  ENCRYPTION_CURRENT_VERSION: '1',
                }),
              ),
            },
          },
        ],
      }).compile();

      serviceWithLegacy = module.get<EncryptionService>(EncryptionService);
    });

    it('should decrypt using v1 key when keyRef is "aws"', () => {
      const { encrypted } = serviceWithLegacy.encrypt('stripe-secret-key');
      // Simulate legacy data that was stored with 'aws' keyRef
      expect(serviceWithLegacy.decrypt(encrypted, 'aws')).toBe('stripe-secret-key');
    });

    it('should decrypt using v1 key when keyRef is "local"', () => {
      const { encrypted } = serviceWithLegacy.encrypt('bank-details');
      // Simulate legacy data that was stored with 'local' keyRef
      expect(serviceWithLegacy.decrypt(encrypted, 'local')).toBe('bank-details');
    });

    it('should fall back to v1 for unknown keyRef and log warning', () => {
      const { encrypted } = serviceWithLegacy.encrypt('some-data');
      // Unknown keyRef should fall back to v1
      expect(serviceWithLegacy.decrypt(encrypted, 'unknown-ref')).toBe('some-data');
    });
  });

  // ─── getCurrentVersion / getKeyRef ────────────────────────────────────────

  describe('getCurrentVersion / getKeyRef', () => {
    it('should default to version 1 when ENCRYPTION_CURRENT_VERSION is not set', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(
                buildConfigGet({
                  ENCRYPTION_KEY_V1: TEST_KEY_V1,
                }),
              ),
            },
          },
        ],
      }).compile();

      const svc = module.get<EncryptionService>(EncryptionService);
      expect(svc.getCurrentVersion()).toBe(1);
      expect(svc.getKeyRef()).toBe('v1');
    });

    it('should return the configured version', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(
                buildConfigGet({
                  ENCRYPTION_KEY_V1: TEST_KEY_V1,
                  ENCRYPTION_KEY_V2: TEST_KEY_V2,
                  ENCRYPTION_CURRENT_VERSION: '2',
                }),
              ),
            },
          },
        ],
      }).compile();

      const svc = module.get<EncryptionService>(EncryptionService);
      expect(svc.getCurrentVersion()).toBe(2);
      expect(svc.getKeyRef()).toBe('v2');
    });
  });

  // ─── Error cases ──────────────────────────────────────────────────────────

  describe('error cases', () => {
    it('should throw on construction when current version key is missing', async () => {
      await expect(
        Test.createTestingModule({
          providers: [
            EncryptionService,
            {
              provide: ConfigService,
              useValue: {
                get: jest.fn(
                  buildConfigGet({
                    ENCRYPTION_KEY_V1: TEST_KEY_V1,
                    ENCRYPTION_CURRENT_VERSION: '3', // v3 does not exist
                  }),
                ),
              },
            },
          ],
        }).compile(),
      ).rejects.toThrow('Current encryption key version 3 is not configured');
    });

    it('should throw on construction when no keys are configured at all', async () => {
      await expect(
        Test.createTestingModule({
          providers: [
            EncryptionService,
            {
              provide: ConfigService,
              useValue: {
                get: jest.fn(buildConfigGet({})),
              },
            },
          ],
        }).compile(),
      ).rejects.toThrow();
    });

    it('should throw when decrypting with a key version that does not exist', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(
                buildConfigGet({
                  ENCRYPTION_KEY_V1: TEST_KEY_V1,
                  ENCRYPTION_CURRENT_VERSION: '1',
                }),
              ),
            },
          },
        ],
      }).compile();

      const svc = module.get<EncryptionService>(EncryptionService);
      const { encrypted } = svc.encrypt('test');

      // Try to decrypt claiming it was encrypted with v5 (which doesn't exist)
      expect(() => svc.decrypt(encrypted, 'v5')).toThrow('Internal Server Error Exception');
    });

    it('should throw when data was encrypted with a different key', async () => {
      // Encrypt with v1 key
      const v1Module: TestingModule = await Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(
                buildConfigGet({
                  ENCRYPTION_KEY_V1: TEST_KEY_V1,
                  ENCRYPTION_CURRENT_VERSION: '1',
                }),
              ),
            },
          },
        ],
      }).compile();
      const svcV1 = v1Module.get<EncryptionService>(EncryptionService);
      const { encrypted } = svcV1.encrypt('secret');

      // Build a service with ONLY v2 key (different bytes)
      const v2Module: TestingModule = await Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(
                buildConfigGet({
                  ENCRYPTION_KEY_V1: TEST_KEY_V2, // intentionally different key for v1
                  ENCRYPTION_CURRENT_VERSION: '1',
                }),
              ),
            },
          },
        ],
      }).compile();
      const svcWrongKey = v2Module.get<EncryptionService>(EncryptionService);

      // Should fail because the v1 key bytes don't match
      expect(() => svcWrongKey.decrypt(encrypted, 'v1')).toThrow();
    });

    it('should throw when key hex is not 32 bytes', async () => {
      await expect(
        Test.createTestingModule({
          providers: [
            EncryptionService,
            {
              provide: ConfigService,
              useValue: {
                get: jest.fn(
                  buildConfigGet({
                    ENCRYPTION_KEY_V1: 'aabb', // too short
                  }),
                ),
              },
            },
          ],
        }).compile(),
      ).rejects.toThrow('must be 32 bytes');
    });
  });
});
