import { createCipheriv, randomBytes } from 'crypto';

import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { KEY_ROTATION_JOB, KeyRotationProcessor } from './key-rotation.processor';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const HEX_KEY_V1 = '11'.repeat(32);
const HEX_KEY_V2 = '22'.repeat(32);
const HEX_KEY_V3 = '33'.repeat(32);

const KEY_V1_BUF = Buffer.from(HEX_KEY_V1, 'hex');
const KEY_V2_BUF = Buffer.from(HEX_KEY_V2, 'hex');

const STRIPE_ID = 'stripe-config-001';
const STAFF_ID = 'staff-profile-001';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string with AES-256-GCM using the same format
 * as the processor: iv_hex:authTag_hex:ciphertext_hex
 */
function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function buildJob(name: string, data: Record<string, unknown> = {}): Job {
  return {
    data,
    name,
    updateProgress: jest.fn().mockResolvedValue(undefined),
  } as unknown as Job;
}

function buildMockPrisma() {
  return {
    staffProfile: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: STAFF_ID }),
    },
    tenantStripeConfig: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: STRIPE_ID }),
    },
  };
}

function makeStripeRow(overrides: Partial<{
  id: string;
  stripe_secret_key_encrypted: string;
  stripe_webhook_secret_encrypted: string;
  encryption_key_ref: string;
}> = {}) {
  return {
    id: overrides.id ?? STRIPE_ID,
    stripe_secret_key_encrypted:
      overrides.stripe_secret_key_encrypted ?? encrypt('sk_live_secret123', KEY_V1_BUF),
    stripe_webhook_secret_encrypted:
      overrides.stripe_webhook_secret_encrypted ?? encrypt('whsec_webhook456', KEY_V1_BUF),
    encryption_key_ref: overrides.encryption_key_ref ?? 'v1',
  };
}

function makeStaffRow(overrides: Partial<{
  id: string;
  bank_account_number_encrypted: string | null;
  bank_iban_encrypted: string | null;
  bank_encryption_key_ref: string | null;
}> = {}) {
  return {
    id: overrides.id ?? STAFF_ID,
    bank_account_number_encrypted:
      overrides.bank_account_number_encrypted !== undefined
        ? overrides.bank_account_number_encrypted
        : encrypt('12345678', KEY_V1_BUF),
    bank_iban_encrypted:
      overrides.bank_iban_encrypted !== undefined
        ? overrides.bank_iban_encrypted
        : encrypt('IE29AIBK12345678901234', KEY_V1_BUF),
    bank_encryption_key_ref: overrides.bank_encryption_key_ref ?? 'v1',
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('KeyRotationProcessor', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      ENCRYPTION_CURRENT_VERSION: '2',
      ENCRYPTION_KEY_V1: HEX_KEY_V1,
      ENCRYPTION_KEY_V2: HEX_KEY_V2,
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  // ─── Basic guard clauses ──────────────────────────────────────────────────

  describe('job name guard', () => {
    it('should ignore jobs with a different name', async () => {
      const prisma = buildMockPrisma();
      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);

      await processor.process(buildJob('security:other-job'));

      expect(prisma.tenantStripeConfig.findMany).not.toHaveBeenCalled();
      expect(prisma.staffProfile.findMany).not.toHaveBeenCalled();
    });

    it('should proceed for the correct job name', async () => {
      const prisma = buildMockPrisma();
      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);

      await processor.process(buildJob(KEY_ROTATION_JOB));

      expect(prisma.tenantStripeConfig.findMany).toHaveBeenCalled();
      expect(prisma.staffProfile.findMany).toHaveBeenCalled();
    });
  });

  // ─── Key loading & validation ─────────────────────────────────────────────

  describe('key loading', () => {
    it('should fail fast when the current key version is not available', async () => {
      const prisma = buildMockPrisma();
      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      process.env.ENCRYPTION_CURRENT_VERSION = '3';

      await expect(processor.process(buildJob(KEY_ROTATION_JOB))).rejects.toThrow(
        'current encryption key version 3 not available',
      );
    });

    it('should fail when no encryption keys are configured at all', async () => {
      const prisma = buildMockPrisma();
      delete process.env.ENCRYPTION_KEY_V1;
      delete process.env.ENCRYPTION_KEY_V2;
      delete process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY_LOCAL;
      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);

      await expect(processor.process(buildJob(KEY_ROTATION_JOB))).rejects.toThrow(
        'No encryption keys configured',
      );
    });

    it('should fail when an encryption key has wrong length', async () => {
      const prisma = buildMockPrisma();
      process.env.ENCRYPTION_KEY_V1 = 'aabb'; // only 2 bytes
      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);

      await expect(processor.process(buildJob(KEY_ROTATION_JOB))).rejects.toThrow(
        'must be 32 bytes',
      );
    });

    it('should load legacy ENCRYPTION_KEY as v1 fallback', async () => {
      const prisma = buildMockPrisma();
      delete process.env.ENCRYPTION_KEY_V1;
      process.env.ENCRYPTION_KEY = HEX_KEY_V1;
      process.env.ENCRYPTION_CURRENT_VERSION = '1';
      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);

      // Should not throw — legacy key loaded as v1
      await processor.process(buildJob(KEY_ROTATION_JOB));

      expect(prisma.tenantStripeConfig.findMany).toHaveBeenCalled();
    });

    it('should load legacy ENCRYPTION_KEY_LOCAL as v1 fallback', async () => {
      const prisma = buildMockPrisma();
      delete process.env.ENCRYPTION_KEY_V1;
      process.env.ENCRYPTION_KEY_LOCAL = HEX_KEY_V1;
      process.env.ENCRYPTION_CURRENT_VERSION = '1';
      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);

      await processor.process(buildJob(KEY_ROTATION_JOB));

      expect(prisma.tenantStripeConfig.findMany).toHaveBeenCalled();
    });
  });

  // ─── Dry-run mode ─────────────────────────────────────────────────────────

  describe('dry-run mode', () => {
    it('should not mutate encrypted rows in dry-run', async () => {
      const prisma = buildMockPrisma();
      prisma.tenantStripeConfig.findMany.mockResolvedValueOnce([makeStripeRow()]).mockResolvedValueOnce([]);
      prisma.staffProfile.findMany.mockResolvedValueOnce([makeStaffRow()]).mockResolvedValueOnce([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB, { dry_run: true });

      await processor.process(job);

      expect(prisma.tenantStripeConfig.update).not.toHaveBeenCalled();
      expect(prisma.staffProfile.update).not.toHaveBeenCalled();
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should increment offset in dry-run mode to avoid infinite loops', async () => {
      const prisma = buildMockPrisma();
      const row = makeStripeRow();
      // First call returns a row, second call returns empty (end of data)
      prisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([]);
      prisma.staffProfile.findMany.mockResolvedValue([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB, { dry_run: true });

      await processor.process(job);

      // First call: skip=0, second call: skip=50 (batchSize)
      expect(prisma.tenantStripeConfig.findMany).toHaveBeenCalledTimes(2);
      const secondCall = prisma.tenantStripeConfig.findMany.mock.calls[1];
      expect(secondCall[0]).toEqual(
        expect.objectContaining({ skip: 50 }),
      );
    });

    it('should not increment offset in non-dry-run mode (WHERE clause filters rotated rows)', async () => {
      const prisma = buildMockPrisma();
      prisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([makeStripeRow()])
        .mockResolvedValueOnce([]);
      prisma.staffProfile.findMany.mockResolvedValue([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB, { dry_run: false });

      await processor.process(job);

      // Both calls should use skip=0
      expect(prisma.tenantStripeConfig.findMany).toHaveBeenCalledTimes(2);
      const firstCall = prisma.tenantStripeConfig.findMany.mock.calls[0];
      const secondCall = prisma.tenantStripeConfig.findMany.mock.calls[1];
      expect(firstCall[0]).toEqual(expect.objectContaining({ skip: 0 }));
      expect(secondCall[0]).toEqual(expect.objectContaining({ skip: 0 }));
    });
  });

  // ─── Happy-path rotation ─────────────────────────────────────────────────

  describe('happy-path rotation', () => {
    it('should re-encrypt stripe keys from v1 to v2', async () => {
      const prisma = buildMockPrisma();
      const row = makeStripeRow();
      prisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([]);
      prisma.staffProfile.findMany.mockResolvedValue([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      expect(prisma.tenantStripeConfig.update).toHaveBeenCalledTimes(1);
      const updateCall = prisma.tenantStripeConfig.update.mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: STRIPE_ID });
      expect(updateCall.data.encryption_key_ref).toBe('v2');
      expect(updateCall.data.key_last_rotated_at).toBeInstanceOf(Date);
      // The new ciphertext must be different from the old
      expect(updateCall.data.stripe_secret_key_encrypted).not.toBe(
        row.stripe_secret_key_encrypted,
      );
      expect(updateCall.data.stripe_webhook_secret_encrypted).not.toBe(
        row.stripe_webhook_secret_encrypted,
      );
    });

    it('should re-encrypt staff bank details from v1 to v2', async () => {
      const prisma = buildMockPrisma();
      prisma.tenantStripeConfig.findMany.mockResolvedValue([]);
      const row = makeStaffRow();
      prisma.staffProfile.findMany
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      expect(prisma.staffProfile.update).toHaveBeenCalledTimes(1);
      const updateCall = prisma.staffProfile.update.mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: STAFF_ID });
      expect(updateCall.data.bank_encryption_key_ref).toBe('v2');
      // New ciphertext differs from old
      expect(updateCall.data.bank_account_number_encrypted).not.toBe(
        row.bank_account_number_encrypted,
      );
      expect(updateCall.data.bank_iban_encrypted).not.toBe(row.bank_iban_encrypted);
    });

    it('should update progress to 100 after rotation completes', async () => {
      const prisma = buildMockPrisma();
      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });
  });

  // ─── Missing key skips ────────────────────────────────────────────────────

  describe('missing-key skips', () => {
    it('should skip stripe records with unknown keyRef gracefully', async () => {
      const prisma = buildMockPrisma();
      // Record encrypted with v3, but v3 key is not in env
      const row = makeStripeRow({
        encryption_key_ref: 'v3',
        stripe_secret_key_encrypted: 'fake:cipher:text',
        stripe_webhook_secret_encrypted: 'fake:cipher:text',
      });
      prisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([]);
      prisma.staffProfile.findMany.mockResolvedValue([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      // Should NOT throw
      await processor.process(job);

      expect(prisma.tenantStripeConfig.update).not.toHaveBeenCalled();
    });

    it('should skip staff records with unknown keyRef gracefully', async () => {
      const prisma = buildMockPrisma();
      prisma.tenantStripeConfig.findMany.mockResolvedValue([]);
      const row = makeStaffRow({
        bank_encryption_key_ref: 'v3',
        bank_account_number_encrypted: 'fake:cipher:text',
        bank_iban_encrypted: 'fake:cipher:text',
      });
      prisma.staffProfile.findMany
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      expect(prisma.staffProfile.update).not.toHaveBeenCalled();
    });

    it('should resolve legacy "aws" keyRef to v1', async () => {
      const prisma = buildMockPrisma();
      const row = makeStripeRow({ encryption_key_ref: 'aws' });
      prisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([]);
      prisma.staffProfile.findMany.mockResolvedValue([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      // Should decrypt with v1 key and re-encrypt with v2
      expect(prisma.tenantStripeConfig.update).toHaveBeenCalledTimes(1);
      expect(prisma.tenantStripeConfig.update.mock.calls[0][0].data.encryption_key_ref).toBe('v2');
    });

    it('should resolve legacy "local" keyRef to v1', async () => {
      const prisma = buildMockPrisma();
      const row = makeStripeRow({ encryption_key_ref: 'local' });
      prisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([]);
      prisma.staffProfile.findMany.mockResolvedValue([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      expect(prisma.tenantStripeConfig.update).toHaveBeenCalledTimes(1);
      expect(prisma.tenantStripeConfig.update.mock.calls[0][0].data.encryption_key_ref).toBe('v2');
    });

    it('should fallback unknown keyRef strings to v1 with warning', async () => {
      const prisma = buildMockPrisma();
      // "mystery" keyRef falls back to v1
      const row = makeStripeRow({ encryption_key_ref: 'mystery' });
      prisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([]);
      prisma.staffProfile.findMany.mockResolvedValue([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      // Falls back to v1 key, which is available — should successfully rotate
      expect(prisma.tenantStripeConfig.update).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Null encrypted fields ────────────────────────────────────────────────

  describe('null encrypted fields', () => {
    it('should skip null bank_account_number_encrypted and only rotate bank_iban_encrypted', async () => {
      const prisma = buildMockPrisma();
      prisma.tenantStripeConfig.findMany.mockResolvedValue([]);
      const row = makeStaffRow({
        bank_account_number_encrypted: null,
      });
      prisma.staffProfile.findMany
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      expect(prisma.staffProfile.update).toHaveBeenCalledTimes(1);
      const updateData = prisma.staffProfile.update.mock.calls[0][0].data;
      // Should NOT include bank_account_number_encrypted when it was null
      expect(updateData).not.toHaveProperty('bank_account_number_encrypted');
      // Should include bank_iban_encrypted since it was non-null
      expect(updateData).toHaveProperty('bank_iban_encrypted');
      expect(updateData.bank_encryption_key_ref).toBe('v2');
    });

    it('should skip null bank_iban_encrypted and only rotate bank_account_number_encrypted', async () => {
      const prisma = buildMockPrisma();
      prisma.tenantStripeConfig.findMany.mockResolvedValue([]);
      const row = makeStaffRow({
        bank_iban_encrypted: null,
      });
      prisma.staffProfile.findMany
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      expect(prisma.staffProfile.update).toHaveBeenCalledTimes(1);
      const updateData = prisma.staffProfile.update.mock.calls[0][0].data;
      expect(updateData).toHaveProperty('bank_account_number_encrypted');
      expect(updateData).not.toHaveProperty('bank_iban_encrypted');
      expect(updateData.bank_encryption_key_ref).toBe('v2');
    });

    it('should still update keyRef when both bank fields are null', async () => {
      const prisma = buildMockPrisma();
      prisma.tenantStripeConfig.findMany.mockResolvedValue([]);
      const row = makeStaffRow({
        bank_account_number_encrypted: null,
        bank_iban_encrypted: null,
      });
      prisma.staffProfile.findMany
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      expect(prisma.staffProfile.update).toHaveBeenCalledTimes(1);
      const updateData = prisma.staffProfile.update.mock.calls[0][0].data;
      expect(updateData).not.toHaveProperty('bank_account_number_encrypted');
      expect(updateData).not.toHaveProperty('bank_iban_encrypted');
      expect(updateData.bank_encryption_key_ref).toBe('v2');
    });
  });

  // ─── Decryption failures ──────────────────────────────────────────────────

  describe('decryption failures', () => {
    it('should log error and continue when stripe ciphertext is malformed', async () => {
      const prisma = buildMockPrisma();
      const row = makeStripeRow({
        stripe_secret_key_encrypted: 'not-valid-ciphertext',
      });
      prisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([]);
      prisma.staffProfile.findMany.mockResolvedValue([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      // Should NOT throw — error is caught and logged
      await processor.process(job);

      expect(prisma.tenantStripeConfig.update).not.toHaveBeenCalled();
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should log error and continue when staff bank ciphertext is malformed', async () => {
      const prisma = buildMockPrisma();
      prisma.tenantStripeConfig.findMany.mockResolvedValue([]);
      const row = makeStaffRow({
        bank_account_number_encrypted: 'garbage:data',
      });
      prisma.staffProfile.findMany
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      expect(prisma.staffProfile.update).not.toHaveBeenCalled();
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should log error when ciphertext was encrypted with wrong key', async () => {
      const prisma = buildMockPrisma();
      // Encrypt with v2 key but claim it is v1 — decryption will fail
      const row = makeStripeRow({
        encryption_key_ref: 'v1',
        stripe_secret_key_encrypted: encrypt('secret', KEY_V2_BUF),
        stripe_webhook_secret_encrypted: encrypt('webhook', KEY_V2_BUF),
      });
      prisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([]);
      prisma.staffProfile.findMany.mockResolvedValue([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      // Should not throw — error caught per-record
      await processor.process(job);

      expect(prisma.tenantStripeConfig.update).not.toHaveBeenCalled();
    });

    it('should count failed records in stats without aborting the batch', async () => {
      const prisma = buildMockPrisma();
      const badRow = makeStripeRow({
        id: 'stripe-bad',
        stripe_secret_key_encrypted: 'invalid:cipher:text:extra',
      });
      const goodRow = makeStripeRow({ id: 'stripe-good' });
      prisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([badRow, goodRow])
        .mockResolvedValueOnce([]);
      prisma.staffProfile.findMany.mockResolvedValue([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      // The good row should still be rotated
      expect(prisma.tenantStripeConfig.update).toHaveBeenCalledTimes(1);
      expect(prisma.tenantStripeConfig.update.mock.calls[0][0].where.id).toBe('stripe-good');
    });
  });

  // ─── Batching ─────────────────────────────────────────────────────────────

  describe('batching', () => {
    it('should request records in batches of 50', async () => {
      const prisma = buildMockPrisma();
      prisma.tenantStripeConfig.findMany.mockResolvedValue([]);
      prisma.staffProfile.findMany.mockResolvedValue([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      expect(prisma.tenantStripeConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
      expect(prisma.staffProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });

    it('should terminate when a batch returns empty results', async () => {
      const prisma = buildMockPrisma();
      // Return exactly 0 rows on first call
      prisma.tenantStripeConfig.findMany.mockResolvedValue([]);
      prisma.staffProfile.findMany.mockResolvedValue([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      // Only 1 query per table (immediate empty termination)
      expect(prisma.tenantStripeConfig.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.staffProfile.findMany).toHaveBeenCalledTimes(1);
    });

    it('should process multiple batches for stripe configs', async () => {
      const prisma = buildMockPrisma();
      // Batch 1: 2 rows, Batch 2: empty
      const rows = [
        makeStripeRow({ id: 'stripe-1' }),
        makeStripeRow({ id: 'stripe-2' }),
      ];
      prisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce(rows)
        .mockResolvedValueOnce([]);
      prisma.staffProfile.findMany.mockResolvedValue([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      expect(prisma.tenantStripeConfig.update).toHaveBeenCalledTimes(2);
    });

    it('should process multiple batches for staff profiles', async () => {
      const prisma = buildMockPrisma();
      prisma.tenantStripeConfig.findMany.mockResolvedValue([]);
      const rows = [
        makeStaffRow({ id: 'staff-1' }),
        makeStaffRow({ id: 'staff-2' }),
        makeStaffRow({ id: 'staff-3' }),
      ];
      prisma.staffProfile.findMany
        .mockResolvedValueOnce(rows)
        .mockResolvedValueOnce([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      expect(prisma.staffProfile.update).toHaveBeenCalledTimes(3);
    });
  });

  // ─── No-repeat corruption / WHERE filter ──────────────────────────────────

  describe('no-repeat corruption', () => {
    it('should query stripe configs WHERE encryption_key_ref != current version', async () => {
      const prisma = buildMockPrisma();
      prisma.tenantStripeConfig.findMany.mockResolvedValue([]);
      prisma.staffProfile.findMany.mockResolvedValue([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      expect(prisma.tenantStripeConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { encryption_key_ref: { not: 'v2' } },
        }),
      );
    });

    it('should query staff profiles WHERE bank_encryption_key_ref != current version and not null', async () => {
      const prisma = buildMockPrisma();
      prisma.tenantStripeConfig.findMany.mockResolvedValue([]);
      prisma.staffProfile.findMany.mockResolvedValue([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      expect(prisma.staffProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            bank_encryption_key_ref: { not: null },
            NOT: { bank_encryption_key_ref: 'v2' },
          },
        }),
      );
    });

    it('should produce AES-256-GCM ciphertext that round-trips correctly', async () => {
      const prisma = buildMockPrisma();
      const plainSecret = 'sk_live_roundtrip_test_key';
      const plainWebhook = 'whsec_roundtrip_test_secret';
      const row = makeStripeRow({
        stripe_secret_key_encrypted: encrypt(plainSecret, KEY_V1_BUF),
        stripe_webhook_secret_encrypted: encrypt(plainWebhook, KEY_V1_BUF),
      });
      prisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([]);
      prisma.staffProfile.findMany.mockResolvedValue([]);

      // Capture the data written by update
      let capturedData: Record<string, string> = {};
      prisma.tenantStripeConfig.update.mockImplementation(
        (args: { data: Record<string, string> }) => {
          capturedData = args.data;
          return Promise.resolve({ id: STRIPE_ID });
        },
      );

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      // The new ciphertext should be in iv:authTag:ciphertext format
      const newSecretParts = (capturedData as Record<string, string>)['stripe_secret_key_encrypted']!.split(':');
      expect(newSecretParts).toHaveLength(3);

      const newWebhookParts = (capturedData as Record<string, string>)['stripe_webhook_secret_encrypted']!.split(':');
      expect(newWebhookParts).toHaveLength(3);
    });
  });

  // ─── Multi-version rotation ───────────────────────────────────────────────

  describe('multi-version rotation', () => {
    it('should handle records encrypted with different key versions in the same batch', async () => {
      process.env.ENCRYPTION_KEY_V3 = HEX_KEY_V3;
      process.env.ENCRYPTION_CURRENT_VERSION = '3';

      const KEY_V3_BUF = Buffer.from(HEX_KEY_V3, 'hex');

      const prisma = buildMockPrisma();
      const rowV1 = makeStripeRow({
        id: 'stripe-v1',
        encryption_key_ref: 'v1',
        stripe_secret_key_encrypted: encrypt('secret-v1', KEY_V1_BUF),
        stripe_webhook_secret_encrypted: encrypt('webhook-v1', KEY_V1_BUF),
      });
      const rowV2 = makeStripeRow({
        id: 'stripe-v2',
        encryption_key_ref: 'v2',
        stripe_secret_key_encrypted: encrypt('secret-v2', KEY_V2_BUF),
        stripe_webhook_secret_encrypted: encrypt('webhook-v2', KEY_V2_BUF),
      });

      prisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([rowV1, rowV2])
        .mockResolvedValueOnce([]);
      prisma.staffProfile.findMany.mockResolvedValue([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      expect(prisma.tenantStripeConfig.update).toHaveBeenCalledTimes(2);

      // Both should be rotated to v3
      const call1 = prisma.tenantStripeConfig.update.mock.calls[0][0];
      const call2 = prisma.tenantStripeConfig.update.mock.calls[1][0];
      expect(call1.data.encryption_key_ref).toBe('v3');
      expect(call2.data.encryption_key_ref).toBe('v3');

      // Verify different records
      const ids = [call1.where.id, call2.where.id].sort();
      expect(ids).toEqual(['stripe-v1', 'stripe-v2']);

      // cleanup
      delete process.env.ENCRYPTION_KEY_V3;
    });

    it('should handle mixed v1 and legacy keyRefs in staff profiles', async () => {
      const prisma = buildMockPrisma();
      prisma.tenantStripeConfig.findMany.mockResolvedValue([]);

      const rowV1 = makeStaffRow({
        id: 'staff-v1',
        bank_encryption_key_ref: 'v1',
      });
      const rowLegacy = makeStaffRow({
        id: 'staff-legacy',
        bank_encryption_key_ref: 'aws',
      });

      prisma.staffProfile.findMany
        .mockResolvedValueOnce([rowV1, rowLegacy])
        .mockResolvedValueOnce([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      expect(prisma.staffProfile.update).toHaveBeenCalledTimes(2);
      // Both should be rotated to v2
      prisma.staffProfile.update.mock.calls.forEach(
        (call: Array<{ data: { bank_encryption_key_ref: string } }>) => {
          expect(call[0]!.data.bank_encryption_key_ref).toBe('v2');
        },
      );
    });
  });

  // ─── DB failure resilience ────────────────────────────────────────────────

  describe('DB failure resilience', () => {
    it('should continue processing remaining stripe records when one update fails', async () => {
      const prisma = buildMockPrisma();
      const row1 = makeStripeRow({ id: 'stripe-fail' });
      const row2 = makeStripeRow({ id: 'stripe-ok' });

      prisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce([row1, row2])
        .mockResolvedValueOnce([]);
      prisma.staffProfile.findMany.mockResolvedValue([]);

      prisma.tenantStripeConfig.update
        .mockRejectedValueOnce(new Error('DB connection lost'))
        .mockResolvedValueOnce({ id: 'stripe-ok' });

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      // Should NOT throw
      await processor.process(job);

      // Both records were attempted
      expect(prisma.tenantStripeConfig.update).toHaveBeenCalledTimes(2);
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should continue processing remaining staff records when one update fails', async () => {
      const prisma = buildMockPrisma();
      prisma.tenantStripeConfig.findMany.mockResolvedValue([]);

      const row1 = makeStaffRow({ id: 'staff-fail' });
      const row2 = makeStaffRow({ id: 'staff-ok' });

      prisma.staffProfile.findMany
        .mockResolvedValueOnce([row1, row2])
        .mockResolvedValueOnce([]);

      prisma.staffProfile.update
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({ id: 'staff-ok' });

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      expect(prisma.staffProfile.update).toHaveBeenCalledTimes(2);
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should preserve progress from earlier batches when a later batch has DB errors', async () => {
      const prisma = buildMockPrisma();

      // Batch 1: succeeds
      const batch1 = [makeStripeRow({ id: 'stripe-batch1' })];
      // Batch 2: DB error on update
      const batch2 = [makeStripeRow({ id: 'stripe-batch2-fail' })];

      prisma.tenantStripeConfig.findMany
        .mockResolvedValueOnce(batch1)
        .mockResolvedValueOnce(batch2)
        .mockResolvedValueOnce([]);
      prisma.staffProfile.findMany.mockResolvedValue([]);

      prisma.tenantStripeConfig.update
        .mockResolvedValueOnce({ id: 'stripe-batch1' }) // Batch 1 succeeds
        .mockRejectedValueOnce(new Error('Deadlock detected')); // Batch 2 fails

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      // Both batches were attempted
      expect(prisma.tenantStripeConfig.update).toHaveBeenCalledTimes(2);
      // Job still completes (does not throw)
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should handle findMany throwing during stripe rotation', async () => {
      const prisma = buildMockPrisma();
      prisma.tenantStripeConfig.findMany.mockRejectedValueOnce(
        new Error('Connection refused'),
      );

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      // This should throw because the error is outside the per-record try/catch
      await expect(processor.process(job)).rejects.toThrow('Connection refused');
    });

    it('should handle findMany throwing during staff rotation', async () => {
      const prisma = buildMockPrisma();
      prisma.tenantStripeConfig.findMany.mockResolvedValue([]);
      prisma.staffProfile.findMany.mockRejectedValueOnce(
        new Error('Connection refused'),
      );

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await expect(processor.process(job)).rejects.toThrow('Connection refused');
    });
  });

  // ─── SELECT shape ─────────────────────────────────────────────────────────

  describe('SELECT shape', () => {
    it('should select only necessary stripe config columns', async () => {
      const prisma = buildMockPrisma();
      prisma.tenantStripeConfig.findMany.mockResolvedValue([]);
      prisma.staffProfile.findMany.mockResolvedValue([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      expect(prisma.tenantStripeConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            id: true,
            stripe_secret_key_encrypted: true,
            stripe_webhook_secret_encrypted: true,
            encryption_key_ref: true,
          },
        }),
      );
    });

    it('should select only necessary staff profile columns', async () => {
      const prisma = buildMockPrisma();
      prisma.tenantStripeConfig.findMany.mockResolvedValue([]);
      prisma.staffProfile.findMany.mockResolvedValue([]);

      const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
      const job = buildJob(KEY_ROTATION_JOB);

      await processor.process(job);

      expect(prisma.staffProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            id: true,
            bank_account_number_encrypted: true,
            bank_iban_encrypted: true,
            bank_encryption_key_ref: true,
          },
        }),
      );
    });
  });
});
