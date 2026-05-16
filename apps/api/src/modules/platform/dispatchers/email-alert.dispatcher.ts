import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { emailAlertChannelConfigSchema } from '@school/shared';

import { ResendEmailProvider } from '../../communications/providers/resend-email.provider';

import type { AlertPayload, ChannelDispatcher } from './channel-dispatcher.interface';

const SEVERITY_TONE: Record<string, string> = {
  critical: '#EF4444',
  info: '#3B82F6',
  warning: '#F59E0B',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Injectable()
export class EmailAlertDispatcher implements ChannelDispatcher {
  private readonly logger = new Logger(EmailAlertDispatcher.name);

  constructor(
    private readonly resendEmail: ResendEmailProvider,
    private readonly configService: ConfigService,
  ) {}

  async send(config: unknown, alert: AlertPayload): Promise<void> {
    const parsed = emailAlertChannelConfigSchema.parse(config);
    const tenantId = this.configService.get<string>('PLATFORM_ALERT_EMAIL_TENANT_ID');
    if (!tenantId) {
      throw new Error('Platform alert email tenant is not configured');
    }

    const color = SEVERITY_TONE[alert.severity] ?? SEVERITY_TONE.warning;
    const html = `
      <div style="font-family: sans-serif; max-width: 600px;">
        <div style="background: ${color}; color: white; padding: 16px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">${escapeHtml(alert.severity.toUpperCase())} Alert</h2>
        </div>
        <div style="border: 1px solid #E5E7EB; border-top: none; padding: 16px; border-radius: 0 0 8px 8px;">
          <p><strong>Rule:</strong> ${escapeHtml(alert.rule_name)}</p>
          <p><strong>Current Value:</strong> ${alert.metric_value}</p>
          <p>${escapeHtml(alert.message)}</p>
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 16px 0;" />
          <p style="color: #6B7280; font-size: 12px;">This is an automated alert from the EduPod Platform.</p>
        </div>
      </div>
    `;

    let sentCount = 0;
    for (const recipient of parsed.recipients) {
      const result = await this.resendEmail.send(tenantId, {
        to: recipient,
        subject: `[EduPod ${alert.severity.toUpperCase()}] ${alert.rule_name}`,
        html,
        tags: [{ name: 'kind', value: 'platform_alert' }],
      });
      if ('messageId' in result) {
        sentCount += 1;
      } else {
        this.logger.warn(`[send] Alert email skipped for ${recipient}: ${result.reason}`);
      }
    }

    if (sentCount === 0) {
      throw new Error('No alert emails were delivered');
    }
  }
}
