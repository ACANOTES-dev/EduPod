import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { NotificationChannel, Prisma, PrismaClient } from '@prisma/client';

import { SYSTEM_USER_SENTINEL } from '../../base/tenant-aware-job';

/**
 * Seeds the platform-level `inbox_message_fallback` notification templates.
 *
 * Wave 3 impl 07 creates `notification` rows via the existing dispatch
 * pipeline, which looks up a template by `(tenant_id, template_key,
 * channel, locale)` with a platform-level fallback (`tenant_id IS NULL`).
 * If the template is missing, the dispatcher marks the row failed and
 * chains to an alternate channel — which ends up chaining to `in_app`,
 * the very channel we are escalating **from**. That would silently
 * drop every fallback.
 *
 * This init runs once at worker startup and idempotently ensures a
 * minimal English + Arabic template set exists at the platform level for
 * the three supported fallback channels (email, sms, whatsapp).
 *
 * Tenants who want to override the wording per school can still write
 * their own tenant-scoped row — `resolveTemplate` checks tenant-level
 * first and only falls back to the platform-level row we install here.
 *
 * Templates are seeded unconditionally so an upgrade that tweaks the
 * copy must bump the `INBOX_FALLBACK_TEMPLATE_VERSION` marker inside a
 * body and we re-run the upsert. For now, we create-if-missing and leave
 * operator-managed overrides untouched.
 */

interface TemplateSeed {
  channel: NotificationChannel;
  locale: string;
  subject_template: string | null;
  body_template: string;
}

const TEMPLATE_KEY = 'inbox_message_fallback';

const TEMPLATE_SEEDS: TemplateSeed[] = [
  // ─── Email ───────────────────────────────────────────────────────────────
  {
    channel: 'email',
    locale: 'en',
    subject_template: 'New message from {{sender_name}}',
    body_template:
      '<p>You have an unread message from <strong>{{sender_name}}</strong> in your school inbox.</p>' +
      '<blockquote>{{snippet}}</blockquote>' +
      '<p>Open your inbox to read the full message and reply if replies are enabled.</p>',
  },
  {
    channel: 'email',
    locale: 'ar',
    subject_template: 'رسالة جديدة من {{sender_name}}',
    body_template:
      '<p>لديك رسالة غير مقروءة من <strong>{{sender_name}}</strong> في صندوق الوارد الخاص بالمدرسة.</p>' +
      '<blockquote>{{snippet}}</blockquote>' +
      '<p>افتح صندوق الوارد لقراءة الرسالة الكاملة والرد إذا كان الرد مفعَّلاً.</p>',
  },
  // ─── SMS ────────────────────────────────────────────────────────────────
  {
    channel: 'sms',
    locale: 'en',
    subject_template: null,
    body_template:
      '{{sender_name}}: {{snippet}} — Open your school inbox to read the full message and reply.',
  },
  {
    channel: 'sms',
    locale: 'ar',
    subject_template: null,
    body_template:
      '{{sender_name}}: {{snippet}} — افتح صندوق الوارد المدرسي لقراءة الرسالة الكاملة والرد.',
  },
  // ─── WhatsApp ───────────────────────────────────────────────────────────
  {
    channel: 'whatsapp',
    locale: 'en',
    subject_template: null,
    body_template:
      '*New message from {{sender_name}}*\n\n{{snippet}}\n\nOpen your school inbox to read the full message and reply.',
  },
  {
    channel: 'whatsapp',
    locale: 'ar',
    subject_template: null,
    body_template:
      '*رسالة جديدة من {{sender_name}}*\n\n{{snippet}}\n\nافتح صندوق الوارد المدرسي لقراءة الرسالة الكاملة والرد.',
  },
];

@Injectable()
export class InboxFallbackTemplatesInit implements OnModuleInit {
  private readonly logger = new Logger(InboxFallbackTemplatesInit.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async onModuleInit(): Promise<void> {
    // The `notification_templates` RLS policy evaluates
    // `current_setting('app.current_tenant_id')::uuid` unconditionally,
    // so we must seed inside a transaction with a valid tenant context
    // even though our target rows are platform-level (tenant_id IS NULL).
    // The sentinel UUID matches no real tenant row, keeping cross-tenant
    // isolation intact while letting the `tenant_id IS NULL` branch of
    // the OR fire.
    let created = 0;
    await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${SYSTEM_USER_SENTINEL}::text, true)`;
        await tx.$executeRaw`SELECT set_config('app.current_user_id', ${SYSTEM_USER_SENTINEL}::text, true)`;

        for (const seed of TEMPLATE_SEEDS) {
          const existing = await tx.notificationTemplate.findFirst({
            where: {
              tenant_id: null,
              template_key: TEMPLATE_KEY,
              channel: seed.channel,
              locale: seed.locale,
            },
            select: { id: true },
          });

          if (existing) continue;

          await tx.notificationTemplate.create({
            data: {
              tenant_id: null,
              template_key: TEMPLATE_KEY,
              channel: seed.channel,
              locale: seed.locale,
              subject_template: seed.subject_template,
              body_template: seed.body_template,
              is_system: true,
            },
          });
          created += 1;
        }
      },
      { maxWait: 10_000, timeout: 30_000 },
    );

    if (created > 0) {
      this.logger.log(
        `Inbox fallback templates ensured — created ${created} new platform-level row(s).`,
      );
    } else {
      this.logger.debug('Inbox fallback templates already present — skipping seed.');
    }
  }
}
