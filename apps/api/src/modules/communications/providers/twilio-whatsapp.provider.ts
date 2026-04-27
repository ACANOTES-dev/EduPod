import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';
import type { Twilio } from 'twilio';

import type { CommsCacheBusEvent } from '@school/shared';

import { CircuitBreakerRegistry } from '../../../common/services/circuit-breaker-registry';
import { WhatsAppConfigService } from '../../configuration/whatsapp-config.service';
import { CommsCacheBusService } from '../comms-cache-bus.service';

import { PerTenantClientCache } from './per-tenant-client-cache';

interface TenantWhatsAppClient {
  client: Twilio;
  fromNumber: string; // bare E.164; prefixed inline
}

@Injectable()
export class TwilioWhatsAppProvider implements OnModuleInit {
  private readonly logger = new Logger(TwilioWhatsAppProvider.name);

  private readonly tenantClientCache = new PerTenantClientCache<TenantWhatsAppClient>({
    maxSize: 1000,
    ttlMs: 30 * 60 * 1000,
  });

  private platformFallbackClient: TenantWhatsAppClient | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly circuitBreaker: CircuitBreakerRegistry,
    private readonly whatsappConfigService: WhatsAppConfigService,
    private readonly cacheBus: CommsCacheBusService,
  ) {}

  onModuleInit(): void {
    this.cacheBus.subscribe((event: CommsCacheBusEvent) => {
      if (event.channel !== 'whatsapp') return;
      this.tenantClientCache.invalidate(event.tenant_id);
      this.logger.log(`Invalidated WhatsApp client cache for tenant=${event.tenant_id}`);
    });
  }

  /** @deprecated removed by Impl 05. */
  isConfigured(): boolean {
    return !!(
      this.configService.get<string>('TWILIO_ACCOUNT_SID') &&
      this.configService.get<string>('TWILIO_AUTH_TOKEN') &&
      this.configService.get<string>('TWILIO_WHATSAPP_FROM')
    );
  }

  async isConfiguredForTenant(tenantId: string): Promise<boolean> {
    const config = await this.whatsappConfigService.getDecryptedConfig(tenantId);
    if (config?.is_enabled) return true;
    return this.isConfigured();
  }

  async send(
    tenantId: string,
    params: { to: string; body: string },
  ): Promise<{ messageSid: string }> {
    const resolved = await this.resolveClient(tenantId);

    const to = params.to.startsWith('whatsapp:') ? params.to : `whatsapp:${params.to}`;
    const from = resolved.fromNumber.startsWith('whatsapp:')
      ? resolved.fromNumber
      : `whatsapp:${resolved.fromNumber}`;

    this.logger.log(`Sending WhatsApp tenant=${tenantId} to=${to}`);

    const message = await this.circuitBreaker.exec('twilio', () =>
      resolved.client.messages.create({ body: params.body, from, to }),
    );

    this.logger.log(`WhatsApp sent tenant=${tenantId} sid=${message.sid}`);
    return { messageSid: message.sid };
  }

  private async resolveClient(tenantId: string): Promise<TenantWhatsAppClient> {
    const tenantConfig = await this.whatsappConfigService.getDecryptedConfig(tenantId);
    if (tenantConfig?.is_enabled) {
      return this.tenantClientCache.getOrCreate(tenantId, () => ({
        client: twilio(tenantConfig.twilio_account_sid, tenantConfig.twilio_auth_token),
        fromNumber: tenantConfig.twilio_whatsapp_from_number,
      }));
    }
    this.logger.warn(
      `tenant=${tenantId} has no WhatsApp config; falling back to .env. Removed by Impl 05.`,
    );
    return this.ensurePlatformFallbackClient();
  }

  private ensurePlatformFallbackClient(): TenantWhatsAppClient {
    if (this.platformFallbackClient) return this.platformFallbackClient;
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    const waFrom = this.configService.get<string>('TWILIO_WHATSAPP_FROM');
    if (!accountSid || !authToken || !waFrom) {
      throw new Error(
        'Twilio WhatsApp is not configured. Tenant has no WhatsApp config and .env fallback is empty.',
      );
    }
    this.platformFallbackClient = {
      client: twilio(accountSid, authToken),
      fromNumber: waFrom,
    };
    return this.platformFallbackClient;
  }
}
