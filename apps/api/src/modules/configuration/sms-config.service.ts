import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import twilio from 'twilio';

import type {
  DecryptedSmsConfig,
  MaskedSmsConfig,
  UpsertSmsConfigDto,
  VerifyResult,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { COMMS_CACHE_BUS, type CommsCacheBus } from './comms-cache-bus.stub';
import { EncryptionService } from './encryption.service';
import { getProviderErrorHint } from './provider-error-hints';
import { maskPhoneRecipient } from './recipient-mask';
import { VERIFICATION_SMS_TEMPLATES } from './verification-templates';

@Injectable()
export class SmsConfigService {
  private readonly logger = new Logger(SmsConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    @Inject(COMMS_CACHE_BUS) private readonly cacheBus: CommsCacheBus,
  ) {}

  async getConfig(tenantId: string): Promise<MaskedSmsConfig> {
    const config = await this.prisma.tenantSmsConfig.findUnique({
      where: { tenant_id: tenantId },
    });
    if (!config) {
      throw new NotFoundException({
        code: 'SMS_CONFIG_NOT_FOUND',
        message: 'SMS configuration not found for this tenant',
      });
    }
    return this.toMasked(config);
  }

  async upsertConfig(
    tenantId: string,
    userId: string,
    dto: UpsertSmsConfigDto,
  ): Promise<MaskedSmsConfig> {
    const { encrypted: sidEncrypted, keyRef } = this.encryption.encrypt(dto.twilio_account_sid);
    const { encrypted: tokenEncrypted } = this.encryption.encrypt(dto.twilio_auth_token);
    const { encrypted: webhookSecretEncrypted } = this.encryption.encrypt(dto.webhook_secret);

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
    const persisted = await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.tenantSmsConfig.upsert({
        where: { tenant_id: tenantId },
        update: {
          twilio_account_sid_encrypted: sidEncrypted,
          twilio_auth_token_encrypted: tokenEncrypted,
          twilio_from_number: dto.twilio_from_number,
          webhook_secret_encrypted: webhookSecretEncrypted,
          encryption_key_ref: keyRef,
          key_last_rotated_at: new Date(),
        },
        create: {
          tenant_id: tenantId,
          twilio_account_sid_encrypted: sidEncrypted,
          twilio_auth_token_encrypted: tokenEncrypted,
          twilio_from_number: dto.twilio_from_number,
          webhook_secret_encrypted: webhookSecretEncrypted,
          encryption_key_ref: keyRef,
          is_enabled: true,
          created_by_user_id: userId,
        },
      });
    });

    await this.cacheBus.publishConfigChanged(tenantId, 'sms');
    return this.composeMaskedFromDto(persisted, dto);
  }

  async deleteConfig(tenantId: string, userId: string): Promise<{ id: string }> {
    const existing = await this.prisma.tenantSmsConfig.findUnique({
      where: { tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'SMS_CONFIG_NOT_FOUND',
        message: 'SMS configuration not found for this tenant',
      });
    }

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
    await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      await txdb.tenantSmsConfig.delete({ where: { id: existing.id } });
    });

    await this.cacheBus.publishConfigChanged(tenantId, 'sms');
    this.logger.log(`SMS config deleted for tenant ${tenantId}`);
    return { id: existing.id };
  }

  /**
   * Returns the decrypted webhook_secret for the tenant, or null if not
   * configured. Internal-only (Impl 06). For Twilio, the "webhook secret"
   * value is whatever the tenant has configured for their Edge endpoint
   * status callbacks; verifyTwilio uses it as the HMAC-SHA1 key.
   *
   * Wraps in `createRlsClient` so the unauthenticated webhook controller
   * path can set RLS context to the URL-derived tenant id (no
   * request-context tenant available).
   */
  async getWebhookSecret(tenantId: string): Promise<string | null> {
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const row = await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.tenantSmsConfig.findUnique({
        where: { tenant_id: tenantId },
        select: { webhook_secret_encrypted: true, encryption_key_ref: true },
      });
    });
    if (!row?.webhook_secret_encrypted) return null;
    return this.encryption.decrypt(row.webhook_secret_encrypted, row.encryption_key_ref);
  }

  // INTERNAL ONLY — never exposed via controller.
  async getDecryptedConfig(tenantId: string): Promise<DecryptedSmsConfig | null> {
    const config = await this.prisma.tenantSmsConfig.findUnique({
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
      twilio_from_number: config.twilio_from_number,
      webhook_secret: config.webhook_secret_encrypted
        ? this.encryption.decrypt(config.webhook_secret_encrypted, config.encryption_key_ref)
        : '',
      is_enabled: config.is_enabled,
      encryption_key_ref: config.encryption_key_ref,
    };
  }

  /**
   * Send a real verification SMS via Twilio (Impl 09).
   *
   * Twilio's SDK throws on failure (no `{ data, error }` envelope) — we
   * wrap the call in try/catch and capture `code` (numeric, e.g. 21211)
   * + `message`. Stamps `last_verified_at = now()` only on success.
   * Failure paths never touch the row.
   */
  async verifyConfig(tenantId: string, recipientPhone: string): Promise<VerifyResult> {
    const decrypted = await this.getDecryptedConfig(tenantId);
    if (!decrypted) {
      throw new NotFoundException({
        code: 'SMS_CONFIG_NOT_FOUND',
        message: 'SMS configuration not found for this tenant',
      });
    }

    const tpl = VERIFICATION_SMS_TEMPLATES.en;
    const client = twilio(decrypted.twilio_account_sid, decrypted.twilio_auth_token);

    let providerMessageId: string | undefined;
    let providerError: string | undefined;
    let statusCode = 0;

    try {
      const message = await client.messages.create({
        from: decrypted.twilio_from_number,
        to: recipientPhone,
        body: tpl.body,
      });
      providerMessageId = message.sid;
    } catch (err) {
      if (err instanceof Error) {
        providerError = err.message;
        const twilioCode = (err as { code?: number }).code;
        statusCode = typeof twilioCode === 'number' ? twilioCode : 0;
      } else {
        providerError = String(err);
      }
    }

    if (providerError || !providerMessageId) {
      this.logger.warn(
        `[verifyConfig] tenant=${tenantId} sms failed: ${providerError ?? 'unknown'} (${statusCode})`,
      );
      return {
        success: false,
        provider_error: providerError ?? 'Unknown Twilio error',
        status_code: statusCode,
        troubleshooting_hint: getProviderErrorHint('sms', statusCode, providerError ?? ''),
        recipient_mask: maskPhoneRecipient(recipientPhone),
      };
    }

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      await txdb.tenantSmsConfig.update({
        where: { id: decrypted.id },
        data: { last_verified_at: new Date() },
      });
    });

    this.logger.log(`[verifyConfig] tenant=${tenantId} sms success messageId=${providerMessageId}`);
    return {
      success: true,
      provider_message_id: providerMessageId,
      message: 'Sent via Twilio SMS',
      recipient_mask: maskPhoneRecipient(recipientPhone),
    };
  }

  private toMasked(row: {
    id: string;
    tenant_id: string;
    twilio_account_sid_encrypted: string;
    twilio_auth_token_encrypted: string;
    twilio_from_number: string;
    webhook_secret_encrypted: string | null;
    encryption_key_ref: string;
    key_last_rotated_at: Date | null;
    is_enabled: boolean;
    last_verified_at: Date | null;
    created_by_user_id: string | null;
    created_at: Date;
    updated_at: Date;
  }): MaskedSmsConfig {
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
      twilio_from_number: row.twilio_from_number,
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
    dto: UpsertSmsConfigDto,
  ): MaskedSmsConfig {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      twilio_account_sid_mask: this.encryption.mask(dto.twilio_account_sid),
      twilio_auth_token_mask: this.encryption.mask(dto.twilio_auth_token),
      webhook_secret_mask: this.encryption.mask(dto.webhook_secret),
      twilio_from_number: dto.twilio_from_number,
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
