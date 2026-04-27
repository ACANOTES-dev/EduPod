import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { DecryptedEmailConfig, MaskedEmailConfig, UpsertEmailConfigDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { COMMS_CACHE_BUS, type CommsCacheBus } from './comms-cache-bus.stub';
import { EncryptionService } from './encryption.service';

@Injectable()
export class EmailConfigService {
  private readonly logger = new Logger(EmailConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    @Inject(COMMS_CACHE_BUS) private readonly cacheBus: CommsCacheBus,
  ) {}

  // ─── Public read ─────────────────────────────────────────────────────────
  async getConfig(tenantId: string): Promise<MaskedEmailConfig> {
    const config = await this.prisma.tenantEmailConfig.findUnique({
      where: { tenant_id: tenantId },
    });
    if (!config) {
      throw new NotFoundException({
        code: 'EMAIL_CONFIG_NOT_FOUND',
        message: 'Email configuration not found for this tenant',
      });
    }
    return this.toMasked(config);
  }

  // ─── Public write — wraps in RLS transaction + publishes invalidation ────
  async upsertConfig(
    tenantId: string,
    userId: string,
    dto: UpsertEmailConfigDto,
  ): Promise<MaskedEmailConfig> {
    const { encrypted: apiKeyEncrypted, keyRef } = this.encryption.encrypt(dto.resend_api_key);
    const { encrypted: webhookSecretEncrypted } = this.encryption.encrypt(dto.webhook_secret);

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
    const persisted = await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.tenantEmailConfig.upsert({
        where: { tenant_id: tenantId },
        update: {
          resend_api_key_encrypted: apiKeyEncrypted,
          from_email: dto.from_email,
          from_name: dto.from_name ?? null,
          reply_to_email: dto.reply_to_email ?? null,
          webhook_secret_encrypted: webhookSecretEncrypted,
          encryption_key_ref: keyRef,
          key_last_rotated_at: new Date(),
        },
        create: {
          tenant_id: tenantId,
          resend_api_key_encrypted: apiKeyEncrypted,
          from_email: dto.from_email,
          from_name: dto.from_name ?? null,
          reply_to_email: dto.reply_to_email ?? null,
          webhook_secret_encrypted: webhookSecretEncrypted,
          encryption_key_ref: keyRef,
          is_enabled: true,
          created_by_user_id: userId,
        },
      });
    });

    // Cache invalidation — every mutation publishes. Impl 04 wires this to Redis.
    await this.cacheBus.publishConfigChanged(tenantId, 'email');

    // Return masked using the freshly-known plaintext (no extra decrypt).
    return this.composeMaskedFromDto(persisted, dto);
  }

  // ─── Public delete ───────────────────────────────────────────────────────
  async deleteConfig(tenantId: string, userId: string): Promise<{ id: string }> {
    const existing = await this.prisma.tenantEmailConfig.findUnique({
      where: { tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'EMAIL_CONFIG_NOT_FOUND',
        message: 'Email configuration not found for this tenant',
      });
    }

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
    await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      await txdb.tenantEmailConfig.delete({ where: { id: existing.id } });
    });

    await this.cacheBus.publishConfigChanged(tenantId, 'email');
    this.logger.log(`Email config deleted for tenant ${tenantId}`);
    return { id: existing.id };
  }

  /**
   * Returns the decrypted webhook_secret for the tenant, or null if not
   * configured. Internal-only (no controller exposure). Decrypts ONLY the
   * webhook secret — never the API key. This is intentionally a smaller
   * surface than `getDecryptedConfig` so the webhook controller's blast
   * radius is limited (Impl 06).
   */
  async getWebhookSecret(tenantId: string): Promise<string | null> {
    const row = await this.prisma.tenantEmailConfig.findUnique({
      where: { tenant_id: tenantId },
      select: { webhook_secret_encrypted: true, encryption_key_ref: true },
    });
    if (!row?.webhook_secret_encrypted) return null;
    return this.encryption.decrypt(row.webhook_secret_encrypted, row.encryption_key_ref);
  }

  // ─── INTERNAL ONLY — consumed by NotificationDispatchService (Impl 04) ───
  // Never exposed via controller. Never logged. Never returned in errors.
  async getDecryptedConfig(tenantId: string): Promise<DecryptedEmailConfig | null> {
    const config = await this.prisma.tenantEmailConfig.findUnique({
      where: { tenant_id: tenantId },
    });
    if (!config) return null;

    return {
      id: config.id,
      tenant_id: config.tenant_id,
      resend_api_key: this.encryption.decrypt(
        config.resend_api_key_encrypted,
        config.encryption_key_ref,
      ),
      from_email: config.from_email,
      from_name: config.from_name,
      reply_to_email: config.reply_to_email,
      webhook_secret: config.webhook_secret_encrypted
        ? this.encryption.decrypt(config.webhook_secret_encrypted, config.encryption_key_ref)
        : '',
      is_enabled: config.is_enabled,
      encryption_key_ref: config.encryption_key_ref,
    };
  }

  // ─── STUB — Impl 09 wires real provider verification ─────────────────────
  async verifyConfig(_tenantId: string, _recipient: string): Promise<never> {
    // Implemented in Impl 09 — sends a real Resend message, sets last_verified_at.
    throw new NotFoundException({
      code: 'EMAIL_VERIFY_NOT_IMPLEMENTED',
      message: 'Email verify endpoint is implemented in Implementation 09',
    });
  }

  // ─── Private helpers ─────────────────────────────────────────────────────
  private toMasked(row: {
    id: string;
    tenant_id: string;
    resend_api_key_encrypted: string;
    from_email: string;
    from_name: string | null;
    reply_to_email: string | null;
    webhook_secret_encrypted: string | null;
    encryption_key_ref: string;
    key_last_rotated_at: Date | null;
    is_enabled: boolean;
    last_verified_at: Date | null;
    created_by_user_id: string | null;
    created_at: Date;
    updated_at: Date;
  }): MaskedEmailConfig {
    const apiKey = this.encryption.decrypt(row.resend_api_key_encrypted, row.encryption_key_ref);
    const webhookSecret = row.webhook_secret_encrypted
      ? this.encryption.decrypt(row.webhook_secret_encrypted, row.encryption_key_ref)
      : '';
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      resend_api_key_mask: this.encryption.mask(apiKey),
      webhook_secret_mask: this.encryption.mask(webhookSecret),
      from_email: row.from_email,
      from_name: row.from_name,
      reply_to_email: row.reply_to_email,
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
    dto: UpsertEmailConfigDto,
  ): MaskedEmailConfig {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      resend_api_key_mask: this.encryption.mask(dto.resend_api_key),
      webhook_secret_mask: this.encryption.mask(dto.webhook_secret),
      from_email: dto.from_email,
      from_name: dto.from_name ?? null,
      reply_to_email: dto.reply_to_email ?? null,
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
