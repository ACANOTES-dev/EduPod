import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

export const KEY_ROTATION_JOB = 'security:key-rotation';

// ─── Payload & Result types ───────────────────────────────────────────────────

interface KeyRotationPayload {
  dry_run?: boolean;
}

interface RotationStats {
  total: number;
  rotated: number;
  skipped: number;
  failed: number;
}

// ─── Internal row shapes returned from Prisma queries ────────────────────────

interface StripeConfigRow {
  id: string;
  stripe_secret_key_encrypted: string;
  stripe_webhook_secret_encrypted: string;
  encryption_key_ref: string;
}

interface StaffProfileRow {
  id: string;
  bank_account_number_encrypted: string | null;
  bank_iban_encrypted: string | null;
  bank_encryption_key_ref: string | null;
}

// ─── Processor ────────────────────────────────────────────────────────────────

/**
 * Rotates all encryption keys for tenant_stripe_configs and staff_profiles.
 * This is a cross-tenant operation — it does NOT use TenantAwareJob or RLS context,
 * because it must iterate all tenants' encrypted records in one pass.
 *
 * Triggered manually via an admin API endpoint, not on a cron schedule.
 */
@Processor(QUEUE_NAMES.SECURITY)
export class KeyRotationProcessor extends WorkerHost {
  private readonly logger = new Logger(KeyRotationProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<KeyRotationPayload>): Promise<void> {
    if (job.name !== KEY_ROTATION_JOB) return;

    const dryRun = job.data.dry_run ?? false;
    this.logger.log(`Starting key rotation (dryRun=${dryRun})`);

    const keys = this.loadKeys();
    const currentVersion = parseInt(process.env['ENCRYPTION_CURRENT_VERSION'] ?? '1', 10);
    const currentKeyRef = `v${currentVersion}`;

    if (!keys.has(currentVersion)) {
      throw new Error(
        `Key rotation aborted: current encryption key version ${currentVersion} not available in environment.`,
      );
    }

    const stripeStats = await this.rotateStripeConfigs(keys, currentVersion, currentKeyRef, dryRun);
    const bankStats = await this.rotateStaffBankDetails(keys, currentVersion, currentKeyRef, dryRun);

    await job.updateProgress(100);

    this.logger.log(
      `Key rotation complete. ` +
        `Stripe: total=${stripeStats.total} rotated=${stripeStats.rotated} skipped=${stripeStats.skipped} failed=${stripeStats.failed}. ` +
        `Bank: total=${bankStats.total} rotated=${bankStats.rotated} skipped=${bankStats.skipped} failed=${bankStats.failed}.`,
    );
  }

  // ─── Stripe config rotation ──────────────────────────────────────────────

  private async rotateStripeConfigs(
    keys: Map<number, Buffer>,
    currentVersion: number,
    currentKeyRef: string,
    dryRun: boolean,
  ): Promise<RotationStats> {
    const stats: RotationStats = { total: 0, rotated: 0, skipped: 0, failed: 0 };
    const batchSize = 50;
    // In non-dry-run mode, updated records drop out of the WHERE clause, so we
    // always query from offset 0 — the next batch automatically contains the next
    // unprocessed records. In dry-run mode, records are never updated and would
    // loop infinitely at offset 0, so we increment offset only for dry runs.
    let offset = 0;

    for (;;) {
      const rows = await this.prisma.tenantStripeConfig.findMany({
        where: { encryption_key_ref: { not: currentKeyRef } },
        select: {
          id: true,
          stripe_secret_key_encrypted: true,
          stripe_webhook_secret_encrypted: true,
          encryption_key_ref: true,
        },
        take: batchSize,
        skip: offset,
      });

      if (rows.length === 0) break;

      stats.total += rows.length;
      const batchRows = rows as StripeConfigRow[];

      for (const row of batchRows) {
        try {
          const oldVersion = this.keyRefToVersion(row.encryption_key_ref);
          const oldKey = keys.get(oldVersion);

          if (!oldKey) {
            this.logger.warn(
              `[stripe] Skipping record ${row.id}: key for ref "${row.encryption_key_ref}" (v${oldVersion}) not in environment.`,
            );
            stats.skipped++;
            continue;
          }

          const secretKey = this.decrypt(row.stripe_secret_key_encrypted, oldKey);
          const webhookSecret = this.decrypt(row.stripe_webhook_secret_encrypted, oldKey);

          const currentKey = keys.get(currentVersion) as Buffer;
          const newSecretKeyEncrypted = this.encrypt(secretKey, currentKey);
          const newWebhookSecretEncrypted = this.encrypt(webhookSecret, currentKey);

          if (!dryRun) {
            await this.prisma.tenantStripeConfig.update({
              where: { id: row.id },
              data: {
                stripe_secret_key_encrypted: newSecretKeyEncrypted,
                stripe_webhook_secret_encrypted: newWebhookSecretEncrypted,
                encryption_key_ref: currentKeyRef,
                key_last_rotated_at: new Date(),
              },
            });
          }

          stats.rotated++;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(`[stripe] Failed to rotate record ${row.id}: ${message}`);
          stats.failed++;
        }
      }

      if (dryRun) {
        offset += batchSize;
      }
    }

    return stats;
  }

  // ─── Staff bank details rotation ─────────────────────────────────────────

  private async rotateStaffBankDetails(
    keys: Map<number, Buffer>,
    currentVersion: number,
    currentKeyRef: string,
    dryRun: boolean,
  ): Promise<RotationStats> {
    const stats: RotationStats = { total: 0, rotated: 0, skipped: 0, failed: 0 };
    const batchSize = 50;
    // In non-dry-run mode, updated records drop out of the WHERE clause, so we
    // always query from offset 0 — the next batch automatically contains the next
    // unprocessed records. In dry-run mode, records are never updated and would
    // loop infinitely at offset 0, so we increment offset only for dry runs.
    let offset = 0;

    for (;;) {
      const rows = await this.prisma.staffProfile.findMany({
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
        take: batchSize,
        skip: offset,
      });

      if (rows.length === 0) break;

      stats.total += rows.length;
      const batchRows = rows as StaffProfileRow[];

      for (const row of batchRows) {
        // bank_encryption_key_ref is non-null here (WHERE filters nulls out)
        const keyRef = row.bank_encryption_key_ref as string;

        try {
          const oldVersion = this.keyRefToVersion(keyRef);
          const oldKey = keys.get(oldVersion);

          if (!oldKey) {
            this.logger.warn(
              `[bank] Skipping record ${row.id}: key for ref "${keyRef}" (v${oldVersion}) not in environment.`,
            );
            stats.skipped++;
            continue;
          }

          const currentKey = keys.get(currentVersion) as Buffer;

          let newAccountNumberEncrypted: string | null = null;
          let newIbanEncrypted: string | null = null;

          if (row.bank_account_number_encrypted !== null) {
            const plain = this.decrypt(row.bank_account_number_encrypted, oldKey);
            newAccountNumberEncrypted = this.encrypt(plain, currentKey);
          }

          if (row.bank_iban_encrypted !== null) {
            const plain = this.decrypt(row.bank_iban_encrypted, oldKey);
            newIbanEncrypted = this.encrypt(plain, currentKey);
          }

          if (!dryRun) {
            // Build update data dynamically — only include fields that were
            // originally non-null to avoid writing explicit nulls for missing fields.
            const updateData: Record<string, string | null> = {
              bank_encryption_key_ref: currentKeyRef,
            };
            if (newAccountNumberEncrypted !== null) {
              updateData['bank_account_number_encrypted'] = newAccountNumberEncrypted;
            }
            if (newIbanEncrypted !== null) {
              updateData['bank_iban_encrypted'] = newIbanEncrypted;
            }
            await this.prisma.staffProfile.update({
              where: { id: row.id },
              data: updateData,
            });
          }

          stats.rotated++;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(`[bank] Failed to rotate record ${row.id}: ${message}`);
          stats.failed++;
        }
      }

      if (dryRun) {
        offset += batchSize;
      }
    }

    return stats;
  }

  // ─── Encryption helpers ───────────────────────────────────────────────────
  //
  // MAINTENANCE NOTE: These encrypt/decrypt methods duplicate the logic from
  // apps/api/src/modules/configuration/encryption.service.ts.
  // The worker cannot import the API's EncryptionService due to module boundaries.
  // If the encryption format (AES-256-GCM, iv:authTag:ciphertext hex) changes,
  // BOTH implementations must be updated in lockstep.
  //

  /**
   * AES-256-GCM encrypt. Returns format: {iv_hex}:{authTag_hex}:{ciphertext_hex}
   */
  private encrypt(plaintext: string, key: Buffer): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * AES-256-GCM decrypt. Expects format: {iv_hex}:{authTag_hex}:{ciphertext_hex}
   */
  private decrypt(ciphertext: string, key: Buffer): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error(`Invalid ciphertext format — expected 3 colon-separated parts, got ${parts.length}`);
    }

    const iv = Buffer.from(parts[0] as string, 'hex');
    const authTag = Buffer.from(parts[1] as string, 'hex');
    const encrypted = Buffer.from(parts[2] as string, 'hex');

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  // ─── Key loading ──────────────────────────────────────────────────────────

  /**
   * Load versioned encryption keys from environment variables.
   * ENCRYPTION_KEY_V1, ENCRYPTION_KEY_V2, ... are primary.
   * ENCRYPTION_KEY / ENCRYPTION_KEY_LOCAL are legacy fallbacks for v1.
   */
  private loadKeys(): Map<number, Buffer> {
    const keys = new Map<number, Buffer>();

    for (let v = 1; v <= 100; v++) {
      const hex = process.env[`ENCRYPTION_KEY_V${v}`];
      if (!hex) break;
      const buf = Buffer.from(hex, 'hex');
      if (buf.length !== 32) {
        throw new Error(
          `ENCRYPTION_KEY_V${v} must be 32 bytes (64 hex chars), got ${buf.length}.`,
        );
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

  // ─── Key reference resolution ─────────────────────────────────────────────

  /**
   * Convert a keyRef string to a numeric key version.
   * - 'v1', 'v2', ... → parsed integer
   * - 'aws', 'local' → 1 (legacy backward compat)
   * - Unknown → 1 with a warning
   */
  private keyRefToVersion(keyRef: string): number {
    const versionMatch = /^v(\d+)$/.exec(keyRef);
    if (versionMatch) {
      return parseInt(versionMatch[1] as string, 10);
    }

    if (keyRef === 'aws' || keyRef === 'local') {
      return 1;
    }

    this.logger.warn(`Unknown keyRef "${keyRef}" — falling back to v1`);
    return 1;
  }
}
