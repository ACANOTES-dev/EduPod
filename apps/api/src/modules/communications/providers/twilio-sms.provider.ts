import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import twilio from 'twilio';
import type { Twilio } from 'twilio';

import type { CommsCacheBusEvent, SmsDispatchResult } from '@school/shared';

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

  constructor(
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

  async isConfiguredForTenant(tenantId: string): Promise<boolean> {
    const config = await this.smsConfigService.getDecryptedConfig(tenantId);
    return Boolean(config?.is_enabled);
  }

  async send(tenantId: string, params: { to: string; body: string }): Promise<SmsDispatchResult> {
    const tenantConfig = await this.smsConfigService.getDecryptedConfig(tenantId);

    if (!tenantConfig) {
      return { skipped: true, reason: 'channel_not_configured' };
    }
    if (!tenantConfig.is_enabled) {
      return { skipped: true, reason: 'channel_disabled' };
    }

    const resolved = this.tenantClientCache.getOrCreate(tenantId, () => ({
      client: twilio(tenantConfig.twilio_account_sid, tenantConfig.twilio_auth_token),
      fromNumber: tenantConfig.twilio_from_number,
    }));

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
}
