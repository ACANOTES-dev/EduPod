import { createHash, createHmac, randomBytes } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
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
    // `tenant_settings` has FORCE ROW LEVEL SECURITY. Both the read and the
    // write must run with `app.current_tenant_id` pinned — otherwise findUnique
    // silently returns null (policy's USING clause hides the row) and the
    // subsequent update fires WITH CHECK against an empty GUC, which raises
    // `invalid input syntax for type uuid: ""` (W-S7-004). Bundle read+write
    // into a single RLS transaction so we also get atomic create-on-miss under
    // concurrency.
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const { encryptedFound, keyRefFound } = await rlsClient.$transaction(async (tx) => {
      const record = await tx.tenantSetting.findUnique({
        where: { tenant_id: tenantId },
      });

      const settings = (record?.settings as Record<string, unknown>) ?? {};
      const wellbeing = (settings['staff_wellbeing'] as Record<string, unknown>) ?? {};

      const existingEncrypted = wellbeing['hmac_secret_encrypted'] as string | undefined;
      const existingKeyRef = wellbeing['hmac_key_ref'] as string | undefined;

      if (existingEncrypted && existingKeyRef) {
        return { encryptedFound: existingEncrypted, keyRefFound: existingKeyRef };
      }

      // Generate and persist a new secret inside the same RLS transaction.
      const secret = randomBytes(32).toString('hex');
      const { encrypted, keyRef } = this.encryption.encrypt(secret);

      const updatedWellbeing = {
        ...wellbeing,
        hmac_secret_encrypted: encrypted,
        hmac_key_ref: keyRef,
      };

      const updatedSettings = {
        ...settings,
        staff_wellbeing: updatedWellbeing,
      };

      await tx.tenantSetting.update({
        where: { tenant_id: tenantId },
        data: { settings: updatedSettings },
      });

      return { encryptedFound: encrypted, keyRefFound: keyRef };
    });

    return this.encryption.decrypt(encryptedFound, keyRefFound);
  }

  /**
   * Compute a participation token hash for a user + survey.
   * 1. token = HMAC-SHA256(surveyId + userId, tenantHmacSecret)
   * 2. tokenHash = SHA256(token)
   * Returns the tokenHash (hex string, 64 chars).
   */
  async computeTokenHash(tenantId: string, surveyId: string, userId: string): Promise<string> {
    const secret = await this.getOrCreateHmacSecret(tenantId);

    const hmacResult = createHmac('sha256', secret)
      .update(surveyId + userId)
      .digest();

    return createHash('sha256').update(hmacResult).digest('hex');
  }
}
