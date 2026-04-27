import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type {
  DecryptedWhatsAppConfig,
  MaskedWhatsAppConfig,
  UpsertWhatsAppConfigDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { COMMS_CACHE_BUS, type CommsCacheBus } from './comms-cache-bus.stub';
import { EncryptionService } from './encryption.service';

@Injectable()
export class WhatsAppConfigService {
  private readonly logger = new Logger(WhatsAppConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    @Inject(COMMS_CACHE_BUS) private readonly cacheBus: CommsCacheBus,
  ) {}

  async getConfig(tenantId: string): Promise<MaskedWhatsAppConfig> {
    const config = await this.prisma.tenantWhatsAppConfig.findUnique({
      where: { tenant_id: tenantId },
    });
    if (!config) {
      throw new NotFoundException({
        code: 'WHATSAPP_CONFIG_NOT_FOUND',
        message: 'WhatsApp configuration not found for this tenant',
      });
    }
    return this.toMasked(config);
  }

  async upsertConfig(
    tenantId: string,
    userId: string,
    dto: UpsertWhatsAppConfigDto,
  ): Promise<MaskedWhatsAppConfig> {
    const { encrypted: sidEncrypted, keyRef } = this.encryption.encrypt(dto.twilio_account_sid);
    const { encrypted: tokenEncrypted } = this.encryption.encrypt(dto.twilio_auth_token);
    const { encrypted: webhookSecretEncrypted } = this.encryption.encrypt(dto.webhook_secret);

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
    const persisted = await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.tenantWhatsAppConfig.upsert({
        where: { tenant_id: tenantId },
        update: {
          twilio_account_sid_encrypted: sidEncrypted,
          twilio_auth_token_encrypted: tokenEncrypted,
          twilio_whatsapp_from_number: dto.twilio_whatsapp_from_number,
          business_profile_id: dto.business_profile_id ?? null,
          webhook_secret_encrypted: webhookSecretEncrypted,
          encryption_key_ref: keyRef,
          key_last_rotated_at: new Date(),
        },
        create: {
          tenant_id: tenantId,
          twilio_account_sid_encrypted: sidEncrypted,
          twilio_auth_token_encrypted: tokenEncrypted,
          twilio_whatsapp_from_number: dto.twilio_whatsapp_from_number,
          business_profile_id: dto.business_profile_id ?? null,
          webhook_secret_encrypted: webhookSecretEncrypted,
          encryption_key_ref: keyRef,
          is_enabled: true,
          created_by_user_id: userId,
        },
      });
    });

    await this.cacheBus.publishConfigChanged(tenantId, 'whatsapp');
    return this.composeMaskedFromDto(persisted, dto);
  }

  async deleteConfig(tenantId: string, userId: string): Promise<{ id: string }> {
    const existing = await this.prisma.tenantWhatsAppConfig.findUnique({
      where: { tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'WHATSAPP_CONFIG_NOT_FOUND',
        message: 'WhatsApp configuration not found for this tenant',
      });
    }

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
    await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      await txdb.tenantWhatsAppConfig.delete({ where: { id: existing.id } });
    });

    await this.cacheBus.publishConfigChanged(tenantId, 'whatsapp');
    this.logger.log(`WhatsApp config deleted for tenant ${tenantId}`);
    return { id: existing.id };
  }

  /**
   * Returns the decrypted webhook_secret for the tenant, or null if not
   * configured. Internal-only (Impl 06). Used by the per-tenant Twilio
   * WhatsApp webhook receiver for HMAC-SHA1 signature verification.
   */
  async getWebhookSecret(tenantId: string): Promise<string | null> {
    const row = await this.prisma.tenantWhatsAppConfig.findUnique({
      where: { tenant_id: tenantId },
      select: { webhook_secret_encrypted: true, encryption_key_ref: true },
    });
    if (!row?.webhook_secret_encrypted) return null;
    return this.encryption.decrypt(row.webhook_secret_encrypted, row.encryption_key_ref);
  }

  // INTERNAL ONLY — never exposed via controller.
  async getDecryptedConfig(tenantId: string): Promise<DecryptedWhatsAppConfig | null> {
    const config = await this.prisma.tenantWhatsAppConfig.findUnique({
      where: { tenant_id: tenantId },
    });
    if (!config) return null;

    return {
      id: config.id,
      tenant_id: config.tenant_id,
      twilio_account_sid: this.encryption.decrypt(
        config.twilio_account_sid_encrypted,
        config.encryption_key_ref,
      ),
      twilio_auth_token: this.encryption.decrypt(
        config.twilio_auth_token_encrypted,
        config.encryption_key_ref,
      ),
      twilio_whatsapp_from_number: config.twilio_whatsapp_from_number,
      business_profile_id: config.business_profile_id,
      webhook_secret: config.webhook_secret_encrypted
        ? this.encryption.decrypt(config.webhook_secret_encrypted, config.encryption_key_ref)
        : '',
      is_enabled: config.is_enabled,
      encryption_key_ref: config.encryption_key_ref,
    };
  }

  async verifyConfig(_tenantId: string, _recipient: string, _templateKey: string): Promise<never> {
    throw new NotFoundException({
      code: 'WHATSAPP_VERIFY_NOT_IMPLEMENTED',
      message: 'WhatsApp verify endpoint is implemented in Implementation 09',
    });
  }

  private toMasked(row: {
    id: string;
    tenant_id: string;
    twilio_account_sid_encrypted: string;
    twilio_auth_token_encrypted: string;
    twilio_whatsapp_from_number: string;
    business_profile_id: string | null;
    webhook_secret_encrypted: string | null;
    encryption_key_ref: string;
    key_last_rotated_at: Date | null;
    is_enabled: boolean;
    last_verified_at: Date | null;
    created_by_user_id: string | null;
    created_at: Date;
    updated_at: Date;
  }): MaskedWhatsAppConfig {
    const sid = this.encryption.decrypt(row.twilio_account_sid_encrypted, row.encryption_key_ref);
    const token = this.encryption.decrypt(row.twilio_auth_token_encrypted, row.encryption_key_ref);
    const webhookSecret = row.webhook_secret_encrypted
      ? this.encryption.decrypt(row.webhook_secret_encrypted, row.encryption_key_ref)
      : '';
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      twilio_account_sid_mask: this.encryption.mask(sid),
      twilio_auth_token_mask: this.encryption.mask(token),
      webhook_secret_mask: this.encryption.mask(webhookSecret),
      twilio_whatsapp_from_number: row.twilio_whatsapp_from_number,
      business_profile_id: row.business_profile_id,
      encryption_key_ref: row.encryption_key_ref,
      key_last_rotated_at: row.key_last_rotated_at,
      is_enabled: row.is_enabled,
      last_verified_at: row.last_verified_at,
      created_by_user_id: row.created_by_user_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private composeMaskedFromDto(
    row: {
      id: string;
      tenant_id: string;
      encryption_key_ref: string;
      key_last_rotated_at: Date | null;
      is_enabled: boolean;
      last_verified_at: Date | null;
      created_by_user_id: string | null;
      created_at: Date;
      updated_at: Date;
    },
    dto: UpsertWhatsAppConfigDto,
  ): MaskedWhatsAppConfig {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      twilio_account_sid_mask: this.encryption.mask(dto.twilio_account_sid),
      twilio_auth_token_mask: this.encryption.mask(dto.twilio_auth_token),
      webhook_secret_mask: this.encryption.mask(dto.webhook_secret),
      twilio_whatsapp_from_number: dto.twilio_whatsapp_from_number,
      business_profile_id: dto.business_profile_id ?? null,
      encryption_key_ref: row.encryption_key_ref,
      key_last_rotated_at: row.key_last_rotated_at,
      is_enabled: row.is_enabled,
      last_verified_at: row.last_verified_at,
      created_by_user_id: row.created_by_user_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
