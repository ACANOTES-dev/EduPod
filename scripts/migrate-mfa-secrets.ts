/**
 * One-time migration script: Encrypt existing plaintext MFA TOTP secrets.
 *
 * Run with: npx tsx scripts/migrate-mfa-secrets.ts
 *
 * This script:
 * 1. Connects to the database using Prisma
 * 2. Finds all users where mfa_secret IS NOT NULL AND mfa_secret_key_ref IS NULL
 *    (i.e. plaintext secrets that have not yet been encrypted)
 * 3. Encrypts each secret using AES-256-GCM via the same logic as EncryptionService
 * 4. Updates both mfa_secret (encrypted value) and mfa_secret_key_ref (key version)
 *
 * Safe to run multiple times — skips already-encrypted secrets (those with mfa_secret_key_ref).
 *
 * Required env vars:
 *   DATABASE_URL          — Prisma connection string
 *   ENCRYPTION_KEY_V1     — 64 hex chars (32 bytes) AES-256 key (or ENCRYPTION_KEY / ENCRYPTION_KEY_LOCAL)
 */

import { createCipheriv, randomBytes } from 'crypto';

import { PrismaClient } from '@prisma/client';

// ─── Encryption setup ──────────────────────────────────────────────────────────

function loadEncryptionKey(): { key: Buffer; version: number } {
  // Try versioned keys first
  for (let v = 1; v <= 100; v++) {
    const hex = process.env[`ENCRYPTION_KEY_V${v}`];
    if (!hex) break;
    const buf = Buffer.from(hex, 'hex');
    if (buf.length !== 32) {
      throw new Error(
        `ENCRYPTION_KEY_V${v} must be 32 bytes (64 hex characters), got ${buf.length}.`,
      );
    }
    // Use the current version (highest available or from ENCRYPTION_CURRENT_VERSION)
    const currentVersionStr = process.env['ENCRYPTION_CURRENT_VERSION'];
    const currentVersion = currentVersionStr ? parseInt(currentVersionStr, 10) : 1;
    if (v === currentVersion) {
      return { key: buf, version: v };
    }
  }

  // Fall back to legacy env vars as v1
  const legacyHex = process.env['ENCRYPTION_KEY'] ?? process.env['ENCRYPTION_KEY_LOCAL'];
  if (legacyHex) {
    const buf = Buffer.from(legacyHex, 'hex');
    if (buf.length !== 32) {
      throw new Error('Encryption key must be 32 bytes (64 hex characters).');
    }
    return { key: buf, version: 1 };
  }

  // If no ENCRYPTION_CURRENT_VERSION, try v1 directly
  const v1Hex = process.env['ENCRYPTION_KEY_V1'];
  if (v1Hex) {
    const buf = Buffer.from(v1Hex, 'hex');
    if (buf.length !== 32) {
      throw new Error('ENCRYPTION_KEY_V1 must be 32 bytes (64 hex characters).');
    }
    return { key: buf, version: 1 };
  }

  throw new Error(
    'No encryption key configured. Set ENCRYPTION_KEY_V1 or ENCRYPTION_KEY env var (64 hex chars).',
  );
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

// ─── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { key, version } = loadEncryptionKey();
  const keyRef = `v${version}`;

  console.log(`Using encryption key version: ${keyRef}`);

  const prisma = new PrismaClient();

  try {
    // Find users with plaintext MFA secrets (no key_ref means not yet encrypted)
    const users = await prisma.user.findMany({
      where: {
        mfa_secret: { not: null },
        mfa_secret_key_ref: null,
      },
      select: {
        id: true,
        email: true,
        mfa_secret: true,
      },
    });

    console.log(`Found ${users.length} user(s) with plaintext MFA secrets to migrate.`);

    if (users.length === 0) {
      console.log('Nothing to do. All MFA secrets are already encrypted.');
      return;
    }

    let migrated = 0;
    let failed = 0;

    for (const user of users) {
      if (!user.mfa_secret) continue;

      try {
        const encryptedSecret = encrypt(user.mfa_secret, key);

        await prisma.user.update({
          where: { id: user.id },
          data: {
            mfa_secret: encryptedSecret,
            mfa_secret_key_ref: keyRef,
          },
        });

        migrated++;
        console.log(`  Migrated: ${user.email}`);
      } catch (err: unknown) {
        failed++;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  FAILED: ${user.email} — ${message}`);
      }
    }

    console.log(`\nMigration complete. Migrated: ${migrated}, Failed: ${failed}`);

    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Migration script failed:', err);
  process.exitCode = 1;
});
