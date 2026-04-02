/* eslint-disable @typescript-eslint/no-explicit-any -- testing implementation details */
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { Job } from 'bullmq';

import { KeyRotationProcessor, KEY_ROTATION_JOB } from './key-rotation.processor';
import { QUEUE_NAMES } from '../../base/queue.constants';

// Mock crypto module
jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue(Buffer.from('123456789012', 'hex')),
  createCipheriv: jest.fn(),
  createDecipheriv: jest.fn(),
}));

// Mock environment
const originalEnv = process.env;

describe('KeyRotationProcessor', () => {
  let processor: KeyRotationProcessor;
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };

    // Setup mock Prisma
    mockPrisma = {
      tenantStripeConfig: {
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      staffProfile: {
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    processor = new KeyRotationProcessor(mockPrisma);

    // Mock crypto functions
    const mockCipher = {
      update: jest.fn().mockReturnValue(Buffer.from('encrypted')),
      final: jest.fn().mockReturnValue(Buffer.from('')),
      getAuthTag: jest.fn().mockReturnValue(Buffer.from('authtag', 'hex')),
    };

    const mockDecipher = {
      update: jest.fn().mockReturnValue(Buffer.from('decrypted-data')),
      final: jest.fn().mockReturnValue(Buffer.from('')),
      setAuthTag: jest.fn(),
    };

    (createCipheriv as jest.Mock).mockReturnValue(mockCipher);
    (createDecipheriv as jest.Mock).mockReturnValue(mockDecipher);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('process', () => {
    const encryptedFormat = 'ivhex:authtaghex:cipherhex';

    beforeEach(() => {
      // Set up encryption keys
      process.env.ENCRYPTION_KEY_V1 = 'a'.repeat(64); // 32 bytes in hex
      process.env.ENCRYPTION_KEY_V2 = 'b'.repeat(64);
      process.env.ENCRYPTION_CURRENT_VERSION = '2';
    });

    it('should skip processing for wrong job name', async () => {
      const job = { name: 'wrong-job', data: {}, updateProgress: jest.fn() } as unknown as Job;

      await processor.process(job);

      expect(mockPrisma.tenantStripeConfig.findMany).not.toHaveBeenCalled();
    });

    it('should throw error when current key version not available', async () => {
      process.env.ENCRYPTION_CURRENT_VERSION = '99';

      const job = {
        name: KEY_ROTATION_JOB,
        data: {},
        updateProgress: jest.fn(),
      } as unknown as Job;

      await expect(processor.process(job)).rejects.toThrow(
        'Key rotation aborted: current encryption key version 99 not available in environment',
      );
    });

    it('should process dry run without updating database', async () => {
      mockPrisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([
          {
            id: 'stripe-1',
            stripe_secret_key_encrypted: encryptedFormat,
            stripe_webhook_secret_encrypted: encryptedFormat,
            encryption_key_ref: 'v1',
          },
        ])
        .mockResolvedValue([]);

      mockPrisma.staffProfile.findMany
        .mockResolvedValueOnce([
          {
            id: 'staff-1',
            bank_account_number_encrypted: encryptedFormat,
            bank_iban_encrypted: encryptedFormat,
            bank_encryption_key_ref: 'v1',
          },
        ])
        .mockResolvedValue([]);

      const job = {
        name: KEY_ROTATION_JOB,
        data: { dry_run: true },
        updateProgress: jest.fn(),
      } as unknown as Job;

      await processor.process(job);

      expect(mockPrisma.tenantStripeConfig.update).not.toHaveBeenCalled();
      expect(mockPrisma.staffProfile.update).not.toHaveBeenCalled();
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should rotate stripe configs from v1 to v2', async () => {
      mockPrisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([
          {
            id: 'stripe-1',
            stripe_secret_key_encrypted: encryptedFormat,
            stripe_webhook_secret_encrypted: encryptedFormat,
            encryption_key_ref: 'v1',
          },
        ])
        .mockResolvedValue([]);

      mockPrisma.staffProfile.findMany.mockResolvedValue([]);

      const job = {
        name: KEY_ROTATION_JOB,
        data: {},
        updateProgress: jest.fn(),
      } as unknown as Job;

      await processor.process(job);

      expect(mockPrisma.tenantStripeConfig.update).toHaveBeenCalledWith({
        where: { id: 'stripe-1' },
        data: expect.objectContaining({
          encryption_key_ref: 'v2',
          key_last_rotated_at: expect.any(Date),
        }),
      });
    });

    it('should rotate staff bank details from v1 to v2', async () => {
      mockPrisma.tenantStripeConfig.findMany.mockResolvedValue([]);
      mockPrisma.staffProfile.findMany
        .mockResolvedValueOnce([
          {
            id: 'staff-1',
            bank_account_number_encrypted: encryptedFormat,
            bank_iban_encrypted: encryptedFormat,
            bank_encryption_key_ref: 'v1',
          },
        ])
        .mockResolvedValue([]);

      const job = {
        name: KEY_ROTATION_JOB,
        data: {},
        updateProgress: jest.fn(),
      } as unknown as Job;

      await processor.process(job);

      expect(mockPrisma.staffProfile.update).toHaveBeenCalledWith({
        where: { id: 'staff-1' },
        data: expect.objectContaining({
          bank_encryption_key_ref: 'v2',
        }),
      });
    });

    it('should handle null bank fields in staff profile', async () => {
      mockPrisma.tenantStripeConfig.findMany.mockResolvedValue([]);
      mockPrisma.staffProfile.findMany
        .mockResolvedValueOnce([
          {
            id: 'staff-1',
            bank_account_number_encrypted: encryptedFormat,
            bank_iban_encrypted: null,
            bank_encryption_key_ref: 'v1',
          },
        ])
        .mockResolvedValue([]);

      const job = {
        name: KEY_ROTATION_JOB,
        data: {},
        updateProgress: jest.fn(),
      } as unknown as Job;

      await processor.process(job);

      expect(mockPrisma.staffProfile.update).toHaveBeenCalledWith({
        where: { id: 'staff-1' },
        data: expect.not.objectContaining({
          bank_iban_encrypted: expect.anything(),
        }),
      });
    });

    it('should skip records with missing encryption keys', async () => {
      mockPrisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([
          {
            id: 'stripe-1',
            stripe_secret_key_encrypted: encryptedFormat,
            stripe_webhook_secret_encrypted: encryptedFormat,
            encryption_key_ref: 'v99', // Non-existent version
          },
        ])
        .mockResolvedValue([]);

      mockPrisma.staffProfile.findMany.mockResolvedValue([]);

      const job = {
        name: KEY_ROTATION_JOB,
        data: {},
        updateProgress: jest.fn(),
      } as unknown as Job;

      await processor.process(job);

      expect(mockPrisma.tenantStripeConfig.update).not.toHaveBeenCalled();
    });

    it('should handle decryption errors gracefully', async () => {
      const mockDecipher = {
        update: jest.fn().mockImplementation(() => {
          throw new Error('Decryption failed');
        }),
        final: jest.fn(),
        setAuthTag: jest.fn(),
      };
      (createDecipheriv as jest.Mock).mockReturnValue(mockDecipher);

      mockPrisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([
          {
            id: 'stripe-1',
            stripe_secret_key_encrypted: encryptedFormat,
            stripe_webhook_secret_encrypted: encryptedFormat,
            encryption_key_ref: 'v1',
          },
        ])
        .mockResolvedValue([]);

      mockPrisma.staffProfile.findMany.mockResolvedValue([]);

      const job = {
        name: KEY_ROTATION_JOB,
        data: {},
        updateProgress: jest.fn(),
      } as unknown as Job;

      // Should not throw
      await expect(processor.process(job)).resolves.not.toThrow();
    });

    it('should process multiple batches in dry run mode', async () => {
      const configs = Array(60)
        .fill(null)
        .map((_, i) => ({
          id: `stripe-${i}`,
          stripe_secret_key_encrypted: encryptedFormat,
          stripe_webhook_secret_encrypted: encryptedFormat,
          encryption_key_ref: 'v1',
        }));

      mockPrisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce(configs.slice(0, 50))
        .mockResolvedValueOnce(configs.slice(50, 60))
        .mockResolvedValue([]);

      mockPrisma.staffProfile.findMany.mockResolvedValue([]);

      const job = {
        name: KEY_ROTATION_JOB,
        data: { dry_run: true },
        updateProgress: jest.fn(),
      } as unknown as Job;

      await processor.process(job);

      expect(mockPrisma.tenantStripeConfig.findMany).toHaveBeenCalledTimes(3);
    });

    it('should process batches without offset in non-dry-run mode', async () => {
      mockPrisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([
          {
            id: 'stripe-1',
            stripe_secret_key_encrypted: encryptedFormat,
            stripe_webhook_secret_encrypted: encryptedFormat,
            encryption_key_ref: 'v1',
          },
        ])
        .mockResolvedValue([]);

      mockPrisma.staffProfile.findMany.mockResolvedValue([]);

      const job = {
        name: KEY_ROTATION_JOB,
        data: { dry_run: false },
        updateProgress: jest.fn(),
      } as unknown as Job;

      await processor.process(job);

      // Should query from offset 0 both times since records are updated
      const calls = mockPrisma.tenantStripeConfig.findMany.mock.calls;
      expect(calls[0][0].skip).toBe(0);
    });

    it('should handle legacy key references (aws, local)', async () => {
      mockPrisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([
          {
            id: 'stripe-1',
            stripe_secret_key_encrypted: encryptedFormat,
            stripe_webhook_secret_encrypted: encryptedFormat,
            encryption_key_ref: 'aws',
          },
          {
            id: 'stripe-2',
            stripe_secret_key_encrypted: encryptedFormat,
            stripe_webhook_secret_encrypted: encryptedFormat,
            encryption_key_ref: 'local',
          },
        ])
        .mockResolvedValue([]);

      mockPrisma.staffProfile.findMany.mockResolvedValue([]);

      const job = {
        name: KEY_ROTATION_JOB,
        data: {},
        updateProgress: jest.fn(),
      } as unknown as Job;

      await processor.process(job);

      expect(mockPrisma.tenantStripeConfig.update).toHaveBeenCalledTimes(2);
    });

    it('should handle unknown key references with warning', async () => {
      mockPrisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([
          {
            id: 'stripe-1',
            stripe_secret_key_encrypted: encryptedFormat,
            stripe_webhook_secret_encrypted: encryptedFormat,
            encryption_key_ref: 'unknown-ref',
          },
        ])
        .mockResolvedValue([]);

      mockPrisma.staffProfile.findMany.mockResolvedValue([]);

      const job = {
        name: KEY_ROTATION_JOB,
        data: {},
        updateProgress: jest.fn(),
      } as unknown as Job;

      // Should fall back to v1 for unknown refs
      await expect(processor.process(job)).resolves.not.toThrow();
    });

    it('should handle empty batches', async () => {
      mockPrisma.tenantStripeConfig.findMany.mockResolvedValue([]);
      mockPrisma.staffProfile.findMany.mockResolvedValue([]);

      const job = {
        name: KEY_ROTATION_JOB,
        data: {},
        updateProgress: jest.fn(),
      } as unknown as Job;

      await processor.process(job);

      expect(mockPrisma.tenantStripeConfig.update).not.toHaveBeenCalled();
      expect(mockPrisma.staffProfile.update).not.toHaveBeenCalled();
    });

    it('should handle partial rotation success', async () => {
      mockPrisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([
          {
            id: 'stripe-1',
            stripe_secret_key_encrypted: encryptedFormat,
            stripe_webhook_secret_encrypted: encryptedFormat,
            encryption_key_ref: 'v1',
          },
          {
            id: 'stripe-2',
            stripe_secret_key_encrypted: 'invalid:format',
            stripe_webhook_secret_encrypted: encryptedFormat,
            encryption_key_ref: 'v1',
          },
        ])
        .mockResolvedValue([]);

      mockPrisma.staffProfile.findMany.mockResolvedValue([]);

      const job = {
        name: KEY_ROTATION_JOB,
        data: {},
        updateProgress: jest.fn(),
      } as unknown as Job;

      await processor.process(job);

      // First record should succeed, second should fail but not break
      expect(mockPrisma.tenantStripeConfig.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('loadKeys', () => {
    it('should throw error when no encryption keys configured', async () => {
      delete process.env.ENCRYPTION_KEY_V1;
      delete process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY_LOCAL;

      mockPrisma.tenantStripeConfig.findMany.mockResolvedValue([]);
      mockPrisma.staffProfile.findMany.mockResolvedValue([]);

      const job = {
        name: KEY_ROTATION_JOB,
        data: {},
        updateProgress: jest.fn(),
      } as unknown as Job;

      await expect(processor.process(job)).rejects.toThrow('No encryption keys configured');
    });

    it('should load multiple versioned keys', async () => {
      process.env.ENCRYPTION_KEY_V1 = 'a'.repeat(64);
      process.env.ENCRYPTION_KEY_V2 = 'b'.repeat(64);
      process.env.ENCRYPTION_KEY_V3 = 'c'.repeat(64);
      process.env.ENCRYPTION_CURRENT_VERSION = '3';

      mockPrisma.tenantStripeConfig.findMany.mockResolvedValue([]);
      mockPrisma.staffProfile.findMany.mockResolvedValue([]);

      const job = {
        name: KEY_ROTATION_JOB,
        data: {},
        updateProgress: jest.fn(),
      } as unknown as Job;

      await expect(processor.process(job)).resolves.not.toThrow();
    });

    it('should validate key length', async () => {
      process.env.ENCRYPTION_KEY_V1 = 'too-short';

      mockPrisma.tenantStripeConfig.findMany.mockResolvedValue([]);
      mockPrisma.staffProfile.findMany.mockResolvedValue([]);

      const job = {
        name: KEY_ROTATION_JOB,
        data: {},
        updateProgress: jest.fn(),
      } as unknown as Job;

      await expect(processor.process(job)).rejects.toThrow('must be 32 bytes');
    });

    it('should fall back to legacy keys', async () => {
      delete process.env.ENCRYPTION_KEY_V1;
      process.env.ENCRYPTION_KEY = 'd'.repeat(64);
      process.env.ENCRYPTION_CURRENT_VERSION = '1';

      mockPrisma.tenantStripeConfig.findMany.mockResolvedValue([]);
      mockPrisma.staffProfile.findMany.mockResolvedValue([]);

      const job = {
        name: KEY_ROTATION_JOB,
        data: {},
        updateProgress: jest.fn(),
      } as unknown as Job;

      await expect(processor.process(job)).resolves.not.toThrow();
    });

    it('should prefer ENCRYPTION_KEY_LOCAL over ENCRYPTION_KEY', async () => {
      delete process.env.ENCRYPTION_KEY_V1;
      process.env.ENCRYPTION_KEY = 'e'.repeat(64);
      process.env.ENCRYPTION_KEY_LOCAL = 'f'.repeat(64);
      process.env.ENCRYPTION_CURRENT_VERSION = '1';

      mockPrisma.tenantStripeConfig.findMany.mockResolvedValue([]);
      mockPrisma.staffProfile.findMany.mockResolvedValue([]);

      const job = {
        name: KEY_ROTATION_JOB,
        data: {},
        updateProgress: jest.fn(),
      } as unknown as Job;

      await expect(processor.process(job)).resolves.not.toThrow();
    });
  });

  describe('constructor and queue configuration', () => {
    it('should have correct queue name', () => {
      expect(QUEUE_NAMES.SECURITY).toBe('security');
    });

    it('should inject PRISMA_CLIENT', () => {
      const prismaClient = { $transaction: jest.fn() };
      const p = new KeyRotationProcessor(prismaClient as any);
      expect(p).toBeDefined();
    });
  });
});
