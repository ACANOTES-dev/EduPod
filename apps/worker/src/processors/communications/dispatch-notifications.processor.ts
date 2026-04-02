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

  /** Intermediate state between Phase 1 (read inside tx) and Phase 2 (dispatch outside tx) */
  private loadedNotifications: DispatchableNotification[] = [];

  constructor(
    prisma: PrismaClient,
    private readonly configService: ConfigService,
    private readonly getResend: () => Resend,
    private readonly getTwilio: () => Twilio,
  ) {
    super(prisma);
  }

  // ─── Override execute() to split DB reads from external HTTP calls ────

  override async execute(data: DispatchNotificationsPayload): Promise<void> {
    if (!data.tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    // Phase 1: Read notifications inside RLS transaction (short-lived)
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${data.tenant_id}::text, true)`;
      const userId = data.user_id || '00000000-0000-0000-0000-000000000000';
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}::text, true)`;

      await this.loadNotifications(data, tx as unknown as PrismaClient);
    });

    // Phase 2: Dispatch externally — NO active transaction holding a PgBouncer connection
    if (this.loadedNotifications.length > 0) {
      await this.dispatchAll(data);
    }
  }

  protected async processJob(): Promise<void> {
    // No-op — logic moved to execute() override
  }

  // ─── Phase 1: Load notifications inside RLS transaction ───────────────

  private async loadNotifications(
    data: DispatchNotificationsPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id, notification_ids, announcement_id } = data;

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

    this.loadedNotifications = await tx.notification.findMany({
      where: {
        id: { in: resolvedIds },
        tenant_id,
        status: { in: ['queued', 'failed'] },
      },
    });
  }

  // ─── Phase 2: Dispatch externally (outside transaction) ───────────────

  private async dispatchAll(data: DispatchNotificationsPayload): Promise<void> {
    let sentCount = 0;
    let failedCount = 0;
    let inAppCount = 0;

    for (const notification of this.loadedNotifications) {
      try {
        switch (notification.channel) {
          case 'in_app':
            await this.dispatchInApp(notification);
            inAppCount++;
            break;
          case 'email':
            await this.dispatchEmail(notification);
            sentCount++;
            break;
          case 'whatsapp':
            await this.dispatchWhatsApp(notification);
            sentCount++;
            break;
          case 'sms':
            await this.dispatchSms(notification);
            sentCount++;
            break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        await this.handleFailure(notification, message);
        failedCount++;
      }
    }

    this.logger.log(
      `Dispatched ${this.loadedNotifications.length} notifications for tenant ${data.tenant_id} — ` +
        `in_app: ${inAppCount}, sent: ${sentCount}, failed: ${failedCount}`,
    );
  }

  // ─── Channel dispatchers ──────────────────────────────────────────────

  private async dispatchInApp(notification: DispatchableNotification): Promise<void> {
    await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: 'delivered',
        delivered_at: new Date(),
        attempt_count: notification.attempt_count + 1,
      },
    });
  }

  private async dispatchEmail(notification: DispatchableNotification): Promise<void> {
    // Resolve template
    const template = await this.resolveTemplate(
      notification.tenant_id,
      notification.template_key ?? 'default',
      'email',
      notification.locale,
    );

    if (!template) {
      this.logger.warn(
        `No email template for key=${notification.template_key} locale=${notification.locale}`,
      );
      await this.markFailed(notification, 'No email template for locale');
      await this.createFallbackNotification(notification, 'in_app');
      return;
    }

    // Resolve recipient email
    const email = await this.resolveRecipientContact(
      notification.tenant_id,
      notification.recipient_user_id,
      'email',
    );

    if (!email) {
      await this.markFailed(notification, 'No email address found for recipient');
      await this.createFallbackNotification(notification, 'in_app');
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
    await this.prisma.notification.update({
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

  private async dispatchWhatsApp(notification: DispatchableNotification): Promise<void> {
    // Resolve template
    const template = await this.resolveTemplate(
      notification.tenant_id,
      notification.template_key ?? 'default',
      'whatsapp',
      notification.locale,
    );

    if (!template) {
      this.logger.warn(
        `No WhatsApp template for key=${notification.template_key} locale=${notification.locale}, falling back`,
      );
      await this.markFailed(notification, 'No WhatsApp template for locale');
      await this.createFallbackNotification(notification, 'sms');
      return;
    }

    // Resolve WhatsApp phone
    const phone = await this.resolveRecipientContact(
      notification.tenant_id,
      notification.recipient_user_id,
      'whatsapp',
    );

    if (!phone) {
      this.logger.log(
        `No WhatsApp phone for recipient ${notification.recipient_user_id}, falling back to SMS`,
      );
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'failed',
          failure_reason: 'No WhatsApp phone number found',
          attempt_count: notification.attempt_count + 1,
          next_retry_at: null,
        },
      });
      await this.createFallbackNotification(notification, 'sms');
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
    await this.prisma.notification.update({
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

  private async dispatchSms(notification: DispatchableNotification): Promise<void> {
    // Resolve template
    const template = await this.resolveTemplate(
      notification.tenant_id,
      notification.template_key ?? 'default',
      'sms',
      notification.locale,
    );

    if (!template) {
      this.logger.warn(
        `No SMS template for key=${notification.template_key} locale=${notification.locale}, falling back to email`,
      );
      await this.markFailed(notification, 'No SMS template for locale');
      await this.createFallbackNotification(notification, 'email');
      return;
    }

    // Resolve SMS phone
    const phone = await this.resolveRecipientContact(
      notification.tenant_id,
      notification.recipient_user_id,
      'sms',
    );

    if (!phone) {
      this.logger.log(
        `No phone number for recipient ${notification.recipient_user_id}, falling back to email`,
      );
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'failed',
          failure_reason: 'No phone number found',
          attempt_count: notification.attempt_count + 1,
          next_retry_at: null,
        },
      });
      await this.createFallbackNotification(notification, 'email');
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
    await this.prisma.notification.update({
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
    tenantId: string,
    templateKey: string,
    channel: string,
    locale: string,
  ): Promise<{ subject_template: string | null; body_template: string } | null> {
    // Tenant-level first
    const tenantTemplate = await this.prisma.notificationTemplate.findFirst({
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
    return this.prisma.notificationTemplate.findFirst({
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
    tenantId: string,
    userId: string,
    channel: 'email' | 'whatsapp' | 'sms',
  ): Promise<string | null> {
    if (channel === 'email') {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      return user?.email ?? null;
    }

    // For whatsapp and sms, look up Parent record via User
    const parent = await this.prisma.parent.findFirst({
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
      await this.markFailed(notification, reason);

      // Create fallback via the chain
      const fallbackChannel = FALLBACK_CHAIN[notification.channel];
      if (fallbackChannel) {
        await this.createFallbackNotification(notification, fallbackChannel);
      }
      return;
    }

    // Exponential backoff: 60s * 2^attempt
    const backoffMs = 60_000 * Math.pow(2, newAttemptCount);
    const nextRetryAt = new Date(Date.now() + backoffMs);

    await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: 'failed',
        attempt_count: newAttemptCount,
        failure_reason: reason,
        next_retry_at: nextRetryAt,
      },
    });
  }

  private async markFailed(notification: DispatchableNotification, reason: string): Promise<void> {
    await this.prisma.notification.update({
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
    original: DispatchableNotification,
    fallbackChannel: NotificationChannel,
  ): Promise<void> {
    this.logger.log(
      `Creating ${fallbackChannel} fallback notification for ${original.id} (was ${original.channel})`,
    );

    await this.prisma.notification.create({
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
