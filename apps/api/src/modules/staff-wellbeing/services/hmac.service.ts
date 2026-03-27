import { createHash, createHmac, randomBytes } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';

import { EncryptionService } from '../../configuration/encryption.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HmacService {
  private readonly logger = new Logger(HmacService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  /**
   * Get or create the HMAC secret for a tenant.
   * If no secret exists, generate one (crypto.randomBytes(32).toString('hex')),
   * encrypt it, and store it in tenant_settings.
   * Returns the decrypted secret (in-memory only — never log or return in API responses).
   */
  async getOrCreateHmacSecret(tenantId: string): Promise<string> {
    const record = await this.prisma.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
    });

    const settings = (record?.settings as Record<string, unknown>) ?? {};
    const wellbeing =
      (settings['staff_wellbeing'] as Record<string, unknown>) ?? {};

    const existingEncrypted = wellbeing['hmac_secret_encrypted'] as
      | string
      | undefined;
    const existingKeyRef = wellbeing['hmac_key_ref'] as string | undefined;

    if (existingEncrypted && existingKeyRef) {
      return this.encryption.decrypt(existingEncrypted, existingKeyRef);
    }

    // Generate a new secret
    const secret = randomBytes(32).toString('hex');
    const { encrypted, keyRef } = this.encryption.encrypt(secret);

    // Store encrypted secret in tenant settings
    const updatedWellbeing = {
      ...wellbeing,
      hmac_secret_encrypted: encrypted,
      hmac_key_ref: keyRef,
    };

    const updatedSettings = {
      ...settings,
      staff_wellbeing: updatedWellbeing,
    };

    await this.prisma.tenantSetting.update({
      where: { tenant_id: tenantId },
      data: { settings: updatedSettings },
    });

    // Re-read from DB to ensure we have the winning write (idempotency under concurrency)
    const confirmRecord = await this.prisma.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
    });

    const confirmSettings =
      (confirmRecord?.settings as Record<string, unknown>) ?? {};
    const confirmWellbeing =
      (confirmSettings['staff_wellbeing'] as Record<string, unknown>) ?? {};
    const confirmedEncrypted = confirmWellbeing[
      'hmac_secret_encrypted'
    ] as string;
    const confirmedKeyRef = confirmWellbeing['hmac_key_ref'] as string;

    return this.encryption.decrypt(confirmedEncrypted, confirmedKeyRef);
  }

  /**
   * Compute a participation token hash for a user + survey.
   * 1. token = HMAC-SHA256(surveyId + userId, tenantHmacSecret)
   * 2. tokenHash = SHA256(token)
   * Returns the tokenHash (hex string, 64 chars).
   */
  async computeTokenHash(
    tenantId: string,
    surveyId: string,
    userId: string,
  ): Promise<string> {
    const secret = await this.getOrCreateHmacSecret(tenantId);

    const hmacResult = createHmac('sha256', secret)
      .update(surveyId + userId)
      .digest();

    return createHash('sha256').update(hmacResult).digest('hex');
  }
}
