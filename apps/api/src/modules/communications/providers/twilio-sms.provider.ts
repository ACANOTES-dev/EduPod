import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';
import type { Twilio } from 'twilio';

import type { CommsCacheBusEvent } from '@school/shared';

import { CircuitBreakerRegistry } from '../../../common/services/circuit-breaker-registry';
import { SmsConfigService } from '../../configuration/sms-config.service';
import { CommsCacheBusService } from '../comms-cache-bus.service';

import { PerTenantClientCache } from './per-tenant-client-cache';

const SMS_MAX_LENGTH = 1600;

interface TenantSmsClient {
  client: Twilio;
  fromNumber: string;
}

@Injectable()
export class TwilioSmsProvider implements OnModuleInit {
  private readonly logger = new Logger(TwilioSmsProvider.name);

  private readonly tenantClientCache = new PerTenantClientCache<TenantSmsClient>({
    maxSize: 1000,
    ttlMs: 30 * 60 * 1000,
  });

  private platformFallbackClient: TenantSmsClient | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly circuitBreaker: CircuitBreakerRegistry,
    private readonly smsConfigService: SmsConfigService,
    private readonly cacheBus: CommsCacheBusService,
  ) {}

  onModuleInit(): void {
    this.cacheBus.subscribe((event: CommsCacheBusEvent) => {
      if (event.channel !== 'sms') return;
      this.tenantClientCache.invalidate(event.tenant_id);
      this.logger.log(`Invalidated SMS client cache for tenant=${event.tenant_id}`);
    });
  }

  /** @deprecated removed by Impl 05; preserved for the dispatch service's startup probe. */
  isConfigured(): boolean {
    return !!(
      this.configService.get<string>('TWILIO_ACCOUNT_SID') &&
      this.configService.get<string>('TWILIO_AUTH_TOKEN') &&
      this.configService.get<string>('TWILIO_SMS_FROM')
    );
  }

  async isConfiguredForTenant(tenantId: string): Promise<boolean> {
    const config = await this.smsConfigService.getDecryptedConfig(tenantId);
    if (config?.is_enabled) return true;
    return this.isConfigured();
  }

  async send(
    tenantId: string,
    params: { to: string; body: string },
  ): Promise<{ messageSid: string }> {
    const resolved = await this.resolveClient(tenantId);

    let body = params.body;
    if (body.length > SMS_MAX_LENGTH) {
      this.logger.warn(
        `SMS body exceeds ${SMS_MAX_LENGTH} chars (${body.length}), truncating tenant=${tenantId}`,
      );
      body = body.slice(0, SMS_MAX_LENGTH - 3) + '...';
    }

    this.logger.log(`Sending SMS tenant=${tenantId} to=${params.to}`);

    const message = await this.circuitBreaker.exec('twilio', () =>
      resolved.client.messages.create({
        body,
        from: resolved.fromNumber,
        to: params.to,
      }),
    );

    this.logger.log(`SMS sent tenant=${tenantId} sid=${message.sid}`);
    return { messageSid: message.sid };
  }

  private async resolveClient(tenantId: string): Promise<TenantSmsClient> {
    const tenantConfig = await this.smsConfigService.getDecryptedConfig(tenantId);
    if (tenantConfig?.is_enabled) {
      return this.tenantClientCache.getOrCreate(tenantId, () => ({
        client: twilio(tenantConfig.twilio_account_sid, tenantConfig.twilio_auth_token),
        fromNumber: tenantConfig.twilio_from_number,
      }));
    }

    this.logger.warn(
      `tenant=${tenantId} has no SMS config; falling back to platform .env credentials. Removed by Impl 05.`,
    );
    return this.ensurePlatformFallbackClient();
  }

  private ensurePlatformFallbackClient(): TenantSmsClient {
    if (this.platformFallbackClient) return this.platformFallbackClient;
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    const smsFrom = this.configService.get<string>('TWILIO_SMS_FROM');
    if (!accountSid || !authToken || !smsFrom) {
      throw new Error(
        'Twilio SMS is not configured. Tenant has no SMS config and .env fallback is empty.',
      );
    }
    this.platformFallbackClient = {
      client: twilio(accountSid, authToken),
      fromNumber: smsFrom,
    };
    return this.platformFallbackClient;
  }
}
