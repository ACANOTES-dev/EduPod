import { Injectable, NotFoundException } from '@nestjs/common';

import type { UpsertStripeConfigDto } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

import { EncryptionService } from './encryption.service';

export interface MaskedStripeConfig {
  id: string;
  tenant_id: string;
  stripe_secret_key_masked: string;
  stripe_publishable_key_masked: string;
  stripe_webhook_secret_masked: string;
  encryption_key_ref: string;
  key_last_rotated_at: Date | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class StripeConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  /**
   * Get Stripe config for a tenant with masked secret values.
   */
  async getConfig(tenantId: string): Promise<MaskedStripeConfig> {
    const config = await this.prisma.tenantStripeConfig.findUnique({
      where: { tenant_id: tenantId },
    });

    if (!config) {
      throw new NotFoundException({
        code: 'STRIPE_CONFIG_NOT_FOUND',
        message: 'Stripe configuration not found for this tenant',
      });
    }

    // Decrypt to get last 4 chars for masking
    const decryptedSecret = this.encryption.decrypt(
      config.stripe_secret_key_encrypted,
      config.encryption_key_ref,
    );
    const decryptedWebhook = this.encryption.decrypt(
      config.stripe_webhook_secret_encrypted,
      config.encryption_key_ref,
    );

    return {
      id: config.id,
      tenant_id: config.tenant_id,
      stripe_secret_key_masked: this.encryption.mask(decryptedSecret),
      stripe_publishable_key_masked: this.encryption.mask(config.stripe_publishable_key),
      stripe_webhook_secret_masked: this.encryption.mask(decryptedWebhook),
      encryption_key_ref: config.encryption_key_ref,
      key_last_rotated_at: config.key_last_rotated_at,
      created_by_user_id: config.created_by_user_id,
      created_at: config.created_at,
      updated_at: config.updated_at,
    };
  }

  /**
   * Create or update Stripe config for a tenant.
   * Encrypts secret key and webhook secret before storage.
   */
  async upsertConfig(tenantId: string, userId: string, data: UpsertStripeConfigDto) {
    const { encrypted: secretKeyEncrypted, keyRef } = this.encryption.encrypt(
      data.stripe_secret_key,
    );
    const { encrypted: webhookSecretEncrypted } = this.encryption.encrypt(
      data.stripe_webhook_secret,
    );

    const config = await this.prisma.tenantStripeConfig.upsert({
      where: { tenant_id: tenantId },
      update: {
        stripe_secret_key_encrypted: secretKeyEncrypted,
        stripe_publishable_key: data.stripe_publishable_key,
        stripe_webhook_secret_encrypted: webhookSecretEncrypted,
        encryption_key_ref: keyRef,
        key_last_rotated_at: new Date(),
      },
      create: {
        tenant_id: tenantId,
        stripe_secret_key_encrypted: secretKeyEncrypted,
        stripe_publishable_key: data.stripe_publishable_key,
        stripe_webhook_secret_encrypted: webhookSecretEncrypted,
        encryption_key_ref: keyRef,
        created_by_user_id: userId,
      },
    });

    // Return masked version
    return {
      id: config.id,
      tenant_id: config.tenant_id,
      stripe_secret_key_masked: this.encryption.mask(data.stripe_secret_key),
      stripe_publishable_key_masked: this.encryption.mask(data.stripe_publishable_key),
      stripe_webhook_secret_masked: this.encryption.mask(data.stripe_webhook_secret),
      encryption_key_ref: config.encryption_key_ref,
      key_last_rotated_at: config.key_last_rotated_at,
      created_by_user_id: config.created_by_user_id,
      created_at: config.created_at,
      updated_at: config.updated_at,
    };
  }
}
