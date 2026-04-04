/**
 * Encryption key rotation script.
 *
 * Re-encrypts all encrypted fields from old key versions to the current version.
 *
 * Usage:
 *   npx tsx scripts/rotate-encryption-key.ts              # Execute rotation
 *   npx tsx scripts/rotate-encryption-key.ts --dry-run    # Report counts only
 *
 * Encrypted field types:
 *   1. Stripe configs (tenant_stripe_configs) — secret key + webhook secret
 *   2. Staff bank details (staff_profiles) — account number + IBAN
 *   3. MFA TOTP secrets (users) — mfa_secret
 *
 * Required env vars:
 *   DATABASE_URL                — Prisma connection string
 *   ENCRYPTION_KEY_V1           — 64 hex chars (32 bytes), required
 *   ENCRYPTION_KEY_V{N}         — additional versioned keys as needed
 *   ENCRYPTION_CURRENT_VERSION  — target version (default: 1)
 *
 * See docs/operations/key-rotation-runbook.md for the full procedure.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

import { PrismaClient } from '@prisma/client';

// ─── Types ──────────────────────────────────────────────────────────────────

interface RotationStats {
  total: number;
  rotated: number;
  skipped: number;
  failed: number;
}

interface RotationResult {
  stripeConfigs: RotationStats;
  staffProfiles: RotationStats;
  mfaSecrets: RotationStats;
  dryRun: boolean;
}

// ─── Key loading ────────────────────────────────────────────────────────────

function loadKeys(): Map<number, Buffer> {
  const keys = new Map<number, Buffer>();

  for (let v = 1; v <= 100; v++) {
    const hex = process.env[`ENCRYPTION_KEY_V${v}`];
    if (!hex) break;
    const buf = Buffer.from(hex, 'hex');
    if (buf.length !== 32) {
      throw new Error(`ENCRYPTION_KEY_V${v} must be 32 bytes (64 hex chars), got ${buf.length}.`);
    }
    keys.set(v, buf);
  }

  // Legacy fallback for v1
  if (!keys.has(1)) {
    const legacyHex = process.env['ENCRYPTION_KEY'] ?? process.env['ENCRYPTION_KEY_LOCAL'];
    if (legacyHex) {
      const buf = Buffer.from(legacyHex, 'hex');
      if (buf.length !== 32) {
        throw new Error('Legacy ENCRYPTION_KEY must be 32 bytes (64 hex chars).');
      }
      keys.set(1, buf);
    }
  }

  if (keys.size === 0) {
    throw new Error(
      'No encryption keys configured. Set ENCRYPTION_KEY_V1 (or legacy ENCRYPTION_KEY) env var.',
    );
  }

  return keys;
}

// ─── Encryption helpers ─────────────────────────────────────────────────────

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(ciphertext: string, key: Buffer): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error(
      `Invalid ciphertext format — expected 3 colon-separated parts, got ${parts.length}`,
    );
  }

  const iv = Buffer.from(parts[0] as string, 'hex');
  const authTag = Buffer.from(parts[1] as string, 'hex');
  const encrypted = Buffer.from(parts[2] as string, 'hex');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function keyRefToVersion(keyRef: string): number {
  const versionMatch = /^v(\d+)$/.exec(keyRef);
  if (versionMatch) {
    return parseInt(versionMatch[1] as string, 10);
  }
  if (keyRef === 'aws' || keyRef === 'local') {
    return 1;
  }
  console.warn(`  [warn] Unknown keyRef "${keyRef}" — falling back to v1`);
  return 1;
}

// ─── Rotation logic ─────────────────────────────────────────────────────────

const BATCH_SIZE = 50;

async function rotateStripeConfigs(
  prisma: PrismaClient,
  keys: Map<number, Buffer>,
  currentVersion: number,
  currentKeyRef: string,
  dryRun: boolean,
): Promise<RotationStats> {
  const stats: RotationStats = { total: 0, rotated: 0, skipped: 0, failed: 0 };
  let offset = 0;

  for (;;) {
    const rows = await prisma.tenantStripeConfig.findMany({
      where: { encryption_key_ref: { not: currentKeyRef } },
      select: {
        id: true,
        stripe_secret_key_encrypted: true,
        stripe_webhook_secret_encrypted: true,
        encryption_key_ref: true,
      },
      take: BATCH_SIZE,
      skip: offset,
    });

    if (rows.length === 0) break;
    stats.total += rows.length;

    for (const row of rows) {
      try {
        const oldVersion = keyRefToVersion(row.encryption_key_ref);
        const oldKey = keys.get(oldVersion);

        if (!oldKey) {
          console.warn(`  [stripe] Skipping ${row.id}: key v${oldVersion} not available`);
          stats.skipped++;
          continue;
        }

        const currentKey = keys.get(currentVersion) as Buffer;
        const secretKey = decrypt(row.stripe_secret_key_encrypted, oldKey);
        const webhookSecret = decrypt(row.stripe_webhook_secret_encrypted, oldKey);
        const newSecretKey = encrypt(secretKey, currentKey);
        const newWebhookSecret = encrypt(webhookSecret, currentKey);

        if (!dryRun) {
          await prisma.tenantStripeConfig.update({
            where: { id: row.id },
            data: {
              stripe_secret_key_encrypted: newSecretKey,
              stripe_webhook_secret_encrypted: newWebhookSecret,
              encryption_key_ref: currentKeyRef,
              key_last_rotated_at: new Date(),
            },
          });
        }

        stats.rotated++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  [stripe] FAILED ${row.id}: ${message}`);
        stats.failed++;
      }
    }

    if (dryRun) {
      offset += BATCH_SIZE;
    }
  }

  return stats;
}

async function rotateStaffBankDetails(
  prisma: PrismaClient,
  keys: Map<number, Buffer>,
  currentVersion: number,
  currentKeyRef: string,
  dryRun: boolean,
): Promise<RotationStats> {
  const stats: RotationStats = { total: 0, rotated: 0, skipped: 0, failed: 0 };
  let offset = 0;

  for (;;) {
    const rows = await prisma.staffProfile.findMany({
      where: {
        bank_encryption_key_ref: { not: null },
        NOT: { bank_encryption_key_ref: currentKeyRef },
      },
      select: {
        id: true,
        bank_account_number_encrypted: true,
        bank_iban_encrypted: true,
        bank_encryption_key_ref: true,
      },
      take: BATCH_SIZE,
      skip: offset,
    });

    if (rows.length === 0) break;
    stats.total += rows.length;

    for (const row of rows) {
      const keyRef = row.bank_encryption_key_ref as string;

      try {
        const oldVersion = keyRefToVersion(keyRef);
        const oldKey = keys.get(oldVersion);

        if (!oldKey) {
          console.warn(`  [bank] Skipping ${row.id}: key v${oldVersion} not available`);
          stats.skipped++;
          continue;
        }

        const currentKey = keys.get(currentVersion) as Buffer;
        const updateData: Record<string, string | Date> = {
          bank_encryption_key_ref: currentKeyRef,
        };

        if (row.bank_account_number_encrypted) {
          const plain = decrypt(row.bank_account_number_encrypted, oldKey);
          updateData['bank_account_number_encrypted'] = encrypt(plain, currentKey);
        }

        if (row.bank_iban_encrypted) {
          const plain = decrypt(row.bank_iban_encrypted, oldKey);
          updateData['bank_iban_encrypted'] = encrypt(plain, currentKey);
        }

        if (!row.bank_account_number_encrypted && !row.bank_iban_encrypted) {
          stats.skipped++;
          continue;
        }

        if (!dryRun) {
          await prisma.staffProfile.update({
            where: { id: row.id },
            data: updateData,
          });
        }

        stats.rotated++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  [bank] FAILED ${row.id}: ${message}`);
        stats.failed++;
      }
    }

    if (dryRun) {
      offset += BATCH_SIZE;
    }
  }

  return stats;
}

async function rotateMfaSecrets(
  prisma: PrismaClient,
  keys: Map<number, Buffer>,
  currentVersion: number,
  currentKeyRef: string,
  dryRun: boolean,
): Promise<RotationStats> {
  const stats: RotationStats = { total: 0, rotated: 0, skipped: 0, failed: 0 };
  let offset = 0;

  for (;;) {
    const rows = await prisma.user.findMany({
      where: {
        mfa_secret: { not: null },
        mfa_secret_key_ref: { not: null },
        NOT: { mfa_secret_key_ref: currentKeyRef },
      },
      select: {
        id: true,
        mfa_secret: true,
        mfa_secret_key_ref: true,
      },
      take: BATCH_SIZE,
      skip: offset,
    });

    if (rows.length === 0) break;
    stats.total += rows.length;

    for (const row of rows) {
      const keyRef = row.mfa_secret_key_ref as string;
      const mfaSecret = row.mfa_secret as string;

      try {
        const oldVersion = keyRefToVersion(keyRef);
        const oldKey = keys.get(oldVersion);

        if (!oldKey) {
          console.warn(`  [mfa] Skipping ${row.id}: key v${oldVersion} not available`);
          stats.skipped++;
          continue;
        }

        const currentKey = keys.get(currentVersion) as Buffer;
        const plaintext = decrypt(mfaSecret, oldKey);
        const newEncrypted = encrypt(plaintext, currentKey);

        if (!dryRun) {
          await prisma.user.update({
            where: { id: row.id },
            data: {
              mfa_secret: newEncrypted,
              mfa_secret_key_ref: currentKeyRef,
            },
          });
        }

        stats.rotated++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  [mfa] FAILED ${row.id}: ${message}`);
        stats.failed++;
      }
    }

    if (dryRun) {
      offset += BATCH_SIZE;
    }
  }

  return stats;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function printStats(label: string, stats: RotationStats): void {
  console.log(
    `  ${label}: total=${stats.total} rotated=${stats.rotated} skipped=${stats.skipped} failed=${stats.failed}`,
  );
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const keys = loadKeys();
  const currentVersion = parseInt(process.env['ENCRYPTION_CURRENT_VERSION'] ?? '1', 10);
  const currentKeyRef = `v${currentVersion}`;

  if (!keys.has(currentVersion)) {
    throw new Error(
      `Current encryption key version ${currentVersion} not available. ` +
        `Set ENCRYPTION_KEY_V${currentVersion} env var.`,
    );
  }

  console.log(
    `Encryption key rotation — target: ${currentKeyRef} (${dryRun ? 'DRY RUN' : 'LIVE'})`,
  );
  console.log(
    `Loaded ${keys.size} key version(s): ${Array.from(keys.keys())
      .map((v) => `v${v}`)
      .join(', ')}`,
  );
  console.log('');

  const prisma = new PrismaClient();

  try {
    const result: RotationResult = {
      stripeConfigs: { total: 0, rotated: 0, skipped: 0, failed: 0 },
      staffProfiles: { total: 0, rotated: 0, skipped: 0, failed: 0 },
      mfaSecrets: { total: 0, rotated: 0, skipped: 0, failed: 0 },
      dryRun,
    };

    console.log('Rotating Stripe configs...');
    result.stripeConfigs = await rotateStripeConfigs(
      prisma,
      keys,
      currentVersion,
      currentKeyRef,
      dryRun,
    );
    printStats('Stripe', result.stripeConfigs);

    console.log('Rotating staff bank details...');
    result.staffProfiles = await rotateStaffBankDetails(
      prisma,
      keys,
      currentVersion,
      currentKeyRef,
      dryRun,
    );
    printStats('Bank', result.staffProfiles);

    console.log('Rotating MFA secrets...');
    result.mfaSecrets = await rotateMfaSecrets(prisma, keys, currentVersion, currentKeyRef, dryRun);
    printStats('MFA', result.mfaSecrets);

    console.log('');

    const totalFailed =
      result.stripeConfigs.failed + result.staffProfiles.failed + result.mfaSecrets.failed;
    const totalRotated =
      result.stripeConfigs.rotated + result.staffProfiles.rotated + result.mfaSecrets.rotated;

    if (dryRun) {
      console.log(`DRY RUN complete. ${totalRotated} record(s) would be rotated.`);
    } else {
      console.log(`Rotation complete. ${totalRotated} record(s) rotated.`);
    }

    if (totalFailed > 0) {
      console.error(`WARNING: ${totalFailed} record(s) failed. Review errors above.`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Key rotation script failed:', err);
  process.exitCode = 1;
});
