import * as crypto from 'crypto';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel, Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';
import { Resend } from 'resend';
import twilio from 'twilio';
import type { Twilio } from 'twilio';

import { toNotificationChannel } from '@school/shared';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const Handlebars = require('handlebars') as typeof import('handlebars');

// Register custom Handlebars helpers (matching API's template-renderer)
Handlebars.registerHelper('formatDate', (date: unknown, locale?: unknown): string => {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(String(date));
  if (isNaN(d.getTime())) return String(date);
  const loc = typeof locale === 'string' ? locale : 'en';
  try {
    return d.toLocaleDateString(loc, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return d.toLocaleDateString('en', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
});

Handlebars.registerHelper('stripHtml', (html: unknown): string => {
  if (typeof html !== 'string') return '';
  return stripHtmlText(html);
});

// ─── HTML stripping utility ──────────────────────────────────────────────────

function stripHtmlText(html: string): string {
  let text = html;
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<[^>]*>/g, '');
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  text = text.trim();
  return text;
}

// ─── Template compilation cache ──────────────────────────────────────────────

type CompiledTemplate = (context: Record<string, unknown>) => string;
const compiledCache = new Map<string, CompiledTemplate>();

function compileTemplate(body: string): CompiledTemplate {
  const hash = crypto.createHash('sha256').update(body).digest('hex');
  const cached = compiledCache.get(hash);
  if (cached) return cached;

  const compiled = Handlebars.compile(body, {
    strict: false,
    noEscape: false,
  });
  compiledCache.set(hash, compiled);
  return compiled;
}

function renderTemplate(templateBody: string, variables: Record<string, unknown>): string {
  const compiled = compileTemplate(templateBody);
  try {
    return compiled(variables);
  } catch {
    return templateBody;
  }
}

function renderSubject(
  subjectTemplate: string | null,
  variables: Record<string, unknown>,
): string | null {
  if (subjectTemplate === null) return null;
  return renderTemplate(subjectTemplate, variables);
}

// ─── SMS length limit ────────────────────────────────────────────────────────

const SMS_MAX_LENGTH = 1600;

// ─── Fallback chain ──────────────────────────────────────────────────────────

const FALLBACK_CHAIN: Record<string, NotificationChannel | null> = {
  whatsapp: 'sms',
  sms: 'email',
  email: 'in_app',
  in_app: null,
};

// ─── Notification shape used internally ──────────────────────────────────────

interface DispatchableNotification {
  id: string;
  tenant_id: string;
  recipient_user_id: string;
  channel: NotificationChannel;
  template_key: string | null;
  locale: string;
  status: string;
  payload_json: unknown;
  source_entity_type: string | null;
  source_entity_id: string | null;
  attempt_count: number;
  max_attempts: number;
}

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface DispatchNotificationsPayload extends TenantJobPayload {
  notification_ids?: string[];
  announcement_id?: string;
  batch_index?: number;
}

// ─── Job name ────────────────────────────────────────────────────────────────

export const DISPATCH_NOTIFICATIONS_JOB = 'communications:dispatch-notifications';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class DispatchNotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(DispatchNotificationsProcessor.name);

  /** Lazily-initialised provider clients */
  private resendClient: Resend | null = null;
  private twilioClient: Twilio | null = null;

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<DispatchNotificationsPayload>): Promise<void> {
    if (job.name !== DISPATCH_NOTIFICATIONS_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    const idCount = job.data.notification_ids?.length ?? 0;
    this.logger.log(
      `Processing ${DISPATCH_NOTIFICATIONS_JOB} — ${idCount || 'announcement-based'} notifications for tenant ${tenant_id}`,
    );

    const dispatchJob = new DispatchNotificationsJob(
      this.prisma,
      this.configService,
      this.getResendClient.bind(this),
      this.getTwilioClient.bind(this),
    );
    await dispatchJob.execute(job.data);
  }

  // ─── Lazy provider initialisation ────────────────────────────────────

  private getResendClient(): Resend {
    if (this.resendClient) return this.resendClient;

    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error('Resend is not configured. Set RESEND_API_KEY environment variable.');
    }

    this.resendClient = new Resend(apiKey);
    return this.resendClient;
  }

  private getTwilioClient(): Twilio {
    if (this.twilioClient) return this.twilioClient;

    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');

    if (!accountSid || !authToken) {
      throw new Error(
        'Twilio is not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.',
      );
    }

    this.twilioClient = twilio(accountSid, authToken);
    return this.twilioClient;
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class DispatchNotificationsJob extends TenantAwareJob<DispatchNotificationsPayload> {
  private readonly logger = new Logger(DispatchNotificationsJob.name);

  constructor(
    prisma: PrismaClient,
    private readonly configService: ConfigService,
    private readonly getResend: () => Resend,
    private readonly getTwilio: () => Twilio,
  ) {
    super(prisma);
  }

  protected async processJob(data: DispatchNotificationsPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, notification_ids, announcement_id } = data;

    // Resolve notification IDs: either from explicit list or by querying for announcement
    let resolvedIds: string[] = notification_ids ?? [];

    if (resolvedIds.length === 0 && announcement_id) {
      const announcementNotifications = await tx.notification.findMany({
        where: {
          tenant_id,
          source_entity_type: 'announcement',
          source_entity_id: announcement_id,
          channel: { not: 'in_app' },
          status: { in: ['queued', 'failed'] },
        },
        select: { id: true },
      });
      resolvedIds = announcementNotifications.map((n: { id: string }) => n.id);
    }

    if (resolvedIds.length === 0) {
      this.logger.log('No notification IDs resolved, nothing to dispatch');
      return;
    }

    const notifications = await tx.notification.findMany({
      where: {
        id: { in: resolvedIds },
        tenant_id,
        status: { in: ['queued', 'failed'] },
      },
    });

    if (notifications.length === 0) {
      this.logger.log(`No dispatchable notifications found for IDs: ${resolvedIds.join(', ')}`);
      return;
    }

    let sentCount = 0;
    let failedCount = 0;
    let inAppCount = 0;

    for (const notification of notifications) {
      try {
        switch (notification.channel) {
          case 'in_app':
            await this.dispatchInApp(tx, notification);
            inAppCount++;
            break;
          case 'email':
            await this.dispatchEmail(tx, notification);
            sentCount++;
            break;
          case 'whatsapp':
            await this.dispatchWhatsApp(tx, notification);
            sentCount++;
            break;
          case 'sms':
            await this.dispatchSms(tx, notification);
            sentCount++;
            break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        await this.handleFailure(tx, notification, message);
        failedCount++;
      }
    }

    this.logger.log(
      `Dispatched ${notifications.length} notifications for tenant ${tenant_id} — ` +
        `in_app: ${inAppCount}, sent: ${sentCount}, failed: ${failedCount}`,
    );
  }

  // ─── Channel dispatchers ──────────────────────────────────────────────

  private async dispatchInApp(
    tx: PrismaClient,
    notification: DispatchableNotification,
  ): Promise<void> {
    await tx.notification.update({
      where: { id: notification.id },
      data: {
        status: 'delivered',
        delivered_at: new Date(),
        attempt_count: notification.attempt_count + 1,
      },
    });
  }

  private async dispatchEmail(
    tx: PrismaClient,
    notification: DispatchableNotification,
  ): Promise<void> {
    // Resolve template
    const template = await this.resolveTemplate(
      tx,
      notification.tenant_id,
      notification.template_key ?? 'default',
      'email',
      notification.locale,
    );

    if (!template) {
      this.logger.warn(
        `No email template for key=${notification.template_key} locale=${notification.locale}`,
      );
      await this.markFailed(tx, notification, 'No email template for locale');
      await this.createFallbackNotification(tx, notification, 'in_app');
      return;
    }

    // Resolve recipient email
    const email = await this.resolveRecipientContact(
      tx,
      notification.tenant_id,
      notification.recipient_user_id,
      'email',
    );

    if (!email) {
      await this.markFailed(tx, notification, 'No email address found for recipient');
      await this.createFallbackNotification(tx, notification, 'in_app');
      return;
    }

    // Render template
    const variables = (notification.payload_json as Record<string, unknown>) ?? {};
    const renderedBody = renderTemplate(template.body_template, variables);
    const renderedSubject = renderSubject(template.subject_template, variables);

    // Send via Resend
    const resend = this.getResend();
    const defaultFrom = this.configService.get<string>('RESEND_FROM_EMAIL') ?? 'noreply@edupod.app';

    const { data: sendData, error } = await resend.emails.send({
      from: defaultFrom,
      to: [email],
      subject: renderedSubject ?? 'Notification',
      html: renderedBody,
      tags: [
        { name: 'notification_id', value: notification.id },
        { name: 'template_key', value: notification.template_key ?? 'default' },
      ],
    });

    if (error) {
      throw new Error(`Resend email failed: ${error.message}`);
    }

    const messageId = sendData?.id ?? '';

    // Mark as sent
    await tx.notification.update({
      where: { id: notification.id },
      data: {
        status: 'sent',
        provider_message_id: messageId,
        sent_at: new Date(),
        attempt_count: notification.attempt_count + 1,
      },
    });

    this.logger.log(
      `Email sent to=${email} messageId=${messageId} notification=${notification.id}`,
    );
  }

  private async dispatchWhatsApp(
    tx: PrismaClient,
    notification: DispatchableNotification,
  ): Promise<void> {
    // Resolve template
    const template = await this.resolveTemplate(
      tx,
      notification.tenant_id,
      notification.template_key ?? 'default',
      'whatsapp',
      notification.locale,
    );

    if (!template) {
      this.logger.warn(
        `No WhatsApp template for key=${notification.template_key} locale=${notification.locale}, falling back`,
      );
      await this.markFailed(tx, notification, 'No WhatsApp template for locale');
      await this.createFallbackNotification(tx, notification, 'sms');
      return;
    }

    // Resolve WhatsApp phone
    const phone = await this.resolveRecipientContact(
      tx,
      notification.tenant_id,
      notification.recipient_user_id,
      'whatsapp',
    );

    if (!phone) {
      this.logger.log(
        `No WhatsApp phone for recipient ${notification.recipient_user_id}, falling back to SMS`,
      );
      await tx.notification.update({
        where: { id: notification.id },
        data: {
          status: 'failed',
          failure_reason: 'No WhatsApp phone number found',
          attempt_count: notification.attempt_count + 1,
          next_retry_at: null,
        },
      });
      await this.createFallbackNotification(tx, notification, 'sms');
      return;
    }

    // Render template and strip HTML for WhatsApp
    const variables = (notification.payload_json as Record<string, unknown>) ?? {};
    const renderedBody = renderTemplate(template.body_template, variables);
    const strippedBody = stripHtmlText(renderedBody);

    // Send via Twilio WhatsApp
    const client = this.getTwilio();
    const whatsappFrom = this.configService.get<string>('TWILIO_WHATSAPP_FROM');
    if (!whatsappFrom) {
      throw new Error(
        'Twilio WhatsApp is not configured. Set TWILIO_WHATSAPP_FROM environment variable.',
      );
    }

    const to = phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`;
    const from = whatsappFrom.startsWith('whatsapp:') ? whatsappFrom : `whatsapp:${whatsappFrom}`;

    const message = await client.messages.create({
      body: strippedBody,
      from,
      to,
    });

    // Mark as sent
    await tx.notification.update({
      where: { id: notification.id },
      data: {
        status: 'sent',
        provider_message_id: message.sid,
        sent_at: new Date(),
        attempt_count: notification.attempt_count + 1,
      },
    });

    this.logger.log(`WhatsApp sent to=${to} sid=${message.sid} notification=${notification.id}`);
  }

  private async dispatchSms(
    tx: PrismaClient,
    notification: DispatchableNotification,
  ): Promise<void> {
    // Resolve template
    const template = await this.resolveTemplate(
      tx,
      notification.tenant_id,
      notification.template_key ?? 'default',
      'sms',
      notification.locale,
    );

    if (!template) {
      this.logger.warn(
        `No SMS template for key=${notification.template_key} locale=${notification.locale}, falling back to email`,
      );
      await this.markFailed(tx, notification, 'No SMS template for locale');
      await this.createFallbackNotification(tx, notification, 'email');
      return;
    }

    // Resolve SMS phone
    const phone = await this.resolveRecipientContact(
      tx,
      notification.tenant_id,
      notification.recipient_user_id,
      'sms',
    );

    if (!phone) {
      this.logger.log(
        `No phone number for recipient ${notification.recipient_user_id}, falling back to email`,
      );
      await tx.notification.update({
        where: { id: notification.id },
        data: {
          status: 'failed',
          failure_reason: 'No phone number found',
          attempt_count: notification.attempt_count + 1,
          next_retry_at: null,
        },
      });
      await this.createFallbackNotification(tx, notification, 'email');
      return;
    }

    // Render template and strip HTML for SMS
    const variables = (notification.payload_json as Record<string, unknown>) ?? {};
    const renderedBody = renderTemplate(template.body_template, variables);
    let strippedBody = stripHtmlText(renderedBody);

    // Truncate if exceeds SMS max length
    if (strippedBody.length > SMS_MAX_LENGTH) {
      this.logger.warn(
        `SMS body exceeds ${SMS_MAX_LENGTH} chars (${strippedBody.length}), truncating`,
      );
      strippedBody = strippedBody.slice(0, SMS_MAX_LENGTH - 3) + '...';
    }

    // Send via Twilio SMS
    const client = this.getTwilio();
    const smsFrom = this.configService.get<string>('TWILIO_SMS_FROM');
    if (!smsFrom) {
      throw new Error('Twilio SMS is not configured. Set TWILIO_SMS_FROM environment variable.');
    }

    const message = await client.messages.create({
      body: strippedBody,
      from: smsFrom,
      to: phone,
    });

    // Mark as sent
    await tx.notification.update({
      where: { id: notification.id },
      data: {
        status: 'sent',
        provider_message_id: message.sid,
        sent_at: new Date(),
        attempt_count: notification.attempt_count + 1,
      },
    });

    this.logger.log(`SMS sent to=${phone} sid=${message.sid} notification=${notification.id}`);
  }

  // ─── Template resolution ──────────────────────────────────────────────

  private async resolveTemplate(
    tx: PrismaClient,
    tenantId: string,
    templateKey: string,
    channel: string,
    locale: string,
  ): Promise<{ subject_template: string | null; body_template: string } | null> {
    // Tenant-level first
    const tenantTemplate = await tx.notificationTemplate.findFirst({
      where: {
        tenant_id: tenantId,
        template_key: templateKey,
        channel: toNotificationChannel(channel),
        locale,
      },
      select: { subject_template: true, body_template: true },
    });

    if (tenantTemplate) return tenantTemplate;

    // Platform-level fallback (tenant_id IS NULL)
    return tx.notificationTemplate.findFirst({
      where: {
        tenant_id: null,
        template_key: templateKey,
        channel: toNotificationChannel(channel),
        locale,
      },
      select: { subject_template: true, body_template: true },
    });
  }

  // ─── Recipient contact resolution ─────────────────────────────────────

  private async resolveRecipientContact(
    tx: PrismaClient,
    tenantId: string,
    userId: string,
    channel: 'email' | 'whatsapp' | 'sms',
  ): Promise<string | null> {
    if (channel === 'email') {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      return user?.email ?? null;
    }

    // For whatsapp and sms, look up Parent record via User
    const parent = await tx.parent.findFirst({
      where: { user_id: userId, tenant_id: tenantId },
      select: { phone: true, whatsapp_phone: true },
    });

    if (!parent) {
      return null;
    }

    if (channel === 'whatsapp') {
      return parent.whatsapp_phone ?? null;
    }

    // sms
    return parent.phone ?? null;
  }

  // ─── Failure handling with fallback chain ─────────────────────────────

  private async handleFailure(
    tx: PrismaClient,
    notification: DispatchableNotification,
    reason: string,
  ): Promise<void> {
    const newAttemptCount = notification.attempt_count + 1;
    const maxAttempts = notification.max_attempts;

    this.logger.warn(
      `Dispatch failed for notification ${notification.id} (attempt ${newAttemptCount}/${maxAttempts}): ${reason}`,
    );

    if (newAttemptCount >= maxAttempts) {
      // Dead-letter: no more retries
      await this.markFailed(tx, notification, reason);

      // Create fallback via the chain
      const fallbackChannel = FALLBACK_CHAIN[notification.channel];
      if (fallbackChannel) {
        await this.createFallbackNotification(tx, notification, fallbackChannel);
      }
      return;
    }

    // Exponential backoff: 60s * 2^attempt
    const backoffMs = 60_000 * Math.pow(2, newAttemptCount);
    const nextRetryAt = new Date(Date.now() + backoffMs);

    await tx.notification.update({
      where: { id: notification.id },
      data: {
        status: 'failed',
        attempt_count: newAttemptCount,
        failure_reason: reason,
        next_retry_at: nextRetryAt,
      },
    });
  }

  private async markFailed(
    tx: PrismaClient,
    notification: DispatchableNotification,
    reason: string,
  ): Promise<void> {
    await tx.notification.update({
      where: { id: notification.id },
      data: {
        status: 'failed',
        attempt_count: notification.attempt_count + 1,
        failure_reason: reason,
        next_retry_at: null,
      },
    });
  }

  private async createFallbackNotification(
    tx: PrismaClient,
    original: DispatchableNotification,
    fallbackChannel: NotificationChannel,
  ): Promise<void> {
    this.logger.log(
      `Creating ${fallbackChannel} fallback notification for ${original.id} (was ${original.channel})`,
    );

    await tx.notification.create({
      data: {
        tenant_id: original.tenant_id,
        recipient_user_id: original.recipient_user_id,
        channel: fallbackChannel,
        template_key: original.template_key,
        locale: original.locale,
        status: fallbackChannel === 'in_app' ? 'delivered' : 'queued',
        payload_json: (original.payload_json ?? {}) as Prisma.InputJsonValue,
        source_entity_type: original.source_entity_type,
        source_entity_id: original.source_entity_id,
        delivered_at: fallbackChannel === 'in_app' ? new Date() : null,
      },
    });
  }
}
