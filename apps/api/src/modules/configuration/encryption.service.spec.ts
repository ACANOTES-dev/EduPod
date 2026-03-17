import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { EncryptionService } from './encryption.service';

// 64 hex chars = 32 bytes, a valid AES-256 key for testing
const TEST_KEY = 'a'.repeat(64);

describe('EncryptionService', () => {
  let service: EncryptionService;

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

    it('should use "local" as keyRef when ENCRYPTION_KEY is not set', () => {
      const { keyRef } = service.encrypt('any-value');

      expect(keyRef).toBe('local');
    });

    it('should throw when decrypting a tampered ciphertext', () => {
      const { encrypted, keyRef } = service.encrypt('sk_test_abc123');

      // Tamper with the ciphertext section (third part after splitting on ':')
      const parts = encrypted.split(':');
      // Flip the last hex byte of the ciphertext
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
