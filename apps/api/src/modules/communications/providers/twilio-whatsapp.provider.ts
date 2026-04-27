import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import twilio from 'twilio';
import type { Twilio } from 'twilio';

import type { CommsCacheBusEvent, WhatsAppDispatchResult } from '@school/shared';

import { CircuitBreakerRegistry } from '../../../common/services/circuit-breaker-registry';
import { WhatsAppConfigService } from '../../configuration/whatsapp-config.service';
import { CommsCacheBusService } from '../comms-cache-bus.service';
import { CommsMetricsService } from '../comms-metrics.service';
import { WhatsAppServiceWindowService } from '../whatsapp-templates/whatsapp-service-window.service';
import { WhatsAppTemplateService } from '../whatsapp-templates/whatsapp-template.service';

import { PerTenantClientCache } from './per-tenant-client-cache';
import { mapTwilioError } from './provider-error-mapping';

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

  constructor(
    private readonly circuitBreaker: CircuitBreakerRegistry,
    private readonly whatsappConfigService: WhatsAppConfigService,
    private readonly cacheBus: CommsCacheBusService,
    private readonly serviceWindow: WhatsAppServiceWindowService,
    private readonly templates: WhatsAppTemplateService,
    private readonly metrics: CommsMetricsService,
  ) {}

  onModuleInit(): void {
    this.cacheBus.subscribe((event: CommsCacheBusEvent) => {
      if (event.channel !== 'whatsapp') return;
      this.tenantClientCache.invalidate(event.tenant_id);
      this.logger.log(`Invalidated WhatsApp client cache for tenant=${event.tenant_id}`);
    });
  }

  async isConfiguredForTenant(tenantId: string): Promise<boolean> {
    const config = await this.whatsappConfigService.getDecryptedConfig(tenantId);
    return Boolean(config?.is_enabled);
  }

  async send(
    tenantId: string,
    params: {
      to: string;
      body: string;
      template_key?: string | null;
      template_variables?: Record<string, string>;
      locale?: string;
    },
  ): Promise<WhatsAppDispatchResult> {
    const tenantConfig = await this.whatsappConfigService.getDecryptedConfig(tenantId);

    if (!tenantConfig) {
      return { skipped: true, reason: 'channel_not_configured' };
    }
    if (!tenantConfig.is_enabled) {
      return { skipped: true, reason: 'channel_disabled' };
    }

    // Impl 08: 24-hour service window check.
    //   - INSIDE the window: free-form `body` allowed (or an approved template).
    //   - OUTSIDE the window: only approved templates pass; everything else is
    //     skipped before reaching Twilio so we own the audit trail.
    const insideWindow = await this.serviceWindow.isInsideWindow(tenantId, params.to);
    const locale = params.locale ?? 'en';

    let messageBody: string | undefined;
    let contentSid: string | undefined;
    let contentVariables: string | undefined;

    if (insideWindow) {
      if (params.body && params.body.trim().length > 0) {
        messageBody = params.body;
      } else if (params.template_key) {
        const tpl = await this.templates.getApprovedByKey(tenantId, params.template_key, locale);
        if (!tpl?.twilio_template_sid) {
          return { skipped: true, reason: 'template_not_approved_inside_window' };
        }
        contentSid = tpl.twilio_template_sid;
        contentVariables = JSON.stringify(params.template_variables ?? {});
      } else {
        return { skipped: true, reason: 'whatsapp_payload_missing_body_and_template' };
      }
    } else {
      if (!params.template_key) {
        return { skipped: true, reason: 'outside_service_window_no_template' };
      }
      const tpl = await this.templates.getApprovedByKey(tenantId, params.template_key, locale);
      if (!tpl?.twilio_template_sid) {
        return { skipped: true, reason: 'outside_service_window_no_template' };
      }
      contentSid = tpl.twilio_template_sid;
      contentVariables = JSON.stringify(params.template_variables ?? {});
    }

    const resolved = this.tenantClientCache.getOrCreate(tenantId, () => ({
      client: twilio(tenantConfig.twilio_account_sid, tenantConfig.twilio_auth_token),
      fromNumber: tenantConfig.twilio_whatsapp_from_number,
    }));

    const to = params.to.startsWith('whatsapp:') ? params.to : `whatsapp:${params.to}`;
    const from = resolved.fromNumber.startsWith('whatsapp:')
      ? resolved.fromNumber
      : `whatsapp:${resolved.fromNumber}`;

    this.logger.log(
      `Sending WhatsApp tenant=${tenantId} to=${to} ${
        contentSid ? `template=${contentSid}` : 'free-form'
      }`,
    );

    try {
      const message = await this.circuitBreaker.exec('twilio', () =>
        resolved.client.messages.create({
          from,
          to,
          ...(messageBody !== undefined ? { body: messageBody } : {}),
          ...(contentSid !== undefined ? { contentSid, contentVariables } : {}),
        }),
      );

      this.logger.log(`WhatsApp sent tenant=${tenantId} sid=${message.sid}`);
      return { messageSid: message.sid };
    } catch (err) {
      const code = (err as { code?: number | string })?.code;
      this.metrics.recordProviderError(tenantId, 'whatsapp', mapTwilioError(code));
      throw err;
    }
  }
}
