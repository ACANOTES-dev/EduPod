import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { EncryptionService } from './encryption.service';

// ─── Types ──────────────────────────────────────────────────────────────────

interface RotationStats {
  total: number;
  rotated: number;
  skipped: number;
  failed: number;
}

interface KeyRotationResult {
  stripeConfigs: RotationStats;
  staffProfiles: RotationStats;
  dryRun: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const BATCH_SIZE = 50;

@Injectable()
export class KeyRotationService {
  private readonly logger = new Logger(KeyRotationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  /**
   * Re-encrypt all records from old key versions to the current version.
   * When dryRun is true, records are counted but not updated.
   */
  async rotateAll(dryRun = false): Promise<KeyRotationResult> {
    const currentKeyRef = this.encryption.getKeyRef();

    const results: KeyRotationResult = {
      stripeConfigs: { total: 0, rotated: 0, skipped: 0, failed: 0 },
      staffProfiles: { total: 0, rotated: 0, skipped: 0, failed: 0 },
      dryRun,
    };

    this.logger.log(
      `Starting key rotation to ${currentKeyRef} (dryRun: ${dryRun})`,
    );

    await this.rotateStripeConfigs(currentKeyRef, dryRun, results.stripeConfigs);
    await this.rotateStaffBankDetails(currentKeyRef, dryRun, results.staffProfiles);

    this.logger.log(
      `Key rotation complete. Stripe: ${results.stripeConfigs.rotated}/${results.stripeConfigs.total} rotated. ` +
        `Staff: ${results.staffProfiles.rotated}/${results.staffProfiles.total} rotated. ` +
        `Failed: ${results.stripeConfigs.failed + results.staffProfiles.failed}.`,
    );

    return results;
  }

  // ─── Stripe Configs ─────────────────────────────────────────────────────

  private async rotateStripeConfigs(
    currentKeyRef: string,
    dryRun: boolean,
    stats: RotationStats,
  ): Promise<void> {
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const batch = await this.prisma.tenantStripeConfig.findMany({
        where: {
          encryption_key_ref: { not: currentKeyRef },
        },
        take: BATCH_SIZE,
        skip,
      });

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      stats.total += batch.length;

      for (const record of batch) {
        try {
          const oldKeyRef = record.encryption_key_ref;

          const secretKey = this.encryption.decrypt(
            record.stripe_secret_key_encrypted,
            oldKeyRef,
          );
          const webhookSecret = this.encryption.decrypt(
            record.stripe_webhook_secret_encrypted,
            oldKeyRef,
          );

          const newSecretKey = this.encryption.encrypt(secretKey);
          const newWebhookSecret = this.encryption.encrypt(webhookSecret);

          if (!dryRun) {
            await this.prisma.tenantStripeConfig.update({
              where: { id: record.id },
              data: {
                stripe_secret_key_encrypted: newSecretKey.encrypted,
                stripe_webhook_secret_encrypted: newWebhookSecret.encrypted,
                encryption_key_ref: currentKeyRef,
                key_last_rotated_at: new Date(),
              },
            });
          }

          stats.rotated++;
        } catch (error: unknown) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error(
            `Failed to rotate stripe config ${record.id}: ${err.message}`,
            err.stack,
          );
          stats.failed++;
        }
      }

      this.logger.log(
        `Stripe configs batch: processed ${stats.total} records (rotated: ${stats.rotated}, failed: ${stats.failed})`,
      );

      hasMore = batch.length >= BATCH_SIZE;
      skip += BATCH_SIZE;
    }
  }

  // ─── Staff Bank Details ─────────────────────────────────────────────────

  private async rotateStaffBankDetails(
    currentKeyRef: string,
    dryRun: boolean,
    stats: RotationStats,
  ): Promise<void> {
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const batch = await this.prisma.staffProfile.findMany({
        where: {
          bank_encryption_key_ref: {
            not: currentKeyRef,
          },
          NOT: {
            bank_encryption_key_ref: null,
          },
        },
        take: BATCH_SIZE,
        skip,
      });

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      stats.total += batch.length;

      for (const record of batch) {
        try {
          const oldKeyRef = record.bank_encryption_key_ref as string;

          const updateData: Record<string, string | Date> = {
            bank_encryption_key_ref: currentKeyRef,
          };

          // Re-encrypt bank account number if present
          if (record.bank_account_number_encrypted) {
            const accountNumber = this.encryption.decrypt(
              record.bank_account_number_encrypted,
              oldKeyRef,
            );
            const newAccountNumber = this.encryption.encrypt(accountNumber);
            updateData['bank_account_number_encrypted'] = newAccountNumber.encrypted;
          }

          // Re-encrypt bank IBAN if present
          if (record.bank_iban_encrypted) {
            const iban = this.encryption.decrypt(record.bank_iban_encrypted, oldKeyRef);
            const newIban = this.encryption.encrypt(iban);
            updateData['bank_iban_encrypted'] = newIban.encrypted;
          }

          // Skip if there are no encrypted fields to rotate
          if (
            !record.bank_account_number_encrypted &&
            !record.bank_iban_encrypted
          ) {
            stats.skipped++;
            continue;
          }

          if (!dryRun) {
            await this.prisma.staffProfile.update({
              where: { id: record.id },
              data: updateData,
            });
          }

          stats.rotated++;
        } catch (error: unknown) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error(
            `Failed to rotate staff profile ${record.id}: ${err.message}`,
            err.stack,
          );
          stats.failed++;
        }
      }

      this.logger.log(
        `Staff profiles batch: processed ${stats.total} records (rotated: ${stats.rotated}, failed: ${stats.failed})`,
      );

      hasMore = batch.length >= BATCH_SIZE;
      skip += BATCH_SIZE;
    }
  }
}
