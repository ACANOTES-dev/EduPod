import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PlatformAlertHistory, PlatformAlertRule } from '@prisma/client';

import { alertConditionConfigSchema } from '@school/shared';

import { ResendEmailProvider } from '../communications/providers/resend-email.provider';

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
export class AlertDispatchService {
  private readonly logger = new Logger(AlertDispatchService.name);

  constructor(
    private readonly resendEmail: ResendEmailProvider,
    private readonly configService: ConfigService,
  ) {}

  async sendEmail(
    rule: PlatformAlertRule,
    alert: PlatformAlertHistory,
    metricValue: number,
  ): Promise<string[]> {
    if (rule.notify_emails.length === 0) {
      return [];
    }

    const tenantId = this.configService.get<string>('PLATFORM_ALERT_EMAIL_TENANT_ID');
    if (!tenantId) {
      this.logger.warn(
        '[sendEmail] PLATFORM_ALERT_EMAIL_TENANT_ID is not configured; platform alert email skipped',
      );
      return [];
    }

    const config = alertConditionConfigSchema.parse(rule.condition_config);
    const color = SEVERITY_TONE[rule.severity];
    const html = `
      <div style="font-family: sans-serif; max-width: 600px;">
        <div style="background: ${color}; color: white; padding: 16px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">${escapeHtml(rule.severity.toUpperCase())} Alert</h2>
        </div>
        <div style="border: 1px solid #E5E7EB; border-top: none; padding: 16px; border-radius: 0 0 8px 8px;">
          <p><strong>Rule:</strong> ${escapeHtml(rule.name)}</p>
          <p><strong>Metric:</strong> ${escapeHtml(rule.metric)}</p>
          <p><strong>Current Value:</strong> ${metricValue}</p>
          <p><strong>Threshold:</strong> ${escapeHtml(config.operator)} ${config.threshold}</p>
          <p><strong>Fired at:</strong> ${alert.fired_at.toISOString()}</p>
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 16px 0;" />
          <p style="color: #6B7280; font-size: 12px;">This is an automated alert from the EduPod Platform.</p>
        </div>
      </div>
    `;

    let sentCount = 0;
    for (const email of rule.notify_emails) {
      try {
        const result = await this.resendEmail.send(tenantId, {
          to: email,
          subject: `[EduPod ${rule.severity.toUpperCase()}] ${rule.name}`,
          html,
          tags: [
            { name: 'kind', value: 'platform_alert' },
            { name: 'alert_id', value: alert.id },
          ],
          idempotencyKey: `platform-alert:${alert.id}:${email}`,
        });
        if ('messageId' in result) {
          sentCount += 1;
        } else {
          this.logger.warn(`[sendEmail] Alert email skipped for ${email}: ${result.reason}`);
        }
      } catch (err: unknown) {
        this.logger.error(`[sendEmail] Failed to send alert email to ${email}`, err);
      }
    }

    return sentCount > 0 ? ['email'] : [];
  }
}
