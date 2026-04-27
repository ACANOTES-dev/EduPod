import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import twilio from 'twilio';

import type {
  DecryptedWhatsAppConfig,
  MaskedWhatsAppConfig,
  UpsertWhatsAppConfigDto,
  VerifyResult,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { COMMS_CACHE_BUS, type CommsCacheBus } from './comms-cache-bus.stub';
import { EncryptionService } from './encryption.service';
import { getProviderErrorHint } from './provider-error-hints';
import { maskPhoneRecipient } from './recipient-mask';

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
   *
   * Wraps in `createRlsClient` so the unauthenticated webhook controller
   * path can set RLS context to the URL-derived tenant id.
   */
  async getWebhookSecret(tenantId: string): Promise<string | null> {
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const row = await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.tenantWhatsAppConfig.findUnique({
        where: { tenant_id: tenantId },
        select: { webhook_secret_encrypted: true, encryption_key_ref: true },
      });
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

  /**
   * Send a real verification WhatsApp via Twilio (Impl 09).
   *
   * WhatsApp differs from SMS / Email in one critical way: outside the 24h
   * service window, free-form sends are forbidden by Twilio's Business
   * Policy. We can never reliably know whether a verify recipient is in
   * window (the tenant typed in a phone — may have never inbound-messaged).
   * Therefore verification ALWAYS goes through an approved template.
   *
   * Looks up `whatsapp_templates` row keyed by
   * `(tenant_id, template_key='comms.verify', language='en')`. If no
   * approved row exists, return a structured error WITHOUT calling Twilio.
   * Impl 13's backfill creates the `comms.verify` row per tenant; until
   * then every WhatsApp verify returns this error — that's expected and
   * documented.
   */
  async verifyConfig(tenantId: string, recipientPhone: string): Promise<VerifyResult> {
    const decrypted = await this.getDecryptedConfig(tenantId);
    if (!decrypted) {
      throw new NotFoundException({
        code: 'WHATSAPP_CONFIG_NOT_FOUND',
        message: 'WhatsApp configuration not found for this tenant',
      });
    }

    const template = await this.prisma.whatsAppTemplate.findFirst({
      where: {
        tenant_id: tenantId,
        template_key: 'comms.verify',
        language_code: 'en',
      },
    });

    if (!template || template.status !== 'approved' || !template.twilio_template_sid) {
      return {
        success: false,
        provider_error: 'verification_template_not_approved',
        status_code: 0,
        troubleshooting_hint:
          'Submit and approve the comms.verify WhatsApp template before running a verification.',
        recipient_mask: maskPhoneRecipient(recipientPhone),
      };
    }

    const client = twilio(decrypted.twilio_account_sid, decrypted.twilio_auth_token);

    let providerMessageId: string | undefined;
    let providerError: string | undefined;
    let statusCode = 0;

    try {
      const message = await client.messages.create({
        from: `whatsapp:${decrypted.twilio_whatsapp_from_number}`,
        to: `whatsapp:${recipientPhone}`,
        contentSid: template.twilio_template_sid,
        // No contentVariables — comms.verify has zero placeholders.
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
        `[verifyConfig] tenant=${tenantId} whatsapp failed: ${providerError ?? 'unknown'} (${statusCode})`,
      );
      return {
        success: false,
        provider_error: providerError ?? 'Unknown Twilio WhatsApp error',
        status_code: statusCode,
        troubleshooting_hint: getProviderErrorHint('whatsapp', statusCode, providerError ?? ''),
        recipient_mask: maskPhoneRecipient(recipientPhone),
      };
    }

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      await txdb.tenantWhatsAppConfig.update({
        where: { id: decrypted.id },
        data: { last_verified_at: new Date() },
      });
    });

    this.logger.log(
      `[verifyConfig] tenant=${tenantId} whatsapp success messageId=${providerMessageId}`,
    );
    return {
      success: true,
      provider_message_id: providerMessageId,
      message: 'Sent via Twilio WhatsApp',
      recipient_mask: maskPhoneRecipient(recipientPhone),
    };
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
